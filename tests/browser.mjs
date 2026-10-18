// npm install --no-save playwright@1.56.1 && npx playwright install chromium
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.STUDIO_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
await mkdir("test-results", { recursive: true });
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(
    () => window.studio?.getPlan()?.stats?.stitches > 0,
  );
  const initial = await page.evaluate(
    () => window.studio.getProject().objects.length,
  );
  assert.equal(initial, 12);
  await page.screenshot({ path: "test-results/desktop.png" });
  await page.locator("[data-select]").last().click();
  await page.locator("#spacing").fill("0.6");
  await page.locator("#spacing").press("Tab");
  await page.waitForFunction(
    () =>
      window.studio.getPlan() &&
      window.studio.getProject().objects.at(-1).spacing === 0.6,
  );
  await page.locator("#undo").click();
  await page.waitForFunction(
    () =>
      window.studio.getPlan() &&
      window.studio.getProject().objects.at(-1).spacing === 0.4,
  );
  await page.locator("#redo").click();
  await page.waitForFunction(
    () =>
      window.studio.getPlan() &&
      window.studio.getProject().objects.at(-1).spacing === 0.6,
  );
  await page.locator("#preview-tab").click();
  await page.locator("#rewind").click();
  assert.match(await page.locator("#stitch-counter").innerText(), /^0 \/ /);
  await page.locator("#step-next").click();
  assert.match(await page.locator("#stitch-counter").innerText(), /^1 \/ /);
  await page.locator("#play").click();
  await page.waitForFunction(
    () => Number(document.getElementById("timeline").value) > 100,
  );
  await page.locator("#play").click();
  await page.locator("#design-tab").click();
  await page.locator("#text-tool").click();
  await page.locator("#text-value").fill("DK");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    (n) =>
      window.studio.getPlan() &&
      window.studio.getProject().objects.length === n + 1,
    initial,
  );
  const lettering = await page.evaluate(() =>
    window.studio.getProject().objects.at(-1),
  );
  assert.equal(lettering.name, "DK");
  assert(lettering.rings.length >= 3);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(10,10)" fill="#b74b59"><path fill-rule="evenodd" d="M0 0H80V80H0Z M20 20H60V60H20Z"/></g><script>window.injected=true</script></svg>';
  await page.locator("#file-input").setInputFiles({
    name: "hole.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(svg),
  });
  await page.waitForFunction(
    (n) =>
      window.studio.getPlan() &&
      window.studio.getProject().objects.length === n + 2,
    initial,
  );
  assert.equal(await page.evaluate(() => window.injected), undefined);
  const imported = await page.evaluate(() =>
    window.studio.getProject().objects.at(-1),
  );
  assert.equal(imported.rings.length, 2);
  assert.equal(imported.color, "#b74b59");
  // SVG import selects its parent; its original region remains independently editable.
  await page.locator(`[data-select="${imported.id}"]`).click();
  await page.locator("#convert-manual").click();
  await page.waitForFunction(
    () =>
      window.studio.getPlan() &&
      window.studio.getProject().objects.at(-1).type === "manual",
  );
  await page.locator("#manual-index").fill("3");
  await page.locator("#manual-index").press("Tab");
  await page.locator("#manual-x").fill("1.2");
  await page.locator("#manual-x").press("Tab");
  await page.waitForFunction(
    () =>
      window.studio.getPlan() &&
      window.studio.getProject().objects.at(-1).commands[2].x === 1.2,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const saved = await downloadPromise;
  await saved.saveAs("test-results/saved.embstudio");
  const project = JSON.parse(
    await readFile("test-results/saved.embstudio", "utf8"),
  );
  assert(project.objects.length === 14);
  await page.reload();
  await page.waitForFunction(
    () => window.studio?.getPlan()?.stats?.stitches > 0,
  );
  assert.equal(
    await page.evaluate(() => window.studio.getProject().objects.length),
    14,
  );
  // Isolate the demo for a reproducible actual WASM/PES export, if requested.
  if (process.env.TEST_MACHINE === "1") {
    await page.locator("#quick-flower").click();
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      () =>
        window.studio.getPlan() &&
        window.studio.getProject().objects.length === 12,
    );
    await page.locator("#export").click();
    const machineDownload = page.waitForEvent("download", { timeout: 180000 });
    await page.locator("#dialog-submit").click();
    const file = await machineDownload;
    await file.saveAs("test-results/browser-export.pes");
    const bytes = await readFile("test-results/browser-export.pes");
    assert.equal(bytes.subarray(0, 8).toString(), "#PES0060");
    await page.waitForFunction(() =>
      document
        .getElementById("sequence-source")
        .textContent.includes("decoded"),
    );
    assert.equal(await page.evaluate(() => window.studio.getMode()), "preview");
    await page.locator("#design-tab").click();
    await page.waitForFunction(
      () =>
        window.studio.getPlan() &&
        window.studio.getPlan().events[0]?.phase !== "machine",
    );
    await page
      .locator("#file-input")
      .setInputFiles(resolve("test-results/browser-export.pes"));
    await page.waitForFunction(() =>
      window.studio
        .getProject()
        .objects.some((o) => o.name.startsWith("browser-export.pes")),
    );
  }
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(base);
  await mobile.waitForFunction(
    () => window.studio?.getPlan()?.stats?.stitches > 0,
  );
  assert(await mobile.locator("#export").isVisible());
  await mobile.locator("#toggle-sequence").click();
  assert(await mobile.locator("#play").isVisible());
  assert(await mobile.locator("#stage").isVisible());
  assert(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mobile.locator("#toggle-layers").click();
  assert(await mobile.locator("#object-list").isVisible());
  await mobile.locator("[data-select]").last().click();
  await mobile.locator("#toggle-inspector").click();
  assert(await mobile.locator("#spacing").isVisible());
  await mobile.locator("#toggle-inspector").click();
  await mobile.screenshot({ path: "test-results/mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Browser integration passed: editing, history, lettering, SVG security/holes, manual stitches, save/reload, playback and mobile" +
      (process.env.TEST_MACHINE === "1"
        ? ", actual WASM PES export/import"
        : ""),
  );
} finally {
  await browser.close();
}
