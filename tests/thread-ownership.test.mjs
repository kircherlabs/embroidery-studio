import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyThreads,
  builtinThreads,
  inventoryEntry,
} from "../src/thread-records.js";
import { ownershipSelection, setOwnership } from "../src/thread-ownership.js";
test("bulk add/remove and mixed choices preserve identities, quantities and inventory metadata", () => {
  const library = emptyThreads(),
    [a, b, c] = builtinThreads();
  library.inventory = [
    {
      ...inventoryEntry(a),
      quantity: 3,
      notes: "Keep",
      favorite: true,
      remainingMetres: 125,
      spoolSize: "500 m",
    },
  ];
  const original = structuredClone(library);
  const selected = ownershipSelection(library, [a.id, b.id, c.id]);
  assert.equal(selected.owned.length, 1);
  assert.equal(selected.unowned.length, 2);
  const added = setOwnership(library, [a.id, b.id, c.id], true);
  assert.equal(added.inventory.length, 3);
  assert.equal(added.inventory[0].quantity, 3);
  assert.deepEqual(setOwnership(added, [a.id, b.id, c.id], true), added);
  const removed = setOwnership(added, [a.id, b.id], false);
  assert.deepEqual(
    { ...removed.inventory[0], quantity: 3 },
    original.inventory[0],
  );
  assert.equal(removed.inventory[0].quantity, 0);
  assert.equal(removed.inventory[1].quantity, 0);
  assert.equal(removed.inventory[2].quantity, 1);
  assert.equal(
    ownershipSelection(removed, [a.id, b.id, c.id]).records.length,
    3,
  );
  assert.deepEqual(library, original);
  assert.deepEqual(removed.records, library.records);
  assert.equal(setOwnership(library, [b.id], false).inventory.length, 1);
});
