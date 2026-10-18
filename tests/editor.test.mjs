import test from "node:test";
import assert from "node:assert/strict";
import { object, validateProject } from "../src/model.js";
import {
  leaves,
  roots,
  groupSelection,
  ungroupSelection,
  copySelection,
  pasteSelection,
  transformSelection,
  selectionBounds,
  children,
  reorder,
  deleteSelection,
} from "../src/hierarchy.js";
import {
  applique,
  makeOperation,
  offsetRings,
  operationObject,
} from "../src/operations.js";
import { generate } from "../src/engine.js";
import { alignSelection } from "../src/hierarchy.js";
import { commonValue } from "../src/inspector.js";
import { duplicateArtwork } from "../src/artwork-diagnostics.js";
const rect = (name, x = 0, y = 0, w = 10, h = 8, props = {}) =>
  object(
    name,
    [
      [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
    ],
    { underlay: false, compensation: 0, ...props },
  );
const project = (objects) => ({
  version: 1,
  name: "Editor",
  machine: "se700",
  objects,
  planning: { smallDetail: 0 },
});

test("nested selection deduplicates descendants and transforms shared geometry once", () => {
  const p = project([rect("A"), rect("B", 20)]),
    group = groupSelection(
      p,
      p.objects.map((o) => o.id),
      "SVG",
    );
  const nested = groupSelection(p, [p.objects[0].id], "Nested");
  assert.deepEqual(roots(p, [group, nested, p.objects[0].id]), [group]);
  const selected = leaves(p, [group, nested, p.objects[0].id]);
  const old = structuredClone(selected);
  transformSelection(selected, {
    sx: 2,
    sy: 2,
    pivot: { x: 0, y: 0 },
    dx: 3,
    dy: 4,
  });
  selected.forEach((o, i) =>
    o.rings.flat().forEach((q, j) => {
      assert.equal(q.x, old[i].rings.flat()[j].x * 2 + 3);
      assert.equal(q.y, old[i].rings.flat()[j].y * 2 + 4);
    }),
  );
  validateProject(JSON.parse(JSON.stringify(p)));
});
test("hiding a parent excludes all its stitches while locking preserves manufacture and source", () => {
  const p = project([rect("A"), rect("B", 20)]),
    id = groupSelection(
      p,
      p.objects.map((o) => o.id),
    );
  const before = generate(p).events;
  p.groups[0].locked = true;
  assert.equal(leaves(p, [id], { editable: true }).length, 0);
  assert.deepEqual(generate(p).events, before);
  p.groups[0].visible = false;
  assert.equal(generate(p).events.length, 0);
  p.groups[0].visible = true;
  assert.deepEqual(generate(p).events, before);
  deleteSelection(p, [id]);
  assert.equal(p.objects.length, 2);
});
test("copy remaps nested groups, operation identifiers and SVG fill associations", () => {
  const a = rect("Fill"),
    b = rect("Outline", 0, 0, 10, 8, {
      type: "run",
      closed: true,
      svgFillId: a.id,
      svgSource: true,
    });
  a.operations = applique(a);
  const p = project([a, b]),
    id = groupSelection(p, [a.id, b.id], "Imported");
  const copies = pasteSelection(p, copySelection(p, [id]), 5);
  assert.equal(copies.length, 1);
  assert.equal(p.objects.length, 4);
  validateProject(p);
  const added = leaves(p, copies);
  assert.equal(added[1].svgFillId, added[0].id);
  assert.notEqual(added[0].operations[0].id, a.operations[0].id);
  assert.equal(added[0].rings[0][0].x, a.rings[0][0].x + 5);
  const ids = ungroupSelection(p, copies);
  assert.equal(ids.length, 2);
  assert.equal(p.groups.length, 1);
  validateProject(p);
});
test("reordering a group moves its complete source block and leaves manual settings intact", () => {
  const p = project([rect("A"), rect("B", 15), rect("C", 30)]),
    group = groupSelection(
      p,
      p.objects.slice(0, 2).map((o) => o.id),
    );
  assert(reorder(p, [group], 1));
  assert.deepEqual(
    p.objects.map((o) => o.name),
    ["C", "A", "B"],
  );
  assert.deepEqual(
    children(p).map((o) => o.id),
    [p.objects[0].id, group],
  );
});

test("alignment and equal-gap distribution change source coordinates while retaining sizes", () => {
  const objects = [
    rect("A", -20, 3, 5, 10),
    rect("B", -4, 8, 8, 5),
    rect("C", 20, -2, 10, 6),
  ];
  const widths = objects.map((o) => selectionBounds([o]).width);
  alignSelection(objects, "top");
  assert(objects.every((o) => selectionBounds([o]).minY === -2));
  alignSelection(objects, "distribute-x");
  const boxes = objects.map((o) => selectionBounds([o]));
  assert.equal(boxes[1].minX - boxes[0].maxX, boxes[2].minX - boxes[1].maxX);
  assert.deepEqual(
    boxes.map((b) => b.width),
    widths,
  );
});

test("operation expansion retains small-island diagnostics and implicit SVG outline suppression", () => {
  const a = rect("Fill"),
    outline = {
      ...structuredClone(a),
      id: "outline",
      name: "SVG outline 2",
      type: "run",
      closed: true,
      svgSource: true,
      svgFillId: a.id,
    };
  a.rings.push([
    { x: 20, y: 20 },
    { x: 20.01, y: 20 },
    { x: 20.01, y: 20.01 },
  ]);
  a.operations = [makeOperation("fill", a)];
  const p = project([a, outline]);
  p.planning.smallDetail = 0.3;
  const plan = generate(p);
  assert(plan.diagnostics.skippedDetails > 0);
  assert(plan.diagnostics.skippedOutlines > 0);
  assert(
    !plan.events.some((e) => e.cmd === "stitch" && e.objectId === outline.id),
  );
});
test("hierarchy validation rejects cycles, orphan parents, duplicate groups and malformed operations", () => {
  const p = project([rect("A")]),
    id = groupSelection(p, [p.objects[0].id]);
  validateProject(p);
  for (const mutate of [
    (q) => (q.groups[0].parentId = id),
    (q) => (q.objects[0].parentId = "missing"),
    (q) => q.groups.push({ ...q.groups[0] }),
    (q) =>
      (q.objects[0].operations = [
        { id: "bad", name: "bad", type: "fill", spacing: 0 },
      ]),
  ]) {
    const q = structuredClone(p);
    mutate(q);
    assert.throws(() => validateProject(q));
  }
});
test("mixed inspector values remain indeterminate instead of choosing the first object", () => {
  assert.equal(
    commonValue([{ spacing: 0.4 }, { spacing: 0.5 }], "spacing"),
    undefined,
  );
  assert.equal(
    commonValue([{ spacing: 0.4 }, { spacing: 0.4 }], "spacing"),
    0.4,
  );
});

test("duplicate geometry is diagnostic only and does not remove intentional repeated passes", () => {
  const a = rect("A"),
    b = rect("Intentional repeat"),
    p = project([a, b]);
  const source = JSON.stringify(p),
    d = duplicateArtwork(p);
  assert.equal(d.length, 1);
  assert.equal(d[0].objectId, b.id);
  const plan = generate(p);
  assert(plan.events.some((e) => e.objectId === a.id));
  assert(plan.events.some((e) => e.objectId === b.id));
  assert.equal(JSON.stringify(p), source);
});

test("tatami stagger patterns change penetrations without changing area or machine limits", () => {
  const o = rect("Pattern", -10, -10, 20, 20),
    p = project([o]);
  const patterns = ["quarter", "half", "aligned"].map((pattern) => {
    o.pattern = pattern;
    return generate(p);
  });
  assert.notDeepEqual(patterns[0].events, patterns[1].events);
  assert.notDeepEqual(patterns[1].events, patterns[2].events);
  patterns.forEach((plan) => {
    assert(plan.stats.fits);
    assert(plan.stats.maxLength <= 7);
    assert.equal(plan.stats.jumps, 1);
  });
});
test("applique steps stay ordered, share geometry and carry real stop commands under color optimization", () => {
  const a = rect("Applique", -20, -10, 15, 15),
    b = rect("Second", 10, -10, 15, 15);
  a.operations = applique(a);
  b.operations = applique(b);
  const p = project([a, b]);
  const plan = generate(p);
  assert.equal(plan.stats.stops, 4);
  const runs = plan.events
    .filter((e) => e.cmd === "stitch" || e.cmd === "stop")
    .map((e) => [e.objectId, e.operationId])
    .filter((v, i, arr) => !i || v.join() !== arr[i - 1].join());
  assert.equal(runs.length, 10);
  for (const o of [a, b])
    assert.deepEqual(
      runs.filter((r) => r[0] === o.id).map((r) => r[1]),
      o.operations.map((op) => op.id),
    );
  assert.deepEqual(
    plan.events
      .filter((e) => e.cmd === "stitch")
      .map((e) => e.objectId)
      .filter((id, i, all) => !i || all[i - 1] !== id)
      .sort(),
    [a.id, b.id].sort(),
  );
  const before = structuredClone(a.rings);
  generate(p);
  assert.deepEqual(a.rings, before);
  a.operations[2].enabled = false;
  const changed = generate(p);
  assert(!changed.events.some((e) => e.operationId === a.operations[2].id));
  assert(changed.events.some((e) => e.operationId === a.operations[4].id));
});

test("color batching compares entire multicolor operation stacks instead of only their first thread", () => {
  const objects = [rect("A", -35), rect("B", -5), rect("C", 25)];
  [
    ["#ff0000", "#0000ff"],
    ["#0000ff", "#ff0000"],
    ["#ff0000", "#0000ff"],
  ].forEach(
    (colors, i) =>
      (objects[i].operations = colors.map((color) => ({
        ...makeOperation("run", objects[i]),
        color,
      }))),
  );
  const plan = generate(project(objects));
  assert.equal(plan.stats.manualChanges, 3);
  assert(plan.diagnostics.operationColorFallback);
  const runs = plan.events
    .filter((e) => e.cmd === "stitch")
    .map((e) => e.objectId)
    .filter((id, i, arr) => !i || arr[i - 1] !== id);
  assert.deepEqual(
    runs,
    objects.map((o) => o.id),
  );
});
test("Clipper offsets preserve holes and concave topology; tackdown contracts actual geometry", () => {
  const o = rect("Patch", -10, -10, 20, 20);
  o.rings.push([
    { x: -3, y: -3 },
    { x: -3, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: -3 },
  ]);
  const contracted = offsetRings(o, -0.4);
  assert.equal(contracted.length, 2);
  const b = selectionBounds([{ ...o, rings: contracted }]);
  assert(Math.abs(b.width - 19.2) < 0.001);
  const hole = contracted
    .map((r) => selectionBounds([{ ...o, rings: [r] }]))
    .sort((a, b) => a.width - b.width)[0];
  assert(Math.abs(hole.width - 6.8) < 0.001);
  const op = operationObject(o, makeOperation("tackdown", o));
  assert.equal(op.type, "run");
  assert.equal(op.closed, true);
});
test("bean stitches repeat each segment, triple run repeats the full contour, all enforce machine lengths", () => {
  const o = object(
    "Line",
    [
      [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
      ],
    ],
    { type: "run", length: 2, underlay: false, compensation: 0 },
  );
  for (const type of ["bean", "triple"]) {
    o.operations = [{ ...makeOperation(type, o), tieIn: false, tieOff: false }];
    const plan = generate(project([o]));
    const top = plan.events.filter(
      (e) => e.phase === type && e.cmd === "stitch",
    );
    assert.equal(top.length, 9);
    assert.equal(plan.stats.maxLength, 2);
    assert.equal(plan.stats.jumps, 1);
    assert.deepEqual(
      top.slice(0, 3).map((e) => e.x),
      type === "bean" ? [2, 0, 2] : [2, 4, 6],
    );
  }
});

test("explicit trim steps own their actual command and do not invent extra sewing or movements", () => {
  const o = rect("Patch");
  o.operations = ["run", "trim", "run"].map((type) => makeOperation(type, o));
  const plan = generate(project([o])),
    event = plan.events.find((e) => e.operationId === o.operations[1].id);
  assert(event);
  assert.equal(event.cmd, "trim");
  assert.equal(event.operationName, "Thread trim");
  assert.equal(plan.stats.trims, 2);
});
