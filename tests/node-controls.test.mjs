import test from "node:test";
import assert from "node:assert/strict";
import { selectedHandles } from "../src/node-controls.js";

const curve = (closed = true) => ({
  closed,
  nodes: Array.from({ length: 4 }, (_, i) => ({
    x: i * 10,
    y: 0,
    in: { x: i * 10 - 3, y: -4 },
    out: { x: i * 10 + 3, y: 4 },
  })),
});
test("no selected node or edge exposes no tangent controls", () => {
  assert.deepEqual(selectedHandles(curve(), null, null), []);
  assert.deepEqual(selectedHandles(null, 0, null), []);
});
test("a selected node exposes only its own independent pair without mutating source", () => {
  const c = curve(),
    before = structuredClone(c);
  for (let i = 0; i < c.nodes.length; i++)
    assert.deepEqual(selectedHandles(c, i, null), [
      { i, key: "in" },
      { i, key: "out" },
    ]);
  assert.deepEqual(c, before);
});
test("an edge exposes only its outgoing start and incoming end handles", () => {
  const c = curve();
  for (let i = 0; i < c.nodes.length; i++)
    assert.deepEqual(selectedHandles(c, null, { index: i }), [
      { i, key: "out" },
      { i: (i + 1) % c.nodes.length, key: "in" },
    ]);
});
test("open paths have no closing edge and missing handles are never invented", () => {
  const c = curve(false);
  assert.deepEqual(selectedHandles(c, null, { index: 3 }), []);
  delete c.nodes[1].in;
  assert.deepEqual(selectedHandles(c, null, { index: 0 }), [
    { i: 0, key: "out" },
  ]);
  assert.deepEqual(selectedHandles(c, 1, null), [{ i: 1, key: "out" }]);
});
test("invalid and stale targets cannot expose unrelated handles", () => {
  for (const index of [-1, 4, 1.5, undefined]) {
    assert.deepEqual(selectedHandles(curve(), index, null), []);
    assert.deepEqual(selectedHandles(curve(), null, { index }), []);
  }
  assert.deepEqual(selectedHandles(curve(), 0, { index: 2 }), [
    { i: 0, key: "in" },
    { i: 0, key: "out" },
  ]);
});
