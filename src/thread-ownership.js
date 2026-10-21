import { inventoryEntry, libraryThreads } from "./thread-records.js";
// Ownership is personal inventory state, independent of catalog and project assignment.
export function ownershipSelection(library, ids) {
  const selected = new Set(ids),
    inventory = new Map(library.inventory.map((i) => [i.thread.id, i]));
  const records = libraryThreads(library).filter((r) => selected.has(r.id));
  return {
    records,
    owned: records.filter((r) => inventory.get(r.id)?.quantity > 0),
    unowned: records.filter((r) => !(inventory.get(r.id)?.quantity > 0)),
  };
}
export function setOwnership(library, ids, owned) {
  const next = structuredClone(library);
  for (const thread of ownershipSelection(library, ids).records) {
    const entry = next.inventory.find((i) => i.thread.id === thread.id);
    if (entry) entry.quantity = owned ? Math.max(1, entry.quantity) : 0;
    else if (owned) next.inventory.push(inventoryEntry(thread));
  }
  return next;
}
