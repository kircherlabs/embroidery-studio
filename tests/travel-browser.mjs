import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, readFile } from "node:fs/promises";
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
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.studio?.getPlan());
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await page
    .locator("#file-input")
    .setInputFiles(
      fileURLToPath(new URL("./fixtures/picsvg-outline.svg", import.meta.url)),
    );
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 11 &&
      window.studio.getPlan()?.stats?.stitches > 0,
  );
  const result = await page.evaluate(async () => {
    const { preparePlan } = await import("./src/planning.js"),
      { fillRows } = await import("./src/engine.js");
    const project = window.studio.getProject(),
      plan = window.studio.getPlan(),
      prepared = preparePlan(project);
    const point = (e) => Math.round(e.x * 10) + "," + Math.round(e.y * 10);
    const sewn = new Map();
    for (const e of plan.events.filter((e) => e.cmd === "stitch")) {
      if (!sewn.has(e.objectId)) sewn.set(e.objectId, new Set());
      sewn.get(e.objectId).add(point(e));
    }
    let required = 0,
      missing = 0;
    for (const o of prepared.units)
      for (const row of fillRows(
        o.rings,
        o.spacing,
        o.angle,
        o.length,
        o.compensation,
        o.fillRule,
      )) {
        if (new Set(row.map(point)).size < 2) continue;
        for (const q of row) {
          required++;
          if (!sewn.get(o.id)?.has(point(q))) missing++;
        }
      }
    const runs = plan.events
      .filter((e) => e.cmd === "stitch")
      .map((e) => e.objectId)
      .filter((id, i, a) => !i || a[i - 1] !== id);
    return {
      stats: plan.stats,
      diagnostics: plan.diagnostics,
      source: JSON.stringify(project.objects),
      runs,
      required,
      missing,
    };
  });
  assert.equal(
    result.missing,
    0,
    "Fill routing lost a required needle position",
  );
  assert(result.required > 1000);
  assert.equal(result.runs.length, 11);
  assert.equal(new Set(result.runs).size, 11, "An object was revisited");
  assert.equal(result.stats.colors, 1);
  assert(result.stats.jumps <= 16);
  assert(result.stats.trims <= 15);
  assert.equal(result.stats.jumpBreakdown.betweenObjects, 10);
  assert.equal(result.stats.jumpBreakdown.initial, 1);
  assert(result.stats.jumpBreakdown.withinRegions <= 5);
  assert.equal(result.diagnostics.skippedDetails, 0);
  assert.equal(result.diagnostics.skippedOutlines, 0);
  assert.equal(result.stats.redundantStitches, 0);
  assert(result.stats.maxLength <= 7);
  assert.equal(
    Object.values(result.stats.jumpBreakdown).reduce((a, b) => a + b, 0),
    result.stats.jumps,
  );
  await page.locator("#preview-tab").click();
  await page.locator("#end").click();
  await page.keyboard.press("Escape");
  await page.locator("#toast.show").waitFor({ state: "hidden" });
  if (!(await page.locator(".object-sequence").evaluate((el) => el.open)))
    await page.locator(".object-sequence > summary").click();
  assert.equal(
    await page.locator("#sewing-order [data-object-step]").count(),
    11,
  );
  await page.screenshot({ path: "test-results/travel-outline-preview.png" });
  await page.locator("#show-jumps").check();
  await page.locator("#show-events").check();
  assert.equal(
    await page.evaluate(() => window.studio.getPlan().stats.jumps),
    result.stats.jumps,
    "Visibility changed the machine plan",
  );
  await page.screenshot({ path: "test-results/travel-outline-commands.png" });
  await page.locator(".object-select").first().click();
  await page.locator("#sequence-locked").check();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects[0].sequenceLocked &&
      window.studio.getPlan(),
  );
  await page.locator("#undo").click();
  await page.waitForFunction(
    () =>
      !window.studio.getProject().objects[0].sequenceLocked &&
      window.studio.getPlan(),
  );
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(window.studio.getProject().objects),
    ),
    result.source,
  );
  if (process.env.TEST_MACHINE === "1") {
    const positions = await page.evaluate(() =>
      window.studio
        .getPlan()
        .events.filter((e) => e.cmd === "stitch")
        .map((e) => [e.x, e.y]),
    );
    await page.locator("#export").click();
    const download = page.waitForEvent("download", { timeout: 180000 });
    await page.locator("#dialog-submit").click();
    await (await download).saveAs("test-results/outline-routing.pes");
    assert.equal(
      (await readFile("test-results/outline-routing.pes"))
        .subarray(0, 8)
        .toString(),
      "#PES0060",
    );
    await page.waitForFunction(() =>
      document
        .getElementById("sequence-source")
        .textContent.includes("decoded"),
    );
    const decoded = await page.evaluate(() => ({
      stats: window.studio.getPlan().stats,
      positions: window.studio
        .getPlan()
        .events.filter((e) => e.cmd === "stitch")
        .map((e) => [e.x, e.y]),
    }));
    // Signed JavaScript zero is the same physical machine coordinate as zero.
    assert.deepEqual(
      decoded.positions,
      positions.map((row) => row.map((n) => n || 0)),
      "The exported PES changed the planned penetrations",
    );
    assert(decoded.stats.jumps < 30 && decoded.stats.trims < 30);
    assert.equal(decoded.stats.colors, 1);
    assert.match(
      await page.locator(".travel-summary").innerText(),
      /Decoded file.*Object origins are unavailable/,
    );
    result.export = decoded.stats;
  }
  assert.deepEqual(errors, []);
  const report = {
    baselineExport: { stitches: 5417, jumps: 694, trims: 693 },
    baseline: {
      stitches: 5417,
      jumps: 694,
      trims: 463,
      initial: 1,
      betweenObjects: 10,
      withinRegions: 683,
    },
    generated: result.stats,
    export: result.export,
    sourceObjects: 11,
    requiredFillPositions: result.required,
    missingFillPositions: result.missing,
  };
  await writeFile(
    "test-results/travel-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  console.log(
    "Exact 11-object SVG: full fill coverage, contiguous objects, pin/undo, command counts and preview passed" +
      (result.export ? " including real PES export." : "."),
  );
} finally {
  await browser.close();
}
