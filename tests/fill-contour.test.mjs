import test from "node:test";
import assert from "node:assert/strict";
import { object, translate, transform } from "../src/model.js";
import { generate, resample } from "../src/engine.js";
import { contourFill } from "../src/fills/contour.js";
import { fillContext, makeFillSettings } from "../src/fills/context.js";
import { stampFillFeatures } from "../src/fills/schema.js";
import { safeConnector } from "../src/geometry.js";
const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const shape = (rings) => {
  const o = object("Contour", rings, {
    id: "contour",
    closed: true,
    fillRule: "evenodd",
    angle: 0,
    spacing: 0.7,
    length: 2,
    underlay: false,
    compensation: 0,
  });
  o.fillSettings = makeFillSettings("contour", o);
  return o;
};
const plan = (o) =>
  generate(
    stampFillFeatures({
      version: 1,
      name: "Contour",
      machine: "se700",
      objects: [o],
    }),
  );
test("Contour is a real sequence of closed offsets, preserves holes/islands and sews only contained connectors", () => {
  const cases = [
    shape([rect(-15, -10, 30, 20)]),
    shape([rect(-15, -10, 30, 20), rect(-4, -4, 8, 8)]),
    shape([rect(-15, -10, 8, 20), rect(4, -10, 8, 20)]),
    shape([
      [
        { x: -15, y: -10 },
        { x: -5, y: -10 },
        { x: -5, y: -1 },
        { x: 5, y: -1 },
        { x: 5, y: -10 },
        { x: 15, y: -10 },
        { x: 15, y: 10 },
        { x: 5, y: 10 },
        { x: 5, y: 1 },
        { x: -5, y: 1 },
        { x: -5, y: 10 },
        { x: -15, y: 10 },
      ],
    ]),
  ];
  for (const o of cases) {
    const before = JSON.stringify(o),
      ctx = fillContext(o, { resample }),
      result = contourFill(ctx, null),
      p = plan(o);
    assert.equal(JSON.stringify(o), before);
    assert(
      !p.issues.some((i) => i.severity === "error"),
      JSON.stringify(p.issues),
    );
    assert(result.paths.length > 2);
    for (const path of result.paths) {
      assert.deepEqual(path.p[0], path.p.at(-1));
      for (let i = 1; i < path.p.length; i++)
        assert(
          safeConnector(path.p[i - 1], path.p[i], ctx.rings, 0, [], "nonzero"),
        );
    }
    let at = null;
    for (const e of p.events) {
      if (e.cmd === "jump") at = e;
      if (e.cmd !== "stitch") continue;
      if (at) assert(safeConnector(at, e, ctx.rings, 0, [], "nonzero"));
      at = e;
    }
  }
  assert(plan(cases.at(-1)).issues.some((i) => i.code === "contour-split"));
});
test("Contour spacing and order affect actual needles; transforms, small collapse and compensation remain honest", () => {
  const o = shape([rect(-12, -12, 24, 24)]),
    a = plan(o);
  assert(a.events.filter((e) => e.cmd === "stitch").length > 250);
  o.fillSettings.direction = "inside-out";
  const b = plan(o);
  assert.notDeepEqual(a.events, b.events);
  assert(
    Math.hypot(b.events[0].x, b.events[0].y) <
      Math.hypot(a.events[0].x, a.events[0].y),
  );
  o.spacing = 1.4;
  assert(plan(o).events.length < b.events.length);
  const original = JSON.stringify(o.rings);
  o.compensation = 0.5;
  o.underlay = true;
  assert.deepEqual(
    plan(o).events,
    plan({ ...o, compensation: 0, underlay: false }).events,
    "unsupported dense-fill controls do not alter running contour construction",
  );
  translate(o, 7, 9);
  transform(o, -1, 1, 27);
  assert(!plan(o).issues.some((i) => i.severity === "error"));
  assert.notEqual(JSON.stringify(o.rings), original);
  const narrow = shape([rect(0, 0, 0.2, 8)]),
    bad = plan(narrow);
  assert.equal(bad.events.length, 0);
  assert(
    bad.issues.some(
      (i) => i.code === "fill-generation" && /No contour fits/.test(i.message),
    ),
  );
});
