import {
  validateArtworkRecord,
  mergeArtworkRecords,
  bytes,
  MAX_LIBRARY_BYTES,
  MAX_LIBRARY_ITEMS,
} from "./artwork-records.js";
const DB = "embroidery-artwork-v1";
function database() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("items");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(r.error || Error("My Artwork storage is unavailable."));
    r.onblocked = () =>
      reject(Error("Close another Studio tab to update My Artwork storage."));
  });
}
export async function loadArtwork() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const records = [],
        issues = [],
        tx = db.transaction("items", "readonly"),
        r = tx.objectStore("items").openCursor();
      let count = 0;
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return;
        if (++count > MAX_LIBRARY_ITEMS) {
          issues.push(
            "Library has more than 1,000 stored entries; export recovery data before cleanup.",
          );
          return;
        }
        try {
          const record = validateArtworkRecord(c.value);
          if (record.id !== c.key)
            throw Error("Record key differs from its identity.");
          records.push(record);
        } catch (e) {
          issues.push(
            `Stored item ${String(c.key).slice(0, 120)}: ${e.message}`,
          );
        }
        c.continue();
      };
      tx.oncomplete = () => resolve({ records, issues });
      tx.onerror = () =>
        reject(tx.error || Error("Could not read My Artwork."));
      tx.onabort = () => reject(tx.error || Error("My Artwork read aborted."));
    });
  } finally {
    db.close();
  }
}
async function transaction(change) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("items", "readwrite"),
        store = tx.objectStore("items"),
        r = store.getAll(),
        keys = store.getAllKeys();
      let result, error, values, keyList;
      const apply = () => {
        if (!values || !keyList) return;
        try {
          result = change(store, values, keyList);
        } catch (e) {
          error = e;
          tx.abort();
        }
      };
      r.onsuccess = () => {
        values = r.result;
        apply();
      };
      keys.onsuccess = () => {
        keyList = keys.result;
        apply();
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () =>
        reject(
          error ||
            tx.error ||
            Error("Could not save My Artwork. Existing data was retained."),
        );
      tx.onabort = () =>
        reject(
          error ||
            tx.error ||
            Error(
              "My Artwork storage transaction aborted. Existing data was retained.",
            ),
        );
    });
  } finally {
    db.close();
  }
}
export async function putArtwork(raw, { replace = false } = {}) {
  const record = validateArtworkRecord(raw);
  return transaction((store, values, keys) => {
    const at = keys.indexOf(record.id);
    if (at >= 0 && !replace)
      throw Error(
        "This library identity already exists. Save as a new item instead.",
      );
    const next = values.filter((_, i) => i !== at);
    next.push(record);
    if (next.length > MAX_LIBRARY_ITEMS || bytes(next) > MAX_LIBRARY_BYTES)
      throw Error(
        "My Artwork exceeds 1,000 items or 64 MB. Export a backup and remove unused items first.",
      );
    store.put(record, record.id);
    return record;
  });
}
export const deleteArtwork = (id) =>
  transaction((store) => {
    store.delete(id);
  });
export const purgeInvalidArtwork = () =>
  transaction((store, values, keys) => {
    let removed = 0;
    for (let i = 0; i < values.length; i++)
      try {
        const r = validateArtworkRecord(values[i]);
        if (r.id !== keys[i]) throw Error("Invalid identity");
      } catch {
        store.delete(keys[i]);
        removed++;
      }
    return removed;
  });
export async function importArtwork(records) {
  return transaction((store, values, keys) => {
    const valid = [];
    for (let i = 0; i < values.length; i++)
      try {
        const r = validateArtworkRecord(values[i]);
        if (r.id === keys[i]) valid.push(r);
      } catch {}
    const merged = mergeArtworkRecords(valid, records),
      old = new Set(valid.map((r) => r.id));
    const additions = merged.records.filter((r) => !old.has(r.id));
    if (
      values.length + additions.length > MAX_LIBRARY_ITEMS ||
      bytes([...values, ...additions]) > MAX_LIBRARY_BYTES
    )
      throw Error(
        "The library storage limit would be exceeded; existing records were retained.",
      );
    for (const r of additions) {
      while (keys.includes(r.id)) {
        r.id = crypto.randomUUID();
      }
      keys.push(r.id);
      store.put(r, r.id);
    }
    return { ...merged, records: undefined };
  });
}
// Raw recovery export never evaluates stored content or deletes unreadable entries.
export async function artworkRecovery() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("items", "readonly"),
        r = tx.objectStore("items").getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
