// Original, reproducible test geometry only. No supplied PES/photo assets are copied.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { generate } from "../src/engine.js";
import { validateProject, bounds } from "../src/model.js";
import { exportPreflight, checkRoundTrip } from "../src/export-safety.js";
import {
  qualityFixtures,
  manualRing,
  autoLetter,
  project,
} from "../tests/helpers/quality-fixtures.mjs";
import { qualityMetrics } from "../tests/helpers/quality-metrics.mjs";
import { zipSync, strToU8 } from "../vendor/fflate.js";
const out = "test-results/quality-reference";
await mkdir(out, { recursive: true });
const files = {},
  report = [];
const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
async function save(name, data) {
  const bytes = typeof data === "string" ? strToU8(data) : data;
  files[name] = bytes;
  await writeFile(`${out}/${name}`, bytes);
}
function plot(plan) {
  const b = bounds(
      plan.events.filter((e) => ["stitch", "jump"].includes(e.cmd)),
    ),
    pad = Math.max(1, Math.max(b.width, b.height) * 0.12),
    w = b.width + pad * 2,
    h = b.height + pad * 3,
    x = b.minX - pad,
    y = b.minY - pad;
  const paths = { top: "", underlay: "", travel: "", jump: "", tie: "" };
  let at = { x: 0, y: 0 };
  for (const e of plan.events) {
    if (e.cmd === "stitch" || e.cmd === "jump") {
      const key =
        e.cmd === "jump"
          ? "jump"
          : e.phase?.startsWith("underlay")
            ? "underlay"
            : e.phase === "travel"
              ? "travel"
              : e.phase === "tie"
                ? "tie"
                : "top";
      paths[key] += `M${at.x},${at.y}L${e.x},${e.y}`;
      at = e;
    }
  }
  const colors = {
    top: "#91364c",
    underlay: "#6f8576",
    travel: "#d6423d",
    jump: "#467fa5",
    tie: "#ba7939",
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="680" role="img" aria-label="Actual needle paths, zoomed for inspection"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fbf8ee"/>${Object.entries(
    paths,
  )
    .map(
      ([k, d]) =>
        `<path d="${d}" fill="none" stroke="${colors[k]}" stroke-width="${Math.min(0.09, w / 300)}" ${k === "jump" ? 'stroke-dasharray=".4 .3"' : ""}/>`,
    )
    .join(
      "",
    )}<text x="${x + w * 0.03}" y="${y + h - w * 0.055}" font-size="${w / 60}" font-family="sans-serif">Maroon: sewn · green: underlay · red: routing · blue: jump</text><text x="${x + w * 0.03}" y="${y + h - w * 0.025}" font-size="${w / 65}" font-family="sans-serif">${b.width.toFixed(1)} × ${b.height.toFixed(1)} mm · diagnostic view, not a 1:1 template</text></svg>`;
}
let html =
  '<meta charset="utf-8"><title>Stitch quality references</title><style>body{background:#183128;color:#f3eedc;font:16px system-ui;margin:25px}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{background:#2c453b;padding:16px;border-radius:12px}svg{width:100%;height:350px}h2{font-size:18px}p{max-width:1000px}</style><h1>Stitch quality: actual before/after paths</h1><p>Original diagnostic fixtures. Exported through the existing PES writer and decoded for verification. These software comparisons have not been physically stitched. Review the source and warnings before a sew-out.</p><p>Maroon: primary stitches · green: underlay · red: routing · blue dashed: jumps · ochre: locks.</p><main>';
const cases = [
  ["A_fill", qualityFixtures().narrowNeck],
  ["B_column", project([autoLetter()])],
  ["C_rails", project([manualRing(2, 1.6)])],
];
for (const [id, source] of cases)
  for (const flag of [false, true]) {
    const p = structuredClone(source),
      name = `${id}_${flag ? "quality" : "legacy"}`;
    p.name = name;
    p.planning.qualitySafeguards = flag;
    validateProject(p);
    const plan = generate(p);
    assert(plan.stats.fits);
    assert(!plan.issues.some((i) => i.severity === "error"));
    assert.deepEqual(exportPreflight(p, plan.events, "pes").errors, []);
    const result = spawnSync(
      process.env.PYTHON || "python",
      ["tests/pes-codec-adapter.py"],
      {
        input: JSON.stringify({
          format: "pes",
          payload: { name, events: plan.events },
        }),
        encoding: "utf8",
        maxBuffer: 16000000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const decoded = JSON.parse(result.stdout);
    assert.deepEqual(
      checkRoundTrip(plan.events, decoded.preview, "pes").errors,
      [],
    );
    const metrics = qualityMetrics(plan.events),
      row = {
        name,
        qualitySafeguards: flag,
        geometryHash: hash(p.objects),
        eventHash: hash(plan.events),
        metrics,
        quality: plan.diagnostics.stitchQuality,
        softwareVerified: true,
        physicalSewoutVerified: false,
      };
    report.push(row);
    await save(`${name}.embstudio`, JSON.stringify(p, null, 2));
    await save(`${name}.pes`, new Uint8Array(decoded.bytes));
    await save(`${name}.events.json`, JSON.stringify(plan.events));
    const svg = plot(plan);
    await save(`${name}.svg`, svg);
    html += `<article><h2>${name}</h2>${svg}<p>${metrics.counts.stitch} stitches · ${metrics.counts.jump} jumps · ${metrics.counts.trim} trims · ${metrics.travel.toFixed(2)} mm running travel · ${metrics.phases.underlay || 0} underlay stitches</p></article>`;
  }
for (let i = 0; i < report.length; i += 2)
  assert.equal(report[i].geometryHash, report[i + 1].geometryHash);
html += "</main>";
await save("report.html", html);
await save("metrics.json", JSON.stringify(report, null, 2));
let guide =
  "# Stitch quality reference sew-outs\n\nSix original samples for Brother SE700 / 100 × 100 mm / PES. These are software-validated comparisons, not physically verified sew-outs. All files fit the field and use the existing corrected PES/PEC origin. Other formats remain subject to their documented machine compatibility.\n\nEach pair has identical editable artwork and sewing settings; only the saved Stitch quality safeguards option changes. Open the .embstudio sources to inspect or revise them. The .events.json and .svg files show actual generated commands; SVG views are zoomed for inspection, not actual-size templates.\n\nA: narrow-neck fill, comparing return routing. B: automatic T column, comparing inter-branch travel. C: deliberately narrow curved manual satin, comparing missing versus retained underlay; this remains a fine-detail diagnostic with a narrow-column warning.\n\nUse the same material, thread and setup for each pair. Keep a record of the machine settings and observed results. Encoded trims are requests; use the normal manual-cleanup preview to inspect remaining connections. No tension, density or pull-compensation adjustments have been invented to mask machine problems.\n\n| Sample | Stitches | Jumps | Trims | Running travel mm | Underlay stitches | Non-lock short stitches |\n|---|---:|---:|---:|---:|---:|---:|\n";
for (const r of report)
  guide += `| ${r.name} | ${r.metrics.counts.stitch} | ${r.metrics.counts.jump} | ${r.metrics.counts.trim} | ${r.metrics.travel.toFixed(2)} | ${r.metrics.phases.underlay || 0} | ${r.metrics.short} |\n`;
await save("README.md", guide);
await writeFile(
  "test-results/stitch-quality-reference.zip",
  zipSync(files, { level: 6 }),
);
console.log(guide);
console.log("Reference package: test-results/stitch-quality-reference.zip");
