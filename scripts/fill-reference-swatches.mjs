// Original Studio reference projects, not imported research assets or sew-out claims.
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { object } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
import { generate } from "../src/engine.js";
import { makeFillSettings } from "../src/fills/context.js";
import {
  stampFillFeatures,
  FILL_METHODS,
  TEXTURES,
} from "../src/fills/schema.js";
import { checkRoundTrip } from "../src/export-safety.js";
const dir = "examples/fill-swatches";
await mkdir(dir, { recursive: true });
await mkdir("test-results", { recursive: true });
const rect = (w, h) => [
  { x: -w / 2, y: -h / 2 },
  { x: w / 2, y: -h / 2 },
  { x: w / 2, y: h / 2 },
  { x: -w / 2, y: h / 2 },
];
function tile(name, method, changes = {}, w = 24, h = 24, x = 0, y = 0) {
  const o = object(
    name,
    [rect(w, h).map((p) => ({ x: p.x + x, y: p.y + y }))],
    {
      id: `swatch-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      closed: true,
      angle: 0,
      color: "#303b53",
      spacing: 0.42,
      length: 2.8,
      underlay: ["tatami", "emboss"].includes(method),
      compensation: ["tatami", "emboss"].includes(method) ? 0.15 : 0,
    },
  );
  o.operations = [{ ...makeOperation("fill", o), id: `${o.id}-fill` }];
  o.operations[0].fillSettings = makeFillSettings(method, o, changes);
  return o;
}
const designs = Object.keys(FILL_METHODS).map((method) => [
  `${method}-reference`,
  [
    tile(
      FILL_METHODS[method],
      method,
      method === "meander" ? { style: "organic" } : {},
      40,
      30,
    ),
  ],
]);
designs.push([
  "tatami-textures",
  Object.keys(TEXTURES).map((texture, i) =>
    tile(
      texture,
      "tatami",
      {
        texture,
        ...(texture === "custom" ? { sequence: [0, 0.4, 0.1, 0.65] } : {}),
      },
      18,
      18,
      ((i % 4) - 1.5) * 21,
      (Math.floor(i / 4) - 1) * 21,
    ),
  ),
]);
designs.push([
  "emboss-motifs",
  ["dots", "diamonds", "checker", "lattice", "diagonal", "waves"].map(
    (motif, i) =>
      tile(
        motif,
        "emboss",
        { motif, strength: 0.75 },
        24,
        24,
        ((i % 3) - 1) * 28,
        (Math.floor(i / 3) - 0.5) * 28,
      ),
  ),
]);
designs.push([
  "meander-styles",
  ["classic", "fine", "open", "organic", "looping"].map((style, i) =>
    tile(
      style,
      "meander",
      { style },
      24,
      24,
      ((i % 3) - 1) * 28,
      (Math.floor(i / 3) - 0.5) * 28,
    ),
  ),
]);
const manifest = [];
for (const [name, objects] of designs) {
  const project = stampFillFeatures({
      version: 1,
      name: `Fill swatch: ${name}`,
      machine: "se700",
      objects,
    }),
    plan = generate(project);
  if (plan.issues.some((i) => i.severity === "error"))
    throw Error(`${name}: ${JSON.stringify(plan.issues)}`);
  await writeFile(
    `${dir}/${name}.embstudio`,
    JSON.stringify(project, null, 2) + "\n",
  );
  const run = spawnSync(
    process.env.PYTHON || "python",
    ["tests/pes-codec-adapter.py"],
    {
      input: JSON.stringify({ payload: { name, events: plan.events } }),
      encoding: "utf8",
      maxBuffer: 16000000,
    },
  );
  if (run.status !== 0) throw Error(run.stderr);
  const out = JSON.parse(run.stdout),
    check = checkRoundTrip(plan.events, out.preview, "pes");
  if (check.errors.length) throw Error(check.errors.join("\n"));
  await writeFile(`${dir}/${name}.pes`, Uint8Array.from(out.bytes));
  manifest.push({
    name,
    width: plan.stats.bounds.width,
    height: plan.stats.bounds.height,
    stitches: plan.stats.stitches,
    jumps: plan.stats.jumps,
    trims: plan.stats.trims,
    settings: objects.map((o) => ({
      name: o.name,
      spacing: o.spacing,
      length: o.length,
      fillSettings: o.operations[0].fillSettings,
    })),
    issues: plan.issues,
  });
}
await writeFile(
  `${dir}/manifest.json`,
  JSON.stringify(
    {
      notice:
        "Software-checked reference files. Not physically sewn. Review settings, hoop fit and machine behavior before testing fabric/thread/stabilizer combinations.",
      machine: "Brother SE700 / 100 x 100 mm",
      designs: manifest,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Wrote ${designs.length} editable projects, software-round-tripped PES files and manifest to ${dir}.`,
);
