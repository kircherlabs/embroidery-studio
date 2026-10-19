import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { smartShape } from "../src/creative.js";
import { makeOperation } from "../src/operations.js";
import { reveal } from "./helpers/ui.mjs";
import {
  decodePes,
  declaredRect,
  streamExtents,
} from "./helpers/pes-decoder.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
await mkdir("test-results", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1580, height: 1060 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    plan = () => page.evaluate(() => window.studio.getPlan()),
    field = async (id, v) => {
      const el = page.locator("#" + id);
      await reveal(el);
      await el.fill(String(v));
      await el.press("Tab");
      await ready();
    },
    open = async (p) => {
      await page
        .locator("#file-input")
        .setInputFiles({
          name: "rounded.embstudio",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(p)),
        });
      await page.locator("#dialog-submit").click();
      await page.waitForFunction(
        (name) =>
          window.studio.getProject().name === name && window.studio.getPlan(),
        p.name,
      );
    };
  await ready();
  const shape = smartShape("rect", 18, 24);
  shape.operations = [
    {
      ...makeOperation("border", shape),
      width: 3,
      compensation: 0,
      underlay: true,
      cornerControl: true,
      tieIn: false,
      tieOff: false,
    },
  ];
  await open({
    version: 1,
    name: "Rounded satin border",
    machine: "se700",
    objects: [shape],
  });
  await page.locator(`[data-select="${shape.id}"]`).click();
  const sharp = await plan();
  await field("shape-radius", 3);
  const rounded = await plan(),
    saved = await project();
  assert.notDeepEqual(rounded.events, sharp.events);
  assert.equal(saved.objects[0].shape.radius, 3);
  assert.equal(saved.objects[0].operations[0].spacing, 0.42);
  assert(!rounded.issues.some((i) => i.code === "tight-satin-turn"));
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual((await plan()).events, sharp.events);
  await page.locator("#redo").click();
  await ready();
  assert.deepEqual((await plan()).events, rounded.events);
  await page.waitForFunction(
    () =>
      document.getElementById("save-status").textContent ===
      "Saved on this device",
  );
  await page.reload();
  await ready();
  assert.deepEqual(await project(), saved);
  await page.locator(`[data-select="${shape.id}"]`).click();
  await reveal(page.locator("#corner-min"));
  await field("corner-min", 0.5);
  assert.notDeepEqual((await plan()).events, rounded.events);
  await field("shape-radius", 0.2);
  assert(
    (await plan()).issues.some(
      (i) => i.code === "tight-satin-turn" && i.objectId === shape.id,
    ),
  );
  await field("shape-radius", 3);
  await page.screenshot({ path: "test-results/rounded-satin-border.png" });

  // Test fonts and SVG in the same browser that performs native path sampling.
  const cases = await page.evaluate(async () => {
    const { lettering, updateLettering, importSVG } = await import(
        "./src/importers.js"
      ),
      { makeOperation } = await import("./src/operations.js"),
      { roundChecked } = await import("./src/creative.js"),
      { generate } = await import("./src/engine.js"),
      { distance } = await import("./src/geometry.js");
    const p = (o) => ({
        version: 1,
        name: o.name,
        machine: "se700",
        objects: [o],
        planning: { smallDetail: 0 },
      }),
      out = [];
    for (const font of ["serif", "sans-serif", "monospace", "cursive"])
      for (const [text, size, radius] of [
        ["MTR", 14, 0.35],
        ["OBS", 8, 0.15],
        ["MTR", 4, 0.08],
      ]) {
        const o = lettering(text, size, "#6689a5", font);
        o.operations = [{ ...makeOperation("column", o), compensation: 0 }];
        const before = generate(p(o));
        roundChecked(o, radius);
        const after = generate(p(o));
        let last = null,
          max = 0;
        for (const e of after.events) {
          if (e.cmd === "stitch" && last)
            max = Math.max(max, distance(last, e));
          if (["stitch", "jump"].includes(e.cmd)) last = e;
        }
        const source = o.textSource,
          opId = o.operations[0].id;
        updateLettering(o, { font: font === "serif" ? "sans-serif" : "serif" });
        out.push({
          font,
          text,
          size,
          max,
          changed:
            JSON.stringify(before.events) !== JSON.stringify(after.events),
          stitches: after.stats.stitches,
          jumps: after.stats.jumps,
          trims: after.stats.trims,
          analyses: after.diagnostics.satin.map((d) => ({
            coverage: d.coverage,
            fallback: d.fallback,
            reason: d.reason,
          })),
          explicit: after.issues.some((i) => i.code === "satin-decomposition"),
          editable:
            !!o.textSource &&
            o.textSource.content === source.content &&
            o.operations[0].id === opId &&
            o.rounding.radius === radius,
        });
      }
    const imported = await importSVG(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path fill="#6689a5" d="M5 5H35V35H5Z M15 15V25H25V15Z" fill-rule="evenodd"/></svg>',
    );
    const vectors = Array.isArray(imported) ? imported : imported.objects;
    for (const o of vectors.filter((o) => o.type === "fill")) {
      o.operations = [{ ...makeOperation("fill", o), compensation: 0 }];
      const before = generate(p(o));
      roundChecked(o, 0.5);
      const after = generate(p(o));
      out.push({
        svg: true,
        changed: JSON.stringify(before.events) !== JSON.stringify(after.events),
        stitches: after.stats.stitches,
        fits: after.stats.fits,
      });
    }
    return out;
  });
  for (const c of cases) {
    assert(c.changed, JSON.stringify(c));
    assert(c.stitches > 0);
    if (c.svg) {
      assert(c.fits);
      continue;
    }
    assert(c.editable);
    assert(c.max <= 7.01, JSON.stringify(c));
    for (const a of c.analyses)
      assert(a.fallback ? c.explicit : a.coverage >= 0.9, JSON.stringify(c));
  }
  assert(cases.some((c) => c.svg));
  await writeFile(
    "test-results/rounded-lettering-analysis.json",
    JSON.stringify(cases, null, 2),
  );

  // Export the real UI-generated rounded border; compare every decoded needle.
  const expected = (await plan()).events.filter((e) => e.cmd === "stitch");
  await page.locator("#export").click();
  const download = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  await (await download).saveAs("test-results/rounded-density.pes");
  const dec = decodePes(await readFile("test-results/rounded-density.pes")),
    sewn = dec.pec.events.filter((e) => e.type === "stitch");
  assert.deepEqual(declaredRect(dec.pec), streamExtents(dec.pec));
  assert.equal(sewn.length, expected.length);
  sewn.forEach((e, i) => {
    assert.equal(e.x, Math.round((expected[i].x - expected[0].x) * 10) || 0);
    assert.equal(e.y, Math.round((expected[i].y - expected[0].y) * 10) || 0);
  });
  assert.deepEqual(errors, []);
  console.log(
    "Rounded density: geometry rebuild, width/spacing settings, Undo/Redo, persistence, tight-turn issues, serif/sans/script MTR/OBS, SVG counters and independent PES coordinates/origin passed.",
  );
} finally {
  await browser.close();
}
