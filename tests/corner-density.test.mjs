import test from "node:test";
import assert from "node:assert/strict";
import { satin, generate, fillRows, resample } from "../src/engine.js";
import {
  centerlineRails,
  paceRails,
  shortInnerTurns,
} from "../src/satin-rails.js";
import { distance, inside } from "../src/geometry.js";
import { object, validateProject } from "../src/model.js";
import { smartShape, roundChecked } from "../src/creative.js";
import { makeOperation } from "../src/operations.js";
import { strokeSatin } from "../src/stroke-satin.js";
import { preparePlan } from "../src/planning.js";
const project = (o) => ({
  version: 1,
  name: "Rounded coverage",
  machine: "se700",
  objects: [o],
  planning: { smallDetail: 0 },
});
const circle = (r) =>
  Array.from({ length: 256 }, (_, i) => ({
    x: r * Math.cos((i * Math.PI) / 128),
    y: r * Math.sin((i * Math.PI) / 128),
  }));
const maximumGap = (rail, closed = false) =>
  Math.max(
    ...rail.slice(1).map((p, i) => distance(p, rail[i])),
    closed ? distance(rail[0], rail.at(-1)) : 0,
  );

test("running, bean and triple outlines follow rounded arcs instead of cutting across long chords", () => {
  const curve = circle(3),
    p = resample(curve, 2.8, true);
  for (let i = 1; i < p.length; i++) {
    assert(distance(p[i - 1], p[i]) <= 2.8 + 1e-9);
    const middle = {
      x: (p[i - 1].x + p[i].x) / 2,
      y: (p[i - 1].y + p[i].y) / 2,
    };
    assert(Math.abs(Math.hypot(middle.x, middle.y) - 3) <= 0.1);
  }
  const o = smartShape("rect", 16, 12, { radius: 2 });
  for (const type of ["run", "bean", "triple"]) {
    o.operations = [{ ...makeOperation(type, o), length: 2.8, closed: true }];
    const plan = generate(project(o));
    assert(plan.stats.fits);
    assert(plan.stats.maxLength <= 2.95);
  }
});

test("satin density is measured on outer arcs, with full width and even closed seams", () => {
  for (const [radius, width] of [
    [3, 4],
    [5, 2],
    [1.5, 1],
  ]) {
    const p = satin(circle(radius), width, 0.42, 7, true, true, 0.3),
      outer = p.slice(0, -1).filter((q) => Math.hypot(q.x, q.y) > radius);
    assert(
      maximumGap(outer, true) <= 0.425,
      `outer rail spacing ${maximumGap(outer, true)}`,
    );
    assert(
      outer.every(
        (q) => Math.abs(Math.hypot(q.x, q.y) - (radius + width / 2)) < 0.012,
      ),
    );
    assert.deepEqual(p[0], p.at(-1));
    assert.equal((p.length - 1) % 2, 0);
    assert(distance(p[0], p.at(-2)) > width * 0.8);
    assert(!p.tightTurn);
    const o = object("Machine-grid curve", [circle(radius)], {
      type: "satin",
      closed: true,
      width,
      spacing: 0.42,
      compensation: 0,
      underlay: false,
      tieIn: false,
      tieOff: false,
    });
    const outerNeedles = generate(project(o)).events.filter(
      (e) => e.cmd === "stitch" && Math.hypot(e.x, e.y) > radius + width * 0.3,
    );
    assert(maximumGap(outerNeedles, true) <= 0.42 + Math.SQRT2 * 0.1 + 0.005);
    assert(
      outerNeedles.every(
        (q) => Math.abs(Math.hypot(q.x, q.y) - (radius + width / 2)) < 0.085,
      ),
    );
  }
});

test("rounded open bends are repaced by rail distance rather than the old centerline count", () => {
  const o = object(
    "Open L",
    [
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
      ],
    ],
    { type: "satin", closed: false },
  );
  roundChecked(o, 2);
  const built = centerlineRails(o.rings[0], 2, 0.42),
    sections = paceRails(built.sections, 0.42),
    p = satin(o.rings[0], 2, 0.42, 7, false);
  for (const side of ["a", "b"])
    assert(
      maximumGap(
        sections
          .filter((_, i) => i % 2 === (side === "a" ? 0 : 1))
          .map((q) => q[side]),
      ) <= 0.425,
    );
  assert.equal(p.length, sections.length);
  assert(sections.every((q) => Math.abs(distance(q.a, q.b) - 2) < 0.02));
  assert(!built.tight);
});

test("short stitches keep the outer rail and alternate full inner penetrations, never thinning straight satin", () => {
  const straight = paceRails(
    centerlineRails(
      [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
      ],
      3,
      0.2,
    ).sections,
    0.2,
  );
  assert.deepEqual(shortInnerTurns(straight, 1), straight);
  const raw = paceRails(
      centerlineRails(circle(3), 4, 0.42, true).sections,
      0.42,
      true,
    ),
    short = shortInnerTurns(raw, 0.4, true);
  let changed = 0;
  for (let i = 0; i < raw.length; i++) {
    const outer = Math.hypot(raw[i].a.x, raw[i].a.y) > 3 ? "a" : "b",
      inner = outer === "a" ? "b" : "a";
    assert.deepEqual(short[i][outer], raw[i][outer]);
    if (distance(short[i][inner], raw[i][inner]) > 1e-8) {
      changed++;
      assert.equal(Math.floor(i / 2) % 2, 1);
    }
  }
  assert(changed > 10);
});

test("tight satin turns pivot without reversed inner loops and produce a located warning", () => {
  const o = object("Tight bend", [circle(0.6)], {
    type: "satin",
    closed: true,
    width: 3,
    compensation: 0,
    underlay: false,
  });
  const built = centerlineRails(o.rings[0], 3, 0.42, true);
  assert(built.tight);
  assert(
    built.sections.every(
      (q) => Math.hypot(q.a.x, q.a.y) < 0.08 || Math.hypot(q.b.x, q.b.y) < 0.08,
    ),
  );
  const p = generate(project(o)),
    issue = p.issues.find((i) => i.code === "tight-satin-turn");
  assert.equal(issue.objectId, o.id);
  assert.equal(issue.severity, "warning");
  assert(p.stats.maxLength <= 7);
  assert(p.events.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)));
});

test("rounding rebuilds variable-width satin rails, retains counters, settings and project editability", () => {
  const o = smartShape("rect", 12, 20),
    hole = smartShape("rect", 8, 16);
  o.rings.push(hole.rings[0].reverse());
  delete o.shape;
  o.operations = [
    { ...makeOperation("column", o), compensation: 0, underlay: true },
  ];
  const sharp = generate(project(o));
  roundChecked(o, 1.2);
  const unit = preparePlan(project(o)).units[0],
    r = strokeSatin(unit);
  assert(!r.reason, r.reason);
  assert(r.coverage > 0.9);
  const rounded = generate(project(o));
  assert.notDeepEqual(rounded.events, sharp.events);
  assert.equal(o.operations[0].spacing, 0.42);
  const full = strokeSatin({ ...unit, cornerControl: false });
  assert(!full.reason, full.reason);
  for (const stroke of full.strokes)
    for (const side of ["a", "b"])
      assert(
        maximumGap(
          stroke.sections
            .filter((_, i) => i % 2 === (side === "a" ? 0 : 1))
            .map((q) => q[side]),
          stroke.closed,
        ) <= 0.425,
      );
  const saved = JSON.parse(JSON.stringify(project(o)));
  validateProject(saved);
  assert.deepEqual(generate(saved).events, rounded.events);
  roundChecked(o, 0);
  assert.deepEqual(generate(project(o)).events, sharp.events);
});

test("stroke columns retain both full rails on straight strokes even at a large crowding threshold", () => {
  const o = smartShape("rect", 4, 20);
  o.operations = [
    { ...makeOperation("column", o), compensation: 0, minCornerStitch: 1 },
  ];
  const unit = preparePlan(project(o)).units[0],
    plain = strokeSatin({ ...unit, cornerControl: false }),
    controlled = strokeSatin({ ...unit, cornerControl: true });
  assert(!plain.reason, plain.reason);
  assert(!controlled.reason, controlled.reason);
  let checked = 0;
  plain.strokes.forEach((s, j) =>
    s.sections.forEach((q, i) => {
      if (Math.abs(q.center.y) < 5) {
        checked++;
        assert.deepEqual(controlled.strokes[j].sections[i].a, q.a);
        assert.deepEqual(controlled.strokes[j].sections[i].b, q.b);
      }
    }),
  );
  assert(checked > 20);
});

test("rounded heart and small polygon borders remain finite, bounded, regenerated and machine safe", () => {
  const heart = Array.from({ length: 160 }, (_, i) => {
    const t = (i * Math.PI) / 80;
    return {
      x: 4.8 * Math.sin(t) ** 3,
      y:
        -0.3 *
        (13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t)),
    };
  });
  for (const rings of [
    [heart],
    smartShape("star", 8, 8, { sides: 5, innerRatio: 0.5 }).rings,
  ]) {
    const o = object("Curved border", rings, { closed: true });
    o.operations = [
      {
        ...makeOperation("border", o),
        width: 0.8,
        compensation: 0,
        underlay: true,
      },
    ];
    const before = generate(project(o));
    roundChecked(o, 0.25);
    const after = generate(project(o));
    assert(after.stats.stitches > 30);
    assert(after.stats.maxLength <= 7);
    assert(after.stats.fits);
    assert.notDeepEqual(after.events, before.events);
    assert(
      after.events.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)),
    );
  }
});

test("tatami rows are regenerated at unchanged millimeter density and clipped to rounded corners and counters", () => {
  const o = smartShape("rect", 20, 16),
    hole = smartShape("rect", 4, 4);
  o.rings.push(hole.rings[0]);
  delete o.shape;
  o.fillRule = "evenodd";
  const before = fillRows(o.rings, 0.42, 0, 2.8, 0, o.fillRule);
  roundChecked(o, 2);
  const after = fillRows(o.rings, 0.42, 0, 2.8, 0, o.fillRule),
    ys = [...new Set(after.map((r) => r[0].y))];
  assert.notDeepEqual(before, after);
  assert.equal(ys.length, new Set(before.map((r) => r[0].y)).size);
  for (let i = 1; i < ys.length; i++)
    assert(Math.abs(ys[i] - ys[i - 1] - 0.42) < 1e-8);
  for (const row of after) {
    assert(row.slice(1, -1).every((p) => inside(p, o.rings, o.fillRule)));
    const a = row[0],
      b = row.at(-1);
    for (let t = 0.01; t < 1; t += 0.1)
      assert(inside({ x: a.x + (b.x - a.x) * t, y: a.y }, o.rings, o.fillRule));
  }
});
