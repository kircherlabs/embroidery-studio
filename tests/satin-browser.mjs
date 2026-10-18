import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
  await page.waitForFunction(() => window.studio?.getPlan());
  const cases = await page.evaluate(async () => {
    const { lettering } = await import("./src/importers.js"),
      { makeOperation } = await import("./src/operations.js"),
      { generate } = await import("./src/engine.js"),
      { safeConnector, distance, fillPolygons } = await import(
        "./src/geometry.js"
      );
    const out = [];
    for (const font of ["serif", "sans-serif", "monospace", "cursive"])
      for (const content of ["MTR", "OBS"]) {
        const o = lettering(content, 14, "#000000", font);
        o.operations = [
          {
            ...makeOperation("column", o),
            tieIn: false,
            tieOff: false,
            compensation: 0,
          },
        ];
        const p = {
            version: 1,
            name: `${font} ${content}`,
            machine: "se700",
            objects: [o],
            planning: { smallDetail: 0 },
          },
          plan = generate(p),
          holes = fillPolygons(o.rings, o.fillRule).flatMap((poly) =>
            poly.slice(1).map((r) => r.map(([x, y]) => ({ x, y }))),
          );
        const material = fillPolygons(o.rings, o.fillRule).map((poly) =>
          poly.map((r) => r.map(([x, y]) => ({ x, y }))),
        );
        let previous = null,
          longest = 0,
          crosses = 0;
        const bad = [],
          angles = new Set();
        for (const e of plan.events) {
          if (e.cmd === "stitch" && previous) {
            longest = Math.max(longest, distance(previous, e));
            if (
              !material.some((rings) =>
                safeConnector(
                  previous,
                  e,
                  rings,
                  0.11,
                  rings.slice(1),
                  "nonzero",
                ),
              )
            ) {
              crosses++;
              if (bad.length < 12) bad.push({ previous, e });
            }
            if (e.phase === "satin-stroke" && distance(previous, e) > 0.5) {
              const a =
                (Math.atan2(e.y - previous.y, e.x - previous.x) + Math.PI) %
                Math.PI;
              angles.add(Math.floor(a / (Math.PI / 12)));
            }
          }
          if (["stitch", "jump"].includes(e.cmd)) previous = e;
        }
        const simple = (mode) => {
          o.operations[0].columnMode = mode;
          const r = generate(p);
          return {
            stitches: r.stats.stitches,
            jumps: r.stats.jumps,
            trims: r.stats.trims,
          };
        };
        const directional = simple("directional");
        o.operations[0].type = "fill";
        const tatami = generate(p);
        o.operations[0].type = "column";
        o.operations[0].columnMode = "stroke";
        out.push({
          font,
          content,
          project: p,
          events: plan.events,
          stats: plan.stats,
          crosses,
          bad,
          longest,
          angleBins: angles.size,
          analysis: plan.diagnostics.satin.map((d) => ({
            coverage: d.coverage,
            overlap: d.overlap,
            fallback: d.fallback,
            reason: d.reason,
            sections: d.strokes.length,
          })),
          directional,
          tatami: {
            stitches: tatami.stats.stitches,
            jumps: tatami.stats.jumps,
            trims: tatami.stats.trims,
          },
        });
      }
    return out;
  });
  const report = cases.map(({ events, project, ...c }) => c);
  await writeFile(
    "test-results/satin-comparison.json",
    JSON.stringify(report, null, 2),
  );
  for (const c of cases) {
    assert(c.stats.fits);
    assert.equal(
      c.crosses,
      0,
      `${c.font} ${c.content}: stitches cross a counter`,
    );
    assert(c.longest <= 7.001);
    assert(
      c.angleBins >= 5,
      `${c.font} ${c.content}: directions did not follow strokes`,
    );
    if (c.content === "MTR")
      assert(
        c.analysis.every((d) => !d.fallback),
        JSON.stringify(c.analysis),
      );
    assert(c.analysis.filter((d) => !d.fallback).length >= 2);
    assert(
      c.analysis.every(
        (d) => d.fallback || (d.coverage >= 0.9 && d.overlap <= 0.15),
      ),
    );
    assert(c.stats.jumps < 100, JSON.stringify(c.stats));
    assert.notEqual(c.stats.stitches, c.directional.stitches);
    assert.notEqual(c.stats.stitches, c.tatami.stitches);
  }
  // Independent PEC and PES readers: every actual needle coordinate, orientation,
  // dimensions and repaired origin must agree with the generated preview stream.
  for (const c of cases) {
    const r = spawnSync(
      process.env.PYTHON || "python",
      [fileURLToPath(new URL("./pes-codec-adapter.py", import.meta.url))],
      {
        input: JSON.stringify({
          payload: { name: c.project.name, events: c.events },
        }),
        maxBuffer: 16000000,
      },
    );
    assert.equal(r.status, 0, r.stderr?.toString());
    const exported = JSON.parse(r.stdout),
      decoded = decodePes(Uint8Array.from(exported.bytes)),
      ext = streamExtents(decoded.pec),
      stitches = c.events.filter((e) => e.cmd === "stitch"),
      read = decoded.pec.events.filter((e) => e.type === "stitch");
    assert.deepEqual(declaredRect(decoded.pec), ext);
    assert.equal(decoded.pec.originFieldX, -ext.left || 0);
    assert.equal(decoded.pec.originFieldY, -ext.top || 0);
    assert.equal(read.length, stitches.length);
    const start = stitches[0];
    for (let i = 0; i < read.length; i++) {
      assert.equal(
        read[i].x,
        Math.round(stitches[i].x * 10) - Math.round(start.x * 10),
      );
      assert.equal(
        read[i].y,
        Math.round(stitches[i].y * 10) - Math.round(start.y * 10),
      );
    }
    assert.deepEqual(
      exported.preview.filter((e) => e.cmd === "stitch").map((e) => [e.x, e.y]),
      stitches.map((e) => [e.x, e.y]),
    );
    await writeFile(
      `test-results/satin-${c.font}-${c.content}.pes`,
      Buffer.from(exported.bytes),
    );
  }
  // Editing the SAME live lettering object and operation: guides, font switching,
  // undo, reload, legacy mode and keyboard/touch-accessible numerical guides.
  const p = cases.find(
      (c) => c.font === "serif" && c.content === "MTR",
    ).project,
    id = p.objects[0].id;
  await page.locator("#file-input").setInputFiles({
    name: "Satin.embstudio",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    (name) =>
      window.studio.getProject().name === name && window.studio.getPlan(),
    p.name,
  );
  await page.locator(`[data-select="${id}"]`).click();
  assert.equal(await page.locator("#column-mode").inputValue(), "stroke");
  assert.equal(await page.locator("#angle").count(), 0);
  await page.locator("#satin-guide-edit").click();
  const plan = await page.evaluate(() => window.studio.getPlan()),
    q = plan.diagnostics.satin
      .flatMap((d) => d.strokes)
      .flatMap((s) => s.sections)
      .find((q) => q.width > 1.2 && q.width < 3);
  const world = async (p) =>
    page.evaluate((p) => {
      const r = document.getElementById("stage").getBoundingClientRect(),
        v = window.studio.getView();
      return {
        x: r.x + v.center.x + p.x * v.scale,
        y: r.y + v.center.y + p.y * v.scale,
      };
    }, p);
  const a = await world(q.a),
    b = await world(q.b);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects[0].operations[0].satinGuides
        ?.length === 1 && window.studio.getPlan(),
  );
  const guided = await page.evaluate(() => window.studio.getProject());
  assert.equal(guided.objects[0].id, id);
  assert.equal(guided.objects[0].textSource.content, "MTR");
  const endpoint = guided.objects[0].operations[0].satinGuides[0].b,
    beforeEndpoint = await world(endpoint),
    afterEndpoint = await world({ x: endpoint.x + 0.4, y: endpoint.y + 0.3 });
  await page.mouse.move(beforeEndpoint.x, beforeEndpoint.y);
  await page.mouse.down();
  await page.mouse.move(afterEndpoint.x, afterEndpoint.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(
    (x) =>
      Math.abs(
        window.studio.getProject().objects[0].operations[0].satinGuides[0].b.x -
          x,
      ) > 0.2 && window.studio.getPlan(),
    endpoint.x,
  );
  await page.locator("#undo").click();
  await page.waitForFunction(() => window.studio.getPlan());
  assert.deepEqual(
    (await page.evaluate(() => window.studio.getProject())).objects[0]
      .operations[0].satinGuides,
    guided.objects[0].operations[0].satinGuides,
  );
  await page.locator(`[data-select="${id}"]`).click();
  await page.locator("#satin-guide-edit").click();
  await page.locator("#live-font").selectOption("sans-serif");
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects[0].textSource.font === "sans-serif" &&
      window.studio.getPlan(),
  );
  assert.deepEqual(
    (await page.evaluate(() => window.studio.getProject())).objects[0]
      .operations[0].satinGuides,
    guided.objects[0].operations[0].satinGuides,
  );
  await page.locator("#undo").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects[0].textSource.font === "serif" &&
      window.studio.getPlan(),
  );
  await page.waitForFunction(
    () =>
      localStorage.getItem("embroidery-studio-v1") ===
      JSON.stringify(window.studio.getProject()),
  );
  await page.reload();
  await page.waitForFunction(() => window.studio?.getPlan());
  await page.locator(`[data-select="${id}"]`).click();
  assert.equal(
    (await page.evaluate(() => window.studio.getProject())).objects[0]
      .operations[0].satinGuides.length,
    1,
  );
  await page.locator("#column-mode").selectOption("directional");
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects[0].operations[0].columnMode ===
        "directional" && window.studio.getPlan(),
  );
  assert.equal(await page.locator("#angle").count(), 1);
  await page.locator("#undo").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects[0].operations[0].columnMode ===
        "stroke" && window.studio.getPlan(),
  );
  await page.locator(`[data-select="${id}"]`).click();
  await page.locator("#satin-structure").check();
  await page.screenshot({ path: "test-results/satin-stroke-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toggle-inspector").click();
  await page.locator("#column-mode").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/satin-stroke-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      report.map((c) => ({
        font: c.font,
        text: c.content,
        stitches: c.stats.stitches,
        jumps: c.stats.jumps,
        trims: c.stats.trims,
        sections: c.analysis.reduce((n, d) => n + d.sections, 0),
        minCoverage: Math.min(...c.analysis.map((d) => d.coverage)),
      })),
      null,
      2,
    ),
  );
  console.log(
    "Stroke satin: four font families, MTR/OBS rails, counters, travel, independent PES coordinates/origin, live guides/fonts, undo, persistence and mobile passed.",
  );
} finally {
  await browser.close();
}
