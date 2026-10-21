import { uid } from "./model.js";
import { validateArtwork, portableJSON } from "./artwork-library.js";
import {
  hasAdvancedFills,
  validateFillFeatures,
  FILL_CAPABILITY,
  unsupported,
} from "./fills/schema.js";
export const LIBRARY_KIND = "embroidery-studio-artwork-library";
export const MAX_LIBRARY_ITEMS = 1000,
  MAX_LIBRARY_BYTES = 64 * 1024 * 1024,
  MAX_BACKUP_BYTES = 72 * 1024 * 1024;
export const bytes = (value) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
export function artworkName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160)
    throw Error("Use an artwork name from 1 to 160 characters.");
  return value.trim();
}
export function validateArtworkRecord(raw) {
  if (raw?.version !== undefined && ![1, 2].includes(raw.version))
    throw unsupported(
      "This saved artwork needs a newer Studio version. Its data was retained.",
    );
  if (
    !raw ||
    ![1, 2].includes(raw.version) ||
    typeof raw.id !== "string" ||
    !raw.id ||
    raw.id.length > 120 ||
    typeof raw.createdAt !== "string" ||
    typeof raw.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(raw.createdAt)) ||
    !Number.isFinite(Date.parse(raw.updatedAt))
  )
    throw Error("Invalid artwork record/version.");
  const r = {
    version: raw.version,
    ...(raw.requires ? { requires: structuredClone(raw.requires) } : {}),
    id: raw.id,
    name: artworkName(raw.name),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    artwork: validateArtwork(raw.artwork),
  };
  validateFillFeatures({
    ...r.artwork,
    version: r.version,
    requires: r.requires,
  });
  if (raw.importId !== undefined) {
    if (
      typeof raw.importId !== "string" ||
      !raw.importId ||
      raw.importId.length > 120
    )
      throw Error("Invalid imported artwork identity.");
    r.importId = raw.importId;
    r.importName = artworkName(raw.importName);
  }
  return r;
}
export function createArtworkRecord(name, artwork) {
  const now = new Date().toISOString();
  return validateArtworkRecord({
    version: hasAdvancedFills(artwork) ? 2 : 1,
    ...(hasAdvancedFills(artwork) ? { requires: [FILL_CAPABILITY] } : {}),
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    artwork,
  });
}
export function uniqueArtworkName(name, records) {
  const taken = new Set(records.map((r) => r.name.toLocaleLowerCase())),
    base = artworkName(name);
  if (!taken.has(base.toLocaleLowerCase())) return base;
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`,
      next = base.slice(0, 160 - suffix.length) + suffix;
    if (!taken.has(next.toLocaleLowerCase())) return next;
  }
}
export function artworkBackup(records) {
  return {
    kind: LIBRARY_KIND,
    version: records.some((r) => r.version === 2) ? 2 : 1,
    ...(records.some((r) => r.version === 2)
      ? { requires: [FILL_CAPABILITY] }
      : {}),
    exportedAt: new Date().toISOString(),
    items: records.map(validateArtworkRecord),
  };
}
export function parseArtworkBackup(input) {
  const data = portableJSON(
    typeof input === "string" ? JSON.parse(input) : input,
    MAX_BACKUP_BYTES,
  );
  if (
    data?.kind !== LIBRARY_KIND ||
    ![1, 2].includes(data.version) ||
    !Array.isArray(data.items) ||
    data.items.length > MAX_LIBRARY_ITEMS
  )
    throw Error(
      "Choose a My Artwork library backup (version 1 or 2, up to 1,000 items).",
    );
  const records = [],
    issues = [];
  validateFillFeatures({
    version: data.version,
    requires: data.requires,
    objects: [],
  });
  for (const [i, raw] of data.items.entries())
    try {
      records.push(validateArtworkRecord(raw));
    } catch (e) {
      issues.push(`Item ${i + 1}: ${e.message}`);
    }
  return { records, issues };
}
export function mergeArtworkRecords(existing, incoming) {
  const records = structuredClone(existing),
    ids = new Set(records.map((r) => r.id));
  let skipped = 0,
    renamed = 0;
  for (const value of incoming) {
    const r = validateArtworkRecord(value),
      signature = JSON.stringify(r.artwork),
      origin = r.importId || r.id,
      originName = r.importName || r.name;
    if (
      records.some(
        (x) =>
          (x.id === origin || x.importId === origin) &&
          (x.importName || x.name) === originName &&
          JSON.stringify(x.artwork) === signature,
      )
    ) {
      skipped++;
      continue;
    }
    const nextName = uniqueArtworkName(r.name, records);
    if (nextName !== r.name) renamed++;
    r.importId = origin;
    r.importName = originName;
    r.name = nextName;
    while (ids.has(r.id)) r.id = uid();
    ids.add(r.id);
    records.push(r);
  }
  if (records.length > MAX_LIBRARY_ITEMS || bytes(records) > MAX_LIBRARY_BYTES)
    throw Error(
      "My Artwork exceeds 1,000 items or 64 MB. Export a backup and remove unused items first.",
    );
  return { records, skipped, renamed, added: records.length - existing.length };
}
