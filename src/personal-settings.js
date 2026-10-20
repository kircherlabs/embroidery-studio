import { validateThreadLibrary, mergeCatalog } from "./thread-records.js";
import {
  loadEquipment,
  validateEquipmentSettings,
  EQUIPMENT_KEY,
} from "./equipment.js";
import { EXPORT_FORMATS, EXPORT_PREFERENCE_KEY } from "./export-preferences.js";
import { loadThreads, saveThreads } from "./thread-store.js";
export function validateFormatPreferences(p) {
  if (
    !p ||
    typeof p !== "object" ||
    Array.isArray(p) ||
    Object.keys(p).length > 2000 ||
    Object.entries(p).some(
      ([k, v]) =>
        !/^[a-zA-Z0-9_-]{1,120}$/.test(k) ||
        ["__proto__", "constructor", "prototype"].includes(k) ||
        !EXPORT_FORMATS.includes(v),
    )
  )
    throw Error("Invalid per-machine export preferences.");
  return p;
}
export function validatePersonal(data) {
  if (
    !data ||
    data.kind !== "embroidery-personal-settings" ||
    data.version !== 1
  )
    throw Error("Not a supported personal settings backup.");
  validateThreadLibrary(data.threads);
  validateEquipmentSettings(data.equipment);
  validateFormatPreferences(data.formats);
  return data;
}
export async function exportPersonal(storage) {
  return validatePersonal({
    kind: "embroidery-personal-settings",
    version: 1,
    threads: await loadThreads(),
    equipment: loadEquipment(storage),
    formats: JSON.parse(storage.getItem(EXPORT_PREFERENCE_KEY) || "{}"),
  });
}
export function mergePersonal(current, incoming, replace = false) {
  validatePersonal(current);
  validatePersonal(incoming);
  const merge = (a, b, key) => {
    const map = new Map(a.map((r) => [key(r), structuredClone(r)]));
    for (const r of b)
      if (replace || !map.has(key(r))) map.set(key(r), structuredClone(r));
    return [...map.values()];
  };
  const result = structuredClone(current);
  result.threads.records = mergeCatalog(
    current.threads.records,
    incoming.threads.records,
    replace,
  ).records;
  result.threads.inventory = merge(
    current.threads.inventory,
    incoming.threads.inventory,
    (r) => r.thread.id,
  );
  if (replace || !Object.keys(result.threads.preferences).length)
    result.threads.preferences = structuredClone(incoming.threads.preferences);
  result.equipment.customMachines = merge(
    current.equipment.customMachines,
    incoming.equipment.customMachines,
    (m) => m.id,
  );
  if (incoming.equipment.default && (replace || !result.equipment.default))
    result.equipment.default = structuredClone(incoming.equipment.default);
  result.formats = replace
    ? { ...current.formats, ...incoming.formats }
    : { ...incoming.formats, ...current.formats };
  return validatePersonal(result);
}
export async function importPersonal(storage, incoming, replace = false) {
  // IndexedDB and localStorage cannot share a transaction. Validate everything first,
  // retain both previous values and roll back if either storage write fails.
  validatePersonal(incoming);
  const current = await exportPersonal(storage),
    result = mergePersonal(current, incoming, replace),
    previous = [
      storage.getItem(EQUIPMENT_KEY),
      storage.getItem(EXPORT_PREFERENCE_KEY),
    ];
  try {
    await saveThreads(result.threads);
    storage.setItem(EQUIPMENT_KEY, JSON.stringify(result.equipment));
    storage.setItem(EXPORT_PREFERENCE_KEY, JSON.stringify(result.formats));
  } catch (e) {
    let rollbackError = null;
    try {
      await saveThreads(current.threads);
      for (const [index, key] of [
        EQUIPMENT_KEY,
        EXPORT_PREFERENCE_KEY,
      ].entries()) {
        if (previous[index] === null) storage.removeItem(key);
        else storage.setItem(key, previous[index]);
      }
    } catch (r) {
      rollbackError = r;
    }
    throw Error(
      "Personal settings import failed. " +
        (rollbackError
          ? "Storage rollback also failed; restore your backup before further edits. "
          : "Previous data restored. ") +
        e.message,
    );
  }
  return result;
}
