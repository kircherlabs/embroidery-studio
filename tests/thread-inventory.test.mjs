import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeThread,
  emptyThreads,
  inventoryEntry,
  validateThreadLibrary,
  libraryThreads,
} from "../src/thread-records.js";
import { matchIndex } from "../src/thread-matching.js";
import {
  projectThreads,
  shoppingRows,
  shoppingCSV,
} from "../src/thread-requirements.js";
import { mergePersonal, validatePersonal } from "../src/personal-settings.js";
import { object } from "../src/model.js";
import { assignThread, threadTargets } from "../src/thread-assignment.js";
const record = (number, extra = {}) =>
  normalizeThread({
    brandName: "New brothread",
    lineName: "Personal fixture",
    number,
    colorName: "Synthetic color " + number,
    hex: "#123456",
    ...extra,
  });
const backup = () => ({
  kind: "embroidery-personal-settings",
  version: 1,
  threads: emptyThreads(),
  equipment: { version: 1, customMachines: [] },
  formats: { se700: "pes" },
});
test("Collection validates quantities, optional estimates, favorites and snapshot identities without requiring a catalog", () => {
  const d = emptyThreads(),
    r = record("001");
  d.inventory = [
    {
      ...inventoryEntry(r, 2),
      spoolSize: "500 m",
      remainingMetres: 120.5,
      notes: "My spool",
      favorite: true,
    },
  ];
  validateThreadLibrary(JSON.parse(JSON.stringify(d)));
  assert.equal(libraryThreads(d)[0].number, "001");
  assert.equal(
    matchIndex(libraryThreads(d), { owned: [r.id] })("#123456")[0].thread.id,
    r.id,
  );
  for (const value of [-1, 1.5, Infinity, "2"])
    assert.throws(
      () =>
        validateThreadLibrary({
          ...d,
          inventory: [{ ...d.inventory[0], quantity: value }],
        }),
      /inventory/i,
    );
  assert.throws(
    () =>
      validateThreadLibrary({
        ...d,
        inventory: [d.inventory[0], d.inventory[0]],
      }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      validateThreadLibrary({
        ...d,
        inventory: [{ ...d.inventory[0], remainingMetres: -1 }],
      }),
    /inventory/i,
  );
});
test("Requirements follow actual sewing blocks, distinct same-RGB spools, locks, visibility and disabled actions", () => {
  const shape = (x) =>
    object(
      "Requirement",
      [
        [
          { x: x - 2, y: -2 },
          { x: x + 2, y: -2 },
          { x: x + 2, y: 2 },
          { x: x - 2, y: 2 },
        ],
      ],
      { color: "#123456", underlay: false },
    );
  const a = shape(-10),
    b = shape(10),
    hidden = shape(0);
  hidden.visible = false;
  assignThread(threadTargets([a], {}), record("001"));
  assignThread(threadTargets([b], {}), record("002"));
  assignThread(threadTargets([hidden], {}), record("003"));
  const p = {
      version: 1,
      name: "Required",
      machine: "se700",
      objects: [a, b, hidden],
    },
    before = JSON.stringify(p),
    inventory = [inventoryEntry(record("001"), 2)],
    req = projectThreads(p, inventory);
  assert.equal(req.rows.length, 2);
  assert.equal(req.changes, 1);
  assert.deepEqual(req.rows[0].blocks, [1]);
  assert.deepEqual(req.rows[1].blocks, [2]);
  assert.equal(req.rows[0].missing, false);
  assert.equal(req.rows[1].missing, true);
  assert.equal(req.rows[1].alternatives[0].thread.number, "001");
  assert.deepEqual(
    shoppingRows(req).map((r) => r.number),
    ["002"],
  );
  assert.match(shoppingCSV(shoppingRows(req)), /"002"/);
  assert.equal(JSON.stringify(p), before);
  assert.equal(inventory[0].quantity, 2);
  b.operations[0].enabled = false;
  assert.equal(projectThreads(p, inventory).rows.length, 1);
});
test("Unassigned colors never invent purchasable spools and CSV escapes quoted text and formulas", () => {
  const o = object("Manual", [], {
    type: "manual",
    color: "#123456",
    commands: [
      { cmd: "stitch", x: 0, y: 0 },
      { cmd: "stitch", x: 1, y: 1 },
    ],
  });
  const req = projectThreads({
    version: 1,
    name: "No spool",
    machine: "se700",
    objects: [o],
  });
  assert.equal(req.rows[0].thread, null);
  assert.deepEqual(shoppingRows(req), []);
  assert.match(
    shoppingCSV([
      {
        brand: "=formula",
        line: 'A "line"',
        number: "001",
        name: "Color",
        quantity: 1,
      },
    ]),
    /"'=formula","A ""line""","001"/,
  );
});
test("Backup merge is idempotent, preserves exact codes and never sums inventory quantities", () => {
  const current = backup(),
    incoming = backup();
  current.threads.records = [record("001")];
  current.threads.inventory = [inventoryEntry(record("001"), 2)];
  incoming.threads.records = [
    record("001", { hex: "#abcdef" }),
    record("A002"),
  ];
  incoming.threads.inventory = [
    inventoryEntry(record("001"), 4),
    inventoryEntry(record("A002"), 1),
  ];
  incoming.formats.se700 = "dst";
  incoming.threads.preferences = {
    brandId: "newbrothread",
    lineId: "personal-fixture",
    ownedOnly: true,
  };
  const keep = mergePersonal(current, incoming);
  assert.equal(keep.threads.records[0].hex, "#123456");
  assert.equal(keep.threads.inventory[0].quantity, 2);
  assert.equal(keep.formats.se700, "pes");
  assert.deepEqual(mergePersonal(keep, incoming), keep);
  const replace = mergePersonal(current, incoming, true);
  assert.equal(replace.threads.inventory[0].quantity, 4);
  assert.equal(replace.threads.records[0].hex, "#abcdef");
  assert.equal(replace.formats.se700, "dst");
  assert.equal(replace.threads.records[1].number, "A002");
  validatePersonal(JSON.parse(JSON.stringify(replace)));
  assert.equal(current.threads.inventory[0].quantity, 2);
});
test("Personal backup rejects unsupported formats, malformed stock and prototype preference keys before writing", () => {
  const d = backup();
  d.formats.se700 = "exe";
  assert.throws(() => validatePersonal(d), /preferences/);
  d.formats = JSON.parse('{"__proto__":"pes"}');
  assert.throws(() => validatePersonal(d), /preferences/);
  d.formats = {};
  d.threads.inventory = [{ ...inventoryEntry(record("001")), quantity: NaN }];
  assert.throws(() => validatePersonal(d), /inventory/i);
});
