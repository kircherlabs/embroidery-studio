import test from "node:test";
import assert from "node:assert/strict";
import {
  object,
  objectBounds,
  validateProject,
  translate,
} from "../src/model.js";
import {
  smartShape,
  combineArtwork,
  cutEyelet,
  applyRecipe,
  productTemplate,
  alignReference,
  roundChecked,
  distributeArtwork,
} from "../src/creative.js";
import {
  shapeRings,
  regenerateShape,
  roundedRing,
  roundArtwork,
  curveRings,
  splitCurve,
} from "../src/smart-geometry.js";
import { transformSelection } from "../src/hierarchy.js";
import {
  inside,
  distance,
  fillPolygons,
  polygonArea,
  safeConnector,
} from "../src/geometry.js";
import { generate, fillRows, satin, resample } from "../src/engine.js";
import { makeOperation, operationObject } from "../src/operations.js";
import { vectorizePixels } from "../src/importers.js";
const project = (objects, groups = []) => ({
  version: 1,
  name: "Creative regression",
  machine: "se700",
  objects,
  groups,
  planning: { smallDetail: 0, optimizeColors: true },
});
const nearRings = (a, b) => {
  assert.equal(a.flat().length, b.flat().length);
  a.flat().forEach((q, i) => {
    close(q.x, b.flat()[i].x);
    close(q.y, b.flat()[i].y);
  });
};
const close = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test("parametric regeneration follows translated, rotated, nonuniformly scaled source frames", () => {
  for (const kind of ["rect", "ellipse", "regular", "star", "eyelet"]) {
    const o = smartShape(kind, 30, 20),
      p = project([o]);
    transformSelection([o], { sx: 1.4, sy: 0.7, angle: 33, dx: 12, dy: -7 });
    translate(o, 3, -2);
    const before = structuredClone(o.rings);
    regenerateShape(o);
    o.rings.flat().forEach((q, i) => {
      close(q.x, before.flat()[i].x);
      close(q.y, before.flat()[i].y);
    });
    validateProject(JSON.parse(JSON.stringify(p)));
  }
});
test("fillets are locally limited, reversible and preserve compound holes after transformations", () => {
  const outer = smartShape("rect", 30, 20, { radius: 0 }).rings[0],
    hole = smartShape("rect", 10, 8, { radius: 0 }).rings[0].reverse();
  const o = object("Letter counter", [outer, hole], { fillRule: "evenodd" });
  roundArtwork(o, 2);
  assert(!inside({ x: 0, y: 0 }, o.rings));
  assert(inside({ x: 12, y: 0 }, o.rings));
  assert(fillPolygons(o.rings, "evenodd").length === 1);
  assert(
    roundedRing(outer, 100).every(
      (q) => Number.isFinite(q.x) && Number.isFinite(q.y),
    ),
  );
  transformSelection([o], { dx: 5, dy: 3 });
  roundArtwork(o, 0);
  assert.deepEqual(
    o.rings[0],
    outer.map((p) => ({ x: p.x + 5, y: p.y + 3 })),
  );
});
test("cubic splitting retains the exact curve and editable source follows group transforms", () => {
  const c = {
    closed: false,
    frame: [1, 0, 0, 1, 0, 0],
    nodes: [
      { x: 0, y: 0, out: { x: 10, y: -20 } },
      { x: 30, y: 0, in: { x: 20, y: 20 } },
    ],
  };
  const original = curveRings(c)[0];
  splitCurve(c, 0, 0.5);
  const split = curveRings(c)[0];
  for (const p of original)
    assert(Math.min(...split.map((q) => distance(p, q))) < 0.03);
  const o = object("Curve", curveRings(c), { type: "run", curve: c });
  transformSelection([o], { angle: 25, dx: 3, dy: 4 });
  const before = o.rings;
  nearRings(curveRings(o.curve), before);
  validateProject(project([o]));
});
test("boolean regions preserve base identity, hierarchy and operations with true cutouts", () => {
  const a = smartShape("rect", 20, 20, { radius: 0 }),
    b = smartShape("rect", 8, 8, { radius: 0 });
  a.parentId = "group";
  applyRecipe(a, "patch");
  const p = project([a, b], [{ id: "group", name: "Source", kind: "group" }]),
    ops = structuredClone(a.operations),
    id = a.id;
  combineArtwork(p, [a, b], "difference");
  assert.equal(p.objects.length, 1);
  assert.equal(a.id, id);
  assert.equal(a.parentId, "group");
  assert.deepEqual(a.operations, ops);
  assert(!inside({ x: 0, y: 0 }, a.rings, a.fillRule));
  assert(inside({ x: 8, y: 0 }, a.rings, a.fillRule));
  validateProject(p);
});
test("eyelet reinforcement and explicit opening remain independent construction objects", () => {
  const body = smartShape("rect", 30, 20),
    eye = smartShape("eyelet"),
    p = project([body, eye]);
  assert(inside({ x: 0, y: 0 }, body.rings));
  assert(!inside({ x: 0, y: 0 }, eye.rings, eye.fillRule));
  cutEyelet(p, eye, [body]);
  assert(!inside({ x: 0, y: 0 }, body.rings, body.fillRule));
  const plan = generate(p);
  assert(plan.events.some((e) => e.objectId === eye.id && e.cmd === "stitch"));
  assert(plan.stats.fits);
  validateProject(p);
});
test("templates generate shared construction operations and preserve stops and dependencies", () => {
  for (const kind of ["keychain", "badge", "applique"]) {
    const items = productTemplate(kind, 65, 28, 4, 2.5),
      p = project(items, items.groups);
    validateProject(p);
    const body = items[0],
      before = generate(p);
    transformSelection([body], { sx: 0.8, sy: 0.8 });
    const after = generate(p);
    assert(before.stats.stitches > 0 && after.stats.stitches > 0);
    assert.equal(
      after.stats.stops,
      kind === "applique" ? 2 : kind === "keychain" ? 1 : 0,
    );
    const ids = [
      ...new Set(
        after.events
          .filter((e) => e.objectId === body.id && e.operationId)
          .map((e) => e.operationId),
      ),
    ];
    assert.deepEqual(
      ids,
      body.operations.map((op) => op.id),
    );
  }
});
test("specific object and group alignment keep the reference stationary and regenerate smart sources", () => {
  const a = smartShape("rect", 20, 20),
    b = smartShape("rect", 8, 8);
  translate(a, -15, 0);
  translate(b, 25, 20);
  const p = project([a, b]),
    before = structuredClone(a.rings);
  alignReference(p, [a.id, b.id], a.id, "center");
  assert.deepEqual(a.rings, before);
  close(objectBounds(b).minX + 4, -15);
  close(objectBounds(b).minY + 4, 0);
  const saved = b.rings;
  regenerateShape(b);
  nearRings(b.rings, saved);
  const c = smartShape("rect", 4, 4);
  translate(c, 35, 0);
  p.objects.push(c);
  distributeArtwork(
    p,
    p.objects.map((o) => o.id),
    "distribute-x",
  );
  const old = b.rings;
  regenerateShape(b);
  nearRings(b.rings, old);
});
test("satin column creates boundary-to-boundary variable widths and preserves counters in actual routing", () => {
  const o = object(
    "Taper with counter",
    [
      [
        { x: -3, y: -10 },
        { x: 3, y: -10 },
        { x: 2, y: 10 },
        { x: -2, y: 10 },
      ],
      [
        { x: -1, y: -4 },
        { x: -1, y: 4 },
        { x: 1, y: 4 },
        { x: 1, y: -4 },
      ],
    ],
    { fillRule: "evenodd", angle: 0, underlay: false, compensation: 0 },
  );
  o.operations = [
    {
      ...makeOperation("column", o),
      angle: 0,
      underlay: false,
      compensation: 0,
      tieIn: false,
      tieOff: false,
    },
  ];
  const rows = fillRows(o.rings, 0.42, 0, 10000, 0, "evenodd", "quarter", 6);
  assert(rows.every((r) => r.length === 2));
  assert(rows.some((r) => distance(r[0], r.at(-1)) > 5));
  assert(rows.some((r) => distance(r[0], r.at(-1)) < 2));
  const plan = generate(project([o]));
  let prev = null;
  for (const e of plan.events) {
    if (e.cmd === "stitch" && prev)
      assert(safeConnector(prev, e, o.rings, 0.11, [o.rings[1]], "evenodd"));
    if (e.cmd === "jump" || e.cmd === "stitch") prev = e;
  }
  assert(
    plan.events.some(
      (e) => e.cmd === "stitch" && e.phase === "top" && Math.abs(e.x) > 2.5,
    ),
  );
  assert(plan.stats.fits);
});
test("wide satin spans split with staggered penetrations and machine-safe commands", () => {
  const o = smartShape("rect", 24, 15, { radius: 0 });
  o.operations = [
    {
      ...makeOperation("column", o),
      underlay: false,
      maxSatin: 5,
      compensation: 0,
    },
  ];
  const plan = generate(project([o]));
  assert(plan.warnings.some((w) => w.includes("staggered split")));
  let prev = null;
  for (const e of plan.events) {
    if (prev && e.cmd === "stitch") assert(distance(e, prev) <= 7.001);
    if (["stitch", "jump"].includes(e.cmd)) prev = e;
  }
  const rows = fillRows(o.rings, 0.42, 0, 10000, 0, "evenodd", "quarter", 5);
  assert(rows.every((r) => r.length > 2));
  assert.notEqual(rows[0][1].x, rows[1].at(-2).x);
});
test("explicit tracing noise filter preserves a meaningful counter while removing isolated specks", () => {
  const w = 40,
    h = 40,
    data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i + 3] = 255;
      const black =
        (x >= 5 &&
          x < 35 &&
          y >= 5 &&
          y < 35 &&
          !(x >= 15 && x < 25 && y >= 15 && y < 25)) ||
        (x === 1 && y === 1);
      data[i] = data[i + 1] = data[i + 2] = black ? 0 : 255;
    }
  const keep = vectorizePixels({ width: w, height: h, data }, 2, true, 40, {
    minArea: 0,
    preservePixels: true,
    simplify: 0,
  });
  const clean = vectorizePixels({ width: w, height: h, data }, 2, true, 40, {
    minArea: 2,
    preservePixels: true,
    simplify: 0,
    smoothing: true,
  });
  assert(keep[0].rings.length > clean[0].rings.length);
  assert.equal(clean[0].rings.length, 2);
  assert(!inside({ x: 0, y: 0 }, clean[0].rings, "nonzero"));
  assert(fillPolygons(clean[0].rings, "nonzero"));
});
test("source validation rejects invalid shape, curve and editable lettering data", () => {
  for (const props of [
    { shape: { ...smartShape("star").shape, sides: Infinity } },
    { curve: { nodes: [], closed: true, frame: [1, 0, 0, 1, 0, 0] } },
    {
      textSource: {
        content: "A",
        height: 0,
        font: "serif",
        tracking: 0,
        lineSpacing: 1.3,
        align: "center",
        frame: [1, 0, 0, 1, 0, 0],
      },
    },
  ]) {
    const o = smartShape("rect");
    Object.assign(o, props);
    assert.throws(() => validateProject(project([o])));
  }
});

test("collinear and coincident-end Bézier controls retain extrema instead of collapsing the path", () => {
  const c = {
    closed: false,
    frame: [1, 0, 0, 1, 0, 0],
    nodes: [
      { x: 0, y: 0, out: { x: 20, y: 0 } },
      { x: 0, y: 0, in: { x: -20, y: 0 } },
    ],
  };
  const r = curveRings(c)[0];
  assert(r.length > 4);
  assert(Math.max(...r.map((p) => p.x)) > 5);
  assert(Math.min(...r.map((p) => p.x)) < -5);
});
test("adaptive satin turning shortens crowded inside stitches without changing legacy defaults", () => {
  const path = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ],
    legacy = satin(path, 3, 0.42, 7),
    adaptive = satin(path, 3, 0.42, 7, false, true, 0.8);
  assert.notDeepEqual(adaptive, legacy);
  assert.deepEqual(satin(path, 3, 0.42, 7, false, false, 0.8), legacy);
  assert(adaptive.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test("machine-grid validation retains every complete required satin row", () => {
  const o = smartShape("rect", 5, 12, { radius: 0 });
  o.operations = [
    {
      ...makeOperation("column", o),
      angle: 0,
      underlay: false,
      compensation: 0,
      tieIn: false,
      tieOff: false,
    },
  ];
  const plan = generate(project([o])),
    rows = fillRows(
      o.rings,
      o.spacing,
      0,
      o.length,
      0,
      "evenodd",
      "quarter",
      6,
    ),
    sewn = [];
  let prev = null;
  for (const e of plan.events) {
    if (
      prev &&
      e.cmd === "stitch" &&
      Math.abs(e.y - prev.y) < 0.001 &&
      Math.abs(e.x - prev.x) > 4.8
    )
      sewn.push(e.y);
    if (["stitch", "jump"].includes(e.cmd)) prev = e;
  }
  for (const row of rows)
    assert(
      sewn.some((y) => Math.abs(y - row[0].y) <= 0.051),
      `Missing row at ${row[0].y}`,
    );
});
test("individual vertex rounding leaves unrelated corners sharp and preserves topology", () => {
  const o = smartShape("rect", 20, 15, { radius: 0 }),
    before = structuredClone(o.rings);
  roundChecked(o, 2, { ring: 0, indices: [0] });
  assert(o.rings[0].length > 4);
  for (const p of before[0].slice(1))
    assert(o.rings[0].some((q) => distance(p, q) < 1e-8));
  assert(fillPolygons(o.rings, o.fillRule));
});

test("wide-column stagger obeys maximum span even at the first and last float", () => {
  const o = smartShape("rect", 24, 12, { radius: 0 });
  const rows = fillRows(o.rings, 0.42, 0, 7, 0, "evenodd", "quarter", 1);
  for (const row of rows)
    for (let i = 1; i < row.length; i++)
      assert(distance(row[i], row[i - 1]) <= 1.000001);
});
test("construction borders exclude cutout counters when requested and location markers are real stitches", () => {
  const body = smartShape("rect", 30, 20),
    eye = smartShape("eyelet");
  applyRecipe(body, "patch");
  const p = project([body, eye]);
  cutEyelet(p, eye, [body]);
  const border = body.operations.find((op) => op.type === "border");
  assert.equal(operationObject(body, border).rings.length, 1);
  border.outerOnly = false;
  assert.equal(operationObject(body, border).rings.length, 2);
  const marker = makeOperation("marker", eye);
  eye.operations.unshift(marker);
  const plan = generate(p);
  assert(
    plan.events.some(
      (e) =>
        e.objectId === eye.id &&
        e.operationId === marker.id &&
        e.cmd === "stitch" &&
        e.phase === "marker",
    ),
  );
  validateProject(p);
});
