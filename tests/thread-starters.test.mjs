import test from "node:test";
import assert from "node:assert/strict";
import {
  builtinThreads,
  libraryThreads,
  emptyThreads,
  inventoryEntry,
  validateThreadLibrary,
  normalizeThread,
} from "../src/thread-records.js";
import { STARTER_PACKS } from "../src/thread-starters.js";
import { matchIndex } from "../src/thread-matching.js";
test("reviewed starter subsets have distinct stable identities, usable approximations and explicit provenance", () => {
  const all = builtinThreads();
  assert.equal(all.length, 171);
  assert.equal(new Set(all.map((r) => r.id)).size, all.length);
  assert.equal(new Set(all.map((r) => r.brandId)).size, 7);
  for (const r of all) {
    assert.match(r.hex, /^#[0-9a-f]{6}$/);
    assert.equal(r.source.colorAccuracy, "studio-approximation");
    assert.equal(r.source.verification, "published-identifiers");
    assert.ok(r.source.url.startsWith("https://"));
    assert.ok(Object.isFrozen(r));
  }
  assert.equal(
    all.find((r) => r.brandId === "newbrothread" && r.number === "007")
      .colorName,
    "Prussian Blue",
  );
  assert.notEqual(
    all.find((r) => r.brandId === "newbrothread" && r.number === "001").id,
    all.find((r) => r.brandId === "brother" && r.number === "001").id,
  );
  assert.ok(STARTER_PACKS.every((p) => p.lineName.includes("subset")));
  assert.equal(
    matchIndex(all, { brand: "newbrothread" })("#263b70")[0].thread.number,
    "007",
  );
});
test("built-ins stay separate from personal data, corrections and owned snapshots survive updates and opt-out", () => {
  const d = emptyThreads(),
    r = builtinThreads()[0];
  assert.equal(d.records.length, 0);
  assert.equal(libraryThreads(d).length, 171);
  d.inventory = [inventoryEntry(r, 3)];
  const correction = structuredClone(r);
  correction.hex = "#123456";
  correction.source.verification = "user-entered";
  correction.source.colorAccuracy = "user-selected";
  d.records = [correction];
  assert.equal(libraryThreads(d).find((t) => t.id === r.id).hex, "#123456");
  assert.equal(d.inventory[0].quantity, 3);
  validateThreadLibrary(JSON.parse(JSON.stringify(d)));
  d.preferences.includeBuiltins = false;
  assert.equal(libraryThreads(d).length, 1);
  assert.equal(libraryThreads(d)[0].id, r.id);
  d.records = [];
  assert.equal(libraryThreads(d)[0].id, r.id);
  const imported = normalizeThread({
    ...r,
    source: { verification: "published-identifiers" },
  });
  assert.equal(
    imported.source.verification,
    "user-imported",
    "imported claims never elevate provenance",
  );
});
