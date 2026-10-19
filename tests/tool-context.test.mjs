import test from "node:test";
import assert from "node:assert/strict";
import { object } from "../src/model.js";
import { threadColors, makeOperation } from "../src/operations.js";
import { editOperations } from "../src/styles.js";
import { generate } from "../src/engine.js";

test("tree thread colors follow enabled operations, deduplicate and fall back for legacy/manual artwork", () => {
  const o = object(
    "Artwork",
    [
      [
        { x: -5, y: -5 },
        { x: 5, y: -5 },
        { x: 5, y: 5 },
        { x: -5, y: 5 },
      ],
    ],
    { color: "#e6ab43" },
  );
  assert.deepEqual(threadColors(o), ["#e6ab43"]);
  o.operations = [
    makeOperation("fill", o),
    makeOperation("run", o),
    makeOperation("stop", o),
  ];
  o.operations[0].color = "#AD8AAE";
  o.operations[1].color = "#ad8aae";
  o.operations[2].color = "#000000";
  assert.deepEqual(threadColors(o), ["#ad8aae"]);
  o.operations[1].color = "#292c31";
  assert.deepEqual(threadColors(o), ["#ad8aae", "#292c31"]);
  o.operations[0].enabled = false;
  assert.deepEqual(threadColors(o), ["#292c31"]);
  delete o.operations[1].color;
  assert.deepEqual(threadColors(o), [o.color]);
  o.operations[1].enabled = false;
  assert.deepEqual(threadColors(o), []);
  assert.deepEqual(threadColors({ ...o, type: "reference" }), []);
  assert.deepEqual(
    threadColors(object("Manual", [], { type: "manual", color: "#6689a5" })),
    ["#6689a5"],
  );
});

test("operation recoloring leaves source paint intact and thread display matches generated commands", () => {
  const o = object(
    "Fill",
    [
      [
        { x: -8, y: -8 },
        { x: 8, y: -8 },
        { x: 8, y: 8 },
        { x: -8, y: 8 },
      ],
    ],
    { color: "#e6ab43" },
  );
  o.operations = [makeOperation("fill", o), makeOperation("border", o)];
  const state = { activeOperationId: o.operations[0].id };
  editOperations([o], state, true, "color", "#ad8aae");
  assert.equal(o.color, "#e6ab43");
  const p = { version: 1, name: "Colors", machine: "se700", objects: [o] },
    before = structuredClone(p);
  assert.deepEqual(threadColors(o), ["#ad8aae", "#e6ab43"]);
  const plan = generate(p);
  assert.deepEqual(
    [
      ...new Set(
        plan.events.filter((e) => e.cmd === "stitch").map((e) => e.color),
      ),
    ].sort(),
    threadColors(o).sort(),
  );
  assert.deepEqual(p, before);
});
