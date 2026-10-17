import test from "node:test";
import assert from "node:assert/strict";
import { object, MACHINES, translate } from "../src/model.js";
import { generate, resample, fillRows } from "../src/engine.js";
import { preparePlan } from "../src/planning.js";
import {
  fillPolygons,
  points,
  inside,
  safeConnector,
} from "../src/geometry.js";
import { movementSegments } from "../src/preview.js";
const R = "#cc3333",
  B = "#3344cc";
const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const p = (objects, planning = {}) => ({
  version: 1,
  name: "Physics regression",
  machine: "se700",
  objects,
  planning,
});
const shape = (name, x, color = R) =>
  object(name, [rect(x, 0, 4, 4)], {
    color,
    underlay: false,
    compensation: 0,
    angle: 0,
  });

test("compatible disjoint colors batch without altering editable object order", () => {
  const project = p([
      shape("red left", -15),
      shape("blue", 0, B),
      shape("red right", 15),
    ]),
    before = JSON.stringify(project);
  const plan = generate(project);
  assert.equal(plan.stats.colors, 2);
  assert.equal(plan.stats.manualChanges, 1);
  assert.equal(plan.stats.uniqueColors, 2);
  assert.equal(JSON.stringify(project), before);
  assert.equal(
    generate({ ...project, planning: { optimizeColors: false } }).stats.colors,
    3,
  );
});
test("overlapping red-blue-red construction cannot be collapsed into two colors", () => {
  const a = shape("base", 0),
    b = shape("middle", 1, B),
    c = shape("top", 2);
  const plan = generate(p([a, b, c]));
  assert.equal(plan.stats.colors, 3);
  assert.deepEqual(
    plan.order.map((o) => o.objectId),
    [a.id, b.id, c.id],
  );
  assert(plan.diagnostics.overlapPairs >= 2);
});
test("manual stitch blocks are sequencing barriers and never get sorted across", () => {
  const m = object("manual", [], {
    type: "manual",
    color: B,
    commands: [
      { cmd: "jump", x: 0, y: 0 },
      { cmd: "stitch", x: 1, y: 0 },
    ],
  });
  const a = shape("first", -10),
    c = shape("last", 10);
  assert.deepEqual(
    preparePlan(p([a, m, c])).units.map((o) => o.id),
    [a.id, m.id, c.id],
  );
});

test("adjacent compensated colors retain boundary construction order", () => {
  const a = shape("base red", 0),
    b = shape("middle blue", 4.2, B),
    c = shape("top red", 8.4);
  for (const o of [a, b, c]) o.compensation = 0.15;
  assert.deepEqual(
    preparePlan(p([a, b, c])).units.map((o) => o.id),
    [a.id, b.id, c.id],
  );
  assert.equal(generate(p([a, b, c])).stats.colors, 3);
});

test("touching tiny contours combine before the small-island threshold", () => {
  const o = object(
    "joined detail",
    [rect(0, 0, 0.2, 0.1), rect(0.2, 0, 0.2, 0.1)],
    { fillRule: "nonzero" },
  );
  const plan = preparePlan(p([o]));
  assert.equal(plan.diagnostics.skippedDetails, 0);
  assert.equal(plan.units.length, 1);
  assert.equal(plan.units[0].bounds.width, 0.4);
});
test("small positive islands may be omitted while small holes and long fine details survive", () => {
  const outer = rect(-5, -5, 10, 10),
    hole = rect(-0.05, -0.05, 0.1, 0.1),
    island = rect(20, 20, 0.1, 0.1),
    fine = rect(10, 0, 0.08, 3);
  const o = object("contours", [outer, hole, island, fine], {
    fillRule: "evenodd",
  });
  const project = p([o]),
    before = JSON.stringify(project),
    plan = preparePlan(project);
  assert.equal(plan.diagnostics.skippedDetails, 1);
  assert.equal(plan.units.length, 2);
  const main = plan.units.find((u) => u.bounds.width > 5);
  assert.equal(main.rings.length, 2);
  assert(!inside({ x: 0, y: 0 }, main.rings, "nonzero"));
  assert.equal(JSON.stringify(project), before);
  assert.equal(
    preparePlan({ ...project, planning: { smallDetail: 0 } }).units.length,
    3,
  );
});
test("nonzero nesting and even-odd counters convert without changing filled topology", () => {
  const outer = rect(0, 0, 10, 10),
    inner = rect(2, 2, 6, 6);
  assert.equal(fillPolygons([outer, inner], "nonzero")[0].length, 1);
  assert.equal(fillPolygons([outer, inner], "evenodd")[0].length, 2);
  assert.equal(
    fillPolygons([outer, [...inner].reverse()], "nonzero")[0].length,
    2,
  );
});
test("matching thin SVG fill outlines are reversible and do not suppress intentional borders", () => {
  const f = shape("SVG region 1", 0),
    outline = object("SVG outline 2", structuredClone(f.rings), {
      type: "run",
      color: R,
      closed: true,
      underlay: false,
      svgSource: true,
      svgFillId: f.id,
      svgStrokeWidth: 0.02,
    });
  assert.equal(preparePlan(p([f, outline])).diagnostics.skippedOutlines, 1);
  assert.equal(
    preparePlan(p([f, outline], { skipSvgOutlines: false })).diagnostics
      .skippedOutlines,
    0,
  );
  for (const changed of [
    { color: B },
    { svgStrokeWidth: 1 },
    { name: "Intentional run", svgSource: false, svgFillId: undefined },
  ])
    assert.equal(
      preparePlan(p([f, { ...outline, ...changed }])).diagnostics
        .skippedOutlines,
      0,
    );
  const moved = structuredClone(outline);
  translate(moved, 2, 2);
  assert.equal(preparePlan(p([f, moved])).diagnostics.skippedOutlines, 0);
});
test("running stitches follow length rather than hundreds of flattening vertices", () => {
  const dense = Array.from({ length: 1001 }, (_, i) => ({ x: i / 100, y: 0 }));
  assert.equal(resample(dense, 2).length, 6);
  const plan = generate(
    p([
      object("outline", [dense], { type: "run", length: 2, underlay: false }),
    ]),
  );
  assert(plan.stats.stitches < 15);
  assert.equal(plan.stats.redundantStitches, 0);
});
test("generated command positions deduplicate after machine rounding", () => {
  const plan = generate(
    p([
      object("small", [rect(0, 0, 1, 1)], {
        angle: 23,
        spacing: 0.15,
        compensation: 0.15,
      }),
    ]),
  );
  assert.equal(plan.stats.redundantStitches, 0);
  assert.equal(plan.stats.zeroLength, plan.stats.anchorStitches);
  assert(plan.stats.maxLength <= 7);
});
test("unsewable geometry cannot introduce an empty color block", () => {
  const project = p(
    [
      shape("red", -10),
      object("unsewable blue", [rect(0, 0, 0.001, 0.001)], { color: B }),
      shape("red2", 10),
    ],
    { optimizeColors: false, smallDetail: 0 },
  );
  assert.equal(generate(project).stats.colors, 1);
});
test("exact connector checks catch a counter narrower than fixed sampling intervals", () => {
  const outer = rect(-2, -2, 4, 4),
    hole = rect(0.021, -0.1, 0.01, 0.2).reverse();
  assert(
    !safeConnector({ x: -1, y: 0 }, { x: 1, y: 0 }, [outer, hole], 0.15, [
      hole,
    ]),
  );
  assert(
    !safeConnector(
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      [outer, [...hole].reverse()],
      0,
      [],
      "evenodd",
    ),
  );
});
test("fill compensation keeps a gap through narrow counters", () => {
  const rows = fillRows(
    [rect(-2, -1, 4, 2), rect(-0.05, -1, 0.1, 2)],
    0.4,
    0,
    2,
    0.5,
    "evenodd",
  );
  assert(rows.every((r) => r.every((q) => q.x < -0.015 || q.x > 0.015)));
});
test("a separate manual block starts with a jump instead of sewing from the preceding design", () => {
  const m = object("manual", [], {
    type: "manual",
    color: R,
    commands: [
      { cmd: "stitch", x: 30, y: 30 },
      { cmd: "stitch", x: 31, y: 30 },
    ],
  });
  const plan = generate(p([shape("red", -10), m]));
  const events = plan.events.filter((e) => e.objectId === m.id);
  assert.equal(events[0].cmd, "jump");
  assert.equal(events[0].x, 30);
  assert.equal(events[0].y, 30);
});
test("quantized long diagonal stitches remain inside the machine limit", () => {
  const plan = generate(
    p([
      object(
        "diag",
        [
          [
            { x: 0, y: 0 },
            { x: 4.943, y: 4.943 },
          ],
        ],
        { type: "run", length: 7, underlay: false },
      ),
    ]),
  );
  assert(plan.stats.maxLength <= MACHINES.se700.maxStitch);
});
test("preview excludes travel and nonmoving metadata from sewing segments", () => {
  const events = [
    { cmd: "jump", x: 10, y: 0 },
    { cmd: "stitch", x: 11, y: 0 },
    { cmd: "trim", x: 90, y: 90 },
    { cmd: "color", x: 80, y: 80 },
    { cmd: "stitch", x: 12, y: 0 },
    { cmd: "jump", x: 20, y: 0 },
    { cmd: "stitch", x: 21, y: 0 },
  ];
  const segments = [...movementSegments(events)];
  assert.equal(segments.length, 5);
  const sew = segments.filter((s) => s.event.cmd === "stitch");
  assert.deepEqual(
    sew.map((s) => [s.from.x, s.to.x]),
    [
      [10, 11],
      [11, 12],
      [20, 21],
    ],
  );
});
