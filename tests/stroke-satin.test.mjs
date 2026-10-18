import test from "node:test";
import assert from "node:assert/strict";
import { object, translate, validateProject } from "../src/model.js";
import { smartShape } from "../src/creative.js";
import { makeOperation } from "../src/operations.js";
import { preparePlan } from "../src/planning.js";
import { generate, satin } from "../src/engine.js";
import { distance, safeConnector } from "../src/geometry.js";
import { strokeSatin } from "../src/stroke-satin.js";
const project = (objects) => ({
  version: 1,
  name: "Satin regression",
  machine: "se700",
  objects,
  planning: { smallDetail: 0 },
});
const column = (o) => {
  o.operations = [
    {
      ...makeOperation("column", o),
      compensation: 0,
      tieIn: false,
      tieOff: false,
      underlay: true,
    },
  ];
  return o;
};
const analyze = (o) => strokeSatin(preparePlan(project([o])).units[0]);
const tee = () =>
  column(
    object(
      "T stroke junction",
      [
        [
          [-6, -10],
          [6, -10],
          [6, -8],
          [1, -8],
          [1, 10],
          [-1, 10],
          [-1, -8],
          [-6, -8],
        ].map(([x, y]) => ({ x, y })),
      ],
      { type: "fill", closed: true },
    ),
  );
test("stroke decomposition constructs transverse columns on both arms of a T, without global scanlines", () => {
  const o = tee(),
    r = analyze(o);
  assert(!r.reason, r.reason);
  assert(r.coverage > 0.95);
  assert(r.overlap < 0.06);
  assert(r.strokes.length >= 2);
  const angles = r.strokes.flatMap((s) =>
    s.sections.map((q) => Math.atan2(q.b.y - q.a.y, q.b.x - q.a.x)),
  );
  assert(angles.filter((a) => Math.abs(Math.cos(a)) > 0.95).length > 30);
  assert(angles.filter((a) => Math.abs(Math.sin(a)) > 0.95).length > 20);
  const plan = generate(project([o]));
  assert(plan.events.some((e) => e.phase === "satin-stroke"));
  assert(plan.stats.fits);
  assert(
    plan.stats.jumps < 8,
    `Unexpected fragmented travel: ${plan.stats.jumps}`,
  );
});
test("curved variable-width rails, center-walk underlay and hidden travel preserve an actual counter", () => {
  const o = column(smartShape("ellipse", 12, 20)),
    hole = smartShape("ellipse", 8, 15);
  o.rings.push(...hole.rings);
  o.fillRule = "evenodd";
  const r = analyze(o);
  assert(!r.reason, r.reason);
  assert(r.coverage > 0.9);
  assert(r.strokes.flatMap((s) => s.sections).some((s) => s.width > 2));
  for (const stroke of r.strokes.filter((s) => s.closed))
    assert.equal(
      stroke.sections.length % 2,
      0,
      "Closed columns must alternate across the seam",
    );
  const plan = generate(project([o]));
  let last;
  for (const e of plan.events) {
    if (e.cmd === "stitch" && last)
      assert(
        safeConnector(last, e, o.rings, 0.11, hole.rings, "evenodd"),
        JSON.stringify({ last, e }),
      );
    if (["jump", "stitch"].includes(e.cmd)) last = e;
  }
  assert(plan.events.some((e) => e.phase === "underlay"));
  assert(plan.events.some((e) => e.phase === "satin-stroke"));
  assert(plan.stats.jumps < 12);
});
test("local direction guides change real needle positions, transform with geometry, and survive project serialization", () => {
  const o = column(smartShape("rect", 4, 18, { radius: 1 })),
    baseline = generate(project([o]));
  o.operations[0].satinGuides = [{ a: { x: -2, y: -1 }, b: { x: 2, y: 1 } }];
  const guided = generate(project([o]));
  assert(!guided.diagnostics.satin.some((d) => d.fallback));
  assert.notDeepEqual(guided.events, baseline.events);
  translate(o, 10, -5);
  assert.deepEqual(o.operations[0].satinGuides, [
    { a: { x: 8, y: -6 }, b: { x: 12, y: -4 } },
  ]);
  const saved = JSON.parse(JSON.stringify(project([o])));
  validateProject(saved);
  assert.deepEqual(generate(saved).events, generate(project([o])).events);
  o.operations[0].satinGuides = [
    { a: { x: 100, y: 100 }, b: { x: 101, y: 100 } },
  ];
  assert(
    generate(project([o])).issues.some((i) => i.code === "satin-orphan-guide"),
  );
  saved.objects[0].operations[0].satinGuides = [
    { a: { x: 0, y: 0 }, b: { x: NaN, y: 0 } },
  ];
  assert.throws(() => validateProject(saved), /direction guides/);
});
test("automatic failure reports its tatami fallback or leaves the region unsewn deliberately", () => {
  const o = column(smartShape("ellipse", 20, 20)),
    p = project([o]);
  const fallback = generate(p);
  assert(
    fallback.issues.some(
      (i) => i.code === "satin-decomposition" && i.severity === "warning",
    ),
  );
  assert(fallback.diagnostics.satin[0].fallback);
  o.operations[0].columnFallback = "manual";
  const manual = generate(p);
  assert.equal(manual.stats.stitches, 0);
  assert(
    manual.issues.some(
      (i) => i.code === "satin-decomposition" && i.severity === "error",
    ),
  );
});
test("wide stroke floats split safely with an explicit diagnostic", () => {
  const o = column(smartShape("rect", 9, 30, { radius: 1 }));
  o.operations[0].maxSatin = 3;
  const p = generate(project([o]));
  assert(!p.diagnostics.satin.some((d) => d.fallback));
  assert(p.warnings.some((w) => w.includes("staggered split")));
  let last;
  for (const e of p.events) {
    if (last && e.cmd === "stitch" && e.phase === "satin-stroke")
      assert(distance(last, e) <= 3.15);
    if (["jump", "stitch"].includes(e.cmd)) last = e;
  }
});
test("legacy columns retain their exact directional commands when no mode is saved", () => {
  const o = tee();
  delete o.operations[0].columnMode;
  const old = generate(project([o]));
  o.operations[0].columnMode = "directional";
  assert.deepEqual(generate(project([o])).events, old.events);
  assert(!old.diagnostics.satin);
});
test("closed satin border has even alternating stations across the seam and controlled inner turns", () => {
  const circle = Array.from({ length: 51 }, (_, i) => ({
    x: 5 * Math.cos((i * Math.PI * 2) / 51),
    y: 5 * Math.sin((i * Math.PI * 2) / 51),
  }));
  const p = satin(circle, 2, 0.41, 7, true, true, 0.3);
  assert.equal((p.length - 1) % 2, 0);
  assert.deepEqual(p[0], p.at(-1));
  assert(distance(p.at(-2), p[0]) > 1.8);
  const corner = [
    { x: 0, y: 0 },
    { x: 0, y: 5 },
    { x: 5, y: 5 },
  ];
  assert.notDeepEqual(
    satin(corner, 3, 0.4, 7, false, true, 0.5),
    satin(corner, 3, 0.4, 7, false, false),
  );
});

test("an unsewable automatic region cannot silently export an empty fallback", () => {
  const o = column(smartShape("ellipse", 0.12, 0.12)),
    p = generate(project([o]));
  assert.equal(p.stats.stitches, 0);
  assert(
    p.issues.some(
      (i) => i.code === "satin-decomposition" && i.severity === "error",
    ),
  );
});
