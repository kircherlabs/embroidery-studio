import test from "node:test";
import assert from "node:assert/strict";
import {
  createArtworkRecord,
  validateArtworkRecord,
  artworkBackup,
  parseArtworkBackup,
  mergeArtworkRecords,
} from "../src/artwork-records.js";
import { extractArtwork } from "../src/artwork-library.js";
import { artworkFixture } from "./helpers/artwork-fixtures.mjs";
test("portable backups preserve source, recover valid entries and handle duplicate IDs/names without overwrites", () => {
  const a = createArtworkRecord(
    "Patch",
    extractArtwork(artworkFixture(), ["outer"]),
  );
  assert.deepEqual(
    parseArtworkBackup(JSON.stringify(artworkBackup([a]))).records,
    [a],
  );
  const corrupt = artworkBackup([a]);
  corrupt.items.push({ ...a, id: "bad", artwork: {} });
  const parsed = parseArtworkBackup(corrupt);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.issues.length, 1);
  assert.equal(mergeArtworkRecords([a], [a]).skipped, 1);
  const changed = structuredClone(a);
  changed.artwork.objects[0].color = "#123456";
  const merged = mergeArtworkRecords([a], [changed]);
  assert.equal(merged.added, 1);
  assert.equal(merged.renamed, 1);
  assert.notEqual(merged.records[1].id, a.id);
  assert.equal(merged.records[1].name, "Patch (2)");
  assert.deepEqual(merged.records[0], a);
  assert.equal(mergeArtworkRecords(merged.records, [changed]).skipped, 1);
  assert.throws(
    () => parseArtworkBackup({ version: 1, objects: [] }),
    /backup/,
  );
  assert.throws(() => validateArtworkRecord({ ...a, name: "" }), /name/);
  assert.throws(
    () =>
      mergeArtworkRecords(
        Array.from({ length: 1000 }, (_, i) => ({ ...a, id: "x" + i })),
        [{ ...a, id: "new" }],
      ),
    /1,000/,
  );
});
