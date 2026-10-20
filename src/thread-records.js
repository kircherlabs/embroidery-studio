// Physical identity is independent of a digital approximation or PEC palette index.
export const THREAD_BRANDS = {
  newbrothread: "New brothread",
  simthread: "Simthread",
  brother: "Brother",
  madeira: "Madeira",
  sulky: "Sulky",
  isacord: "Isacord",
  robison_anton: "Robison-Anton",
  floriani: "Floriani",
};
const str = (v, max = 160) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const optional = (v, max = 160) =>
  v === null || v === undefined || v === ""
    ? null
    : str(v, max)
      ? v.trim()
      : (() => {
          throw Error("Thread fields must be text within the allowed length.");
        })();
export const slug = (s) =>
  String(s)
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
export function brandIdentity(name, id) {
  const folded = slug(id || name).replaceAll("-", "");
  const match = Object.keys(THREAD_BRANDS).find(
    (k) =>
      slug(k).replaceAll("-", "") === folded ||
      slug(THREAD_BRANDS[k]).replaceAll("-", "") === folded,
  );
  return match
    ? { brandId: match, brandName: THREAD_BRANDS[match] }
    : { brandId: slug(id || name), brandName: name };
}
export const threadId = (brand, line, number) =>
  "thread:" + [brand, line, number].map(encodeURIComponent).join("|");
export function normalizeThread(raw, defaults = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("Each catalog row must be a thread record.");
  const get = (k) =>
    raw[k] === undefined || raw[k] === null || raw[k] === ""
      ? (defaults[k] ?? raw[k])
      : raw[k];
  const b = brandIdentity(get("brandName") || get("brandId"), get("brandId")),
    lineName = optional(get("lineName") || get("lineId")),
    lineId = slug(get("lineId") || lineName || "");
  if (!str(b.brandId) || !str(b.brandName) || !str(lineId) || !str(lineName))
    throw Error("Every entry needs a brand and product line.");
  const number =
    get("number") === undefined ||
    get("number") === null ||
    get("number") === ""
      ? null
      : get("number");
  if (number !== null && !str(number, 80))
    throw Error(
      "Thread numbers must be text, preserving leading zeros and letters.",
    );
  const colorName = optional(get("colorName"));
  if (!number && !colorName)
    throw Error("Provide a spool number or palette color name.");
  let hex = optional(get("hex"), 7);
  if (hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex))
      throw Error("Use a six-digit HEX value or leave it empty.");
    hex = hex.toLowerCase();
  }
  const source = raw.source || defaults.source || {};
  const record = {
    id: number
      ? threadId(b.brandId, lineId, number.trim())
      : get("id") || "swatch-" + crypto.randomUUID(),
    ...b,
    lineId,
    lineName,
    number: number?.trim() || null,
    colorName,
    hex,
    material: optional(get("material")),
    weight: optional(
      typeof get("weight") === "number" ? String(get("weight")) : get("weight"),
    ),
    spoolSizes: Array.isArray(get("spoolSizes"))
      ? get("spoolSizes").map((s) => optional(s, 80))
      : [],
    source: {
      name: optional(source.name),
      url: optional(source.url, 1000),
      catalogVersion: optional(source.catalogVersion),
      license: optional(source.license, 1000),
      attribution: optional(source.attribution, 1000),
      verification: "user-imported",
      declaredVerification: optional(
        source.declaredVerification || source.verification,
      ),
      colorAccuracy: hex ? "digital-approximation" : "unknown",
    },
  };
  validateThread(record);
  return record;
}
export function validateThread(r) {
  if (
    !r ||
    !str(r.id, 800) ||
    !str(r.brandId) ||
    !str(r.brandName) ||
    !str(r.lineId) ||
    !str(r.lineName) ||
    (r.number !== null && !str(r.number, 80)) ||
    (r.colorName !== null && !str(r.colorName)) ||
    (r.hex !== null && !/^#[0-9a-f]{6}$/i.test(r.hex)) ||
    !Array.isArray(r.spoolSizes) ||
    r.spoolSizes.length > 50 ||
    r.spoolSizes.some((s) => !str(s, 80))
  )
    throw Error("Invalid physical thread record.");
  if (r.number && r.id !== threadId(r.brandId, r.lineId, r.number))
    throw Error("Thread identity does not match brand, line and spool number.");
  for (const k of ["material", "weight"])
    if (r[k] !== null && !str(r[k]))
      throw Error("Invalid thread material / weight.");
  const s = r.source;
  if (
    !s ||
    !["user-imported", "user-entered"].includes(s.verification) ||
    !["digital-approximation", "unknown", "user-measured"].includes(
      s.colorAccuracy,
    )
  )
    throw Error("Invalid thread provenance.");
  for (const [k, max] of Object.entries({
    name: 160,
    url: 1000,
    catalogVersion: 160,
    license: 1000,
    attribution: 1000,
    declaredVerification: 160,
  }))
    if (s[k] !== null && s[k] !== undefined && !str(s[k], max))
      throw Error("Invalid thread provenance field.");
  return r;
}
export function validateAssignment(a) {
  if (
    !a ||
    a.version !== 1 ||
    !/^#[0-9a-f]{6}$/i.test(a.designColor) ||
    !["user", "algorithmic", "third-party", "manufacturer-documented"].includes(
      a.method,
    )
  )
    throw Error("Invalid physical thread assignment.");
  validateThread(a.thread);
  if (a.method !== "user" && a.thread.hex === null)
    throw Error("Color matching needs a digital color reference.");
  if (a.deltaE !== undefined && (!Number.isFinite(a.deltaE) || a.deltaE < 0))
    throw Error("Invalid thread match distance.");
  return a;
}
export function mergeCatalog(existing, incoming, replace = false) {
  const map = new Map(existing.map((r) => [r.id, r]));
  let added = 0,
    kept = 0,
    replaced = 0;
  for (const r of incoming) {
    validateThread(r);
    if (map.has(r.id)) {
      if (replace) {
        map.set(r.id, r);
        replaced++;
      } else kept++;
    } else {
      map.set(r.id, r);
      added++;
    }
  }
  if (map.size > 50000)
    throw Error(
      "This local library exceeds 50,000 entries. Split the catalog into smaller libraries.",
    );
  return { records: [...map.values()], added, kept, replaced };
}
export const emptyThreads = () => ({
  version: 1,
  records: [],
  preferences: {},
  inventory: [],
  conversions: [],
});
export function validateThreadLibrary(d) {
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.records) ||
    d.records.length > 50000 ||
    !d.preferences ||
    typeof d.preferences !== "object" ||
    Array.isArray(d.preferences) ||
    !Array.isArray(d.inventory) ||
    !Array.isArray(d.conversions)
  )
    throw Error("Invalid personal thread library.");
  const ids = new Set();
  for (const r of d.records) {
    validateThread(r);
    if (ids.has(r.id)) throw Error("Duplicate thread identity.");
    ids.add(r.id);
  }
  for (const key of ["brandId", "lineId", "brandName"])
    if (d.preferences[key] !== undefined && !str(d.preferences[key]))
      throw Error("Invalid thread preference.");
  if (d.inventory.length || d.conversions.length)
    throw Error(
      "This catalog version does not yet accept inventory or conversion records.",
    );
  return d;
}

// Physical spool identity is separate from its approximate screen color.
export const sewingThreadKey = (o) =>
  o.physicalThread?.thread.id || o.color?.toLowerCase();
