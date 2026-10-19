import test from "node:test";
import assert from "node:assert/strict";
import { object, validateProject } from "../src/model.js";
import { smartShape } from "../src/creative.js";
import { makeOperation, operationTargets } from "../src/operations.js";
import { editOperations, setEmbroideryStyle } from "../src/styles.js";
import {
  closingRings,
  orderedActions,
  actionNeighbor,
  moveAction,
} from "../src/sewing-actions.js";
import { generate } from "../src/engine.js";
const project = (objects) => ({
  version: 1,
  name: "Actions",
  machine: "se700",
  objects,
});

test("changing a method retains action identity, count, independent thread and other actions", () => {
  const o = smartShape("ellipse", 24, 18);
  o.operations = [makeOperation("run", o), makeOperation("border", o)];
  o.operations[0].color = "#6689a5";
  o.operations[1].color = "#e6ab43";
  const originalStitches = generate(project([o]))
    .events.filter(
      (e) => e.operationId === o.operations[0].id && e.cmd === "stitch",
    )
    .map((e) => [e.x, e.y]);
  const before = structuredClone(o),
    state = { activeOperationId: o.operations[0].id };
  editOperations([o], state, true, "type", "satin");
  assert.equal(o.operations.length, 2);
  assert.equal(o.operations[0].id, before.operations[0].id);
  assert.equal(o.operations[0].color, before.operations[0].color);
  assert.deepEqual(o.operations[1], before.operations[1]);
  assert.deepEqual(o.shape, before.shape);
  assert.deepEqual(o.rings, before.rings);
  const sewn = generate(project([o]))
    .events.filter(
      (e) => e.operationId === o.operations[0].id && e.cmd === "stitch",
    )
    .map((e) => [e.x, e.y]);
  assert(sewn.length > 10);
  assert.notDeepEqual(sewn, originalStitches);
});
test("closure review accepts a real region and rejects a line without mutating source artwork", () => {
  const line = object(
      "Line",
      [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      ],
      { type: "run", closed: false },
    ),
    open = object(
      "Open",
      [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 8 },
        ],
      ],
      { type: "run", closed: false },
    ),
    before = structuredClone(open);
  assert.equal(closingRings(line), null);
  assert(closingRings(open));
  assert.deepEqual(open, before);
  open.closed = true;
  editOperations([open], {}, true, "type", "fill");
  assert.equal(open.operations.length, 1);
  assert(generate(project([open])).stats.stitches > 10);
});
test("linked patch cards follow actual preparation/finish phases and cannot reorder across them", () => {
  const o = smartShape("rect", 30, 20);
  o.constructionArtworkIds = ["art"];
  o.operations = [
    makeOperation("border", o),
    makeOperation("placement", o),
    makeOperation("stop", o),
    makeOperation("tackdown", o),
  ];
  assert.deepEqual(
    orderedActions(o).map((op) => op.type),
    ["placement", "stop", "tackdown", "border"],
  );
  assert.equal(actionNeighbor(o, o.operations[0].id, -1), null);
  const finish = o.operations[0].id;
  moveAction(o, finish, -1);
  assert.equal(o.operations[0].id, finish);
  const tack = o.operations[3].id;
  moveAction(o, tack, -1);
  assert.deepEqual(
    orderedActions(o).map((op) => op.type),
    ["placement", "tackdown", "stop", "border"],
  );
  editOperations([o], { activeOperationId: finish }, true, "type", "run");
  assert.equal(
    o.operations.find((op) => op.id === finish).constructionStage,
    "finish",
  );
  assert.equal(orderedActions(o).at(-1).id, finish);
});
test("fill-and-satin preset is shared geometry with independent actions and ordered machine paths", () => {
  const o = smartShape("ellipse", 24, 18),
    rings = structuredClone(o.rings);
  setEmbroideryStyle(o, "fill-border");
  o.operations[0].color = "#6689a5";
  o.operations[1].color = "#e6ab43";
  const p = validateProject(project([o])),
    plan = generate(p),
    order = [
      ...new Set(
        plan.events.filter((e) => e.cmd === "stitch").map((e) => e.operationId),
      ),
    ];
  assert.deepEqual(
    order,
    o.operations.map((op) => op.id),
  );
  assert.equal(plan.stats.manualChanges, 1);
  assert.deepEqual(o.rings, rings);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
});
test("an object containing only machine commands still exposes one editable action", () => {
  const o = smartShape("rect");
  o.operations = [makeOperation("stop", o)];
  assert.equal(operationTargets(o, {}, true)[0].type, "stop");
  assert.deepEqual(operationTargets(o, {}, false), []);
  editOperations([o], {}, true, "type", "run");
  assert.equal(o.operations.length, 1);
  assert.equal(o.operations[0].type, "run");
});
