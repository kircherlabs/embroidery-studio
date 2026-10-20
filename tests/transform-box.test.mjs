import test from "node:test";
import assert from "node:assert/strict";
import { object, validateProject } from "../src/model.js";
import {
  transformSelection,
  groupSelection,
  ungroupSelection,
} from "../src/hierarchy.js";
import {
  selectionBox,
  boxPoint,
  boxHandles,
  resizeBox,
  handleCursor,
} from "../src/transform-box.js";
import { smartShape } from "../src/creative.js";
import {
  curveRings,
  identity,
  mapPoint,
  detachSource,
  regenerateShape,
  regenerateRails,
} from "../src/smart-geometry.js";
import { railArtwork } from "../src/rail-ui.js";
import { regeneratePathText, letteringCurve } from "../src/text-path.js";
import { generate } from "../src/engine.js";
const near = (a, b, t = 1e-7) => assert(Math.abs(a - b) < t, `${a} != ${b}`),
  point = (a, b) => {
    near(a.x, b.x);
    near(a.y, b.y);
  },
  rect = (w = 30, h = 16) => [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ],
  shape = () =>
    object("Rectangle", [rect()], {
      closed: true,
      underlay: false,
      compensation: 0,
    }),
  project = (objects) => ({
    version: 1,
    name: "Transforms",
    machine: "se700",
    groups: [],
    objects,
    planning: { smallDetail: 0, optimizeColors: true },
  }),
  handle = (b, id) => boxHandles(b, 6).find((h) => h.id === id),
  corners = (b) =>
    [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
    ].map(([x, y]) => boxPoint({ x, y }, b));
for (const angle of [0, 30, 45, 90, 175]) {
  test(`local cage and anchored width resize at ${angle} degrees`, () => {
    const o = shape();
    transformSelection([o], { angle, dx: 3, dy: -2 });
    const b = selectionBox([o]);
    near(b.angle, angle);
    near(b.width, 30);
    near(b.height, 16);
    corners(b).forEach((p, i) => point(p, o.rings[0][i]));
    const e = handle(b, "e"),
      w = handle(b, "w"),
      target = { x: e.x + b.u.x * 9, y: e.y + b.u.y * 9 };
    transformSelection([o], resizeBox(b, e, target));
    const after = selectionBox([o]);
    near(after.width, 39);
    near(after.height, 16);
    near(after.angle, angle);
    point(handle(after, "w"), w);
    point(handle(after, "e"), target);
    // Orthogonal sides remain orthogonal: local resize must not shear a rectangle.
    const [a, c, d] = o.rings[0];
    near((c.x - a.x) * (d.x - c.x) + (c.y - a.y) * (d.y - c.y), 0);
    assert.match(handleCursor(e, b), /resize$/);
  });
}
test("corner proportions, center modifier, cursor axes and minimum non-flipping scale", () => {
  const o = shape();
  transformSelection([o], { angle: 30 });
  const b = selectionBox([o]),
    h = handle(b, "se");
  const opts = resizeBox(
    b,
    h,
    { x: h.x + 10 * b.u.x, y: h.y + 10 * b.u.y },
    { proportional: true },
  );
  near(opts.sx, opts.sy);
  point(opts.pivot, handle(b, "nw"));
  const middle = resizeBox(
    b,
    handle(b, "e"),
    { x: handle(b, "e").x + b.u.x * 5, y: handle(b, "e").y + b.u.y * 5 },
    { center: true },
  );
  point(middle.pivot, b.center);
  transformSelection([o], middle);
  point(selectionBox([o]).center, b.center);
  near(selectionBox([o]).width, 40);
  assert(resizeBox(b, h, { x: -1000, y: -1000 }).sx > 0);
  near(resizeBox(b, h, { x: -1000, y: -1000 }).sy, 0.02);
  assert.equal(handleCursor(handle(b, "e"), b), "nwse-resize");
  assert.equal(handleCursor(handle(b, "n"), b), "nesw-resize");
  assert.equal(handleCursor(handle(b, "rotate"), b), "grab");
});
test("orientation is stable metadata; Canvas switching is view-only and mixed selections fall back", () => {
  const a = shape(),
    b = shape();
  transformSelection([a, b], { angle: 30 });
  const original = structuredClone([a, b]);
  assert(selectionBox([a, b]).local);
  const canvas = selectionBox([a, b], "canvas");
  assert(!canvas.local);
  near(canvas.angle, 0);
  assert.deepEqual([a, b], original);
  transformSelection([b], { angle: 15 });
  assert(!selectionBox([a, b]).local);
  assert(selectionBox([a, b]).mixed);
  const old = structuredClone(a);
  transformSelection([a], { sx: 1.5, sy: 0.8, pivot: canvas.center });
  a.rings[0].forEach((q, i) => {
    near(q.x, canvas.center.x + (old.rings[0][i].x - canvas.center.x) * 1.5);
    near(q.y, canvas.center.y + (old.rings[0][i].y - canvas.center.y) * 0.8);
  });
  // Editing a vertex does not guess a new orientation from the changed contour.
  const angle = selectionBox([a]).angle;
  a.rings[0][0].x += 4;
  near(selectionBox([a]).angle, angle);
});
test("shared-axis groups rotate/scale together; ungrouping changes no geometry", () => {
  const a = shape(),
    b = shape();
  transformSelection([b], { dx: 34 });
  const p = project([a, b]);
  const ids = groupSelection(p, [a.id, b.id]);
  assert(ids.length);
  transformSelection(p.objects, { angle: 45 });
  let box = selectionBox(p.objects);
  assert(box.local);
  near(box.width, 64);
  transformSelection(p.objects, {
    sx: 1.25,
    sy: 0.75,
    axes: box.angle,
    pivot: box.center,
  });
  box = selectionBox(p.objects);
  near(box.width, 80);
  near(box.height, 12);
  const rings = p.objects.map((o) => structuredClone(o.rings));
  ungroupSelection(p, [ids]);
  assert.equal(p.groups.length, 0);
  assert.deepEqual(
    p.objects.map((o) => o.rings),
    rings,
  );
  near(selectionBox(p.objects).angle, 45);
});
test("source frames and compact orientation survive local resize, mirroring, detach and persistence", () => {
  const o = smartShape("rect", 30, 16);
  transformSelection([o], { angle: 30 });
  let b = selectionBox([o]);
  transformSelection([o], { sx: 1.5, sy: 0.7, axes: b.angle, pivot: b.center });
  const rings = structuredClone(o.rings);
  regenerateShape(o);
  o.rings.flat().forEach((p, i) => point(p, rings.flat()[i]));
  const original = structuredClone(o);
  transformSelection([o], { sx: -1 });
  transformSelection([o], { sx: -1 });
  o.rings.flat().forEach((p, i) => point(p, original.rings.flat()[i]));
  near(selectionBox([o]).angle, 30);
  delete o.localAxis;
  const recovered = selectionBox([o]).angle;
  detachSource(o);
  near(selectionBox([o]).angle, recovered);
  assert(!o.shape);
  const p = JSON.parse(JSON.stringify(project([o])));
  validateProject(p);
  near(selectionBox(p.objects).angle, 30);
  validateProject(project([shape()]));
  for (const axis of [[0, 0], [1], [1, 1], [NaN, 0]])
    assert.throws(() =>
      validateProject(project([{ ...shape(), localAxis: axis }])),
    );
});
test("Bézier controls, rails and per-action guides follow the same affine matrix once", () => {
  const c = (y) => ({
      closed: false,
      frame: identity(),
      nodes: [
        { x: -12, y, out: { x: -2, y: y - 3 } },
        { x: 12, y, in: { x: 3, y: y + 4 } },
      ],
    }),
    curve = c(0),
    o = object("Curve", curveRings(curve), {
      type: "satin",
      closed: false,
      curve,
    }),
    rail = railArtwork(c(-2), c(2));
  rail.operations[0].satinGuides = [
    { a: { x: 0, y: -10 }, b: { x: 0, y: 10 } },
  ];
  const old = structuredClone(rail.operations[0].satinGuides[0]);
  transformSelection([o, rail], { angle: 30, pivot: { x: 0, y: 0 } });
  const box = selectionBox([o, rail]);
  transformSelection([o, rail], {
    sx: 1.4,
    sy: 0.8,
    axes: 30,
    pivot: box.center,
  });
  const rings = structuredClone(o.rings),
    rails = structuredClone(rail.rings);
  o.rings = curveRings(o.curve);
  regenerateRails(rail);
  // Flattening uses a world-space tolerance, so resizing can legitimately change
  // sample count. Compare distance to segments, not array indices.
  const deviation = (points, poly) =>
    Math.max(
      ...points.map((p) =>
        Math.min(
          ...poly.slice(1).map((q, i) => {
            const a = poly[i],
              dx = q.x - a.x,
              dy = q.y - a.y,
              t = Math.max(
                0,
                Math.min(
                  1,
                  ((p.x - a.x) * dx + (p.y - a.y) * dy) /
                    (dx * dx + dy * dy || 1),
                ),
              );
            return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
          }),
        ),
      ),
    );
  near(deviation(o.rings[0], rings[0]), 0, 0.08);
  rail.rings.forEach((r, i) => near(deviation(r, rails[i]), 0, 0.08));
  point(mapPoint(o.curve.nodes[0], o.curve.frame), rings[0][0]);
  point(
    mapPoint(old.a, rail.satinRails.a.frame),
    rail.operations[0].satinGuides[0].a,
  );
  assert.equal(o.curve.nodes.length, 2);
  assert(o.curve.nodes[0].out);
  assert.equal(rail.satinRails.a.nodes.length, 2);
  assert.equal(
    generate(project([rail])).issues.filter((i) => i.severity === "error")
      .length,
    0,
  );
});
test("path lettering retains glyphs, baseline and holes under local-axis transforms", () => {
  const source = {
      content: "O",
      height: 5,
      font: "serif",
      tracking: 0,
      lineSpacing: 1.3,
      align: "center",
      frame: identity(),
      glyphs: [{ advance: 5, rings: [rect(4, 5), rect(2, 3).reverse()] }],
      path: {
        curve: {
          frame: identity(),
          closed: false,
          nodes: [
            { x: -15, y: 0 },
            { x: 15, y: 0 },
          ],
        },
        offset: 0,
        normal: 0,
        reverse: false,
      },
    },
    o = object("Letter", [], { textSource: source });
  regeneratePathText(o);
  transformSelection([o], { angle: 45 });
  const box = selectionBox([o]);
  transformSelection([o], { sx: 1.3, sy: 0.9, axes: 45, pivot: box.center });
  const rings = structuredClone(o.rings);
  regeneratePathText(o);
  o.rings.flat().forEach((p, i) => point(p, rings.flat()[i]));
  assert.equal(o.rings.length, 2);
  assert.equal(o.textSource.content, "O");
  near(selectionBox([o]).angle, 45);
  point(letteringCurve(o).nodes[0], source.path.curve.nodes[0]);
  validateProject(project([o]));
});
test("manual machine commands transform intact; hoop diagnostics locate actual movements only", () => {
  const o = object("Manual", [], {
    type: "manual",
    commands: [
      { cmd: "jump", x: -8, y: -4 },
      { cmd: "stitch", x: 8, y: 4 },
      { cmd: "trim", x: 8, y: 4 },
      { cmd: "stop", x: 8, y: 4 },
      { cmd: "end", x: 8, y: 4 },
    ],
  });
  transformSelection([o], { angle: 30 });
  const b = selectionBox([o]);
  near(b.width, 16);
  near(b.height, 8);
  assert.deepEqual(
    o.commands.map((c) => c.cmd),
    ["jump", "stitch", "trim", "stop", "end"],
  );
  point(o.commands[1], o.commands[3]);
  const s = shape();
  transformSelection([s], { angle: 30, dx: 48 });
  let result = generate(project([s]));
  assert(!result.stats.fits);
  const issues = result.issues.filter((i) => i.code === "outside-hoop");
  assert(issues.length);
  assert(issues.every((i) => i.objectId === s.id));
  const events = structuredClone(result.events);
  selectionBox([s], "canvas");
  assert.deepEqual(generate(project([s])).events, events);
  transformSelection([s], { dx: -48 });
  result = generate(project([s]));
  assert(result.stats.fits);
  assert(!result.issues.some((i) => i.code === "outside-hoop"));
});
