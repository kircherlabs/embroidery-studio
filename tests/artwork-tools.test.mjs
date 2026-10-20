import test from "node:test";
import assert from "node:assert/strict";
import { object, validateProject, objectBounds } from "../src/model.js";
import { smartShape, roundChecked } from "../src/creative.js";
import {
  identity,
  curveRings,
  mapPoint,
  shapeRings,
} from "../src/smart-geometry.js";
import {
  transformSelection,
  groupSelection,
  leaves,
  copySelection,
  pasteSelection,
} from "../src/hierarchy.js";
import { syncLinkedArtwork, unlinkArtwork } from "../src/linked-artwork.js";
import { regenerateShape } from "../src/smart-geometry.js";
import {
  setArtworkEffects,
  removeArtworkEffects,
  bakeArtworkEffects,
  simplifyContour,
} from "../src/artwork-effects.js";
import { captureStyle, transferStyle } from "../src/style-transfer.js";
import { repeatArtwork } from "../src/repeats.js";
import { makeOperation, operationsOf, applique } from "../src/operations.js";
import { generate } from "../src/engine.js";
import { fillPolygons } from "../src/geometry.js";
import { reverseArtwork } from "../src/path-editing.js";
const project = (objects) => ({
  version: 1,
  name: "Artwork tools",
  machine: "se700",
  objects,
  groups: [],
  planning: { smallDetail: 0 },
});
const near = (a, b, t = 1e-6) => assert(Math.abs(a - b) < t, `${a} != ${b}`);
const nearRings = (a, b) => {
  assert.deepEqual(
    a.map((r) => r.length),
    b.map((r) => r.length),
  );
  a.forEach((r, i) =>
    r.forEach((p, j) => {
      near(p.x, b[i][j].x, 1e-10);
      near(p.y, b[i][j].y, 1e-10);
    }),
  );
};
const square = (r) => [
  { x: -r, y: -r },
  { x: r, y: -r },
  { x: r, y: r },
  { x: -r, y: r },
];
test("effects reconstruct from the original and restore full Smart source without touching actions", () => {
  const o = smartShape("rect", 20, 12, { radius: 1 }),
    original = structuredClone(o),
    p = project([o]);
  o.operations = [
    makeOperation("fill", o),
    { ...makeOperation("border", o), color: "#ff0000" },
  ];
  const ops = structuredClone(o.operations),
    before = generate(p);
  setArtworkEffects(o, { offset: 1, simplify: 0.01 });
  near(objectBounds(o).width, 22, 0.03);
  assert(!o.shape);
  assert.deepEqual(o.effects.source.shape, original.shape);
  const first = structuredClone(o.rings);
  setArtworkEffects(o, { offset: 1, simplify: 0.01 });
  assert.deepEqual(o.rings, first);
  setArtworkEffects(o, { offset: 2 });
  near(objectBounds(o).width, 24, 0.03);
  assert.notDeepEqual(generate(p).events, before.events);
  assert.deepEqual(o.operations, ops);
  validateProject(JSON.parse(JSON.stringify(p)));
  removeArtworkEffects(o);
  assert.deepEqual(o.rings, original.rings);
  assert.deepEqual(o.shape, original.shape);
  assert.deepEqual(o.operations, ops);
});
test("effect transforms compose once and removal restores rotated/scaled/mirrored Bézier controls", () => {
  const curve = {
    closed: true,
    frame: identity(),
    nodes: [
      { x: -8, y: -5, out: { x: -2, y: -8 } },
      { x: 8, y: -5 },
      { x: 6, y: 7 },
      { x: -8, y: 7 },
    ],
  };
  const o = object("Curve", curveRings(curve), { curve, closed: true }),
    expected = structuredClone(o);
  setArtworkEffects(o, { offset: 0.5, simplify: 0.02 });
  const move = {
    sx: -1.3,
    sy: 0.7,
    angle: 23,
    dx: 9,
    dy: -4,
    pivot: { x: 0, y: 0 },
  };
  transformSelection([o], move);
  transformSelection([expected], move);
  const previous = structuredClone(o.rings);
  setArtworkEffects(o, { offset: 0.5, simplify: 0.02 });
  nearRings(o.rings, previous);
  removeArtworkEffects(o);
  assert.deepEqual(o.curve, expected.curve);
  nearRings(o.rings, expected.rings);
});
test("closed simplification removes redundant nodes but preserves holes and original, open paths keep endpoints", () => {
  const outer = square(10).flatMap((a, i) => [
    a,
    {
      x: (a.x + square(10)[(i + 1) % 4].x) / 2,
      y: (a.y + square(10)[(i + 1) % 4].y) / 2,
    },
  ]);
  const o = object("Counter", [outer, square(3)], { fillRule: "evenodd" });
  setArtworkEffects(o, { simplify: 0.05, offset: 0.5 });
  assert.equal(fillPolygons(o.rings, o.fillRule)[0].length, 2);
  assert.equal(o.effects.source.rings[0].length, 8);
  removeArtworkEffects(o);
  assert.deepEqual(o.rings[0], outer);
  const r = [
    { x: 0, y: 0 },
    { x: 1, y: 0.001 },
    { x: 2, y: 0 },
  ];
  assert.deepEqual(simplifyContour(r, 0.01, false), [r[0], r[2]]);
});
test("collapsed offsets and unsupported effects are rejected atomically; bake and source rounding are explicit", () => {
  const o = object("Narrow", [square(0.5)]),
    before = structuredClone(o);
  assert.throws(
    () => setArtworkEffects(o, { offset: -1 }),
    /empty|collaps|merg/,
  );
  assert.deepEqual(o, before);
  o.satinRails = {};
  assert.throws(() => setArtworkEffects(o, { offset: 1 }), /rail/);
  delete o.satinRails;
  const open = object(
    "Open",
    [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    ],
    { type: "run", closed: false },
  );
  assert.throws(() => setArtworkEffects(open, { offset: 1 }), /closed/);
  setArtworkEffects(o, { offset: 0.1 });
  assert.throws(() => roundChecked(o, 0.1), /bake/i);
  assert.throws(() => reverseArtwork(o), /Bake/);
  const r = structuredClone(o.rings);
  bakeArtworkEffects(o);
  assert(!o.effects);
  assert.deepEqual(o.rings, r);
});
test("effect source validates parameters, bounded data and nested source compatibility", () => {
  const o = smartShape("star", 20, 20);
  setArtworkEffects(o, { simplify: 0.01 });
  const p = project([o]);
  validateProject(p);
  for (const corrupt of [
    (e) => (e.source.effects = {}),
    (e) => (e.frame[0] = 0),
    (e) => (e.simplify = 2),
    (e) => (e.source.rings[0][0].x = NaN),
    (e) => (e.source.shape.sides = 2),
  ]) {
    const bad = structuredClone(p);
    corrupt(bad.objects[0].effects);
    assert.throws(() => validateProject(bad));
  }
});
test("color-only transfer updates selected action and changes thread without changing needles", () => {
  const src = smartShape("ellipse", 12, 12),
    target = smartShape("rect", 12, 10);
  src.color = "#ff0000";
  target.operations = [
    makeOperation("fill", target),
    makeOperation("border", target),
  ];
  const before = generate(project([target])),
    style = captureStyle(src),
    id = target.operations[1].id;
  transferStyle([target], style, "color", { activeOperationId: id });
  assert.equal(target.operations[0].color, target.color);
  assert.equal(target.operations[1].color, src.color);
  const coords = (p) =>
    p.events.filter((e) => e.cmd === "stitch").map((e) => [e.x, e.y]);
  assert.deepEqual(coords(generate(project([target]))), coords(before));
});
test("whole styles populate empty setups and bulk scope updates compatible sewing actions without touching stops", () => {
  const source = smartShape("ellipse", 8, 8),
    a = smartShape("rect", 8, 8),
    b = smartShape("rect", 8, 8);
  source.operations = [
    { ...makeOperation("triple", source), color: "#123456" },
  ];
  a.operations = [];
  transferStyle([a], captureStyle(source), "stack");
  assert.equal(a.operations.length, 1);
  assert.equal(a.operations[0].type, "triple");
  b.operations = [
    makeOperation("run", b),
    makeOperation("stop", b),
    makeOperation("border", b),
  ];
  const pause = structuredClone(b.operations[1]);
  transferStyle([a, b], captureStyle(source), "color", {
    bulkOperations: "all",
  });
  assert(
    b.operations
      .filter((op) => op.type !== "stop")
      .every((op) => op.color === "#123456"),
  );
  assert.deepEqual(b.operations[1], pause);
});
test("single-action style transfer preserves IDs, other actions and geometry while changing actual reinforcement", () => {
  const src = smartShape("rect", 10, 8),
    target = smartShape("rect", 10, 8);
  src.operations = [makeOperation("bean", src)];
  src.operations[0].length = 1;
  target.operations = [
    makeOperation("run", target),
    makeOperation("border", target),
  ];
  const ring = structuredClone(target.rings),
    id = target.operations[0].id,
    border = structuredClone(target.operations[1]),
    before = generate(project([target])).stats.stitches;
  transferStyle([target], captureStyle(src), "action", {
    activeOperationId: id,
  });
  assert.equal(target.operations.length, 2);
  assert.equal(target.operations[0].id, id);
  assert.equal(target.operations[0].type, "bean");
  assert.equal(target.operations[0].name, "Bean stitch");
  assert.deepEqual(target.operations[1], border);
  assert.deepEqual(target.rings, ring);
  assert(generate(project([target])).stats.stitches > before);
});
test("whole setup copies independent IDs, disabled states and stops, but never source guides or entry points", () => {
  const src = smartShape("rect", 14, 12),
    target = smartShape("rect", 18, 15);
  src.operations = applique(src);
  src.operations[0].enabled = false;
  src.operations.at(-1).satinGuides = [
    { a: { x: 1, y: 0 }, b: { x: 2, y: 1 } },
  ];
  src.operations.at(-1).startIndex = 3;
  transferStyle([target], captureStyle(src, src.operations[2].id), "stack");
  assert.equal(target.operations.length, 5);
  assert.equal(target.operations[0].enabled, false);
  assert.equal(target.operations.filter((op) => op.type === "stop").length, 2);
  assert(
    target.operations.every(
      (op) => !src.operations.some((s) => s.id === op.id),
    ),
  );
  assert(
    target.operations.every((op) => !op.satinGuides && op.startIndex === 0),
  );
  assert.equal(generate(project([target])).stats.stops, 2);
  validateProject(JSON.parse(JSON.stringify(project([target]))));
});
test("style transfer validates all targets before changing any, including closed areas and rail dependency", () => {
  const src = smartShape("rect", 10, 10),
    a = smartShape("ellipse", 8, 8),
    b = object(
      "Open",
      [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      ],
      { type: "run", closed: false },
    );
  const before = structuredClone([a, b]);
  assert.throws(
    () => transferStyle([a, b], captureStyle(src), "action"),
    /closed/,
  );
  assert.deepEqual([a, b], before);
  src.operations = [{ ...makeOperation("column", src), columnMode: "rails" }];
  assert.throws(() => transferStyle([a], captureStyle(src), "action"), /rails/);
});
test("linear repeats preserve nested groups, Smart sources, original settings and source manual sewing order", () => {
  const a = smartShape("rect", 4, 4),
    b = smartShape("ellipse", 3, 3),
    end = smartShape("star", 4, 4),
    p = project([a, b, end]);
  transformSelection([b], { dx: 7 });
  const nested = groupSelection(p, [b.id], "Nested"),
    parent = groupSelection(p, [a.id, nested], "Design");
  p.sequencing = {
    mode: "manual",
    origin: "sequence",
    order: [b.id, a.id, end.id],
  };
  const original = structuredClone([a, b]);
  const added = repeatArtwork(p, [parent], { count: 3, dx: 15, dy: 2 });
  assert.equal(added.length, 2);
  assert.equal(p.objects.length, 7);
  assert.deepEqual(
    p.objects.filter((o) => [a.id, b.id].includes(o.id)),
    original,
  );
  assert.equal(p.groups.filter((g) => g.name === "Nested").length, 3);
  const first = leaves(p, [added[0]]);
  near(objectBounds(first[0]).minX, objectBounds(a).minX + 15);
  assert(first[0].shape);
  assert.deepEqual(p.sequencing.order, [
    b.id,
    a.id,
    first[1].id,
    first[0].id,
    ...leaves(p, [added[1]])
      .reverse()
      .map((o) => o.id),
    end.id,
  ]);
  validateProject(JSON.parse(JSON.stringify(p)));
});
test("radial copies rotate geometry and direction about an explicit center; fixed-orientation option stays upright", () => {
  for (const rotate of [true, false]) {
    const o = smartShape("rect", 4, 2, { frame: [1, 0, 0, 1, 15, 0] }),
      p = project([o]);
    o.operations = [{ ...makeOperation("fill", o), angle: 20 }];
    const [id] = repeatArtwork(p, [o.id], {
        mode: "radial",
        count: 2,
        angle: 90,
        cx: 0,
        cy: 0,
        rotate,
      }),
      n = p.objects.find((o) => o.id === id),
      b = objectBounds(n);
    near((b.minX + b.maxX) / 2, 0);
    near((b.minY + b.maxY) / 2, 15);
    near(b.width, rotate ? 2 : 4);
    near(n.operations[0].angle, rotate ? 110 : 20);
    nearRings(n.rings, shapeRings(n.shape));
  }
});
test("mirrored repeats reflect closed Bézier handles, holes and operations while originals stay unchanged", () => {
  const c = {
    nodes: [
      { x: -8, y: 0, out: { x: -3, y: -5 } },
      { x: 5, y: 2 },
      { x: -3, y: 7 },
    ],
    closed: true,
    frame: identity(),
  };
  const o = object("Curve", curveRings(c), { curve: c, closed: true }),
    p = project([o]),
    before = structuredClone(o);
  o.operations = [makeOperation("border", o)];
  const [id] = repeatArtwork(p, [o.id], {
      mode: "mirror-x",
      count: 2,
      dx: 20,
      dy: 0,
    }),
    n = p.objects.find((o) => o.id === id),
    b = objectBounds(o),
    center = (b.minX + b.maxX) / 2;
  n.rings[0].forEach((pt, i) => {
    near(pt.x, 2 * center - before.rings[0][i].x + 20);
    near(pt.y, before.rings[0][i].y);
  });
  assert.deepEqual(n.curve.nodes, c.nodes);
  near(
    mapPoint(c.nodes[0].out, n.curve.frame).x,
    2 * center - c.nodes[0].out.x + 20,
  );
  assert.equal(n.operations[0].width, o.operations[0].width);
  assert.notEqual(n.operations[0].id, o.operations[0].id);
});
test("repeats remap complete patch links and preserve stops; partial linked boundaries and locked descendants are rejected", () => {
  const boundary = smartShape("rect", 20, 15),
    artwork = smartShape("ellipse", 8, 8),
    p = project([boundary, artwork]);
  boundary.operations = applique(boundary);
  boundary.constructionArtworkIds = [artwork.id];
  const before = structuredClone(p);
  assert.throws(() => repeatArtwork(p, [boundary.id]), /complete patch/);
  assert.deepEqual(p, before);
  const parent = groupSelection(p, [boundary.id, artwork.id], "Patch");
  const [id] = repeatArtwork(p, [parent], { count: 2, dx: 25 }),
    pair = leaves(p, [id]);
  assert.deepEqual(pair[0].constructionArtworkIds, [pair[1].id]);
  assert.equal(generate(p).stats.stops, 4);
  pair[1].locked = true;
  assert.throws(() => repeatArtwork(p, [id]), /Unlock/);
});
test("linked repeats follow source edits, preserve instance transforms and independent sewing settings", () => {
  const o = smartShape("rect", 8, 6),
    p = project([o]);
  o.operations = [makeOperation("fill", o)];
  const [id] = repeatArtwork(p, [o.id], { count: 2, dx: 15, linked: true }),
    copy = p.objects.find((n) => n.id === id);
  assert(copy.linkedGeometry);
  assert(!copy.shape);
  copy.operations[0].color = "#ff0000";
  transformSelection([copy], { angle: 30, dx: 2 });
  const frame = structuredClone(copy.linkedGeometry.frame);
  p.objects[0].shape.width = 12;
  regenerateShape(p.objects[0]);
  // Engine resolves source geometry even if cached instance contours are stale.
  const before = structuredClone(p),
    plan = generate(p);
  assert.deepEqual(p, before);
  assert(plan.events.some((e) => e.objectId === copy.id));
  syncLinkedArtwork(p);
  assert.deepEqual(copy.linkedGeometry.frame, frame);
  nearRings(
    copy.rings,
    p.objects[0].rings.map((r) => r.map((pt) => mapPoint(pt, frame))),
  );
  assert.equal(copy.operations[0].color, "#ff0000");
  assert.equal(p.objects[0].operations[0].color, o.color);
  validateProject(JSON.parse(JSON.stringify(p)));
  unlinkArtwork(p, copy);
  assert(!copy.linkedGeometry);
  assert(copy.shape);
  nearRings(copy.rings, shapeRings(copy.shape));
  p.objects[0].shape.width = 16;
  regenerateShape(p.objects[0]);
  syncLinkedArtwork(p);
  assert.equal(copy.shape.width, 12);
});
test("copy/paste remaps linked originals inside subtrees, and deleting a source retains cached geometry", () => {
  const o = smartShape("ellipse", 6, 8),
    p = project([o]);
  const [id] = repeatArtwork(p, [o.id], { count: 2, dx: 12, linked: true });
  const group = groupSelection(p, [o.id, id], "Linked motif"),
    clip = copySelection(p, [group]);
  const [newGroup] = pasteSelection(p, clip),
    pair = leaves(p, [newGroup]);
  assert.equal(pair[1].linkedGeometry.sourceId, pair[0].id);
  syncLinkedArtwork(p);
  validateProject(p);
  const originalCopy = p.objects.find((n) => n.id === id),
    cached = structuredClone(originalCopy.rings);
  p.objects = p.objects.filter((n) => n.id !== o.id);
  assert.equal(syncLinkedArtwork(p), 1);
  assert(!originalCopy.linkedGeometry);
  assert.deepEqual(originalCopy.rings, cached);
  validateProject(p);
});
test("linked validation rejects cycles, missing originals and incompatible rail sources without partial repeat changes", () => {
  const o = smartShape("ellipse", 8, 8),
    p = project([o]);
  const [id] = repeatArtwork(p, [o.id], { count: 2, linked: true });
  const bad = structuredClone(p);
  bad.objects[0].linkedGeometry = { sourceId: id, frame: identity() };
  delete bad.objects[0].shape;
  assert.throws(() => validateProject(bad), /original/);
  bad.objects[0].linkedGeometry.sourceId = "missing";
  assert.throws(() => validateProject(bad), /original/);
  const rail = smartShape("rect", 8, 8);
  rail.satinRails = {};
  const r = project([rail]),
    before = structuredClone(r);
  assert.throws(
    () => repeatArtwork(r, [rail.id], { linked: true }),
    /paired satin/,
  );
  assert.deepEqual(r, before);
});
