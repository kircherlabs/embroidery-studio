import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  decodePes,
  streamExtents,
  declaredRect,
  modelMachineSizeMm,
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
      fileURLToPath(new URL("./fixtures/HayDave.fixed.pes", import.meta.url)),
    );
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.some((o) => o.type === "manual") &&
      window.studio.getPlan(),
    {},
    { timeout: 180000 },
  );
  const before = await page.evaluate(() => ({
    stats: window.studio.getPlan().stats,
    points: window.studio
      .getPlan()
      .events.filter((e) => e.cmd === "stitch")
      .map((e) => [e.x, e.y]),
  }));
  assert(Math.abs(before.stats.bounds.width - 75.2) < 0.01);
  assert(Math.abs(before.stats.bounds.height - 40.4) < 0.01);
  assert(before.stats.fits);
  await page.locator("#export").click();
  const pending = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  await (await pending).saveAs("test-results/HayDave-reexport.pes");
  await page.waitForFunction(() =>
    document.getElementById("sequence-source").textContent.includes("decoded"),
  );
  const bytes = await readFile("test-results/HayDave-reexport.pes"),
    dec = decodePes(bytes),
    ext = streamExtents(dec.pec);
  assert.deepEqual(declaredRect(dec.pec), ext);
  assert.deepEqual(modelMachineSizeMm(dec.pec), {
    widthMm: 75.2,
    heightMm: 40.4,
  });
  const stitches = dec.pec.events.filter((e) => e.type === "stitch");
  assert.equal(stitches.length, before.points.length);
  const ax = before.points[0][0],
    ay = before.points[0][1];
  stitches.forEach((e, i) => {
    assert.equal(e.x, Math.round((before.points[i][0] - ax) * 10) || 0);
    assert.equal(e.y, Math.round((before.points[i][1] - ay) * 10) || 0);
  });
  const after = await page.evaluate(() =>
    window.studio
      .getPlan()
      .events.filter((e) => e.cmd === "stitch")
      .map((e) => [e.x || 0, e.y || 0]),
  );
  assert.deepEqual(
    after,
    before.points.map((p) => p.map((n) => n || 0)),
  );
  assert.deepEqual(errors, []);
  const report = {
    widthMm: dec.pec.declaredWidth / 10,
    heightMm: dec.pec.declaredHeight / 10,
    origin: [dec.pec.originFieldX, dec.pec.originFieldY],
    stitches: stitches.length,
    previewPositionsPreserved: true,
  };
  await writeFile(
    "test-results/pes-compatibility-report.json",
    JSON.stringify(report, null, 2),
  );
  await page.screenshot({ path: "test-results/pes-compatibility-preview.png" });
  console.log(report);
} finally {
  await browser.close();
}
