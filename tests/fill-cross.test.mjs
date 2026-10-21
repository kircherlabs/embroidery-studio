import test from "node:test";
import assert from "node:assert/strict";
import { object, translate, transform } from "../src/model.js";
import { generate } from "../src/engine.js";
import { crossCells, crossFill } from "../src/fills/cross.js";
import { fillContext, makeFillSettings } from "../src/fills/context.js";
import { stampFillFeatures } from "../src/fills/schema.js";
const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const shape = (rings) => {
  const o = object("Crosses", rings, {
    id: "cross",
    closed: true,
    fillRule: "evenodd",
    angle: 0,
    length: 4,
    underlay: false,
    compensation: 0,
    tieIn: false,
    tieOff: false,
  });
  o.fillSettings = makeFillSettings("cross", o);
  return o;
};
const plan = (o) =>
  generate(
    stampFillFeatures({
      version: 1,
      name: "Crosses",
      machine: "se700",
      objects: [o],
    }),
  );
test("cross cells are real Xs with complete containment, counters and a consistent second diagonal", () => {
  const o = shape([rect(-12, -12, 24, 24), rect(-0.2, -0.4, 0.4, 0.3)]),
    ctx = fillContext(o),
    a = crossFill(ctx);
  assert(a.paths.length > 150);
  assert.equal(a.paths.length % 2, 0);
  for (let i = 0; i < a.paths.length; i += 2) {
    const under = a.paths[i].p.map(ctx.local),
      top = a.paths[i + 1].p.map(ctx.local);
    assert(under[0].x < under[1].x && under[0].y < under[1].y);
    assert(top[0].x > top[1].x && top[0].y < top[1].y);
    assert(ctx.safe(under[0], under[1]));
    assert(ctx.safe(top[0], top[1]));
  }
  const p = plan(o);
  assert(!p.issues.some((i) => i.severity === "error"));
  assert.equal(
    p.events.filter((e) => e.cmd === "stitch" && e.phase === "cross-under")
      .length,
    a.paths.length / 2,
  );
  assert.equal(
    p.events.filter((e) => e.cmd === "stitch" && e.phase === "cross-top")
      .length,
    a.paths.length / 2,
  );
  // No front-side vertical travel bars: each sewn leg is preceded by its own jump
  // and positioning penetration, without per-leg tie locks.
  assert.equal(p.events.filter((e) => e.cmd === "jump").length, a.paths.length);
  assert(!p.events.some((e) => e.cmd === "stitch" && e.phase === "tie"));
  const tinyCounter = shape([rect(-8, -8, 16, 16), rect(0.6, -0.1, 0.1, 0.1)]);
  assert(
    !crossCells(fillContext(tinyCounter)).cells.some(
      (c) => c[0].x < 0.65 && c[2].x > 0.65 && c[0].y < -0.05 && c[2].y > -0.05,
    ),
    "counter entirely between diagonals must still exclude the cell",
  );
});
test("cross grid follows translated/rotated/reflected artwork and pitch/size change physical density", () => {
  const o = shape([rect(-10, -10, 20, 20)]),
    n = crossCells(fillContext(o)).cells.length;
  translate(o, 8, 5);
  transform(o, 1, 1, 25);
  assert.equal(crossCells(fillContext(o)).cells.length, n);
  transform(o, -1, 1);
  assert.equal(crossCells(fillContext(o)).cells.length, n);
  assert(!plan(o).issues.some((i) => i.severity === "error"));
  o.fillSettings.pitch = 3;
  assert(crossCells(fillContext(o)).cells.length < n);
  o.fillSettings.size = 4;
  assert.throws(() => fillContext(o), /grid spacing/i);
  const narrow = shape([rect(0, 0, 0.2, 4)]),
    p = plan(narrow);
  assert.equal(p.events.length, 0);
  assert(
    p.issues.some(
      (i) => i.code === "fill-generation" && /No complete/.test(i.message),
    ),
  );
});
