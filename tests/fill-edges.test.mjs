import test from "node:test";
import assert from "node:assert/strict";
import { redistributeRow } from "../src/fills/edges.js";
import { fillRows, generate } from "../src/engine.js";
import { object } from "../src/model.js";
import { makeFillSettings } from "../src/fills/context.js";
import { stampFillFeatures } from "../src/fills/schema.js";
const short = (rows, min = 0.5) =>
  rows.reduce(
    (n, r) =>
      n +
      r.slice(1).filter((p, i) => Math.hypot(p.x - r[i].x, p.y - r[i].y) < min)
        .length,
    0,
  );
test("edge redistribution preserves endpoints, maximum length and feasible minimum with local phase preservation", () => {
  const row = [0, 0.2, 3.2, 6.2, 6.4].map((x) => ({ x, y: 0 })),
    a = redistributeRow(row, 0.6, 3);
  assert.equal(a.limited, false);
  assert.deepEqual(a.points[0], row[0]);
  assert.deepEqual(a.points.at(-1), row.at(-1));
  assert(short([a.points], 0.6 - 1e-9) === 0);
  assert(a.points.slice(1).every((p, i) => p.x - a.points[i].x <= 3 + 1e-9));
  assert(a.points.some((p) => p.x === 3.2));
  for (let k = 1; k < 1000; k++) {
    const span = k / 37,
      original = Array.from({ length: Math.ceil(span / 3) + 1 }, (_, i) => ({
        x: Math.min(i * 3, span),
        y: 2,
      })),
      b = redistributeRow(original, 0.6, 3);
    assert.deepEqual(b.points[0], original[0]);
    assert.deepEqual(b.points.at(-1), original.at(-1));
    if (!b.limited)
      for (let i = 1; i < b.points.length; i++) {
        const d = b.points[i].x - b.points[i - 1].x;
        assert(d >= 0.6 - 1e-8 && d <= 3 + 1e-8);
      }
  }
  const thin = [
    { x: 0, y: 0 },
    { x: 0.2, y: 0 },
  ];
  assert.deepEqual(redistributeRow(thin, 0.6, 3), {
    points: thin,
    limited: true,
  });
});
test("opt-in edge correction measurably reduces short border penetrations without weakening row coverage", () => {
  const circle = [
    Array.from({ length: 120 }, (_, i) => ({
      x: 18 * Math.cos((i * Math.PI) / 60),
      y: 18 * Math.sin((i * Math.PI) / 60),
    })),
  ];
  const original = fillRows(
    circle,
    0.42,
    0,
    3,
    0,
    "nonzero",
    "quarter",
    null,
    0,
    { fixed: true, phase: (r) => (((r % 4) + 4) % 4) / 4 },
  );
  const improved = original.map((r) => {
    const forward = r[0].x < r.at(-1).x ? r : [...r].reverse();
    return redistributeRow(forward, 0.6, 3).points;
  });
  assert(
    short(improved) < short(original) / 4,
    `${short(original)} -> ${short(improved)}`,
  );
  assert.equal(original.length, improved.length);
  original.forEach((r, i) =>
    assert.deepEqual(
      [Math.min(...r.map((p) => p.x)), Math.max(...r.map((p) => p.x))],
      [improved[i][0].x, improved[i].at(-1).x],
    ),
  );
  const o = object(
    "Very narrow",
    [
      [
        { x: 0, y: 0 },
        { x: 0.2, y: 0 },
        { x: 0.2, y: 5 },
        { x: 0, y: 5 },
      ],
    ],
    { closed: true, type: "fill", angle: 0, compensation: 0, underlay: false },
  );
  o.fillSettings = makeFillSettings("tatami", o, {
    edgeOptimize: true,
    edgeMinimum: 0.6,
  });
  const p = generate(
    stampFillFeatures({
      version: 1,
      name: "Thin",
      machine: "se700",
      objects: [o],
    }),
  );
  assert(p.events.some((e) => e.cmd === "stitch"));
  assert(
    p.issues.some(
      (i) => i.code === "fill-short-edge-spans" && i.severity === "info",
    ),
  );
  console.log(
    `120-vertex circle raw top-row intervals <0.5mm: ${short(original)} -> ${short(improved)}; row count ${original.length} unchanged.`,
  );
});
