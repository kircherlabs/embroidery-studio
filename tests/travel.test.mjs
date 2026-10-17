import test from "node:test";
import assert from "node:assert/strict";
import { generate, fillRows, analyze } from "../src/engine.js";
import { routeFill } from "../src/fill-routing.js";
import {
  object,
  ellipse,
  demo,
  MACHINES,
  validateProject,
} from "../src/model.js";
import { preparePlan } from "../src/planning.js";
const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const p = (objects, planning = {}) => ({
  version: 1,
  name: "Travel regression",
  machine: "se700",
  objects,
  planning,
});
const runs = (events) =>
  events
    .filter((e) => e.cmd === "stitch")
    .map((e) => e.objectId)
    .filter((id, i, a) => !i || a[i - 1] !== id);

test("eleven separate single-color fills complete with only initial and object jumps", () => {
  const project = p(
    Array.from({ length: 11 }, (_, i) =>
      object(
        "oval " + i,
        [ellipse((i % 4) * 20 - 30, Math.floor(i / 4) * 23 - 23, 8, 5)],
        { color: "#000000" },
      ),
    ),
  );
  const source = JSON.stringify(project),
    plan = generate(project);
  assert.equal(plan.stats.colors, 1);
  assert.equal(plan.stats.jumps, 11);
  assert.deepEqual(plan.stats.jumpBreakdown, {
    initial: 1,
    betweenObjects: 10,
    betweenRegions: 0,
    withinRegions: 0,
    unclassified: 0,
  });
  assert(plan.stats.trims <= 11);
  assert.equal(runs(plan.events).length, 11);
  assert.equal(JSON.stringify(project), source);
});
test("source objects containing several regions cannot be revisited or interleaved", () => {
  const a = object("two islands", [rect(-30, 0, 5, 5), rect(30, 0, 5, 5)], {
      color: "#000000",
    }),
    b = object("middle", [rect(0, 0, 5, 5)], { color: "#000000" });
  const plan = generate(p([a, b]));
  assert.equal(runs(plan.events).length, 2);
  assert.equal(plan.stats.jumpBreakdown.betweenRegions, 1);
  assert.equal(plan.stats.jumpBreakdown.betweenObjects, 1);
});
test("whole objects batch in first-use thread order while source order remains an override", () => {
  const colors = ["#000000", "#dd3333", "#2288dd", "#eebb33"],
    indices = [0, 1, 2, 0, 2, 1, 2, 0, 2, 3, 2];
  const objects = indices.map((c, i) =>
    object(
      "piece " + i,
      [rect((i % 4) * 20 - 30, Math.floor(i / 4) * 20 - 20, 5, 5)],
      { color: colors[c], underlay: false },
    ),
  );
  const plan = generate(p(objects));
  assert.equal(plan.stats.colors, 4);
  assert.equal(plan.stats.manualChanges, 3);
  assert.deepEqual(
    plan.events.filter((e) => e.cmd === "color").map((e) => e.color),
    colors.slice(1),
  );
  assert.deepEqual(
    runs(generate(p(objects, { optimizeColors: false })).events),
    objects.map((o) => o.id),
  );
  objects[1].sequenceLocked = true;
  const pinned = runs(generate(p(objects)).events);
  assert.equal(pinned[0], objects[0].id);
  assert.equal(pinned[1], objects[1].id);
  assert.doesNotThrow(() => validateProject(p(objects)));
});
test("routing sews every top span once and never crosses a counter or island gap", () => {
  const rings = [
    rect(-15, -10, 30, 20),
    rect(-5, -5, 10, 10),
    rect(20, -10, 5, 20),
  ];
  const o = object("counter", rings, {
    angle: 0,
    compensation: 0,
    underlay: false,
    fillRule: "evenodd",
  });
  const plan = generate(p([o]));
  let last = { x: 0, y: 0 };
  for (const e of plan.events) {
    if (e.cmd === "stitch")
      for (let t = 0.05; t < 1; t += 0.05) {
        const x = last.x + (e.x - last.x) * t,
          y = last.y + (e.y - last.y) * t;
        assert(
          !(x > -4.85 && x < 4.85 && y > -4.85 && y < 4.85),
          "sewing crosses counter",
        );
        assert(!(x > 15.15 && x < 19.85), "sewing crosses disconnected gap");
      }
    if (e.cmd === "stitch" || e.cmd === "jump") last = e;
  }
  const unit = preparePlan(p([o])).units.find((u) => u.bounds.width > 20),
    rows = fillRows(unit.rings, o.spacing, o.angle, o.length, 0, unit.fillRule);
  const routed = routeFill(rows, unit, { x: 0, y: 0 }, "top");
  assert.equal(routed.filter((r) => r.phase === "top").length, rows.length);
  assert.equal(
    new Set(
      routed
        .filter((r) => r.phase === "top")
        .map((r) =>
          r.p
            .map((q) => q.x + "," + q.y)
            .sort()
            .join(";"),
        ),
    ).size,
    rows.length,
  );
  assert(plan.stats.jumps < 8);
  assert(plan.stats.travelStitches > 0);
});
test("sloping narrow spans connect even without overlapping scanline intervals", () => {
  const o = object(
    "diagonal ribbon",
    [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 21, y: 20 },
        { x: 20, y: 20 },
      ],
    ],
    { angle: 0, underlay: false, compensation: 0 },
  );
  assert.equal(generate(p([o])).stats.jumps, 1);
});

test("travel shortcuts cannot sew across a narrow open channel", () => {
  const ring = [
    { x: 0, y: 0 },
    { x: 4.3, y: 0 },
    { x: 4.3, y: 10 },
    { x: 2.3, y: 10 },
    { x: 2.3, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 10 },
    { x: 0, y: 10 },
  ];
  const plan = generate(
    p([
      object("open channel", [ring], {
        angle: 0,
        underlay: false,
        compensation: 0.15,
      }),
    ]),
  );
  let prev = { x: 0, y: 0 };
  for (const e of plan.events) {
    if (e.cmd === "stitch")
      for (let t = 0.01; t < 1; t += 0.01) {
        const x = prev.x + (e.x - prev.x) * t,
          y = prev.y + (e.y - prev.y) * t;
        assert(
          !(x > 2.12 && x < 2.18 && y > 2.2),
          "travel closed the compensated channel",
        );
      }
    if (e.cmd === "stitch" || e.cmd === "jump") prev = e;
  }
});
test("underlay precedes top stitching and internal travel follows machine stitch limits", () => {
  const plan = generate(demo());
  assert(plan.stats.jumps <= 15);
  assert(plan.stats.maxLength <= 7);
  for (const id of new Set(plan.events.map((e) => e.objectId))) {
    let top = false;
    for (const e of plan.events.filter(
      (e) => e.objectId === id && e.cmd === "stitch",
    )) {
      if (e.phase === "top" || e.phase === "travel") top = true;
      if (e.phase?.startsWith("underlay"))
        assert(!top, "underlay repeated after top fill");
    }
  }
  assert.equal(plan.stats.redundantStitches, 0);
});
test("jump diagnostics count actual commands, separate moves, and avoid guessing decoded object origins", () => {
  const events = [
    { cmd: "jump", x: 0, y: 0, objectId: "a", regionId: "a0" },
    { cmd: "stitch", x: 0, y: 0, objectId: "a", regionId: "a0" },
    { cmd: "jump", x: 1, y: 0, objectId: "a", regionId: "a0" },
    { cmd: "stitch", x: 2, y: 0, objectId: "a", regionId: "a0" },
    { cmd: "jump", x: 3, y: 0, objectId: "a", regionId: "a1" },
    { cmd: "stitch", x: 4, y: 0, objectId: "a", regionId: "a1" },
    { cmd: "jump", x: 5, y: 0, objectId: "b", regionId: "b0" },
  ];
  const stats = analyze(events, MACHINES.se700);
  assert.equal(stats.jumps, 4);
  assert.equal(stats.jumpMoves, 3);
  assert.deepEqual(stats.jumpBreakdown, {
    initial: 1,
    withinRegions: 1,
    betweenRegions: 1,
    betweenObjects: 1,
    unclassified: 0,
  });
  const machine = analyze(
    events.map((e) => ({ ...e, objectId: null, regionId: undefined })),
    MACHINES.se700,
  );
  assert.equal(machine.jumpBreakdown.unclassified, 3);
  assert.equal(machine.jumps, 4);
});
