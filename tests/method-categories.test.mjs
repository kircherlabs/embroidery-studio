import test from "node:test";
import assert from "node:assert/strict";
import {
  methodCategory,
  METHOD_CATEGORIES,
  CONSTRUCTION_METHODS,
  methodPicker,
} from "../src/method-ui.js";
import { object, validateProject } from "../src/model.js";
import { smartShape } from "../src/creative.js";
import { makeOperation, OPERATION_TYPES } from "../src/operations.js";
import { editOperations } from "../src/styles.js";
import { generate } from "../src/engine.js";
const project = (o) => ({
  version: 1,
  name: "Method categories",
  machine: "se700",
  objects: [o],
});

test("only three everyday categories, with every old method retained under its proper category", () => {
  assert.deepEqual(Object.keys(METHOD_CATEGORIES), ["run", "fill", "satin"]);
  assert.deepEqual(Object.keys(CONSTRUCTION_METHODS), [
    "placement",
    "tackdown",
    "basting",
    "contour",
    "marker",
    "stop",
    "trim",
  ]);
  for (const type of Object.keys(OPERATION_TYPES)) {
    assert.equal(
      methodCategory(type),
      ["run", "bean", "triple"].includes(type)
        ? "run"
        : ["satin", "border", "column"].includes(type)
          ? "satin"
          : type === "fill"
            ? "fill"
            : "construction",
    );
    const o = smartShape("rect", 14, 18);
    o.operations = [makeOperation(type, o)];
    const before = JSON.stringify(o),
      plan = generate(project(o));
    methodPicker([type], { closed: true });
    assert.equal(JSON.stringify(o), before);
    const saved = validateProject(JSON.parse(JSON.stringify(project(o))));
    assert.deepEqual(
      generate(saved).events,
      plan.events,
      `${type} persistence`,
    );
  }
});

test("reinforcement updates the same action and retains distinct real needle sequences", () => {
  const o = object(
    "Line",
    [
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
    ],
    {
      type: "run",
      closed: false,
      length: 2,
      underlay: false,
      compensation: 0,
      tieIn: false,
      tieOff: false,
    },
  );
  o.operations = [makeOperation("run", o)];
  const id = o.operations[0].id;
  const expected = {
    run: [0, 2, 4],
    bean: [0, 2, 0, 2, 4, 2, 4],
    triple: [0, 2, 4, 2, 0, 2, 4],
  };
  for (const type of ["run", "bean", "triple"]) {
    editOperations([o], { activeOperationId: id }, true, "type", type);
    assert.equal(o.operations.length, 1);
    assert.equal(o.operations[0].id, id);
    assert.deepEqual(
      generate(project(o))
        .events.filter((e) => e.cmd === "stitch")
        .map((e) => e.x),
      expected[type],
    );
  }
});

test("construction outlines retain their existing offsets, machine commands and ordered action identity", () => {
  const o = smartShape("rect", 20, 16);
  o.operations = [
    "placement",
    "tackdown",
    "basting",
    "contour",
    "stop",
    "trim",
    "border",
  ].map((t) => makeOperation(t, o));
  o.operations[3].offset = -1;
  const before = generate(project(o)),
    original = structuredClone(o.operations);
  for (const op of o.operations) methodPicker([op.type], { closed: true });
  assert.deepEqual(o.operations, original);
  assert.deepEqual(generate(project(o)).events, before.events);
  assert.equal(before.stats.stops, 1);
  const negative = before.events.filter(
    (e) => e.operationId === o.operations[3].id && e.cmd === "stitch",
  );
  assert(negative.every((e) => Math.abs(e.x) <= 9.01 && Math.abs(e.y) <= 7.01));
  o.operations[3].offset = 1;
  const positive = generate(project(o)).events.filter(
    (e) => e.operationId === o.operations[3].id && e.cmd === "stitch",
  );
  assert(positive.some((e) => Math.abs(e.x) > 10 || Math.abs(e.y) > 8));
});
