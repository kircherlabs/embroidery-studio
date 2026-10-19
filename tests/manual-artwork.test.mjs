import { createSurroundingPatch } from "../src/construction.js";
import test from "node:test";
import assert from "node:assert/strict";
import { demo, object, translate, validateProject } from "../src/model.js";
import { addReference } from "../src/references.js";
import { arrangeArtwork } from "../src/arrange.js";
import { smartShape } from "../src/creative.js";
import { generate } from "../src/engine.js";
import {
  copySelection,
  pasteSelection,
  deleteSelection,
  selectionBounds,
  transformSelection,
} from "../src/hierarchy.js";
import {
  curveRings,
  mapPoint,
  regenerateShape,
} from "../src/smart-geometry.js";
import {
  fillPolygons,
  polygonArea,
  safeConnector,
  distance,
} from "../src/geometry.js";
import { makeOperation } from "../src/operations.js";
import { sewingIds, useTreeOrder } from "../src/sequencing.js";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const asset = () => ({
  name: "Reference.png",
  width: 200,
  height: 100,
  data: png,
});
const project = (objects) => ({
  version: 1,
  name: "Manual artwork",
  machine: "se700",
  objects,
});
const near = (a, b, t = 1e-6) => assert(Math.abs(a - b) <= t, `${a} != ${b}`);
const nearRings = (a, b) => {
  assert.equal(a.flat().length, b.flat().length);
  a.flat().forEach((p, i) => {
    near(p.x, b.flat()[i].x);
    near(p.y, b.flat()[i].y);
  });
};
test("reference transforms, opacity and off-hoop placement never change any embroidery command or statistic", () => {
  const p = demo(),
    before = generate(p),
    ref = addReference(p, asset());
  assert(ref.locked);
  assert.equal(ref.type, "reference");
  assert.equal(p.objects[0], ref);
  ref.locked = false;
  transformSelection([ref], { sx: 1.3, sy: 0.7, angle: 37, dx: 650, dy: 400 });
  ref.reference.opacity = 0.17;
  validateProject(p);
  const after = generate(p);
  assert.deepEqual(after.events, before.events);
  assert.deepEqual(after.stats, before.stats);
  assert.deepEqual(after.warnings, before.warnings);
  assert.deepEqual(after.issues, before.issues);
  useTreeOrder(p);
  assert(!sewingIds(p).includes(ref.id));
  const only = project([]);
  addReference(only, asset());
  const empty = generate(only);
  assert.equal(empty.events.length, 0);
  assert.equal(empty.stats.stitches, 0);
  assert.equal(empty.stats.jumps, 0);
  assert.equal(empty.stats.trims, 0);
  assert.equal(empty.stats.changes, 0);
  assert(empty.stats.fits);
  assert.equal(empty.issues.length, 0);
});
test("reference duplication shares bytes, clipboard transfers assets, deletion prunes only unused images, and serialization is portable", () => {
  const p = project([]),
    ref = addReference(p, asset());
  ref.locked = false;
  const clip = copySelection(p, [ref.id]),
    ids = pasteSelection(p, clip),
    copy = p.objects.find((o) => o.id === ids[0]);
  assert.equal(copy.reference.assetId, ref.reference.assetId);
  assert.equal(Object.keys(p.referenceAssets).length, 1);
  assert.equal(p.referenceAssets[ref.reference.assetId].data, png);
  near(copy.rings[0][0].x, ref.rings[0][0].x + 3);
  const q = project([]);
  pasteSelection(q, clip);
  validateProject(q);
  assert.equal(Object.values(q.referenceAssets)[0].data, png);
  const saved = JSON.parse(JSON.stringify(p));
  validateProject(saved);
  assert.deepEqual(saved, p);
  deleteSelection(p, [copy.id]);
  assert.equal(Object.keys(p.referenceAssets).length, 1);
  deleteSelection(p, [ref.id]);
  assert.equal(Object.keys(p.referenceAssets).length, 0);
  const bad = structuredClone(q);
  bad.objects[0].operations = [];
  assert.throws(() => validateProject(bad), /reference layer/);
  const broken = structuredClone(q);
  broken.referenceAssets[broken.objects[0].reference.assetId].data =
    "https://example.com/image.png";
  assert.throws(() => validateProject(broken), /embedded reference/);
});
test("flipping Smart shapes after rotation and free scaling transforms their actual geometry and retained parameters", () => {
  for (const kind of ["rect", "ellipse", "regular", "star"]) {
    const o = smartShape(kind, 18, 13, { radius: 1, sides: 7 }),
      p = project([o]);
    transformSelection([o], { sx: 1.4, sy: 0.7, angle: 29, dx: 8, dy: -6 });
    const original = structuredClone(o),
      b = selectionBounds([o]),
      cx = (b.minX + b.maxX) / 2,
      cy = (b.minY + b.maxY) / 2;
    arrangeArtwork(p, [o.id], "flip-horizontal");
    nearRings(
      o.rings,
      original.rings.map((r) => r.map((q) => ({ x: 2 * cx - q.x, y: q.y }))),
    );
    regenerateShape(o);
    nearRings(
      o.rings,
      original.rings.map((r) => r.map((q) => ({ x: 2 * cx - q.x, y: q.y }))),
    );
    arrangeArtwork(p, [o.id], "flip-vertical");
    nearRings(
      o.rings,
      original.rings.map((r) =>
        r.map((q) => ({ x: 2 * cx - q.x, y: 2 * cy - q.y })),
      ),
    );
    for (const key of [
      "width",
      "height",
      "spacing",
      "length",
      "compensation",
      "underlay",
      "color",
    ])
      assert.equal(o[key], original[key]);
    validateProject(p);
  }
});
test("nested groups and multiselections reflect once around shared bounds without changing layers, parents or manual sewing order", () => {
  const a = smartShape("rect", 6, 9),
    b = smartShape("star", 7, 12),
    c = smartShape("ellipse", 4, 8);
  translate(a, -15, 3);
  translate(b, 7, -4);
  translate(c, 20, 4);
  const p = project([a, b, c]);
  p.groups = [
    { id: "svg", name: "Imported SVG", kind: "svg" },
    { id: "nested", name: "Nested", kind: "group", parentId: "svg" },
  ];
  a.parentId = "nested";
  b.parentId = "svg";
  useTreeOrder(p);
  const snapshot = structuredClone(p),
    bounds = selectionBounds(p.objects),
    cx = (bounds.minX + bounds.maxX) / 2;
  arrangeArtwork(p, ["svg", c.id], "flip-horizontal");
  p.objects.forEach((o, i) => {
    nearRings(
      o.rings,
      snapshot.objects[i].rings.map((r) =>
        r.map((q) => ({ x: 2 * cx - q.x, y: q.y })),
      ),
    );
    assert.equal(o.parentId, snapshot.objects[i].parentId);
    assert.equal(o.id, snapshot.objects[i].id);
  });
  assert.deepEqual(p.sequencing, snapshot.sequencing);
  assert.deepEqual(p.groups, snapshot.groups);
  c.locked = true;
  const fixed = structuredClone(c);
  arrangeArtwork(p, [c.id], "flip-vertical");
  assert.deepEqual(c, fixed);
});
test("open and closed Bézier anchors and control handles are reflected through the editable frame", () => {
  for (const closed of [false, true]) {
    const curve = {
        closed,
        frame: [1.2, 0.3, -0.1, 0.8, 10, -4],
        nodes: [
          { x: 0, y: 0, out: { x: 2, y: -4 } },
          { x: 6, y: 2, in: { x: 3, y: 4 }, out: { x: 8, y: 4 } },
          { x: 9, y: 7, in: { x: 10, y: 3 } },
        ],
      },
      o = object("Curve", curveRings(curve), {
        type: closed ? "fill" : "run",
        closed,
        curve,
      }),
      p = project([o]);
    const old = structuredClone(o),
      b = selectionBounds([o]),
      cx = (b.minX + b.maxX) / 2;
    arrangeArtwork(p, [o.id], "flip-horizontal");
    nearRings(
      o.rings,
      old.rings.map((r) => r.map((q) => ({ x: 2 * cx - q.x, y: q.y }))),
    );
    for (let i = 0; i < curve.nodes.length; i++)
      for (const key of ["anchor", "in", "out"]) {
        const n = old.curve.nodes[i],
          point = key === "anchor" ? n : n[key];
        if (!point) continue;
        const a = mapPoint(point, old.curve.frame),
          next = key === "anchor" ? o.curve.nodes[i] : o.curve.nodes[i][key],
          world = mapPoint(next, o.curve.frame);
        near(world.x, 2 * cx - a.x);
        near(world.y, a.y);
      }
    nearRings(curveRings(o.curve), o.rings);
    assert.equal(o.curve.closed, closed);
    validateProject(p);
  }
});
test("mirrored nonzero counters remain holes, embroidery methods regenerate safely, and local satin guides follow the mirror", () => {
  const outer = [
      { x: -9, y: -10 },
      { x: 7, y: -10 },
      { x: 7, y: 10 },
      { x: -9, y: 10 },
    ],
    hole = [
      { x: -5, y: -5 },
      { x: -5, y: 5 },
      { x: 2, y: 5 },
      { x: 2, y: -5 },
    ];
  for (const method of ["fill", "column", "run", "satin", "border"]) {
    const o = object(
        "Asymmetric counter",
        [structuredClone(outer), structuredClone(hole)],
        { fillRule: "nonzero", closed: true },
      ),
      p = project([o]);
    o.operations = [{ ...makeOperation(method, o), compensation: 0 }];
    if (method === "column")
      o.operations[0].satinGuides = [{ a: { x: 3, y: 2 }, b: { x: 7, y: 2 } }];
    const area = polygonArea(fillPolygons(o.rings, "nonzero")),
      settings = structuredClone(o.operations[0]);
    arrangeArtwork(p, [o.id], "flip-horizontal");
    near(polygonArea(fillPolygons(o.rings, "nonzero")), area);
    assert.equal(fillPolygons(o.rings, "nonzero")[0].length, 2);
    validateProject(p);
    const plan = generate(p);
    assert(plan.events.some((e) => e.cmd === "stitch"));
    assert(
      plan.events.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)),
    );
    assert(plan.stats.fits);
    for (const key of [
      "spacing",
      "width",
      "color",
      "length",
      "underlay",
      "compensation",
    ])
      assert.equal(o.operations[0][key], settings[key]);
    if (method === "column")
      assert.deepEqual(o.operations[0].satinGuides, [
        { a: { x: -5, y: 2 }, b: { x: -9, y: 2 } },
      ]);
  }
});
test("duplicate then flip preserves the original and manual command kinds and positions survive mirroring", () => {
  const a = object(
      "Half",
      [
        [
          { x: 0, y: 0 },
          { x: 8, y: 1 },
          { x: 3, y: 9 },
        ],
      ],
      { closed: true },
    ),
    p = project([a]),
    original = structuredClone(a),
    ids = pasteSelection(p, copySelection(p, [a.id]), 0);
  arrangeArtwork(p, ids, "flip-horizontal");
  assert.deepEqual(a, original);
  const copy = p.objects[1];
  near(copy.rings[0][0].x, 8);
  translate(copy, 8, 0);
  assert.deepEqual(a, original);
  const symmetric = [...a.rings.flat(), ...copy.rings.flat()];
  for (const p of symmetric)
    assert(
      symmetric.some((q) => Math.hypot(q.x - (16 - p.x), q.y - p.y) < 1e-7),
    );
  const m = object("Manual", [], {
      type: "manual",
      commands: [
        { cmd: "jump", x: -5, y: -2 },
        { cmd: "stitch", x: -5, y: -2 },
        { cmd: "stitch", x: 3, y: -1 },
        { cmd: "trim", x: 3, y: -1 },
        { cmd: "stop", x: 3, y: -1 },
        { cmd: "jump", x: 1, y: 6 },
        { cmd: "stitch", x: 1, y: 6 },
        { cmd: "end", x: 1, y: 6 },
      ],
    }),
    q = project([m]),
    before = structuredClone(m.commands),
    b = selectionBounds([m]),
    cy = (b.minY + b.maxY) / 2;
  arrangeArtwork(q, [m.id], "flip-vertical");
  m.commands.forEach((c, i) => {
    assert.equal(c.cmd, before[i].cmd);
    near(c.x, before[i].x);
    near(c.y, 2 * cy - before[i].y);
  });
  validateProject(q);
});

test("surrounding patch sizing ignores selected reference layers outside the hoop", () => {
  const shape = smartShape("rect", 20, 12),
    p = project([shape]),
    ref = addReference(p, asset());
  ref.locked = false;
  translate(ref, 600, 0);
  const { boundary } = createSurroundingPatch(p, [ref.id, shape.id], {
    kind: "rectangle",
    margin: 3,
    border: 2,
  });
  near(selectionBounds([boundary]).width, 26);
  near(selectionBounds([boundary]).height, 18);
  assert.deepEqual(boundary.constructionArtworkIds, [shape.id]);
  assert(generate(p).stats.fits);
});
