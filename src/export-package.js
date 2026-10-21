import {
  FORMAT_STATUS,
  exportPreflight,
  checkRoundTrip,
} from "./export-safety.js";
import { getMachine } from "./equipment.js";
import { analyze } from "./engine.js";
import { zipSync, strToU8 } from "../vendor/fflate.js";

export const packageFormats = () =>
  Object.entries(FORMAT_STATUS)
    .filter(([, s]) => s.implemented && s.roundTrip)
    .map(([f]) => f);
export function packageName(name) {
  const safe =
    String(name || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "design";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)
    ? "design-" + safe
    : safe;
}
export async function preparePackage(
  project,
  plan,
  encode,
  progress = () => {},
) {
  const result = { files: [], omitted: [] };
  if (plan.issues?.some((i) => i.severity === "error"))
    throw Error("Resolve Design Issues errors before exporting a package.");
  let total = 0;
  for (const format of packageFormats()) {
    progress(format);
    const check = exportPreflight(project, plan.events, format);
    if (check.errors.length) {
      result.omitted.push({ format, reasons: check.errors });
      continue;
    }
    try {
      const output = await encode({
        action: "export",
        format,
        events: plan.events,
        name: project.name,
      });
      if (!(output.bytes instanceof Uint8Array) || !output.bytes.length)
        throw Error("The writer produced an empty or invalid file.");
      if (!Array.isArray(output.events))
        throw Error("No decoded machine instructions were returned.");
      const integrity = checkRoundTrip(plan.events, output.events, format);
      if (integrity.errors.length) throw Error(integrity.errors.join(" "));
      if (!analyze(output.events, getMachine(project)).fits)
        throw Error("Decoded commands exceed the selected design field.");
      if (total + output.bytes.byteLength > 64000000)
        throw Error(
          "Package exceeds the 64 MB memory safeguard. Export this format separately.",
        );
      total += output.bytes.byteLength;
      result.files.push({
        format,
        bytes: output.bytes,
        warnings: [
          ...check.warnings,
          ...(integrity.addedNeedles
            ? [
                `${integrity.addedNeedles} additional needle positions required by format movement limits.`,
              ]
            : []),
        ],
      });
    } catch (e) {
      result.omitted.push({ format, reasons: [e.message || String(e)] });
    }
  }
  return result;
}
const clean = (v) =>
  String(v ?? "")
    .replace(/[\r\n\t\0-\x1f]/g, " ")
    .slice(0, 300);
const cell = (v) =>
  '"' +
  (/^[=+@\-]/.test(clean(v)) ? "'" : "") +
  clean(v).replaceAll('"', '""') +
  '"';
export function packageSequence(project, events) {
  const products = new Map();
  for (const o of project.objects)
    for (const op of [o, ...(o.operations || [])])
      if (op.physicalThread)
        products.set(op.physicalThread.thread.id, op.physicalThread.thread);
  const rows = [];
  let current = null;
  for (const e of events) {
    if (e.cmd === "color") current = null;
    else if (e.cmd === "stop") {
      rows.push({
        action: "Operator stop",
        color: e.color,
        thread: null,
        stitches: 0,
      });
      current = null;
    } else if (e.cmd === "stitch") {
      const key = e.threadKey || e.color;
      if (!current || current.key !== key) {
        current = {
          action: "Sew",
          key,
          color: e.color,
          thread: products.get(e.threadKey) || null,
          stitches: 0,
        };
        rows.push(current);
      }
      current.stitches++;
    }
  }
  return rows;
}
export function packageDocuments(project, plan, result) {
  const rows = packageSequence(project, plan.events);
  const csv = [
    [
      "Order",
      "Action",
      "Design color",
      "Brand",
      "Product line",
      "Spool number",
      "Color name",
      "Needle penetrations",
    ],
    ...rows.map((r, i) => [
      i + 1,
      r.action,
      r.color,
      r.thread?.brandName,
      r.thread?.lineName,
      r.thread?.number,
      r.thread?.colorName,
      r.stitches,
    ]),
  ]
    .map((r) => r.map(cell).join(","))
    .join("\r\n");
  const readme = [
    `Embroidery Studio design package: ${clean(project.name)}`,
    `Design dimensions: ${plan.stats.bounds.width.toFixed(2)} x ${plan.stats.bounds.height.toFixed(2)} mm`,
    `Generated sewing stitches: ${plan.stats.stitches}`,
    `Thread changes: ${plan.stats.changes}; operator stops: ${plan.stats.stops}; jumps: ${plan.stats.jumps}; trims: ${plan.stats.trims}`,
    `Formats included: ${result.files.map((f) => f.format.toUpperCase()).join(", ")}`,
    "",
    "Unzip this package before transferring a compatible file to your machine.",
    "These formats are a distribution package, not a claim that every file works on every machine.",
    "Verify your exact model, physical hoop, orientation and design dimensions. Test on scrap before final stitching.",
    "Software export/round-trip validation is not a physical machine sew-out. Screen thread colors and substitutions are approximate.",
    "Thread brand/line/spool identities may not be embedded in machine files. Follow THREAD-SEQUENCE.csv, including repeated-color pauses.",
    "The dimensions and stitch counts above describe the generated plan; format movement limits may add needle positions.",
    "",
    "Sewing / thread sequence:",
    ...rows.map(
      (r, i) =>
        `${i + 1}. ${r.action} | ${clean(r.color)} | ${r.action === "Operator stop" ? "Follow the construction step; keep the thread unless the next sewing row requires a change" : r.thread ? [r.thread.brandName, r.thread.lineName, r.thread.number, r.thread.colorName].filter(Boolean).map(clean).join(" / ") : "Choose thread to match design color"} | ${r.stitches} stitches`,
    ),
    "",
    "Format notes:",
    ...result.files.flatMap((f) => [
      f.format.toUpperCase() + ":",
      ...f.warnings.map((w) => "  " + w),
    ]),
    "",
    "Omitted formats:",
    ...(result.omitted.length
      ? result.omitted.map(
          (o) => o.format.toUpperCase() + ": " + o.reasons.join(" "),
        )
      : ["None."]),
    "",
    "Keep the editable .embstudio project separately; reference images, source artwork and personal inventory are not included.",
  ].join("\r\n");
  return { readme, csv };
}
export function packageArchive(project, plan, result) {
  if (!result.files.length)
    throw Error("No safely validated machine files are available.");
  const name = packageName(project.name),
    files = Object.create(null),
    docs = packageDocuments(project, plan, result);
  for (const f of result.files) {
    if (
      !packageFormats().includes(f.format) ||
      !(f.bytes instanceof Uint8Array) ||
      !f.bytes.length ||
      files[name + "." + f.format]
    )
      throw Error("Invalid or duplicate archive entry.");
    files[name + "." + f.format] = f.bytes;
  }
  files["README.txt"] = strToU8(docs.readme);
  files["THREAD-SEQUENCE.csv"] = strToU8(docs.csv);
  // STORE avoids redundant compression and expensive workers; the six compact machine files are bounded at 64 MB.
  return zipSync(files, { level: 0, mtime: new Date(2020, 0, 1) });
}
