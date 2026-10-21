import test from "node:test";
import assert from "node:assert/strict";
import { object, translate, transform } from "../src/model.js";
import { generate, fillRows } from "../src/engine.js";
import { makeFillSettings, fillContext } from "../src/fills/context.js";
import { stampFillFeatures, TEXTURES } from "../src/fills/schema.js";
import { texturePhase, hash01 } from "../src/fills/tatami.js";
import {
  makeOperation,
  materialize,
  operationObject,
} from "../src/operations.js";
import { safeConnector, inside } from "../src/geometry.js";
const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const region = (rings = [rect(-16, -12, 32, 24)]) =>
  object("Texture", rings, {
    id: "texture",
    closed: true,
    angle: 0,
    spacing: 0.42,
    length: 3,
    underlay: false,
    compensation: 0,
    fillRule: "evenodd",
  });
const project = (o) =>
  stampFillFeatures({
    version: 1,
    name: "Textures",
    machine: "se700",
    objects: [o],
  });
const commands = (plan) =>
  plan.events.map(({ cmd, x, y, phase }) => ({ cmd, x, y, phase }));
// Machine coordinates are rounded to 0.1 mm; accept at most half a grid
// diagonal at a boundary, never a sewn shortcut through a counter.
const covered = (p, rings) =>
  inside(p, rings, "evenodd") ||
  rings.some((r) =>
    r.some((b, i) => {
      const a = r[(i + r.length - 1) % r.length],
        dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
          ),
        );
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) <= 0.071;
    }),
  );
test("texture phases are deterministic, periodic where intended, bounded and distinct", () => {
  for (const [texture, sequence] of Object.entries({
    quarter: [0, 0.25, 0.5, 0.75],
    half: [0, 0.5],
    aligned: [0],
    third: [0, 1 / 3, 2 / 3],
    fifth: [0, 0.2, 0.4, 0.6, 0.8],
    custom: [0, 0.4, 0.1],
  })) {
    const s = { texture, sequence };
    for (let r = -30; r < 30; r++)
      assert.equal(
        texturePhase(s, r),
        sequence[((r % sequence.length) + sequence.length) % sequence.length],
      );
  }
  for (const texture of Object.keys(TEXTURES).filter((t) => t !== "custom")) {
    const s = { texture, seed: 43 },
      values = Array.from({ length: 1000 }, (_, i) => texturePhase(s, i - 500));
    assert(
      values.every((n) => Number.isFinite(n) && n >= 0 && n < 1),
      texture,
    );
    assert.deepEqual(
      values,
      Array.from({ length: 1000 }, (_, i) => texturePhase(s, i - 500)),
    );
  }
  assert.notDeepEqual(
    Array.from({ length: 30 }, (_, i) =>
      texturePhase({ texture: "random", seed: 1 }, i),
    ),
    Array.from({ length: 30 }, (_, i) =>
      texturePhase({ texture: "random", seed: 2 }, i),
    ),
  );
  assert.equal(hash01(4, -5), hash01(4, -5));
  for (const texture of ["twill", "wave"])
    for (let r = -20; r < 20; r++)
      assert(
        Math.abs(
          texturePhase({ texture, period: 8 }, r) -
            texturePhase({ texture, period: 8 }, r + 8),
        ) < 1e-12,
      );
});
test("each expanded Tatami texture changes actual needles without modifying source or sewing action identity", () => {
  const streams = new Set();
  for (const texture of Object.keys(TEXTURES).filter((t) => t !== "custom")) {
    const o = region();
    o.operations = [makeOperation("fill", o)];
    o.operations[0].fillSettings = makeFillSettings("tatami", o, { texture });
    const p = project(o),
      before = JSON.stringify(p),
      a = generate(p),
      b = generate(p);
    assert.equal(JSON.stringify(p), before);
    assert(!a.issues.some((i) => i.severity === "error"), texture);
    assert(a.events.filter((e) => e.cmd === "stitch").length > 500, texture);
    assert.deepEqual(commands(a), commands(b));
    streams.add(JSON.stringify(commands(a)));
    assert(
      a.events
        .filter((e) => e.cmd === "stitch")
        .every((e) => e.color === o.color),
    );
    assert.equal(o.operations.length, 1);
  }
  assert.equal(
    streams.size,
    Object.keys(TEXTURES).length - 1,
    "every preset has a distinct real needle stream",
  );
});
test("new Tatami keeps holes and islands out of top stitches, including crossing connectors", () => {
  const o = region([
    rect(-18, -12, 30, 24),
    rect(-7, -5, 8, 10),
    rect(15, -5, 4, 10),
  ]);
  for (const texture of [
    "twill",
    "random",
    "wave",
    "third",
    "fifth",
    "progressive",
    "chevron",
  ]) {
    o.fillSettings = makeFillSettings("tatami", o, { texture });
    const plan = generate(project(o));
    let previous = null;
    for (const e of plan.events) {
      if (e.cmd === "jump") {
        previous = e;
        continue;
      }
      if (e.cmd !== "stitch") continue;
      assert(covered(e, o.rings), `${texture} needle ${JSON.stringify(e)}`);
      if (previous)
        for (let k = 1; k <= 10; k++)
          assert(
            covered(
              {
                x: previous.x + ((e.x - previous.x) * k) / 10,
                y: previous.y + ((e.y - previous.y) * k) / 10,
              },
              o.rings,
            ),
            `${texture} crossed a counter`,
          );
      previous = e;
    }
  }
});
test("artwork frame preserves texture phase on translate/rotate/mirror and physical density on scaling", () => {
  const o = region();
  o.fillSettings = makeFillSettings("tatami", o, { texture: "twill" });
  const rows = (s) => {
    const c = fillContext(s);
    return fillRows(
      c.localRings,
      s.spacing,
      0,
      s.length,
      0,
      "nonzero",
      "quarter",
      null,
      0,
      { fixed: true, phase: (r) => texturePhase(c.cfg, r) },
    );
  };
  const original = rows(o),
    normalized = (rs) =>
      rs.map((r) =>
        r.map((p) => [Math.round(p.x * 1e6), Math.round(p.y * 1e6)]),
      );
  translate(o, 10, -5);
  assert.deepEqual(normalized(rows(o)), normalized(original));
  transform(o, 1, 1, 90);
  assert.deepEqual(normalized(rows(o)), normalized(original));
  transform(o, -1, 1);
  assert.deepEqual(normalized(rows(o)), normalized(original));
  transform(o, 2, 2);
  const grown = rows(o);
  assert(grown.length >= original.length * 1.95);
  const ys = [...new Set(grown.map((r) => r[0].y))].sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++)
    assert(Math.abs(ys[i] - ys[i - 1] - 0.42) < 1e-8);
});
test("underlay and compensation affect new textures, and materialization allows a true legacy reset", () => {
  const o = region();
  o.fillSettings = makeFillSettings("tatami", o, { texture: "wave" });
  const base = generate(project(o));
  o.underlay = true;
  const under = generate(project(o));
  assert(under.events.some((e) => e.phase === "underlay"));
  assert(under.events.length > base.events.length);
  o.underlay = false;
  o.compensation = 0.2;
  assert.notDeepEqual(commands(generate(project(o))), commands(base));
  const cfg = structuredClone(o.fillSettings);
  materialize(o);
  assert.equal(o.fillSettings, undefined);
  assert.deepEqual(o.operations[0].fillSettings, cfg);
  delete o.operations[0].fillSettings;
  o.operations[0].pattern = "quarter";
  o.operations[0].compensation = 0;
  const reset = generate(project(o)),
    legacy = region();
  assert.deepEqual(commands(reset), commands(generate(project(legacy))));
  assert.equal(operationObject(o, o.operations[0]).fillSettings, undefined);
});
