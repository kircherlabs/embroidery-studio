import test from "node:test";
import assert from "node:assert/strict";
import { object, validateProject, bounds } from "../src/model.js";
import { curveRings, identity } from "../src/smart-geometry.js";
import { transformSelection } from "../src/hierarchy.js";
import {
  distance,
  polygonArea,
  inside,
  fillPolygons,
} from "../src/geometry.js";
import { generate } from "../src/engine.js";
import { makeOperation } from "../src/operations.js";
import {
  pencilCurve,
  cubic,
  worldCurve,
  nearestSegment,
  sculptCurve,
  sculptArtwork,
  setNodeMode,
  alignHandle,
  splitArea,
  splitPath,
  cutPathByLine,
  eraseArtwork,
  joinPaths,
  reverseArtwork,
  closeArtwork,
  replaceArtwork,
} from "../src/path-editing.js";
const near = (a, b, t = 1e-6) => assert(Math.abs(a - b) <= t, `${a} != ${b}`);
const rect = (a, b, c, d) => [
  { x: a, y: b },
  { x: c, y: b },
  { x: c, y: d },
  { x: a, y: d },
];
const project = (objects) => ({
  version: 1,
  name: "Vector editing",
  machine: "se700",
  groups: [],
  objects,
  planning: { smallDetail: 0, optimizeColors: true },
});
const line = (x = 0, end = 20) =>
  object(
    "Trace",
    [
      [
        { x, y: 0 },
        { x: end, y: 0 },
      ],
    ],
    { type: "run", closed: false, underlay: false },
  );
const curved = () => {
  const curve = {
    frame: identity(),
    closed: false,
    nodes: [
      { x: 0, y: 0, out: { x: 3, y: 12 } },
      { x: 20, y: 0, in: { x: 16, y: -8 } },
    ],
  };
  return object("Curve", curveRings(curve), {
    type: "run",
    closed: false,
    curve,
    underlay: false,
  });
};
const ps = (c) => [
  c.nodes[0],
  c.nodes[0].out || c.nodes[0],
  c.nodes[1].in || c.nodes[1],
  c.nodes[1],
];
const area = (o) => polygonArea(fillPolygons(o.rings, o.fillRule));

test("Pencil reduces sampled organic traces to editable curves within physical tolerance", () => {
  for (const closed of [false, true]) {
    const trace = Array.from({ length: 800 }, (_, i) => {
      const t = i / 799;
      return closed
        ? {
            x:
              15 *
              Math.cos(t * 2 * Math.PI) *
              (1 + 0.15 * Math.cos(t * 10 * Math.PI)),
            y: 12 * Math.sin(t * 2 * Math.PI),
          }
        : { x: t * 35, y: 5 * Math.sin(t * 7) + 0.025 * Math.sin(t * 70) };
    });
    const c = pencilCurve(trace, 0.15, closed),
      ring = curveRings(c)[0];
    assert(c.nodes.length < trace.length / 3);
    assert(c.nodes.some((n) => n.out));
    assert.equal(c.closed, closed);
    // Both pointer-to-curve and curve-to-pointer distances are measured in mm.
    const segmentDistance = (p, a, b) => {
      const v = { x: b.x - a.x, y: b.y - a.y },
        t = Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * v.x + (p.y - a.y) * v.y) /
              (v.x * v.x + v.y * v.y || 1),
          ),
        );
      return distance(p, { x: a.x + t * v.x, y: a.y + t * v.y });
    };
    for (const [source, target, wrap] of [
      [ring, trace, false],
      [trace, ring, closed],
    ])
      for (const p of source) {
        const pairs = target.slice(1).map((q, i) => [target[i], q]);
        if (wrap) pairs.push([target.at(-1), target[0]]);
        assert(
          Math.min(...pairs.map(([a, b]) => segmentDistance(p, a, b))) < 0.19,
        );
      }
    validateProject(
      JSON.parse(
        JSON.stringify(
          project([
            object("Pencil", [ring], {
              curve: c,
              type: closed ? "fill" : "run",
              closed,
            }),
          ]),
        ),
      ),
    );
  }
  assert.throws(() => pencilCurve([{ x: 0, y: 0 }]), /longer/);
  assert.throws(
    () =>
      pencilCurve(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        NaN,
      ),
    /smoothing/,
  );
});
test("Pencil retains cusps, endpoints and rejects unusable closed strokes", () => {
  const trace = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 11, y: 0 },
    { x: 20, y: 0 },
  ];
  const c = pencilCurve(trace, 0.02);
  near(c.nodes[0].x, 0);
  near(c.nodes.at(-1).x, 20);
  assert(c.nodes.some((p) => p.x === 10 && p.y === 10));
  assert.throws(() =>
    pencilCurve(
      [
        { x: 0, y: 0 },
        { x: 0.001, y: 0 },
        { x: 0.002, y: 0 },
      ],
      0.15,
      true,
    ),
  );
  assert.throws(
    () =>
      pencilCurve(
        Array.from({ length: 2000 }, (_, i) => ({ x: i * 0.05, y: i % 2 })),
        0.02,
      ),
    /too many nodes/,
  );
});
test("curve sculpting pulls the grabbed point exactly and preserves sharp neighboring handles", () => {
  const c = curved().curve,
    before = structuredClone(c),
    old = cubic(ps(c), 0.37);
  sculptCurve(c, 0, 0.37, { x: 2, y: -3 });
  const after = cubic(ps(c), 0.37);
  near(after.x, old.x + 2);
  near(after.y, old.y - 3);
  assert.deepEqual(
    c.nodes.map(({ x, y }) => ({ x, y })),
    before.nodes.map(({ x, y }) => ({ x, y })),
  );
  assert.throws(() => sculptCurve(c, 0, 0, { x: 1, y: 1 }), /anchor/);
  setNodeMode(c, 0, "symmetric");
  c.nodes[0].out = { x: 3, y: 4 };
  alignHandle(c.nodes[0], "out");
  near(c.nodes[0].in.x, -3);
  near(c.nodes[0].in.y, -4);
  setNodeMode(c, 1, "corner");
  assert(!c.nodes[1].in && !c.nodes[1].out);
  const end = pencilCurve(
    [
      { x: 0, y: 0 },
      { x: 10, y: 2 },
      { x: 20, y: 0 },
    ],
    0.1,
  );
  const endHandleLength = distance(end.nodes.at(-1), end.nodes.at(-1).in);
  setNodeMode(end, end.nodes.length - 1, "symmetric");
  near(distance(end.nodes.at(-1), end.nodes.at(-1).in), endHandleLength);
});
test("imported contour sculpting is local and preserves other islands and holes", () => {
  const o = object(
      "Imported pumpkin",
      [rect(-15, -10, 15, 10), rect(-3, -3, 3, 3).reverse()],
      { fillRule: "evenodd" },
    ),
    hole = structuredClone(o.rings[1]);
  const hit = nearestSegment(o, { x: 0, y: -10 });
  sculptArtwork(o, hit, { x: 0, y: -2 }, 3);
  assert.deepEqual(o.rings[1], hole);
  assert(!inside({ x: 0, y: 0 }, o.rings, "evenodd"));
  assert(o.rings[0].some((p) => p.y < -11.9));
  assert(o.rings[0].some((p) => p.x === 15 && p.y === 10));
  assert.equal(fillPolygons(o.rings, "evenodd")[0].length, 2);
});
test("area Knife preserves total area, holes, independent pieces and sewing colors", () => {
  const o = object(
    "Badge",
    [rect(-20, -15, 20, 15), rect(-5, -5, 5, 5).reverse()],
    { closed: true, fillRule: "evenodd" },
  );
  o.operations = [
    makeOperation("fill", { color: "#0000ff" }),
    makeOperation("border", { color: "#ffff00" }),
  ];
  const parts = splitArea(o, { x: -25, y: 10 }, { x: 25, y: 10 });
  assert.equal(parts.length, 2);
  near(
    parts.reduce((n, p) => n + area(p), 0),
    area(o),
  );
  assert(parts.some((p) => p.rings.length === 2));
  assert.equal(new Set(parts.map((p) => p.id)).size, 2);
  for (const p of parts) {
    assert.equal(p.operations.length, 2);
    assert.deepEqual(
      p.operations.map((op) => op.color),
      ["#0000ff", "#ffff00"],
    );
  }
  assert.notEqual(parts[0].operations[0].id, parts[1].operations[0].id);
  assert.throws(() => splitArea(o, { x: -2, y: 0 }, { x: 2, y: 0 }), /beyond/);
  assert.throws(
    () => splitArea(o, { x: -25, y: 20 }, { x: 25, y: 20 }),
    /did not cross/,
  );
  validateProject(project(parts));
});
test("concave and disconnected region cuts retain every resulting island", () => {
  const o = object(
    "Concave",
    [
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 15, y: 20 },
        { x: 15, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 20 },
        { x: 0, y: 20 },
      ],
      rect(25, 0, 30, 20),
    ],
    { closed: true },
  );
  const parts = splitArea(o, { x: -5, y: 10 }, { x: 35, y: 10 });
  assert.equal(parts.length, 5);
  near(
    parts.reduce((s, p) => s + area(p), 0),
    area(o),
  );
});
test("exact cubic splitting and transformed curves retain original coordinates", () => {
  const o = curved();
  transformSelection([o], { sx: 1.2, sy: 0.8, angle: 23, dx: -5, dy: 6 });
  const original = worldCurve(o),
    parts = splitPath(o, { index: 0, t: 0.43 });
  for (let i = 0; i <= 40; i++) {
    const t = i / 40,
      part = t <= 0.43 ? parts[0] : parts[1],
      local = t <= 0.43 ? t / 0.43 : (t - 0.43) / 0.57;
    const p = cubic(ps(part.curve), local),
      q = cubic(ps(original), t);
    near(p.x, q.x);
    near(p.y, q.y);
  }
  const straight = cutPathByLine(line(), { x: 3, y: -5 }, { x: 3, y: 5 });
  near(straight[0].rings[0].at(-1).x, 3, 0.006);
  near(straight[1].rings[0][0].x, 3, 0.006);
});
test("opening closed contours is explicit and does not create duplicate zero-length nodes", () => {
  const o = object("Filled rectangle", [rect(-10, -10, 10, 10)], {
    closed: true,
  });
  assert.throws(() => splitPath(o, { index: 1, t: 0 }), /Convert open/);
  const [opened] = splitPath(o, { index: 1, t: 0 }, true);
  assert.equal(opened.curve.nodes.length, 5);
  assert.equal(opened.type, "run");
  assert.equal(opened.operations[0].type, "run");
  for (let i = 1; i < opened.curve.nodes.length; i++)
    assert(distance(opened.curve.nodes[i - 1], opened.curve.nodes[i]) > 1);
  const arcs = cutPathByLine(o, { x: -20, y: 0 }, { x: 20, y: 0 }, true);
  assert.equal(arcs.length, 2);
  assert(arcs.every((p) => !p.closed));
  assert.throws(() => splitPath(line(), { index: 0, t: 0 }), /endpoint/);
});
test("vector area eraser makes genuine counters, keeps tiny fragments and handles full removal", () => {
  const o = object("Patch", [rect(-10, -10, 10, 10)], { closed: true });
  const [hole] = eraseArtwork(o, [{ x: 0, y: 0 }], 4, true);
  assert.equal(hole.rings.length, 2);
  assert(!inside({ x: 0, y: 0 }, hole.rings, "evenodd"));
  const parts = eraseArtwork(
    o,
    [
      { x: -20, y: 9.5 },
      { x: 20, y: 9.5 },
    ],
    0.4,
    true,
  );
  assert.equal(parts.length, 2);
  assert(parts.some((p) => bounds(p.rings.flat()).height < 0.31));
  assert.equal(eraseArtwork(o, [{ x: 100, y: 100 }], 2), null);
  assert.deepEqual(eraseArtwork(o, [{ x: 0, y: 0 }], 100), []);
});
test("line erasing removes only brushed geometry and never sews across the removed gap", () => {
  const o = line(),
    parts = eraseArtwork(
      o,
      [
        { x: 8, y: -5 },
        { x: 8, y: 5 },
      ],
      2,
      false,
    );
  assert.equal(parts.length, 2);
  near(parts[0].rings[0].at(-1).x, 7, 0.01);
  near(parts[1].rings[0][0].x, 9, 0.01);
  const plan = generate(project(parts));
  assert(plan.events.some((e) => e.cmd === "jump"));
  let last = null;
  for (const e of plan.events) {
    if (e.cmd === "stitch" && last)
      assert(
        !(last.x < 7.01 && e.x > 8.99),
        "no sewn connector across erasure",
      );
    if (["stitch", "jump"].includes(e.cmd)) last = e;
  }
  assert(plan.stats.fits);
  assert(
    plan.events.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)),
  );
  const loop = object("Outline", [rect(-10, -10, 10, 10)], {
    type: "run",
    closed: true,
    underlay: false,
  });
  const opened = eraseArtwork(loop, [{ x: 0, y: -10 }], 2, false);
  assert.equal(
    opened.length,
    1,
    "a closed contour seam does not add an artificial jump",
  );
  near(opened[0].rings[0][0].x, 1, 0.01);
  near(opened[0].rings[0].at(-1).x, -1, 0.01);
});
test("joins choose nearest endpoints, preserve cubic handles, reject gaps and require settings consent", () => {
  const a = curved(),
    b = line(20.2, 30);
  b.color = a.color;
  const joined = joinPaths(a, b, 0.3);
  near(joined.curve.nodes[0].out.y, 12);
  near(joined.rings[0].at(-1).x, 30);
  assert.throws(() => joinPaths(a, b, 0.1), /endpoints/);
  assert.throws(() => joinPaths(a, b, NaN), /join gap/);
  b.operations = [makeOperation("bean", { color: "#00ff00" })];
  assert.throws(() => joinPaths(a, b, 1), /different sewing/);
  assert.equal(joinPaths(a, b, 1, true).type, a.type);
  const reversed = line(30, 20.2);
  near(joinPaths(a, reversed, 0.3).rings[0].at(-1).x, 30);
});
test("reverse twice is lossless; Close changes actual sewing commands and source", () => {
  const o = curved(),
    before = structuredClone(o);
  reverseArtwork(o);
  reverseArtwork(o);
  assert.deepEqual(o.curve, before.curve);
  const a = line();
  a.operations = [makeOperation("run", { closed: false })];
  const open = generate(project([a])).events.filter(
    (e) => e.cmd === "stitch",
  ).length;
  closeArtwork(a);
  assert(a.closed && a.operations[0].closed && a.curve === undefined);
  assert(
    generate(project([a])).events.filter((e) => e.cmd === "stitch").length >
      open,
  );
});
test("replacement preserves parent membership, manual sequence, linked references and portable files", () => {
  const o = object("Shared", [rect(-10, -10, 10, 10)], {
      closed: true,
      parentId: "g",
    }),
    boundary = object("Boundary", [rect(-20, -20, 20, 20)], {
      constructionArtworkIds: [o.id],
    });
  const p = project([o, boundary]);
  p.groups = [{ id: "g", name: "SVG", kind: "svg" }];
  p.sequencing = {
    mode: "manual",
    origin: "sequence",
    order: [o.id, boundary.id],
  };
  const pieces = splitArea(o, { x: -15, y: 0 }, { x: 15, y: 0 });
  replaceArtwork(p, o, pieces);
  assert(pieces.every((n) => n.parentId === "g"));
  assert.deepEqual(p.sequencing.order, [
    ...pieces.map((n) => n.id),
    boundary.id,
  ]);
  assert.deepEqual(
    boundary.constructionArtworkIds,
    pieces.map((n) => n.id),
  );
  validateProject(JSON.parse(JSON.stringify(p)));
  for (const type of ["reference", "manual"]) {
    const invalid = { ...line(), type };
    assert.throws(() => splitPath(invalid, { index: 0, t: 0.5 }), /vector/);
  }
  assert.throws(
    () => eraseArtwork({ ...line(), locked: true }, [{ x: 0, y: 0 }], 2),
    /Unlock/,
  );
  assert.throws(
    () => splitArea(boundary, { x: -25, y: 0 }, { x: 25, y: 0 }),
    /dependencies/,
  );
});

test("ambiguous self-intersecting filled contours are rejected without altering the source", () => {
  const o = object(
      "Crossed contour",
      [
        [
          { x: -10, y: -10 },
          { x: 10, y: 10 },
          { x: -10, y: 10 },
          { x: 10, y: -10 },
        ],
      ],
      { closed: true },
    ),
    before = structuredClone(o);
  assert.throws(
    () => splitArea(o, { x: -15, y: 0 }, { x: 15, y: 0 }),
    /invalid/,
  );
  assert.throws(() => eraseArtwork(o, [{ x: 0, y: 0 }], 2), /invalid/);
  assert.deepEqual(o, before);
});

test("edited artwork retains each embroidery method and regenerates bounded actual needle commands", () => {
  const trace = Array.from({ length: 120 }, (_, i) => ({
    x: -12 + (24 * i) / 119,
    y: 3 * Math.sin((i / 119) * Math.PI),
  }));
  for (const type of [
    "run",
    "bean",
    "triple",
    "satin",
    "fill",
    "border",
    "column",
  ]) {
    const closed = ["fill", "border", "column"].includes(type),
      curve = pencilCurve(
        closed ? [...trace, { x: 12, y: 8 }, { x: -12, y: 8 }] : trace,
        0.1,
        closed,
      );
    const o = object(type, curveRings(curve), {
      curve,
      type: closed ? "fill" : "run",
      closed,
      underlay: false,
    });
    o.operations = [makeOperation(type, o)];
    reverseArtwork(o);
    const plan = generate(project([o]));
    assert(plan.stats.stitches > 10, type);
    assert(plan.stats.fits, type);
    assert.equal(o.operations[0].type, type);
    let previous = null;
    for (const e of plan.events) {
      if (e.cmd === "stitch" && previous)
        assert(
          distance(e, previous) <= 7.01,
          `${type} exceeds machine stitch limit`,
        );
      if (["stitch", "jump"].includes(e.cmd)) previous = e;
    }
    validateProject(JSON.parse(JSON.stringify(project([o]))));
  }
});
