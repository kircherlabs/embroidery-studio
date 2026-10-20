import { normalizeThread, mergeCatalog } from "./thread-records.js";
export const CATALOG_FIELDS = [
  "brandName",
  "brandId",
  "lineName",
  "lineId",
  "number",
  "colorName",
  "hex",
  "material",
  "weight",
  "spoolSizes",
];
const aliases = {
  brandname: ["brand", "brand_name", "manufacturer"],
  brandid: ["brand_id"],
  linename: ["line", "product_line", "product_line_name", "line_name"],
  lineid: ["line_id", "product_line_id"],
  number: ["thread_number", "thread_code", "code", "sku", "color_number"],
  colorname: ["color_name", "name", "colour_name"],
  hex: ["hex", "hex_color", "color_hex"],
  material: ["material"],
  weight: ["weight", "thread_weight"],
  spoolsizes: ["spool_sizes", "spool_size"],
};
export function csvRows(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    cell = "",
    quote = false;
  const push = () => {
    if (cell.length > 20000)
      throw Error("CSV field exceeds 20,000 characters.");
    row.push(cell);
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quote && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quote || !cell) quote = !quote;
      else throw Error("Invalid CSV quoting.");
    } else if (c === "," && !quote) push();
    else if ((c === "\n" || c === "\r") && !quote) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      push();
      if (row.some((s) => s.trim())) rows.push(row);
      row = [];
      if (rows.length > 50001) throw Error("CSV exceeds 50,000 entries.");
    } else cell += c;
  }
  if (quote) throw Error("Unclosed CSV quoted field.");
  push();
  if (row.some((s) => s.trim())) rows.push(row);
  return rows;
}
const lower = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, "");
export function suggestedMapping(headers) {
  const mapping = {};
  for (const key of CATALOG_FIELDS) {
    const index = headers.findIndex((h) =>
      [key.toLowerCase(), ...(aliases[key.toLowerCase()] || [])]
        .map(lower)
        .includes(lower(h)),
    );
    if (index >= 0) mapping[key] = headers[index];
  }
  return mapping;
}
export function catalogInput(text, name) {
  if (text.length > 24000000)
    throw Error("Choose a catalog smaller than 24 MB.");
  if (/\.json$/i.test(name)) {
    const raw = JSON.parse(text),
      records = Array.isArray(raw) ? raw : raw.records;
    if (!Array.isArray(records))
      throw Error("JSON must contain an array of thread records.");
    return { kind: "json", rows: records, headers: [] };
  }
  if (/\.gpl$/i.test(name) || text.startsWith("GIMP Palette")) {
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || /^(#|GIMP Palette|Name:|Columns:)/.test(line.trim()))
        continue;
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      if (!m || m.slice(1, 4).some((n) => Number(n) > 255))
        throw Error("Invalid GPL color row.");
      rows.push({
        hex:
          "#" +
          m
            .slice(1, 4)
            .map((n) => Number(n).toString(16).padStart(2, "0"))
            .join(""),
        colorName: m[4].trim(),
      });
    }
    return { kind: "gpl", rows, headers: [] };
  }
  const rows = csvRows(text),
    headers = rows.shift() || [];
  if (!headers.length || new Set(headers.map(lower)).size !== headers.length)
    throw Error("CSV needs unique column headers.");
  if (rows.some((r) => r.length !== headers.length))
    throw Error("CSV rows do not match the header columns.");
  return {
    kind: "csv",
    rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
    headers,
    mapping: suggestedMapping(headers),
  };
}
export function catalogRecords(
  input,
  {
    mapping = input.mapping || {},
    brandName,
    lineName,
    numberPrefix = false,
    source = {},
  } = {},
) {
  if (!input.rows.length || input.rows.length > 50000)
    throw Error("Choose a catalog containing 1–50,000 entries.");
  const records = input.rows.map((row, i) => {
    const fields =
      input.kind === "csv"
        ? Object.fromEntries(
            CATALOG_FIELDS.map((k) => [
              k,
              mapping[k] ? row[mapping[k]] : undefined,
            ]),
          )
        : { ...row };
    if (input.kind === "gpl" && numberPrefix) {
      const m = fields.colorName.match(/^([A-Za-z]*\d[A-Za-z0-9_-]*)\s+(.+)$/);
      if (m) {
        fields.number = m[1];
        fields.colorName = m[2];
      }
    }
    if (typeof fields.spoolSizes === "string")
      fields.spoolSizes = fields.spoolSizes
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    if (input.kind === "gpl")
      fields.id =
        "gpl:" +
        encodeURIComponent(brandName || "") +
        "|" +
        encodeURIComponent(lineName || "") +
        "|" +
        i +
        "|" +
        fields.hex;
    // User-selected import defaults may supply missing identity, never imply a license.
    return normalizeThread(fields, { brandName, lineName, source });
  });
  return mergeCatalog([], records).records;
}
