import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
try {
  const p = await browser.newPage();
  await p.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await p.waitForFunction(() => window.studio?.getPlan());
  const result = await p.evaluate(async () => {
    const { extractArtwork } = await import("./src/artwork-library.js"),
      { object } = await import("./src/model.js"),
      r = await import("./src/artwork-records.js"),
      s = await import("./src/artwork-store.js");
    const o = object("Shape", [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
      ]),
      a = r.createArtworkRecord(
        "Shape",
        extractArtwork(
          { version: 1, name: "A", machine: "se700", objects: [o] },
          [o.id],
        ),
      );
    await s.putArtwork(a);
    let duplicate = false;
    try {
      await s.putArtwork(a);
    } catch {
      duplicate = true;
    }
    const backup = r.artworkBackup((await s.loadArtwork()).records);
    const repeated = await s.importArtwork(
      r.parseArtworkBackup(backup).records,
    );
    const renamed = {
      ...a,
      name: "Renamed",
      updatedAt: new Date().toISOString(),
    };
    await s.putArtwork(renamed, { replace: true });
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw Error("simulated storage quota");
    };
    let failed = false;
    try {
      await s.putArtwork({ ...a, id: "failed" });
    } catch (e) {
      failed = e.message.includes("quota");
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("embroidery-artwork-v1", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("items", "readwrite");
      tx.objectStore("items").put({ bad: true }, "corrupt");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const loaded = await s.loadArtwork(),
      raw = await s.artworkRecovery();
    await s.deleteArtwork(a.id);
    const after = await s.loadArtwork();
    await s.importArtwork(backup.items);
    const purged=await s.purgeInvalidArtwork();
    return {
      duplicate,
      repeated,
      failed,
      loaded,
      rawCount: raw.length,
      after,
      purged,
      remainingIssues:(await s.loadArtwork()).issues,
      restored: (await s.loadArtwork()).records,
    };
  });
  assert.equal(result.duplicate, true);
  assert.equal(result.repeated.skipped, 1);
  assert.equal(result.failed, true);
  assert.equal(result.loaded.records.length, 1);
  assert.equal(result.loaded.records[0].name, "Renamed");
  assert.equal(result.loaded.issues.length, 1);
  assert.equal(result.rawCount, 2);
  assert.equal(result.after.records.length, 0);
  assert.equal(result.after.issues.length, 1);
  assert.equal(result.restored.length, 1);
  assert.equal(result.purged,1);assert.equal(result.remainingIssues.length,0);
  await p.reload();
  await p.waitForFunction(() => window.studio?.getPlan());
  assert.equal(
    await p.evaluate(
      async () =>
        (await (await import("./src/artwork-store.js")).loadArtwork()).records
          .length,
    ),
    1,
  );
  console.log(
    "PASS IndexedDB persistence, atomic storage failure, rename/delete, backup restore/duplicates and isolated corrupt-entry recovery",
  );
} finally {
  await browser.close();
}
