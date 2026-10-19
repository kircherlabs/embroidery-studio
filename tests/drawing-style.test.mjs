import test from "node:test";
import assert from "node:assert/strict";
import { object } from "../src/model.js";
import { smartShape } from "../src/creative.js";
import { drawingStyleSelection } from "../src/drawing-style-ui.js";
import { addReference } from "../src/references.js";
import { applyStyle } from "../src/construction-ui.js";
import { makeOperation } from "../src/operations.js";
import { generate } from "../src/engine.js";

test("drawing style eligibility explains excluded children without changing geometry or stacks", () => {
  const shape = smartShape("rect"),
    locked = smartShape("ellipse"),
    open = object(
      "Open",
      [
        [
          { x: 0, y: 0 },
          { x: 8, y: 5 },
        ],
      ],
      { type: "run", closed: false },
    ),
    manual = object("Manual", [], { type: "manual", commands: [] }),
    patch = smartShape("rect"),
    p = {
      version: 1,
      machine: "se700",
      objects: [shape, locked, open, manual, patch],
      groups: [{ id: "parent", kind: "svg", name: "Artwork" }],
    };
  locked.locked = true;
  patch.constructionArtworkIds = [shape.id];
  const ref = addReference(p, {
    name: "Reference",
    data: "data:image/png;base64,AA==",
    width: 10,
    height: 10,
  });
  ref.locked = false;
  for (const o of p.objects) o.parentId = "parent";
  const state = { project: p, selectionIds: ["parent"] },
    before = structuredClone(p),
    fill = drawingStyleSelection(state, "fill");
  assert.deepEqual(
    fill.objects.map((o) => o.id),
    [shape.id],
  );
  for (const reason of [
    "locked",
    "reference images",
    "manual stitch objects",
    "linked patch boundaries",
    "open paths",
  ])
    assert(fill.excluded.includes(reason), reason);
  assert.deepEqual(
    drawingStyleSelection(state, "run").objects.map((o) => o.id),
    [shape.id, open.id],
  );
  assert.deepEqual(p, before);
});

test("explicit style application uses construction confirmation and produces actual changed machine paths", async () => {
  const shape = smartShape("rect", 20, 12),
    p = { version: 1, name: "Style", machine: "se700", objects: [shape] },
    original = structuredClone(shape),
    api = {
      state: {},
      toast: () => {},
      ask: async () => false,
      mutate: (fn) => {
        fn();
        return true;
      },
    };
  const fill = generate(p).events;
  assert.equal(await applyStyle(api, [shape], "run"), true);
  assert.notDeepEqual(generate(p).events, fill);
  assert.deepEqual(shape.rings, original.rings);
  shape.operations.push(makeOperation("stop", shape));
  const construction = structuredClone(shape);
  await applyStyle(api, [shape], "border");
  assert.deepEqual(shape, construction);
  api.ask = async () => true;
  assert.equal(await applyStyle(api, [shape], "border"), true);
  assert.deepEqual(
    shape.operations.map((op) => op.type),
    ["border"],
  );
  assert(generate(p).events.some((e) => e.cmd === "stitch"));
  assert.deepEqual(shape.shape, original.shape);
});
