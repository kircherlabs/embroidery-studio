import test from "node:test";
import assert from "node:assert/strict";
import { object, validateProject, translate, bounds } from "../src/model.js";
import { editClosedCurve } from "../src/closed-curve-editing.js";
import {
  curveRings,
  sourceTransform,
  mapPoint,
} from "../src/smart-geometry.js";
import {
  alignHandle,
  nearestSegment,
  worldCurve,
  reverseArtwork,
} from "../src/path-editing.js";
import { generate } from "../src/engine.js";
import { extractArtwork, insertArtwork } from "../src/artwork-library.js";
const rect = [
  { x: -20, y: -20 },
  { x: 20, y: -20 },
  { x: 20, y: 20 },
  { x: -20, y: 20 },
];
const fixture = (rings = [rect]) =>
  object("Closed Shape", structuredClone(rings), {
    angle: 0,
    underlay: false,
    compensation: 0,
    closed: true,
  });
const project = (o) => ({
  version: 1,
  name: "Curves",
  machine: "se700",
  objects: [o],
});
test("edge toggles preserve endpoints and independent opposite controls, including edited curves and saved copies", () => {
  let o = fixture();
  o = editClosedCurve(o, "toggle-segment", 0, 0);
  assert(o.curve.nodes[0].out && o.curve.nodes[1].in);
  assert.deepEqual(
    o.curve.nodes.map(({ x, y }) => ({ x, y })),
    rect,
  );
  o = editClosedCurve(o, "toggle-segment", 0, 3);
  const adjacent = structuredClone(o.curve.nodes[0].in),
    curved = structuredClone([o.curve.nodes[0].out, o.curve.nodes[1].in]);
  o = editClosedCurve(o, "toggle-segment", 0, 0);
  assert(!o.curve.nodes[0].out && !o.curve.nodes[1].in);
  assert.deepEqual(o.curve.nodes[0].in, adjacent);
  o = JSON.parse(JSON.stringify(o));
  validateProject(project(o));
  for (let i = 0; i < 10; i++) {
    o = editClosedCurve(o, "toggle-segment", 0, 0);
    assert.deepEqual([o.curve.nodes[0].out, o.curve.nodes[1].in], curved);
    o = editClosedCurve(o, "toggle-segment", 0, 0);
  }
});
test("smooth/corner reversal restores exact handles; Break Handles preserves both curves and unequal lengths", () => {
  let o = editClosedCurve(fixture(), "toggle-segment", 0, 0);
  o.curve.nodes[0].in = { x: -23, y: -18 };
  o.rings = curveRings(o.curve);
  const prior = structuredClone(o.curve.nodes[0]);
  o = editClosedCurve(o, "toggle-node", 0, 0);
  const n = o.curve.nodes[0],
    a = Math.hypot(n.in.x - n.x, n.in.y - n.y),
    b = Math.hypot(n.out.x - n.x, n.out.y - n.y);
  assert(Math.abs(a - b) > 1);
  assert(
    Math.abs(
      (n.in.x - n.x) * (n.out.y - n.y) - (n.in.y - n.y) * (n.out.x - n.x),
    ) < 1e-9,
  );
  n.out.y -= 1;
  alignHandle(n, "out");
  assert(Math.abs(Math.hypot(n.in.x - n.x, n.in.y - n.y) - a) < 1e-9);
  const curved = structuredClone([n.in, n.out]);
  o.rings = curveRings(o.curve);
  const broken = editClosedCurve(o, "break", 0, 0);
  assert.deepEqual(
    [broken.curve.nodes[0].in, broken.curve.nodes[0].out],
    curved,
  );
  assert(broken.curve.nodes[0].broken);
  o = editClosedCurve(o, "toggle-node", 0, 0);
  assert.deepEqual(o.curve.nodes[0], prior);
});
test("whole-contour smoothing is lossless for triangles, polygons, mixed curves and holes", () => {
  for (const rings of [
    [rect],
    [
      [
        { x: -20, y: 15 },
        { x: 0, y: -20 },
        { x: 20, y: 15 },
      ],
    ],
    [
      [
        { x: -20, y: -20 },
        { x: 20, y: -20 },
        { x: 10, y: 0 },
        { x: 20, y: 20 },
        { x: -20, y: 20 },
        { x: -10, y: 0 },
      ],
    ],
    [rect, rect.map((p) => ({ x: p.x / 3, y: p.y / 3 }))],
  ]) {
    let o = fixture(rings),
      before = structuredClone(o.rings);
    o = editClosedCurve(o, "toggle-whole");
    assert(o.curve.nodes.every((n) => n.mode === "smooth"));
    const saved = JSON.parse(JSON.stringify(o));
    validateProject(project(saved));
    o = editClosedCurve(saved, "toggle-whole");
    assert.deepEqual(o.rings, before);
    if (rings.length > 1) {
      o = editClosedCurve(o, "toggle-segment", 1, 0);
      assert(o.curve.contours[0].nodes[0].out);
      assert.equal(o.rings.length, 2);
      assert.equal(nearestSegment(o, { x: 0, y: -7 }).ring, 1);
    }
  }
  let mixed = editClosedCurve(fixture(), "toggle-segment", 0, 0),
    before = structuredClone(mixed);
  mixed = editClosedCurve(
    editClosedCurve(mixed, "toggle-whole"),
    "toggle-whole",
  );
  assert.deepEqual(mixed.rings, before.rings);
  assert.deepEqual(mixed.curve.nodes, before.curve.nodes);
});
test("transforms, source cloning/My Artwork and stitch generation retain curves, counters and restoration data", () => {
  let o = editClosedCurve(
    fixture([rect, rect.map((p) => ({ x: p.x / 3, y: p.y / 3 }))]),
    "toggle-whole",
  );
  const m = [0.8, 0.6, -0.6, 0.8, 3, -2];
  sourceTransform(o, m);
  o.rings = curveRings(o.curve);
  const p = project(o);
  validateProject(p);
  const data = extractArtwork(p, [o.id]);
  const dest = {
    version: 1,
    name: "Destination",
    machine: "se700",
    objects: [],
  };
  insertArtwork(dest, data, { x: 0, y: 0 });
  validateProject(dest);
  const restored = editClosedCurve(o, "toggle-whole");
  assert.deepEqual(
    restored.rings[0],
    rect.map((p) => mapPoint(p, m)),
  );
  const plan = generate(dest);
  assert(plan.stats.stitches > 100);
  assert.equal(dest.objects[0].rings.length, 2);
  const saved = JSON.stringify(data);
  translate(dest.objects[0], 5, 2);
  assert.equal(JSON.stringify(data), saved);
});
test("invalid crossing/contour topology changes are rejected atomically", () => {
  const bad = fixture([
      [
        { x: -10, y: -10 },
        { x: 10, y: 10 },
        { x: -10, y: 10 },
        { x: 10, y: -10 },
      ],
    ]),
    before = JSON.stringify(bad);
  assert.throws(
    () => editClosedCurve(bad, "toggle-whole"),
    /cross|hole|collapse/,
  );
  assert.equal(JSON.stringify(bad), before);
  const close = fixture([
    rect,
    [
      { x: -19, y: -19 },
      { x: 19, y: -19 },
      { x: 19, y: 19 },
      { x: -19, y: 19 },
    ],
  ]);
  assert.throws(
    () => editClosedCurve(close, "toggle-whole", 1),
    /hole|join|cross/,
  );
});
test("restored contours remain aligned in existing world-space and reverse editing utilities", () => {
  let o = editClosedCurve(
    editClosedCurve(fixture(), "toggle-whole"),
    "toggle-whole",
  );
  sourceTransform(o, [0.8, 0.6, -0.6, 0.8, 30, 20]);
  o.rings = curveRings(o.curve);
  assert.deepEqual(bounds(curveRings(worldCurve(o))[0]), bounds(o.rings[0]));
  reverseArtwork(o);
  assert.deepEqual(bounds(o.rings[0]), bounds(curveRings(o.curve)[0]));
});
test('collapsed Pen handles initialize real curves and smooth tangents without losing their saved corner',()=>{
 let o=editClosedCurve(editClosedCurve(fixture(),'toggle-whole'),'toggle-whole');
 o.curve.nodes[0].out={...rect[0]};o.curve.nodes[0].in={...rect[0]};o.curve.nodes[1].in={...rect[1]};
 const edge=editClosedCurve(o,'toggle-segment');assert.notDeepEqual(edge.curve.nodes[0].out,rect[0]);
 const smooth=editClosedCurve(o,'smooth');const n=smooth.curve.nodes[0];assert(Math.hypot(n.in.x-n.x,n.in.y-n.y)>0);assert(Math.hypot(n.out.x-n.x,n.out.y-n.y)>0);
 const restored=editClosedCurve(smooth,'toggle-node');assert.deepEqual(restored.curve.nodes[0].in,rect[0]);assert.deepEqual(restored.curve.nodes[0].out,rect[0]);
 const symmetric=editClosedCurve(o,'symmetric').curve.nodes[0];assert(Math.abs(Math.hypot(symmetric.in.x-symmetric.x,symmetric.in.y-symmetric.y)-Math.hypot(symmetric.out.x-symmetric.x,symmetric.out.y-symmetric.y))<1e-9);
});
