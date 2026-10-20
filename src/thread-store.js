import { emptyThreads, validateThreadLibrary } from "./thread-records.js";
const DB_NAME = "embroidery-personal-v1";
function database() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("settings");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || Error("Personal storage unavailable."));
    r.onblocked = () =>
      reject(Error("Close another Studio tab to update personal storage."));
  });
}
export async function loadThreads() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("settings", "readonly"),
        r = tx.objectStore("settings").get("threads");
      r.onsuccess = () => {
        try {
          resolve(r.result ? validateThreadLibrary(r.result) : emptyThreads());
        } catch (e) {
          reject(e);
        }
      };
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function saveThreads(data) {
  validateThreadLibrary(data);
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put(structuredClone(data), "threads");
      tx.oncomplete = resolve;
      tx.onerror = () =>
        reject(tx.error || Error("Could not save personal thread data."));
      tx.onabort = () =>
        reject(tx.error || Error("Thread storage transaction aborted."));
    });
  } finally {
    db.close();
  }
}
