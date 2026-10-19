import test from "node:test";
import assert from "node:assert/strict";
import { object, validateProject } from "../src/model.js";
import {
  identity,
  railRings,
  regenerateRails,
  curveRings,
  mapPoint,
} from "../src/smart-geometry.js";
import {
  makeRailSource,
  manualSatin,
  railLayout,
  splitRailSource,
} from "../src/manual-satin.js";
import { makeOperation } from "../src/operations.js";
import { transformSelection } from "../src/hierarchy.js";
import { generate } from "../src/engine.js";
import {
  distance,
  inside,
  polygonArea,
  fillPolygons,
} from "../src/geometry.js";
const c = (nodes, closed = false) => ({ nodes, closed, frame: identity() });
const line = (y) =>
  c([
    { x: -20, y },
    { x: 20, y },
  ]);
const circle = (r, n = 64, reverse = false) =>
  c(
    Array.from({ length: n }, (_, i) => ({
      x: r * Math.cos(((reverse ? -1 : 1) * i * 2 * Math.PI) / n),
      y: r * Math.sin(((reverse ? -1 : 1) * i * 2 * Math.PI) / n),
    })),
    true,
  );
const project = (objects) => ({
  version: 1,
  name: "Manual satin",
  machine: "se700",
  objects,
  groups: [],
  planning: { smallDetail: 0, optimizeColors: true },
});
const art = (a, b, settings = {}) => {
  const satinRails = makeRailSource(a, b),
    o = object("Manual column", railRings(satinRails), {
      closed: true,
      satinRails,
      fillRule: "evenodd",
    });
  o.operations = [
    {
      ...makeOperation("column", o),
      columnMode: "rails",
      compensation: 0,
      ...settings,
    },
  ];
  return o;
};
const view = (o) => ({ ...o, ...o.operations[0] });
const near = (a, b, t = 1e-5) => assert(Math.abs(a - b) < t, `${a} != ${b}`);
test("two independent rails make transverse variable-width satin with one contiguous top path", () => {
  const o = art(
      line(-2),
      c([
        { x: -20, y: 1 },
        { x: 20, y: 4 },
      ]),
    ),
    result = manualSatin(view(o)),
    p = generate(project([o]));
  assert(result.minWidth < 3.1 && result.maxWidth > 5.9);
  assert(p.stats.stitches > 150);
  assert.equal(p.stats.jumpBreakdown.betweenObjects, 0);
  assert(p.stats.fits);
  assert(!p.issues.some((i) => i.severity === "error"));
  const top = result.paths.filter((p) => p.phase === "satin-rails");
  assert.equal(top.length, 1);
  for (let i = 1; i < top[0].p.length; i++) {
    const a = top[0].p[i - 1],
      b = top[0].p[i];
    assert(Math.abs(b.y - a.y) > 2.9);
    assert(Math.abs(b.x - a.x) < 0.4);
  }
  assert(result.paths.some((p) => p.phase === "underlay"));
  validateProject(JSON.parse(JSON.stringify(project([o]))));
});
test("direction rungs influence actual rail correspondence and reject crossing/missing guides", () => {
  const o = art(line(-2), line(2), { underlay: false }),
    before = manualSatin(view(o));
  o.operations[0].satinGuides = [{ a: { x: -5, y: -3 }, b: { x: 2, y: 3 } }];
  const after = manualSatin(view(o));
  assert.notDeepEqual(after.paths, before.paths);
  assert(after.sections.some((q) => q.b.x - q.a.x > 4));
  assert.throws(
    () => railLayout(o.satinRails, [{ a: { x: 0, y: -1 }, b: { x: 0, y: 1 } }]),
    /cross each rail/,
  );
  assert.throws(
    () =>
      railLayout(o.satinRails, [
        { a: { x: -5, y: -3 }, b: { x: 8, y: 3 } },
        { a: { x: 5, y: -3 }, b: { x: -8, y: 3 } },
      ]),
    /cross or disagree/,
  );
});
test("closed rails form one band across a genuine counter, not two independent outlines", () => {
  const o = art(circle(16), circle(12, 47, true), { underlay: false }),
    r = manualSatin(view(o));
  assert(r.closed);
  assert.equal(r.paths.length, 1);
  assert(!inside({ x: 0, y: 0 }, o.rings, "evenodd"));
  for (const q of r.sections) {
    assert(Math.hypot(q.a.x, q.a.y) > 15.9);
    assert(Math.hypot(q.b.x, q.b.y) > 11.9 && Math.hypot(q.b.x, q.b.y) < 12.01);
    near(q.width, 4, 0.04);
  }
  assert(r.sections.length > 470);
  const top = r.paths[0].p;
  near(top[0].x, top.at(-1).x, 0.001);
  near(top[0].y, top.at(-1).y, 0.001);
  const p = generate(project([o]));
  assert(p.stats.jumps < 4);
  assert(!p.issues.some((i) => i.severity === "error"));
});
test("seam nodes and independent rail direction survive group transforms, scaling and mirrors", () => {
  const o = art(circle(16), circle(12, 64, true));
  o.satinRails.seamA = 16;
  o.satinRails.seamB = 48;
  const first = railLayout(o.satinRails).sections[0],
    p = project([o]);
  transformSelection([o], { sx: -1.2, sy: 0.8, angle: 20, dx: 5, dy: -3 });
  regenerateRails(o);
  const r = railLayout(o.satinRails);
  assert(distance(first.a, r.sections[0].a) > 5);
  assert.equal(o.satinRails.seamA, 16);
  near(
    distance(
      r.sections[0].a,
      mapPoint(o.satinRails.a.nodes[16], o.satinRails.a.frame),
    ),
    0,
  );
  validateProject(p);
  assert(!generate(p).issues.some((i) => i.severity === "error"));
});
test("width adjustment, compensation, center/edge underlay and reverse alter manufacturing without changing source", () => {
  const o = art(line(-2), line(2)),
    source = structuredClone(o.satinRails),
    normal = manualSatin(view(o));
  Object.assign(o.operations[0], {
    railScale: 1.5,
    compensation: 0.2,
    railUnderlay: "both",
    reverse: true,
  });
  const adjusted = manualSatin(view(o));
  near(adjusted.maxWidth, 6.4, 0.001);
  assert(adjusted.wide > 0);
  assert.equal(adjusted.paths.filter((p) => p.phase === "underlay").length, 3);
  assert(adjusted.sections[0].center.x > normal.sections[0].center.x + 39);
  assert.deepEqual(o.satinRails, source);
  let last = null;
  for (const e of generate(project([o])).events) {
    if (e.cmd === "stitch" && last) assert(distance(last, e) <= 6.6);
    if (["stitch", "jump"].includes(e.cmd)) last = e;
  }
});
test("sharp bends reject counter-crossing correspondence instead of silently sewing across the opening", () => {
  const o = art(circle(16), circle(12));
  o.satinRails.reverseB = true;
  const p = generate(project([o]));
  assert(
    p.issues.some(
      (i) => i.code === "manual-satin-rails" && i.severity === "error",
    ),
  );
  assert.equal(p.stats.stitches, 0);
  assert.throws(
    () =>
      makeRailSource(
        line(0),
        c([
          { x: -20, y: 2 },
          { x: 20, y: -2 },
        ]),
      ),
    /non-crossing/,
  );
  assert(
    manualSatin(view(art(circle(10), circle(12)))).paths.length,
    "either rail can be the outer contour",
  );
});
test("closed-ring split preserves area and yields two individually editable curved columns", () => {
  const o = art(circle(16), circle(12, 47, true)),
    parts = splitRailSource(o.satinRails, [], 0.37);
  assert.equal(parts.length, 2);
  assert(parts.every((r) => !r.a.closed && !r.b.closed));
  const area = polygonArea(fillPolygons(o.rings, "evenodd")),
    sum = parts.reduce(
      (n, r) => n + polygonArea(fillPolygons(railRings(r), "evenodd")),
      0,
    );
  near(sum, area, 0.2);
  const a = manualSatin({ ...view(o), satinRails: parts[0] }),
    b = manualSatin({ ...view(o), satinRails: parts[1] });
  assert(a.paths.length && b.paths.length);
  assert.throws(() => splitRailSource(o.satinRails, [], 0), /split/);
});
test("malformed sources, modes, seam indices and settings are rejected while old projects remain readable", () => {
  const o = art(line(-2), line(2)),
    p = project([o]);
  validateProject(p);
  for (const change of [
    (q) => (q.objects[0].satinRails.a.frame = [0, 0, 0, 0, 0, 0]),
    (q) => (q.objects[0].satinRails.seamA = 99),
    (q) => (q.objects[0].operations[0].railScale = 9),
    (q) => (q.objects[0].operations[0].railUnderlay = "bad"),
  ]) {
    const q = structuredClone(p);
    change(q);
    assert.throws(() => validateProject(q));
  }
  delete o.satinRails;
  o.operations[0].columnMode = "stroke";
  validateProject(p);
});
test("a hollow heart is one continuous satin band, and splitting keeps the opening", () => {
  const heart = (scale) =>
    c(
      Array.from({ length: 96 }, (_, i) => {
        const t = (i * Math.PI) / 48;
        return {
          x: scale * 16 * Math.sin(t) ** 3,
          y:
            -scale *
            (13 * Math.cos(t) -
              5 * Math.cos(2 * t) -
              2 * Math.cos(3 * t) -
              Math.cos(4 * t)),
        };
      }),
      true,
    );
  const o = art(heart(1), heart(0.78), { cornerControl: true }),
    r = manualSatin(view(o));
  assert.equal(o.satinRails.seamB, 0);
  assert.equal(r.paths.filter((p) => p.phase === "satin-rails").length, 1);
  assert(r.sections.length > 450);
  assert(!inside({ x: 0, y: 0 }, o.rings, "evenodd"));
  const p = generate(project([o]));
  assert(!p.issues.some((i) => i.severity === "error"));
  assert(p.stats.jumps < 5);
  const parts = splitRailSource(o.satinRails, [], 0.5);
  assert(
    parts.every(
      (s) => manualSatin({ ...view(o), satinRails: s }).paths.length > 0,
    ),
  );
});
test("curved variable-width columns pace the outer rail in physical millimeters", () => {
  const arc = (radius, n) =>
    c(
      Array.from({ length: n }, (_, i) => ({
        x: radius * Math.cos((i / (n - 1)) * Math.PI * 0.7),
        y: radius * Math.sin((i / (n - 1)) * Math.PI * 0.7),
      })),
    );
  const o = art(arc(15, 48), arc(11, 33), {
      underlay: false,
      cornerControl: true,
    }),
    r = manualSatin(view(o));
  for (let i = 2; i < r.sections.length; i++)
    assert(distance(r.sections[i].a, r.sections[i - 2].a) <= 0.42001);
  assert(
    r.sections.some((q) => Math.abs(q.a.x - q.b.x) > 3) &&
      r.sections.some((q) => Math.abs(q.a.y - q.b.y) > 3),
  );
  assert(!generate(project([o])).issues.some((i) => i.severity === "error"));
});

test("independent cubic rails and their rungs survive group transforms", () => {
  const curve = (y) =>
    c([
      { x: -20, y, out: { x: -10, y: y - 10 } },
      { x: 20, y, in: { x: 10, y: y - 10 } },
    ]);
  const o = art(curve(-2), curve(3)),
    p = project([o]);
  o.operations[0].satinGuides = [{ a: { x: 0, y: -15 }, b: { x: 0, y: 5 } }];
  const before = manualSatin(view(o));
  assert(before.sections.length > 150);
  transformSelection([o], { sx: -1, dx: 4, dy: 3 });
  validateProject(p);
  const after = manualSatin(view(o));
  near(after.minWidth, before.minWidth, 0.03);
  near(after.maxWidth, before.maxWidth, 0.03);
  assert.notDeepEqual(o.satinRails.a.frame, identity());
  assert(!generate(p).issues.some((i) => i.severity === "error"));
});

test("narrow spans get actionable guidance and collapsed tips cannot export", () => {
  const narrow = art(line(0), line(0.5));
  const p = generate(project([narrow]));
  assert(p.stats.stitches > 0);
  assert(
    p.issues.some(
      (i) => i.code === "manual-satin-narrow" && i.severity === "warning",
    ),
  );
  const collapsed = art(line(0), line(0.05));
  const q = generate(project([collapsed]));
  assert.equal(q.stats.stitches, 0);
  assert(
    q.issues.some(
      (i) => i.code === "manual-satin-rails" && i.severity === "error",
    ),
  );
  const ring = art(circle(16), circle(12));
  ring.operations[0].satinGuides = [
    { a: { x: -20, y: 0 }, b: { x: 20, y: 0 } },
  ];
  assert.throws(() => manualSatin(view(ring)), /once|cross|rail/i);
});
