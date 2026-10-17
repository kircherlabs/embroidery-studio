import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile, mkdir, writeFile } from "node:fs/promises";
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
      fileURLToPath(
        new URL("./fixtures/generated-artwork.svg", import.meta.url),
      ),
    );
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 191 &&
      window.studio.getPlan()?.stats?.stitches > 0,
  );
  const result = await page.evaluate(() => ({
    stats: window.studio.getPlan().stats,
    diagnostics: window.studio.getPlan().diagnostics,
    source: JSON.stringify(window.studio.getProject().objects),
  }));
  assert.equal(result.stats.uniqueColors, 5);
  assert(result.stats.colors < 25);
  assert.equal(result.stats.manualChanges, result.stats.colors - 1);
  assert.equal(result.stats.redundantStitches, 0);
  assert.equal(result.stats.zeroLength, result.stats.anchorStitches);
  assert(result.stats.stitches < 20000);
  assert(result.stats.jumps < 3627);
  assert(result.stats.trims < 1702);
  assert(result.diagnostics.skippedDetails > 0);
  assert(result.diagnostics.skippedOutlines >= 90);
  assert.match(
    await page.locator("#sequence-metrics").innerText(),
    /manual changes.*jumps/,
  );
  await page.locator("#preview-tab").click();
  await page.locator("#end").click();
  await page.keyboard.press("Escape");
  await page.locator("#toast.show").waitFor({ state: "hidden" });
  await page.screenshot({ path: "test-results/digitizing-preview.png" });
  await page.locator("#show-jumps").check();
  await page.locator("#show-events").check();
  await page.screenshot({ path: "test-results/digitizing-commands.png" });
  await page.locator(".planning-controls summary").click();
  await page.locator("#optimize-colors").uncheck();
  await page.waitForFunction(
    () =>
      window.studio.getProject().planning?.optimizeColors === false &&
      window.studio.getPlan(),
  );
  const sourceOrder = await page.evaluate(() => window.studio.getPlan().stats);
  assert(sourceOrder.colors >= result.stats.colors);
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(window.studio.getProject().objects),
    ),
    result.source,
  );
  await page.locator("#optimize-colors").check();
  await page.waitForFunction(
    () =>
      window.studio.getProject().planning?.optimizeColors &&
      window.studio.getPlan(),
  );
  await page.locator("#small-detail").fill("0");
  await page.locator("#small-detail").press("Tab");
  await page.waitForFunction(
    () =>
      window.studio.getProject().planning?.smallDetail === 0 &&
      window.studio.getPlan(),
  );
  assert.equal(
    await page.evaluate(
      () => window.studio.getPlan().diagnostics.skippedDetails,
    ),
    0,
  );
  await page.locator("#small-detail").fill("0.3");
  await page.locator("#small-detail").press("Tab");
  await page.waitForFunction(
    () =>
      window.studio.getProject().planning?.smallDetail === 0.3 &&
      window.studio.getPlan(),
  );
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(window.studio.getProject().objects),
    ),
    result.source,
  );
  if (process.env.TEST_MACHINE === "1") {
    const sourceStitches = await page.evaluate(() =>
      window.studio
        .getPlan()
        .events.filter((e) => e.cmd === "stitch")
        .map((e) => [e.x, e.y]),
    );
    await page.locator("#export").click();
    const promise = page.waitForEvent("download", { timeout: 180000 });
    await page.locator("#dialog-submit").click();
    const file = await promise;
    await file.saveAs("test-results/optimized-artwork.pes");
    assert.equal(
      (await readFile("test-results/optimized-artwork.pes"))
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
      events: window.studio.getPlan().events,
    }));
    assert.equal(decoded.stats.colors, result.stats.colors);
    assert(decoded.stats.fits);
    // The proven PEC writer may insert stationary needle anchors at jumps. Keep
    // them visible in the actual-file preview; reject any added *moving* stitch.
    let index = 0,
      anchors = 0,
      last = { x: 0, y: 0 };
    for (const e of decoded.events) {
      if (e.cmd === "stitch") {
        const next = sourceStitches[index];
        if (next && e.x === next[0] && e.y === next[1]) index++;
        else {
          assert(
            e.x === last.x && e.y === last.y,
            `Unexpected moving export stitch at ${e.x},${e.y}`,
          );
          anchors++;
        }
      }
      if (e.cmd === "stitch" || e.cmd === "jump") last = e;
    }
    assert.equal(
      index,
      sourceStitches.length,
      "PES dropped or reordered source penetrations",
    );
    assert.equal(
      anchors,
      0,
      "The explicit generator anchors should make this PES stitch sequence exact",
    );
    assert(
      decoded.stats.stitches < 36360 &&
        decoded.stats.jumps < 4954 &&
        decoded.stats.trims < 4953,
      "Actual PES output did not improve over the original pipeline",
    );
    result.export = { stats: decoded.stats, stationaryAnchors: anchors };
  }
  const report = {
    baseline: {
      stitches: 35782,
      colorBlocks: 70,
      manualChanges: 69,
      jumps: 3627,
      trims: 1702,
      zeroLength: 8589,
    },
    baselineExport: {
      stitches: 36360,
      jumps: 4954,
      trims: 4953,
      manualChanges: 69,
    },
    improved: result.stats,
    diagnostics: result.diagnostics,
    sourceOrderBlocks: sourceOrder.colors,
    export: result.export,
  };
  await writeFile(
    "test-results/digitizing-report.json",
    JSON.stringify(report, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ...report,
        diagnostics: { ...report.diagnostics, detailExamples: undefined },
      },
      null,
      2,
    ),
  );
  console.log(
    "Digitizing controls, untouched source artwork, reversible detail handling and preview diagnostics passed" +
      (process.env.TEST_MACHINE === "1"
        ? " including PES penetration-order and stationary-anchor validation."
        : "."),
  );
} finally {
  await browser.close();
}
