import {
  packageFormats,
  packageName,
  packageDocuments,
} from "./export-package.js";
import { exportPreflight, checkRoundTrip } from "./export-safety.js";
import { getMachine, machineOf } from "./equipment.js";
import { analyze } from "./engine.js";
import {
  hoopTemplate,
  printTemplates,
  overviewSvg,
} from "./multi-hoop-templates.js";
import { zipSync, strToU8 } from "../vendor/fflate.js";
import { hoopingRevision } from "./multi-hoop-layout.js";
const number = (n) => String(n).padStart(2, "0");
function maximumSewnSpan(events) {
  let needle = null,
    max = 0;
  for (const e of events) {
    if (["jump", "trim", "color", "end"].includes(e.cmd)) needle = null;
    else if (e.cmd === "stitch") {
      if (needle)
        max = Math.max(max, Math.hypot(e.x - needle.x, e.y - needle.y));
      needle = e;
    }
  }
  // In VP3 the first needle's placement can come from a block header, not an
  // explicit jump at that coordinate. It is not a sewn span from global origin.
  return max;
}
export async function prepareMultiHoopPackage(
  master,
  bundle,
  encode,
  formats,
  progress = () => {},
) {
  if (bundle.sourceRevision !== hoopingRevision(master))
    throw Error(
      "The master or layout changed. Regenerate all hooping sections before exporting.",
    );
  if (bundle.problems.length)
    throw Error(
      "Resolve every Multi-Hoop issue before exporting. " +
        bundle.problems[0].message,
    );
  if (!master.multiHoop?.hoops.length)
    throw Error("Add hooping regions first.");
  const sections = bundle.sections.filter((s) => s.plan.stats.stitches > 0),
    result = {
      files: [],
      omitted: [],
      sections,
      sourceRevision: bundle.sourceRevision,
    };
  if (!sections.length) throw Error("No hooping contains sewing stitches.");
  if (
    !formats?.length ||
    formats.some((f) => !packageFormats().includes(f)) ||
    new Set(formats).size !== formats.length
  )
    throw Error("Select tested, distinct machine formats.");
  let total = 0;
  for (const format of formats) {
    const group = [],
      reasons = [];
    for (const s of sections) {
      progress(format, s.number);
      const check = exportPreflight(s.project, s.plan.events, format);
      if (s.plan.issues?.some((i) => i.severity === "error"))
        check.errors.push("Resolve section Design Issues.");
      if (check.errors.length) {
        reasons.push(`Hooping ${s.number}: ${check.errors.join(" ")}`);
        continue;
      }
      try {
        const output = await encode({
          action: "export",
          format,
          events: s.plan.events,
          name: `${master.name} ${number(s.number)}`,
        });
        if (
          !(output.bytes instanceof Uint8Array) ||
          !output.bytes.length ||
          !Array.isArray(output.events)
        )
          throw Error("Writer did not return a file and decoded commands.");
        const integrity = checkRoundTrip(s.plan.events, output.events, format),
          stats = analyze(output.events, getMachine(s.project));
        if (integrity.errors.length) throw Error(integrity.errors.join(" "));
        if (!stats.fits)
          throw Error(
            "Decoded commands exceed this hooping’s actual sewing field.",
          );
        if (
          maximumSewnSpan(output.events) >
          getMachine(s.project).maxStitch + 0.15
        )
          throw Error(
            "Decoded stitch movement exceeds the selected machine limit.",
          );
        if (total + output.bytes.length > 64000000)
          throw Error(
            "Package exceeds 64 MB. Export fewer formats or reduce design complexity.",
          );
        total += output.bytes.length;
        group.push({
          format,
          number: s.number,
          hoopId: s.hoop.id,
          bytes: output.bytes,
          stats,
          warnings: [
            ...check.warnings,
            ...(integrity.addedNeedles
              ? [
                  `${integrity.addedNeedles} format-required needle positions added.`,
                ]
              : []),
          ],
        });
      } catch (e) {
        reasons.push(`Hooping ${s.number}: ${e.message}`);
      }
    }
    // Never distribute an incomplete format set: an omitted middle hooping is
    // not a machine-ready version of the design.
    if (reasons.length) result.omitted.push({ format, reasons });
    else result.files.push(...group);
  }
  return result;
}
export function multiHoopArchive(master, bundle, result) {
  if (
    result.sourceRevision !== hoopingRevision(master) ||
    bundle.sourceRevision !== result.sourceRevision
  )
    throw Error(
      "The master changed after package preparation. Regenerate before downloading.",
    );
  if (!result.files.length)
    throw Error("No complete validated format set is available.");
  const files = Object.create(null),
    m = getMachine(master),
    model = machineOf(master),
    name = packageName(master.name);
  const manifest = {
    version: 1,
    name: master.name,
    workflow: "standard-rehooping-separate-files",
    units: "mm",
    axes: "X right, Y down; TOP is negative Y",
    orientationDegrees: 0,
    machine: master.machine,
    field: { width: m.width, height: m.height },
    physicalTesting: false,
    overlap: master.multiHoop.overlap,
    margin: master.multiHoop.margin,
    stitchedRegistration: master.multiHoop.registration,
    registration: bundle.registration.pairs,
    hoopings: bundle.sections.map((s) => ({
      number: s.number,
      id: s.hoop.id,
      center: { x: s.hoop.x, y: s.hoop.y },
      stitches: s.plan.stats.stitches,
      bounds: s.plan.stats.bounds,
      plannedNeedleBounds: s.needleBounds,
      objects: s.objectIds,
    })),
    files: [],
    omitted: result.omitted,
  };
  for (const f of result.files) {
    if (
      !packageFormats().includes(f.format) ||
      !result.sections.some(
        (s) => s.number === f.number && s.hoop.id === f.hoopId,
      ) ||
      !(f.bytes instanceof Uint8Array)
    )
      throw Error("Invalid multi-hoop archive entry.");
    const path = `${f.format}/hoop-${number(f.number)}-${name}.${f.format}`;
    if (files[path]) throw Error("Duplicate machine file.");
    files[path] = f.bytes;
    manifest.files.push({
      path,
      format: f.format,
      hooping: f.number,
      stitches: f.stats.stitches,
      bounds: f.stats.bounds,
      warnings: f.warnings,
    });
  }
  for (const s of result.sections) {
    const docs = packageDocuments(s.project, s.plan, {
      files: result.files.filter((f) => f.number === s.number),
      omitted: result.omitted,
    });
    files[`threads/hoop-${number(s.number)}-sequence.csv`] = strToU8(docs.csv);
    files[`threads/hoop-${number(s.number)}-notes.txt`] = strToU8(docs.readme);
    files[`templates/hoop-${number(s.number)}-actual-size.svg`] = strToU8(
      hoopTemplate(master, s, bundle.registration),
    );
  }
  files["OVERVIEW.svg"] = strToU8(overviewSvg(master, bundle.sections));
  files["PRINT-AT-100-PERCENT.html"] = strToU8(
    printTemplates(master, result.sections, bundle.registration),
  );
  files["HOOPING-MANIFEST.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["START-HERE.txt"] = strToU8(
    [
      `Embroidery Studio · ${master.name} · STANDARD REHOOPING`,
      `Selected machine: ${m.name}; continuous sewing field ${m.width} x ${m.height} mm.`,
      `Manufacturer-documented formats for this exact profile: ${model.formats?.join(", ") || "none / generic"}. Other files are conversion outputs, not a compatibility promise.`,
      "One editable master; separate numbered files. No sliding/rotating/multi-position encoding or automatic reposition command.",
      "Unzip. Choose ONE compatible format directory. Sew files in numeric order, rehooping the fabric between files. Empty hoopings have no file.",
      "Do not combine format directories or sew all formats. Do not resize, mirror or automatically center sections at the machine. Keep TOP orientation.",
      "Planned section coordinates use the hoop center as local (0,0); the manifest and templates share master coordinates. Positive X is right; positive Y is down. Some formats/machines normalize origin or center a design on load: do not assume the loaded position preserves Studio’s offset. Restore the planned placement with the template, sewn-bounds center offset below and two dry-needle alignment points before sewing.",
      "Overlap is alignment space, NOT duplicate embroidery. Source ownership domains are exclusive. Whole objects/actions are assigned once.",
      "",
      "SETUP / ALIGNMENT",
      "Keep a stable fabric/stabilizer sandwich. Mark a common baseline and TOP before rehooping; do not stretch or rotate the fabric.",
      "Open PRINT-AT-100-PERCENT.html. Print A4 at 100% / Actual size; disable Fit/Shrink and browser headers/footers. Measure its 50 mm ruler. Join tiled pages using their 10 mm overlaps.",
      "Use section field center, source contours and common coordinates to position each hoop. Check at least two widely separated alignment points and orientation with a dry needle before sewing.",
      master.multiHoop.registration
        ? "Stitched registration ENABLED: temporary running crosses are the first action, followed by an operator pause. Match BOTH shared marks to the previous hooping before starting; repeat marks are a verification, not automatic alignment. At the pause, replace temporary thread with artwork thread. Remove temporary marks after assembly."
        : "Stitched registration DISABLED: no extra registration stitches or pauses are included. Use printed templates and measured shared coordinates.",
      "Automatic cutting varies by machine and format. Read each hooping’s thread/stop notes, especially JEF trim/header limits, VP3 stop restrictions and DST/EXP color-change pauses.",
      "Check every field on the exact physical hoop template (especially oval envelopes), test the assembled design on scrap, and inspect each join. Software validation does not verify real-world alignment, pull/push distortion or sew-out quality.",
      "",
      "HOOPING ORDER / SHARED MASTER CENTERS",
      ...bundle.sections.map(
        (s) =>
          `${number(s.number)}: hoop center X ${s.hoop.x.toFixed(3)}, Y ${s.hoop.y.toFixed(3)} mm; 0 degrees; ${s.plan.stats.stitches} generated stitches; ${s.plan.stats.changes} thread changes; ${s.plan.stats.stops} stops${!s.plan.stats.stitches ? " (empty; no file)" : ""}. Sewn bounds ${s.needleBounds.width.toFixed(2)} x ${s.needleBounds.height.toFixed(2)} mm; their center offset from hoop center is X ${((s.needleBounds.minX + s.needleBounds.maxX) / 2).toFixed(3)}, Y ${((s.needleBounds.minY + s.needleBounds.maxY) / 2).toFixed(3)} mm.`,
      ),
      "",
      "REGISTRATION PAIRS",
      ...bundle.registration.pairs.map(
        (p) =>
          `${p.id}: hoops ${bundle.sections.find((s) => s.hoop.id === p.a).number}/${bundle.sections.find((s) => s.hoop.id === p.b).number}; ${p.points.map((q, i) => `${i ? "B" : "A"} X ${q.x.toFixed(3)} Y ${q.y.toFixed(3)} mm`).join("; ")}; baseline ${p.baseline.toFixed(3)} mm.`,
      ),
      "",
      "SOURCE SPLITS / JOIN REVIEW",
      ...bundle.splits.map(
        (s) =>
          `${master.objects.find((o) => o.id === s.objectId)?.name || s.objectId}: ${s.message}`,
      ),
      "",
      "OMITTED FORMATS (whole format set omitted if any hooping fails)",
      ...result.omitted.map(
        (o) => `${o.format.toUpperCase()}: ${o.reasons.join(" ")}`,
      ),
      "",
      "Save the editable .embstudio master with its multi-hoop layout separately. These machine files never replace editable artwork.",
    ].join("\r\n"),
  );
  if (Object.values(files).reduce((n, v) => n + v.length, 0) > 64000000)
    throw Error(
      "Package including templates exceeds 64 MB. Export fewer formats.",
    );
  return zipSync(files, { level: 0, mtime: new Date(2020, 0, 1) });
}
