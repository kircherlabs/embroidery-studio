import test from "node:test";
import assert from "node:assert/strict";
import { object } from "../src/model.js";
import { generate } from "../src/engine.js";
import { makeFillSettings } from "../src/fills/context.js";
import { stampFillFeatures } from "../src/fills/schema.js";
import { safeConnector } from "../src/geometry.js";
const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const shape = (rings) =>
  object("Emboss", rings, {
    id: "emboss",
    closed: true,
    fillRule: "evenodd",
    angle: 0,
    length: 3,
    underlay: false,
    compensation: 0,
    tieIn: false,
    tieOff: false,
  });
const plan = (o) =>
  generate(
    stampFillFeatures({
      version: 1,
      name: "Emboss",
      machine: "se700",
      objects: [o],
    }),
  );
test("six embossed motifs change real penetrations without changing fill rows, geometry, colors or max length", () => {
  const o = shape([rect(-18, -12, 36, 24), rect(-3, -3, 6, 6)]);
  o.fillSettings = makeFillSettings("tatami", o);
  const base = plan(o),
    baseCount = base.events.length,
    streams = new Set();
  const ys = (events) =>
      [
        ...new Set(
          events
            .filter((e) => e.cmd === "stitch" && e.phase === "top")
            .map((e) => e.y),
        ),
      ].sort((a, b) => a - b),
    expectedRows = ys(base.events);
  for (const motif of [
    "dots",
    "diamonds",
    "checker",
    "lattice",
    "diagonal",
    "waves",
  ]) {
    o.fillSettings = makeFillSettings("emboss", o, { motif, strength: 1 });
    const before = JSON.stringify(o),
      p = plan(o);
    assert.equal(JSON.stringify(o), before);
    assert(!p.issues.some((i) => i.severity === "error"));
    assert.deepEqual(p.events, plan(o).events);
    assert.deepEqual(ys(p.events), expectedRows);
    assert(p.events.length < baseCount * 2);
    assert(p.events.every((e) => e.color === o.color || e.cmd === "end"));
    streams.add(JSON.stringify(p.events));
    let at = null;
    for (const e of p.events) {
      if (e.cmd === "jump") at = e;
      else if (e.cmd === "stitch") {
        if (at) {
          assert(Math.hypot(e.x - at.x, e.y - at.y) <= 3.15);
          assert(safeConnector(at, e, o.rings, 0.001, [], "evenodd"));
        }
        at = e;
      }
    }
  }
  assert.equal(streams.size, 6);
  o.fillSettings = makeFillSettings("emboss", o, { strength: 0 });
  assert.deepEqual(plan(o).events, base.events);
});
test("motif scale, repeat, angle, phase and emphasis change actual commands; narrow spans keep endpoints", () => {
  const o = shape([rect(-12, -12, 24, 24)]);
  o.fillSettings = makeFillSettings("emboss", o);
  const original = plan(o).events;
  for (const changes of [
    { scale: 6 },
    { repeat: 8 },
    { motifAngle: 33 },
    { phaseX: 1.1 },
    { phaseY: 1.3 },
    { strength: 1 },
  ]) {
    o.fillSettings = makeFillSettings("emboss", o, changes);
    assert.notDeepEqual(plan(o).events, original, JSON.stringify(changes));
  }
  const tiny = shape([rect(0, 0, 0.2, 5)]);
  tiny.fillSettings = makeFillSettings("emboss", tiny, {
    motif: "dots",
    strength: 1,
  });
  const p = plan(tiny),
    x = new Set(p.events.filter((e) => e.cmd === "stitch").map((e) => e.x));
  assert(x.has(0) && x.has(0.2));
  o.fillSettings = makeFillSettings("emboss", o, {
    motif: "dots",
    scale: 1,
    repeat: 1,
    strength: 1,
  });
  assert(plan(o).issues.some((i) => i.code === "emboss-reduced-detail"));
});
