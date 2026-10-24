import test from "node:test";
import assert from "node:assert/strict";
import {
  editArtworkPoint,
  pointHit,
  pointEditable,
} from "../src/point-editing.js";
import { Stage } from "../src/stage.js";
import { object, validateProject } from "../src/model.js";
import {
  curveRings,
  sourceTransform,
  mapPoint,
} from "../src/smart-geometry.js";
import { cubic, nearestSegment } from "../src/path-editing.js";
import { generate } from "../src/engine.js";
const square = () =>
  object(
    "Points",
    [
      [
        { x: -20, y: -20 },
        { x: 20, y: -20 },
        { x: 20, y: 20 },
        { x: -20, y: 20 },
      ],
    ],
    { closed: true, underlay: false, compensation: 0 },
  );
const curved = () => {
  const o = square();
  o.curve = {
    closed: true,
    frame: [1, 0, 0, 1, 0, 0],
    nodes: [
      {
        x: -20,
        y: -20,
        in: { x: -22, y: -10 },
        out: { x: -12, y: -30 },
        mode: "corner",
      },
      {
        x: 20,
        y: -20,
        in: { x: 10, y: -30 },
        out: { x: 22, y: -10 },
        mode: "corner",
      },
      { x: 20, y: 20 },
      { x: -20, y: 20 },
    ],
  };
  o.rings = curveRings(o.curve);
  return o;
};
const near = (a, b, e = 1e-7) =>
  assert(Math.hypot(a.x - b.x, a.y - b.y) < e, JSON.stringify({ a, b }));
const project = (o) => ({
  version: 1,
  name: "Point edits",
  machine: "se700",
  objects: [o],
});

test("curved insertion is exact subdivision and removal recovers its parent without changing opposite handles", () => {
  for (const t of [0.13, 0.37, 0.5, 0.88]) {
    const original = curved(),
      snapshot = JSON.stringify(original),
      a = original.curve.nodes[0],
      b = original.curve.nodes[1],
      ps = [a, a.out, b.in, b];
    const added = editArtworkPoint(original, {
      kind: "edge",
      ring: 0,
      index: 0,
      t,
    });
    assert.equal(added.curve.nodes.length, 5);
    for (let i = 0; i <= 200; i++) {
      const u = i / 200,
        nodes = added.curve.nodes,
        k = u <= t ? 0 : 1,
        v = u <= t ? u / t : (u - t) / (1 - t),
        n = nodes[k],
        m = nodes[k + 1];
      near(cubic(ps, u), cubic([n, n.out, m.in, m], v), 1e-10);
    }
    assert.deepEqual(added.curve.nodes[0].in, a.in);
    assert.deepEqual(added.curve.nodes[2].out, b.out);
    const removed = editArtworkPoint(added, {
      kind: "anchor",
      ring: 0,
      index: 1,
    });
    near(removed.curve.nodes[0].out, a.out);
    near(removed.curve.nodes[1].in, b.in);
    assert.equal(JSON.stringify(original), snapshot);
  }
});

test("line clicks retain exact coordinates, minimum anchors and valid closed topology", () => {
  const o = square(),
    hit = nearestSegment(o, { x: 3, y: -20 });
  const added = editArtworkPoint(o, { ...hit, kind: "edge" });
  assert.equal(added.rings[0].length, 5);
  near(added.rings[0][1], { x: 3, y: -20 }, 0.00002);
  assert.deepEqual(
    editArtworkPoint(added, { kind: "anchor", index: 1 }).rings,
    o.rings,
  );
  const triangle = editArtworkPoint(o, { kind: "anchor", index: 0 });
  assert.throws(
    () => editArtworkPoint(triangle, { kind: "anchor", index: 0 }),
    /at least 3/,
  );
  assert.throws(
    () => editArtworkPoint(o, { kind: "anchor", index: 99 }),
    /valid anchor/,
  );
  assert.throws(
    () => editArtworkPoint(curved(), { kind: "edge", index: 0, t: 0 }),
    /away/,
  );
});

test("point edits preserve holes, other contours, sewing settings and physical thread identity", () => {
  const o = square();
  o.rings.push([
    { x: -6, y: -6 },
    { x: 6, y: -6 },
    { x: 6, y: 6 },
    { x: -6, y: 6 },
  ]);
  o.operations = [
    {
      id: "action",
      type: "fill",
      thread: {
        brandId: "test",
        lineId: "zero",
        number: "001",
        hex: "#123456",
      },
    },
  ];
  const added = editArtworkPoint(o, {
    kind: "edge",
    ring: 1,
    index: 0,
    point: { x: 0, y: -6 },
    t: 0.5,
  });
  assert.deepEqual(added.rings[0], o.rings[0]);
  assert.deepEqual(added.operations, o.operations);
  const restored = editArtworkPoint(added, {
    kind: "anchor",
    ring: 1,
    index: 1,
  });
  assert.deepEqual(restored.rings, o.rings);
  // Removing this concave outline vertex would cross the hole boundary.
  assert.throws(
    () => editArtworkPoint(o, { kind: "anchor", ring: 0, index: 0 }),
    /hole|cross|collapse/,
  );
});

test("transformed curve hit targets and subdivision stay in the source coordinate system", () => {
  const o = curved(),
    transform = [0.8, 0.6, -0.6, 0.8, 10, -2];
  o.rings = o.rings.map((r) => r.map((p) => mapPoint(p, transform)));
  sourceTransform(o, transform);
  const a = o.curve.nodes[0],
    b = o.curve.nodes[1],
    p = mapPoint(cubic([a, a.out, b.in, b], 0.42), o.curve.frame),
    hit = nearestSegment(o, p);
  near(hit.point, p, 0.00001);
  const next = editArtworkPoint(o, { ...hit, kind: "edge" });
  near(mapPoint(next.curve.nodes[1], next.curve.frame), p, 0.00001);
  assert.deepEqual(next.curve.frame, o.curve.frame);
  const anchor = pointHit(next, p, 1);
  assert.equal(anchor.index, 1);
});

test("point edits serialize, regenerate stitches and keep independent objects intact", () => {
  const o = curved(),
    neighbor = square(),
    before = JSON.stringify(neighbor);
  const next = editArtworkPoint(o, { kind: "edge", index: 0, t: 0.4 });
  const p = JSON.parse(JSON.stringify(project(next)));
  validateProject(p);
  assert.deepEqual(p.objects[0].curve, next.curve);
  const plan = generate(p);
  assert(plan.events.some((e) => e.cmd === "stitch"));
  assert.equal(JSON.stringify(neighbor), before);
  for (let i = 0; i < 20; i++) {
    const a = editArtworkPoint(o, { kind: "edge", index: 0, t: 0.25 });
    const b = editArtworkPoint(a, { kind: "anchor", index: 1 });
    assert.equal(b.curve.nodes.length, o.curve.nodes.length);
    near(b.curve.nodes[0].out, o.curve.nodes[0].out);
  }
});

test("active-node target is singular, focus-aware, visible and editable without modifying project geometry", () => {
  const a = curved(),
    b = square();
  a.parentId = "group";
  const s = {
    mode: "design",
    tool: "node",
    project: {
      ...project(a),
      objects: [a, b],
      groups: [{ id: "group", kind: "group", name: "Group" }],
    },
    selection: a.id,
    selectionIds: [a.id],
  };
  const snapshot = JSON.stringify(s.project),
    stage = { state: s };
  const target = () => Stage.prototype.nodeTarget.call(stage);
  assert.equal(target(), a);
  s.selection = b.id;
  s.selectionIds = [b.id];
  assert.equal(target(), b);
  s.selectionIds = [a.id, b.id];
  assert.equal(target(), null);
  s.selection = "group";
  s.selectionIds = ["group"];
  assert.equal(target(), null);
  s.selection = b.id;
  s.selectionIds = [b.id];
  s.isolation = "group";
  assert.equal(target(), null);
  s.selection = a.id;
  s.selectionIds = [a.id];
  assert.equal(target(), a);
  s.tool = "select";
  assert.equal(target(), null);
  s.tool = "node";
  s.mode = "preview";
  assert.equal(target(), null);
  s.mode = "design";
  assert.equal(JSON.stringify(s.project), snapshot);
  a.locked = true;
  assert.equal(target(), null);
  delete a.locked;
  a.visible = false;
  assert.equal(target(), null);
  delete a.visible;
  assert(!pointEditable({ ...a, satinRails: {} }));
});

test("non-exact curved removal uses a bounded fit and rejects excessive shape loss", () => {
  const source = curved(),
    added = editArtworkPoint(source, { kind: "edge", index: 0, t: 0.5 });
  added.curve.nodes[1].out.y += 0.03;
  added.rings = curveRings(added.curve);
  const fitted = editArtworkPoint(added, { kind: "anchor", index: 1 });
  assert.equal(fitted.curve.nodes.length, 4);
  for (let i = 0; i <= 100; i++) {
    const t = i / 100,
      a = source.curve.nodes[0],
      b = source.curve.nodes[1],
      n = fitted.curve.nodes[0],
      m = fitted.curve.nodes[1];
    // Fitting changes parameter speed; measure physical curve distance instead.
    assert(
      nearestSegment(fitted, cubic([a, a.out, b.in, b], t)).distance < 0.25,
    );
  }
  const sharp = editArtworkPoint(source, { kind: "edge", index: 0, t: 0.5 });
  sharp.curve.nodes[1].y -= 10;
  sharp.curve.nodes[1].in.y -= 10;
  sharp.curve.nodes[1].out.y -= 10;
  sharp.rings = curveRings(sharp.curve);
  const before = JSON.stringify(sharp);
  assert.throws(
    () => editArtworkPoint(sharp, { kind: "anchor", index: 1 }),
    /0.25 mm/,
  );
  assert.equal(JSON.stringify(sharp), before);
});

test("open paths retain endpoints, minimum size and precise line insertion", () => {
  const o = object(
    "Line",
    [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
    ],
    { type: "run", closed: false },
  );
  const next = editArtworkPoint(o, {
    ...nearestSegment(o, { x: 4, y: 0 }),
    kind: "edge",
  });
  near(next.rings[0][1], { x: 4, y: 0 }, 1e-10);
  const short = editArtworkPoint(o, { kind: "anchor", index: 1 });
  assert.deepEqual(short.rings[0], [o.rings[0][0], o.rings[0][2]]);
  assert.throws(
    () => editArtworkPoint(short, { kind: "anchor", index: 0 }),
    /at least 2/,
  );
});

test("real Stage point gestures commit once on release and cancel safely for touch navigation", () => {
  const o = square(),
    state = {
      mode: "design",
      tool: "node",
      project: project(o),
      selection: o.id,
      selectionIds: [o.id],
    },
    stage = Object.create(Stage.prototype);
  let commits = 0;
  Object.assign(stage, {
    state,
    canvas: { focus() {}, setPointerCapture() {} },
    draft: [],
    pointers: new Map(),
    pointMode: true,
    render() {},
    toWorld: (e) => e.world,
    actions: {
      mutate: (fn) => {
        commits++;
        fn();
      },
      refresh() {},
      draft() {},
      notice: (message) => {
        throw Error(message);
      },
    },
  });
  Object.defineProperty(stage, "scale", { value: 5 });
  const event = (
    pointerId = 1,
    pointerType = "mouse",
    world = { x: 0, y: -20 },
  ) => ({
    button: 0,
    pointerId,
    pointerType,
    clientX: world.x * 5,
    clientY: world.y * 5,
    world,
  });
  stage.down(event());
  assert.equal(o.rings[0].length, 4);
  assert.equal(commits, 0);
  stage.up(event());
  assert.equal(o.rings[0].length, 5);
  assert.equal(commits, 1);
  stage.down(event(2, "touch"));
  stage.up(event(2, "touch"));
  assert.equal(o.rings[0].length, 4);
  assert.equal(commits, 2);
  stage.down(event(3, "touch"));
  stage.down(event(4, "touch", { x: 5, y: -20 }));
  stage.up(event(3, "touch"));
  stage.up(event(4, "touch", { x: 5, y: -20 }));
  assert.equal(commits, 2);
  assert.equal(o.rings[0].length, 4);
  stage.down(event());
  stage.cancelDrag();
  stage.up(event());
  assert.equal(commits, 2);
  stage.down(event());
  stage.move(event(1, "mouse", { x: 4, y: -20 }));
  stage.up(event());
  assert.equal(commits, 2);
});
