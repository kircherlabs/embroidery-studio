import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import {
  qualityFixtures,
  manualRing,
  autoLetter,
  project as fixtureProject,
} from "./helpers/quality-fixtures.mjs";
import { reveal } from "./helpers/ui.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
await mkdir("test-results", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1050 },
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  await ready();
  const source = qualityFixtures().narrowNeck;
  delete source.planning.qualitySafeguards;
  const open = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "quality.embstudio",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      ({ name, id }) =>
        window.studio.getProject().name === name &&
        window.studio.getPlan()?.events.some((e) => e.objectId === id),
      { name: p.name, id: p.objects[0].id },
    );
  };
  await open(source);
  const plan = () => page.evaluate(() => window.studio.getPlan());
  const project = () => page.evaluate(() => window.studio.getProject());
  const legacy = (await plan()).events;
  await reveal(page.locator("#quality-safeguards"));
  assert(!(await page.locator("#quality-safeguards").isChecked()));
  await page.locator("#quality-safeguards").check();
  await page.waitForFunction(() => window.studio.getPlan()?.stats.jumps > 1);
  assert((await plan()).stats.jumps > 1);
  assert.equal(
    JSON.stringify((await project()).objects),
    JSON.stringify(source.objects),
  );
  const revised = (await plan()).events;
  await page.locator("#undo").click();
  await page.waitForFunction(() => window.studio.getPlan()?.stats.jumps === 1);
  assert.deepEqual((await plan()).events, legacy);
  await page.locator("#redo").click();
  await page.waitForFunction(() => window.studio.getPlan()?.stats.jumps > 1);
  assert.deepEqual((await plan()).events, revised);
  const download = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const saved = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  assert(saved.planning.qualitySafeguards);
  saved.name = "Reopened quality reference";
  await open(saved);
  assert.deepEqual((await plan()).events, revised);
  await page.locator("#preview-tab").click();
  await page.screenshot({ path: "test-results/quality-routing-preview.png" });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await reveal(page.locator("#quality-safeguards"));
    if (!(await page.locator("#quality-safeguards").isVisible()))
      await page.locator("#toggle-layers").click();
    const box = await page.locator("#quality-safeguards").boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= width);
  }
  await page.setViewportSize({ width: 1500, height: 1050 });
  for (const [name, art] of [
    ["Manual satin quality", manualRing(2, 1.6)],
    ["Automatic satin quality", autoLetter()],
  ]) {
    const fixture = fixtureProject([art]);
    fixture.name = name;
    await open(fixture);
    const original = await plan(),
      sourceObjects = JSON.stringify((await project()).objects);
    await reveal(page.locator("#quality-safeguards"));
    await page.locator("#quality-safeguards").check();
    if (name.startsWith("Manual"))
      await page.waitForFunction(
        () => window.studio.getPlan()?.stats.jumps === 1,
      );
    else
      await page.waitForFunction(
        () => window.studio.getPlan()?.stats.travelStitches === 0,
      );
    const improved = await plan();
    const needles = (p) =>
      p.events
        .filter(
          (e) =>
            ["satin-rails", "satin-stroke"].includes(e.phase) &&
            e.cmd === "stitch",
        )
        .map((e) => [e.x, e.y]);
    assert.deepEqual(needles(improved), needles(original));
    assert.equal(JSON.stringify((await project()).objects), sourceObjects);
    if (name.startsWith("Manual"))
      assert(improved.stats.jumps < original.stats.jumps);
    else assert(improved.stats.travelStitches < original.stats.travelStitches);
  }
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 0 &&
      window.studio.getPlan()?.stats.stitches === 0,
  );
  assert((await project()).planning.qualitySafeguards);
  await page.reload();
  await ready();
  assert((await project()).planning.qualitySafeguards);
  assert.deepEqual(errors, []);
  console.log(
    "Stitch quality: legacy opt-in, actual revised routing, unchanged artwork, history, portable reload, new-design default and responsive controls passed.",
  );
} finally {
  await browser.close();
}
