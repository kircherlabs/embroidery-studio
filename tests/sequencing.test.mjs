import test from "node:test";
import assert from "node:assert/strict";
import {
  demo,
  object,
  ellipse,
  validateProject,
  PALETTE,
} from "../src/model.js";
import { generate } from "../src/engine.js";
import { moveInTree } from "../src/hierarchy.js";
import { applique } from "../src/operations.js";
import {
  sewingIds,
  moveSewingObjects,
  useTreeOrder,
  normalizeSewingOrder,
} from "../src/sequencing.js";
const project = () => ({
  version: 1,
  name: "Order",
  machine: "se700",
  objects: [
    object("A", [ellipse(-20, 0, 3, 3)], { color: PALETTE[0] }),
    object("B", [ellipse(0, 0, 3, 3)], { color: PALETTE[1] }),
    object("C", [ellipse(20, 0, 3, 3)], { color: PALETTE[0] }),
  ],
});
const actual = (p) => [
  ...new Set(
    generate(p)
      .events.filter((e) => e.cmd === "stitch")
      .map((e) => e.objectId),
  ),
];

test("manual order overrides automatic batching, persists and keeps source layers unchanged", () => {
  const p = project(),
    source = p.objects.map((o) => o.id),
    auto = actual(p);
  assert.deepEqual(auto, [source[0], source[2], source[1]]);
  assert(moveSewingObjects(p, [source[1]], source[0], true, auto));
  assert.deepEqual(actual(p), source);
  assert.deepEqual(
    p.objects.map((o) => o.id),
    source,
  );
  assert.equal(generate(p).stats.colors, 3);
  assert.deepEqual(
    actual(validateProject(JSON.parse(JSON.stringify(p)))),
    source,
  );
  delete p.sequencing;
  assert.deepEqual(actual(p), auto);
});

test("manual order keeps a complete applique stack and real stops together", () => {
  const p = project(),
    [a, b, c] = p.objects;
  a.operations = applique(a);
  assert(moveSewingObjects(p, [a.id], actual(p).at(-1), true, actual(p)));
  const events = generate(p).events,
    stack = [
      ...new Set(
        events
          .filter((e) => e.objectId === a.id && e.operationId)
          .map((e) => e.operationId),
      ),
    ];
  assert.deepEqual(
    stack,
    a.operations.map((op) => op.id),
  );
  assert.equal(
    events.filter((e) => e.objectId === a.id && e.cmd === "stop").length,
    2,
  );
  assert.equal(actual(p).at(-1), a.id);
  const first = events.findIndex((e) => e.objectId === a.id);
  assert(events.slice(first).every((e) => !e.objectId || e.objectId === a.id));
});

test("tree drops move sibling selections as complete groups and reject reparenting", () => {
  const p = project(),
    [a, b, c] = p.objects;
  p.groups = [
    { id: "svg", kind: "svg", name: "Drawing" },
    { id: "g", kind: "group", name: "Pair", parentId: "svg" },
  ];
  a.parentId = b.parentId = "g";
  c.parentId = "svg";
  assert.equal(moveInTree(p, [a.id], c.id), false);
  assert(moveInTree(p, ["g"], c.id, true));
  useTreeOrder(p);
  assert.deepEqual(
    p.objects.map((o) => o.id),
    [c.id, a.id, b.id],
  );
  assert.deepEqual(actual(p), [c.id, a.id, b.id]);
  assert.equal(a.parentId, "g");
  assert(moveInTree(p, [a.id], b.id, true));
  useTreeOrder(p);
  assert.deepEqual(actual(p), [c.id, b.id, a.id]);
});

test("tree multi-move preserves relative order and protects locked artwork and sequence pins", () => {
  const p = project(),
    [a, b, c] = p.objects;
  assert(moveInTree(p, [a.id, b.id], c.id, true));
  assert.deepEqual(
    p.objects.map((o) => o.id),
    [c.id, a.id, b.id],
  );
  a.locked = true;
  assert.equal(moveInTree(p, [a.id], c.id), false);
  a.locked = false;
  a.sequenceLocked = true;
  assert.equal(moveInTree(p, [c.id], b.id, true), false);
  assert.equal(moveSewingObjects(p, [c.id], b.id, true), false);
  assert.equal(moveSewingObjects(p, [a.id], c.id), false);
});

test("new, deleted and temporarily hidden objects have stable manual order", () => {
  const p = project(),
    [a, b, c] = p.objects;
  useTreeOrder(p);
  a.visible = false;
  const d = object("D", [ellipse(30, 0, 3, 3)]);
  p.objects.push(d);
  p.objects = p.objects.filter((o) => o.id !== b.id);
  normalizeSewingOrder(p);
  validateProject(p);
  assert.deepEqual(sewingIds(p), [a.id, c.id, d.id]);
  assert.deepEqual(actual(p), [c.id, d.id]);
  a.visible = true;
  assert.deepEqual(actual(p), [a.id, c.id, d.id]);
  for (const order of [["missing"], [a.id, a.id], "invalid"]) {
    const bad = structuredClone(p);
    bad.sequencing.order = order;
    assert.throws(() => validateProject(bad), /sewing order/);
  }
});

test("Wildflower batches each thread once without weakening imported overlap dependencies", () => {
  const p = demo(),
    before = JSON.stringify(p),
    plan = generate(p);
  assert.equal(plan.stats.colors, 4);
  assert.equal(plan.stats.manualChanges, 3);
  assert.equal(plan.events.filter((e) => e.cmd === "color").length, 3);
  assert.equal(JSON.stringify(p), before);
  const petals = actual(p)
    .map((id) => p.objects.find((o) => o.id === id))
    .filter((o) => o.name.startsWith("Petal"));
  assert.deepEqual(
    petals.map((o) => o.color),
    [
      PALETTE[0],
      PALETTE[0],
      PALETTE[0],
      PALETTE[0],
      PALETTE[1],
      PALETTE[1],
      PALETTE[1],
    ],
  );
  // The former example intentionally overlapped alternating colored petals.
  const old = demo();
  old.objects
    .filter((o) => o.name.startsWith("Petal"))
    .forEach((o, i) => {
      const a = (i / 7) * Math.PI * 2;
      o.rings = [
        ellipse(Math.cos(a) * 11, -19 + Math.sin(a) * 11, 10, 5, (i / 7) * 360),
      ];
    });
  assert.equal(generate(old).stats.colors, 9);
});
