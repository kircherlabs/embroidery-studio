import test from "node:test";
import assert from "node:assert/strict";
import {
  object,
  objectBounds,
  validateProject,
  MACHINES,
} from "../src/model.js";
import { smartShape, roundChecked } from "../src/creative.js";
import { setEmbroideryStyle, editOperations } from "../src/styles.js";
import {
  operationTargets,
  effectiveOperation,
  propertyApplies,
  makeOperation,
  operationObject,
} from "../src/operations.js";
import {
  preflightConstruction,
  refitPatch,
  patchBoundary,
  createSurroundingPatch,
  constructionOperations,
} from "../src/construction.js";
import { generate } from "../src/engine.js";
import { inside } from "../src/geometry.js";
import {
  copySelection,
  pasteSelection,
  transformSelection,
} from "../src/hierarchy.js";
import { regenerateShape } from "../src/smart-geometry.js";
const project = (objects) => ({
  version: 1,
  name: "Construction",
  machine: "se700",
  objects,
  planning: { smallDetail: 0 },
});
const needle = (plan) =>
  plan.events.filter((e) => e.cmd === "stitch").map((e) => [e.x, e.y]);

test("closed shape styles create editable operations with observably different stitches", () => {
  for (const kind of ["rect", "ellipse", "regular", "star"]) {
    const o = smartShape(kind, 25, 18),
      geometry = structuredClone(o.rings),
      sequences = [];
    for (const style of ["run", "border", "fill", "combined"]) {
      setEmbroideryStyle(o, style);
      assert.deepEqual(o.rings, geometry);
      assert(o.shape);
      const plan = generate(project([o]));
      assert(plan.stats.stitches > 15);
      assert(plan.stats.fits);
      sequences.push(needle(plan));
      assert.equal(o.operations.length, style === "combined" ? 2 : 1);
    }
    assert.notDeepEqual(sequences[0], sequences[1]);
    assert.notDeepEqual(sequences[2], sequences[3]);
  }
});
test("method edits retain closed source geometry and inherited values, with consistent active and bulk scope", () => {
  const a = smartShape("rect", 20, 15),
    b = smartShape("rect", 18, 12),
    state = { bulkOperations: "primary" };
  const source = structuredClone(a.rings);
  assert.equal(
    effectiveOperation(a, operationTargets(a, state, true)[0]).spacing,
    0.42,
  );
  editOperations([a], state, true, "type", "run");
  assert.equal(a.type, "fill");
  assert.deepEqual(a.rings, source);
  assert(a.operations[0].closed);
  assert.equal(generate(project([a])).stats.jumps, 1);
  b.operations = [
    makeOperation("run", b),
    makeOperation("fill", b),
    makeOperation("stop", b),
  ];
  state.activeOperationId = b.operations[1].id;
  editOperations([b], state, true, "spacing", 0.6);
  assert.equal(b.operations[1].spacing, 0.6);
  assert.equal(b.operations[0].spacing, 0.42);
  state.bulkOperations = "all";
  const result = editOperations([a, b], state, false, "spacing", 0.8);
  assert.equal(result.changed, 1);
  assert.equal(result.skipped, 2);
  assert.equal(b.operations[1].spacing, 0.8);
  const restored = validateProject(JSON.parse(JSON.stringify(project([a, b]))));
  assert.equal(restored.objects[1].operations[1].spacing, 0.8);
});
test("open artwork cannot acquire closed-region methods accidentally and markers do not expose closure or vertex settings", () => {
  const o = object(
    "Open curve",
    [
      [
        { x: 0, y: 0 },
        { x: 8, y: 7 },
        { x: 15, y: 0 },
      ],
    ],
    { type: "run", closed: false },
  );
  assert.throws(() => setEmbroideryStyle(o, "fill"), /closed/);
  assert.deepEqual(editOperations([o], {}, true, "type", "fill"), {
    changed: 0,
    skipped: 1,
  });
  assert(!o.operations);
  assert(!propertyApplies("marker", "closed"));
  assert(!propertyApplies("marker", "startIndex"));
  assert(!propertyApplies("fill", "cornerControl"));
  assert(!propertyApplies("column", "cornerControl"));
  assert(propertyApplies("border", "cornerControl"));
});
test("preflight identifies collapsed insets, holes, disconnected islands, open paths and hoop clearance without mutating artwork", () => {
  const narrow = smartShape("rect", 0.6, 10, { radius: 0 }),
    open = object(
      "Open",
      [
        [
          { x: 0, y: 0 },
          { x: 5, y: 2 },
        ],
      ],
      { type: "run" },
    );
  const saved = JSON.stringify([narrow, open]);
  const result = preflightConstruction([narrow, open]);
  assert(!result.valid);
  assert(result.issues.some((i) => i.code === "inset"));
  assert(result.issues.some((i) => i.code === "open"));
  assert.equal(JSON.stringify([narrow, open]), saved);
  const hole = smartShape("rect", 20, 20, { radius: 0 }),
    inner = smartShape("rect", 4, 4, { radius: 0 });
  hole.rings.push(inner.rings[0]);
  assert(preflightConstruction([hole]).issues.some((i) => i.code === "holes"));
  const other = smartShape("rect", 4, 4, { frame: [1, 0, 0, 1, 30, 0] });
  hole.rings.push(other.rings[0]);
  assert(preflightConstruction([hole]).complex);
  assert(
    preflightConstruction([hole]).issues.some((i) => i.code === "islands"),
  );
  const huge = smartShape("rect", 102, 30);
  assert(preflightConstruction([huge]).issues.some((i) => i.code === "hoop"));
});
test("all patch shapes surround artwork with editable geometry, repeatable sizing and finite machine instructions", () => {
  for (const kind of ["rectangle", "rounded", "circle", "oval"]) {
    const artwork = smartShape("rect", 30, 16, { radius: 0 });
    const boundary = patchBoundary([artwork], { kind, margin: 4, border: 2 });
    assert(
      artwork.rings.flat().every((p) => inside(p, boundary.rings, "evenodd")),
    );
    assert(preflightConstruction([boundary], MACHINES.se700, 2).valid);
    assert.equal(
      boundary.operations.filter((o) => o.type === "stop").length,
      2,
    );
    const p = project([artwork]);
    const result = createSurroundingPatch(p, [artwork.id], {
      kind,
      margin: 4,
      border: 2,
    });
    const original = structuredClone(artwork.rings);
    let plan = generate(p);
    assert.equal(plan.stats.stops, 2);
    assert(plan.stats.fits);
    result.boundary.shape.width += 4;
    regenerateShape(result.boundary);
    assert.deepEqual(artwork.rings, original);
    assert.notDeepEqual(needle(generate(p)), needle(plan));
    const restored = validateProject(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(needle(generate(restored)), needle(generate(p)));
  }
});
test("shared patch dependencies surround complete decorative objects even under reverse manual ordering", () => {
  const a = smartShape("rect", 12, 8, { frame: [1, 0, 0, 1, -9, 0] }),
    b = smartShape("ellipse", 10, 10, { frame: [1, 0, 0, 1, 9, 0] });
  b.color = "#cc0000";
  const p = project([a, b]),
    saved = structuredClone([a, b]);
  const { boundary, group } = createSurroundingPatch(p, [a.id, b.id], {
    kind: "rounded",
    margin: 4,
  });
  assert.deepEqual(a.operations, saved[0].operations);
  assert.deepEqual(a.rings, saved[0].rings);
  p.sequencing = {
    mode: "manual",
    origin: "sequence",
    order: [b.id, a.id, boundary.id],
  };
  const plan = generate(p),
    sequence = plan.events.filter((e) => ["stitch", "stop"].includes(e.cmd));
  const firstArtwork = sequence.findIndex((e) => e.objectId === b.id),
    lastArtwork = sequence.findLastIndex((e) => e.objectId === a.id),
    finish = boundary.operations.at(-1).id;
  assert(firstArtwork > 0);
  assert(
    sequence.slice(0, firstArtwork).every((e) => e.objectId === boundary.id),
  );
  assert(
    sequence.slice(lastArtwork + 1).every((e) => e.operationId === finish),
  );
  assert.equal(plan.stats.stops, 2);
  const objectBlocks = sequence
    .filter((e) => e.cmd === "stitch")
    .map((e) => e.objectId)
    .filter((id, i, all) => !i || id !== all[i - 1]);
  assert.deepEqual(objectBlocks, [boundary.id, b.id, a.id, boundary.id]);
  const pasted = pasteSelection(p, copySelection(p, [group.id]));
  const newBoundary = p.objects.find(
    (o) => o.parentId === pasted[0] && o.constructionArtworkIds,
  );
  assert(
    newBoundary.constructionArtworkIds.every(
      (id) => !boundary.constructionArtworkIds.includes(id),
    ),
  );
  assert.equal(generate(p).stats.stops, 4);
});
test("invalid operations become navigable errors without discarding valid neighboring artwork", () => {
  const a = object(
    "Open artwork",
    [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    ],
    { type: "run" },
  );
  a.operations = [makeOperation("border", a)];
  const b = smartShape("ellipse", 10, 8);
  const plan = generate(project([a, b]));
  const issue = plan.issues.find((i) => i.code === "invalid-operation");
  assert.equal(issue.severity, "error");
  assert.equal(issue.objectId, a.id);
  assert.equal(issue.operationId, a.operations[0].id);
  assert(plan.events.some((e) => e.cmd === "stitch" && e.objectId === b.id));
  assert(!plan.events.some((e) => e.cmd === "stitch" && e.objectId === a.id));
  assert.equal(
    plan.issues.filter((i) => i.code === "invalid-operation").length,
    1,
  );
});
test("corner construction changes actual needle placement without changing source shape; smart rounding preserves parameters", () => {
  const o = object(
    "Sharp",
    [
      [
        { x: 0, y: 0 },
        { x: 8.6, y: 0 },
        { x: 8.6, y: 10 },
      ],
    ],
    { type: "run", underlay: false },
  );
  setEmbroideryStyle(o, "run");
  const before = structuredClone(o.rings),
    plan = generate(project([o]));
  editOperations([o], {}, true, "cornerControl", true);
  editOperations([o], {}, true, "minCornerStitch", 0.7);
  assert.deepEqual(o.rings, before);
  assert.notDeepEqual(needle(generate(project([o]))), needle(plan));
  const rect = smartShape("rect", 20, 15, { radius: 0 });
  roundChecked(rect, 3);
  assert.equal(rect.shape.radius, 3);
  assert(rect.shape);
  roundChecked(rect, 0);
  assert.equal(rect.shape.radius, 0);
});

test("visible method parameters alter needle coordinates or commands rather than just saved properties", () => {
  const cases = [
    ["run", "length", 1.1],
    ["run", "reverse", true],
    ["run", "startIndex", 2],
    ["run", "underlay", true],
    ["run", "tieIn", false],
    ["run", "tieOff", false],
    ["fill", "spacing", 0.8],
    ["fill", "length", 1.3],
    ["fill", "angle", 50],
    ["fill", "pattern", "aligned"],
    ["fill", "compensation", 0.6],
    ["fill", "underlay", true],
    ["border", "width", 1.2],
    ["border", "spacing", 0.7],
    ["border", "offset", -1],
    ["border", "outerOnly", true],
    ["border", "compensation", 0.5],
    ["column", "maxSatin", 1.8],
  ];
  for (const [method, key, value] of cases) {
    const o = smartShape("rect", 25, 16, { radius: 0 }),
      hole = smartShape("rect", 5, 4, { radius: 0 });
    o.rings.push(hole.rings[0]);
    delete o.shape;
    o.operations = [makeOperation(method, o)];
    o.operations[0].underlay = false;
    const rings = structuredClone(o.rings),
      before = generate(project([o]));
    editOperations([o], {}, true, key, value);
    const after = generate(project([o]));
    assert.notDeepEqual(
      after.events.map((e) => [e.cmd, e.x, e.y]),
      before.events.map((e) => [e.cmd, e.x, e.y]),
      `${method}.${key} should affect actual instructions`,
    );
    assert.deepEqual(o.rings, rings);
  }
});

test("construction preflight reports actual overlapping fabric pieces and protects outside sequence pins", () => {
  const a = smartShape("rect", 20, 16),
    b = smartShape("ellipse", 18, 12);
  assert(
    preflightConstruction([a, b]).issues.some(
      (i) => i.code === "overlapping-pieces",
    ),
  );
  const pin = smartShape("rect", 4, 4);
  pin.sequenceLocked = true;
  const p = project([a, pin, b]),
    before = JSON.stringify(p);
  assert.throws(
    () => createSurroundingPatch(p, [a.id, b.id], { kind: "rounded" }),
    /pinned/,
  );
  assert.equal(JSON.stringify(p), before);
});

test("preflight checks only requested construction steps and a boundary-only copy is independent", () => {
  const narrow = smartShape("rect", 0.6, 10, { radius: 0 });
  assert(
    preflightConstruction([narrow], MACHINES.se700, 0.5, { tackdown: false })
      .valid,
  );
  const art = smartShape("ellipse", 12, 8),
    p = project([art]),
    { boundary } = createSurroundingPatch(p, [art.id], { kind: "rounded" });
  const ids = pasteSelection(p, copySelection(p, [boundary.id]));
  assert.equal(
    p.objects.find((o) => o.id === ids[0]).constructionArtworkIds,
    undefined,
  );
});

test("style changes retain the primary thread and method changes retain deliberately named steps", () => {
  const o = smartShape("rect", 20, 12);
  setEmbroideryStyle(o, "fill");
  o.operations[0].color = "#cc2211";
  o.operations[0].name = "My top layer";
  editOperations([o], {}, true, "type", "column");
  assert.equal(o.operations[0].name, "My top layer");
  assert.equal(o.operations[0].color, "#cc2211");
  setEmbroideryStyle(o, "run");
  assert.equal(o.operations[0].color, "#cc2211");
});

test("post-creation margin refit follows transformed artwork and retains independently edited construction settings", () => {
  const art = smartShape("rect", 20, 12),
    p = project([art]),
    { boundary } = createSurroundingPatch(p, [art.id], {
      kind: "rectangle",
      margin: 3,
    });
  const ops = structuredClone(boundary.operations);
  ops.at(-1).width = 1.3;
  boundary.operations = structuredClone(ops);
  transformSelection([art], { dx: 5, dy: 3, sx: 1.2, sy: 1.2 });
  const geometry = structuredClone(art.rings);
  refitPatch(p, boundary, 5);
  assert.equal(boundary.patchMargin, 5);
  assert.equal(boundary.shape.width, 34);
  assert.deepEqual(boundary.operations, ops);
  assert.deepEqual(art.rings, geometry);
  assert.equal(generate(p).stats.stops, 2);
});
