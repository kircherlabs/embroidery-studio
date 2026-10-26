import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "../src/engine.js";
import { object, ellipse, translate } from "../src/model.js";
import { stitchQuality, QUALITY_ISSUES } from "../src/stitch-quality.js";
import {
  qualityFixtures,
  project,
  autoLetter,
  manualRing,
} from "./helpers/quality-fixtures.mjs";
import { generateMultiHoop } from "../src/multi-hoop-split.js";
import { newLayout } from "../src/multi-hoop-layout.js";
test("routing and underlay diagnostics identify actual source actions and events", () => {
  for (const [p, code] of [
    [qualityFixtures().narrowNeck, "fill-return"],
    [project([autoLetter()]), "satin-return"],
    [project([manualRing(2, 1.6)]), "satin-underlay-chords"],
  ]) {
    const original = JSON.stringify(p),
      old = generate(p),
      issue = old.issues.find((i) => i.code === code);
    assert(issue, code);
    assert.equal(issue.severity, "warning");
    assert(Number.isInteger(issue.eventIndex));
    assert.equal(old.events[issue.eventIndex].objectId, issue.objectId);
    assert.equal(old.events[issue.eventIndex].operationId, issue.operationId);
    assert.match(issue.action, /quality safeguards/i);
    assert.equal(JSON.stringify(p), original);
    p.planning.qualitySafeguards = true;
    assert(!generate(p).issues.some((i) => i.code === code));
  }
});
test("needle crowding detects a collapsed inner turn without changing any stitches", () => {
  const o = object("Tight satin", [ellipse(0, 0, 0.6, 0.6, 128)], {
    id: "tight",
    type: "satin",
    closed: true,
    width: 3,
    compensation: 0,
    underlay: false,
  });
  const p = project([o]),
    plan = generate(p),
    issue = plan.issues.find((i) => i.code === "needle-crowding");
  assert(issue);
  assert.equal(issue.severity, "warning");
  assert.equal(plan.events[issue.eventIndex].objectId, o.id);
  assert(plan.issues.some((i) => i.code === "tight-satin-turn"));
  assert.match(issue.message, /grid position/);
  const before = JSON.stringify(plan.events);
  stitchQuality(plan.events, [{ ...o, operationId: "base" }]);
  assert.equal(JSON.stringify(plan.events), before);
});
test("intentional run, manual commands, tie locks and ordinary short details are not crowding faults", () => {
  for (const type of ["run", "manual", "fill"]) {
    const units = [{ id: "a", operationId: "b", type }];
    const events = Array.from({ length: 80 }, (_, i) => ({
      cmd: "stitch",
      x: (i % 2) * 0.1,
      y: 0,
      objectId: "a",
      operationId: "b",
      phase: type === "fill" ? "tie" : "top",
    }));
    assert.deepEqual(stitchQuality(events, units).issues, []);
  }
  const units = [{ id: "a", operationId: "b", type: "fill" }];
  const events = Array.from({ length: 8 }, (_, i) => ({
    cmd: "stitch",
    x: i * 0.1,
    y: 0,
    objectId: "a",
    operationId: "b",
    phase: "top",
  }));
  assert.deepEqual(stitchQuality(events, units).issues, []);
});
test("assembled multi-hoop warnings retain the correct hoop and sequence position", () => {
  const a = autoLetter(),
    b = autoLetter("H");
  translate(a, -50, 0);
  translate(b, 50, 0);
  const p = project([a, b]);
  p.multiHoop = {
    ...newLayout(p),
    hoops: [
      { id: "left", x: -45, y: 0 },
      { id: "right", x: 45, y: 0 },
    ],
  };
  const before = JSON.stringify(p),
    bundle = generateMultiHoop(p);
  assert.deepEqual(bundle.problems, []);
  const issues = bundle.assembled.issues.filter((i) =>
    QUALITY_ISSUES.has(i.code),
  );
  assert(issues.length >= 2);
  for (const i of issues) {
    const e = bundle.assembled.events[i.eventIndex];
    assert.equal(e.objectId, i.objectId);
    assert.equal(e.hoopingNumber, i.hoopingNumber);
  }
  assert.equal(JSON.stringify(p), before);
  p.planning.qualitySafeguards = true;
  const revised = generateMultiHoop(p);
  assert.deepEqual(revised.problems, []);
  assert(
    !revised.assembled.issues.some((i) =>
      ["fill-return", "satin-return"].includes(i.code),
    ),
  );
});
test("quality diagnostics stay bounded on a 150000-needle plan", () => {
  const events = Array.from({ length: 150000 }, (_, i) => ({
    cmd: "stitch",
    x: (i % 300) * 0.42,
    y: Math.floor(i / 300) * 0.42,
    objectId: "a",
    operationId: "b",
    phase: "top",
  }));
  const start = performance.now(),
    result = stitchQuality(events, [
      { id: "a", operationId: "b", type: "fill" },
    ]);
  assert.equal(result.summaries[0].needles, events.length);
  assert.deepEqual(result.issues, []);
  const elapsed = performance.now() - start;
  assert(elapsed < 5000, `diagnostic scan ${elapsed} ms`);
  console.log(
    `Quality diagnostic scan: 150000 needles in ${elapsed.toFixed(1)} ms.`,
  );
});
