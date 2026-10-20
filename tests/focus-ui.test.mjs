import test from "node:test";
import assert from "node:assert/strict";
import { focusClass } from "../src/focus-ui.js";

test("nested focus presentation distinguishes target, descendants, context ancestors and outsiders without mutating visibility", () => {
  const p = {
    groups: [
      { id: "svg", kind: "svg" },
      { id: "pair", parentId: "svg", kind: "group" },
      { id: "inner", parentId: "pair", kind: "group" },
      { id: "other", kind: "group" },
    ],
    objects: [
      { id: "a", parentId: "inner" },
      { id: "hidden", parentId: "inner", visible: false },
      { id: "locked", parentId: "inner", locked: true },
      { id: "b", parentId: "pair" },
      { id: "outside", parentId: "other" },
    ],
  };
  const all = [...p.groups, ...p.objects],
    before = JSON.stringify(p);
  const classes = (focus) =>
    Object.fromEntries(all.map((n) => [n.id, focusClass(p, n, focus)]));
  assert.deepEqual(classes("inner"), {
    svg: "focus-ancestor",
    pair: "focus-ancestor",
    inner: "focus-target",
    other: "focus-outside",
    a: "focus-included",
    hidden: "focus-included",
    locked: "focus-included",
    b: "focus-outside",
    outside: "focus-outside",
  });
  assert.equal(classes("a").inner, "focus-ancestor");
  assert.equal(classes("a").hidden, "focus-outside");
  assert.equal(classes("svg").b, "focus-included");
  assert(
    all.every(
      (n) =>
        focusClass(p, n, null) === "" && focusClass(p, n, "missing") === "",
    ),
  );
  assert.equal(JSON.stringify(p), before);
});
