import test from "node:test";
import assert from "node:assert/strict";
import { normalizeThread } from "../src/thread-records.js";
import { matchIndex, matchGroups } from "../src/thread-matching.js";
import {
  assignThread,
  threadTargets,
  clearThread,
} from "../src/thread-assignment.js";
import { object, validateProject } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
import { generate } from "../src/engine.js";
import { applyTracePalette } from "../src/image-tracing.js";
import { lab } from "../src/image-colors.js";
import { captureStyle, transferStyle } from "../src/style-transfer.js";
import { checkRoundTrip, exportPreflight } from "../src/export-safety.js";
const record = (number, hex, brandName = "Personal fixture") =>
  normalizeThread({ brandName, lineName: "Synthetic chart", number, hex });
const shape = (x = 0) =>
  object(
    "Thread shape",
    [
      [
        { x: x - 3, y: -3 },
        { x: x + 3, y: -3 },
        { x: x + 3, y: 3 },
        { x: x - 3, y: 3 },
      ],
    ],
    { color: "#e64caa", underlay: false },
  );
test("Lab matching is deterministic, filters identities, excludes unknown colors and never falls back from owned-only", () => {
  const records = [
    record("001", "#e64caa"),
    record("002", "#d650a0"),
    record("003", "#103080"),
    record("004", null),
    record("001", "#e64caa", "Another brand"),
  ];
  assert.equal(matchIndex(records)("#e64caa")[0].deltaE, 0);
  assert.deepEqual(
    matchIndex(records)("#e64caa"),
    matchIndex([...records].reverse())("#e64caa"),
  );
  assert.equal(
    matchIndex(records, { brand: records[0].brandId })("#e64caa")[0].thread.id,
    records[0].id,
  );
  assert.deepEqual(matchIndex(records, { owned: [] })("#e64caa"), []);
  assert.equal(
    matchIndex(records, { owned: [records[2].id] })("#e64caa")[0].thread.number,
    "003",
  );
  assert.equal(matchIndex(records)("#e64caa").length, 4);
});
test("Substitution retains original palette, geometry and action settings; restore is independent of installed catalog", () => {
  const o = shape();
  o.operations = [makeOperation("fill", o), makeOperation("border", o)];
  const target = threadTargets(
      [o],
      { activeOperationId: o.operations[1].id },
      true,
    ),
    rings = structuredClone(o.rings),
    fill = structuredClone(o.operations[0]);
  assignThread(target, record("001", "#123456"), "algorithmic", 4);
  assignThread(target, record("002", "#654321"), "user", 5);
  assert.equal(o.operations[1].physicalThread.designColor, "#e64caa");
  assert.equal(matchGroups(target)[0].color, "#e64caa");
  assert.equal(matchGroups(target, true)[0].color, "#654321");
  assert.deepEqual(o.rings, rings);
  assert.deepEqual(o.operations[0], fill);
  const p = validateProject(
    JSON.parse(
      JSON.stringify({
        version: 1,
        name: "Substitute",
        machine: "se700",
        objects: [o],
      }),
    ),
  );
  clearThread(
    threadTargets(p.objects, { activeOperationId: o.operations[1].id }, true),
  );
  assert.equal(p.objects[0].operations[1].color, "#e64caa");
});
test("Palette revisions update design colors while keeping explicit spool choices; style colors clear stale identities", () => {
  const o = shape();
  assignThread(threadTargets([o], {}), record("001", "#123456"));
  const palette = [
    { hex: "#e64caa", lab: lab([230, 76, 170]) },
    { hex: "#e02090", lab: lab([224, 32, 144]) },
  ];
  applyTracePalette([o], palette, {
    "#e64caa": { keep: false, target: "#e02090" },
  });
  assert.equal(o.operations[0].physicalThread.designColor, "#e02090");
  assert.equal(o.operations[0].color, "#123456");
  const source = shape();
  source.color = "#abcdef";
  transferStyle([o], captureStyle(source), "color");
  assert.equal(o.operations[0].physicalThread, undefined);
  assert.equal(o.operations[0].color, "#abcdef");
});
test("Distinct physical spools sharing HEX retain real machine-change pauses and unchanged needle geometry", () => {
  const a = shape(-10),
    b = shape(10),
    p = {
      version: 1,
      name: "Same approximation",
      machine: "se700",
      objects: [a, b],
    };
  const before = generate(p)
    .events.filter((e) => e.cmd === "stitch")
    .map(({ x, y }) => [x, y]);
  assignThread(threadTargets([a], {}), record("001", "#e64caa"));
  assignThread(threadTargets([b], {}), record("002", "#e64caa"));
  const plan = generate(p);
  assert.equal(plan.stats.changes, 1);
  assert.equal(plan.stats.uniqueColors, 2);
  assert.ok(
    exportPreflight(p, plan.events, "pes").warnings.some((s) =>
      s.includes("repeated-color"),
    ),
  );
  const decoded = plan.events.map((e) => ({
    ...e,
    cmd: e.cmd === "color" ? "stop" : e.cmd,
  }));
  assert.deepEqual(checkRoundTrip(plan.events, decoded, "pes").errors, []);
  assert.ok(
    checkRoundTrip(
      plan.events,
      decoded.filter((e) => e.cmd !== "stop"),
      "pes",
    ).errors.length,
  );
  // Additional lock stitches are intentional at the newly required thread change.
  const after = plan.events
    .filter((e) => e.cmd === "stitch")
    .map(({ x, y }) => [x, y]);
  for (const point of before)
    assert.ok(after.some((q) => q[0] === point[0] && q[1] === point[1]));
});
