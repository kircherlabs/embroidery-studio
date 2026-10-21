import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { object, validateProject } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
import { decodePes } from "./helpers/pes-decoder.mjs";
import { normalizeThread } from "../src/thread-records.js";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
await mkdir("test-results", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1450, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    load = async (p) => {
      validateProject(p);
      await page.locator("#file-input").setInputFiles({
        name: "threads.embstudio",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(p)),
      });
      await page.locator("#dialog-submit").click();
      await page.waitForFunction(
        (n) => window.studio.getProject().name === n,
        p.name,
      );
      await ready();
      await page.evaluate(async () => {
        const { loadThreads, saveThreads } = await import(
          "./src/thread-store.js"
        );
        const d = await loadThreads();
        d.preferences.includeBuiltins = false;
        await saveThreads(d);
      });
    };
  const importCatalog = async (name, body) => {
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#thread-management").evaluate((el) => (el.open = true));
    await page.locator("#thread-import").click();
    await (
      await chooser
    ).setFiles({
      name,
      mimeType: name.endsWith(".json") ? "application/json" : "text/plain",
      buffer: Buffer.from(body),
    });
    await page.locator("#catalog-preview-button").waitFor();
  };
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await ready();
  const o = object(
    "Thread circle",
    [
      [
        { x: -8, y: -6 },
        { x: 8, y: -6 },
        { x: 8, y: 6 },
        { x: -8, y: 6 },
      ],
    ],
    { color: "#ee44aa" },
  );
  o.operations = [makeOperation("fill", o), makeOperation("border", o)];
  o.operations[1].color = "#102080";
  const original = structuredClone(o),
    p = {
      version: 1,
      name: "Physical thread fixture",
      machine: "se700",
      objects: [o],
    };
  await load(p);
  await page.locator(`[data-select="${o.id}"]`).click();
  await page.locator(`[data-operation="${o.operations[1].id}"]`).click();
  await page.locator("[data-thread-pick]").click();
  await page.keyboard.press("Control+z");
  assert.equal(
    (await project()).name,
    "Physical thread fixture",
    "Modal shortcuts cannot undo project history",
  );
  await importCatalog(
    "Personal-test.csv",
    "Brand,Product Line,Code,Color Name,Hex,Material,Weight\nNew brothread,Personal fixture,001,Personal white,#f4f4f4,polyester,40 wt\nSimthread,Personal fixture,001,Personal blue,#123456,polyester,40 wt\nBrother,Personal fixture,001,Personal red,#e04060,polyester,40 wt\n",
  );
  await page.locator("#catalog-preview-button").click();
  assert.match(
    await page.locator("#catalog-status").innerText(),
    /3 valid entries/,
  );
  await page.locator("#catalog-apply").click();
  await page.locator("#thread-search").waitFor();
  assert.equal(await page.locator(".thread-result").count(), 3);
  await page.locator("#thread-brand").selectOption("newbrothread");
  await page
    .locator("#thread-line")
    .selectOption("newbrothread|personal-fixture");
  await page.locator("#thread-management").evaluate((el) => (el.open = true));
  await page.locator("#thread-prefer").click();
  await page.locator(".thread-result").click();
  await page
    .locator("#thread-detail summary")
    .filter({ hasText: "Source & accuracy" })
    .click();
  assert.match(
    await page.locator("#thread-detail").innerText(),
    /user-imported/,
  );
  await page.locator("#thread-use").click();
  await ready();
  let saved = await project(),
    border = saved.objects[0].operations[1];
  assert.equal(border.physicalThread.thread.number, "001");
  assert.equal(border.physicalThread.thread.brandId, "newbrothread");
  assert.equal(border.physicalThread.designColor, "#102080");
  assert.equal(border.color, "#f4f4f4");
  assert.deepEqual(saved.objects[0].rings, original.rings);
  assert.deepEqual(saved.objects[0].operations[0], original.operations[0]);
  assert.equal(
    saved.objects[0].operations[1].spacing,
    original.operations[1].spacing,
  );
  const stitchPlan = await page.evaluate(() => window.studio.getPlan());
  await page.locator("#export").click();
  await page.locator("#export-format").selectOption("pes");
  const download = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  const file = await download;
  const pes = decodePes(new Uint8Array(await readFile(await file.path())));
  assert.equal(
    pes.pec.declaredWidth,
    Math.round(stitchPlan.stats.bounds.width * 10),
  );
  assert.equal(
    pes.pec.declaredHeight,
    Math.round(stitchPlan.stats.bounds.height * 10),
  );
  await page.waitForFunction(() =>
    document.getElementById("sequence-source").textContent.includes("decoded"),
  );
  const encodedNeedles = await page.evaluate(() =>
    window.studio.getPlan().events.filter((e) => e.cmd === "stitch"),
  );
  const sourceNeedles = stitchPlan.events.filter((e) => e.cmd === "stitch");
  assert.equal(encodedNeedles.length, sourceNeedles.length);
  for (let i = 0; i < sourceNeedles.length; i++) {
    assert.ok(Math.abs(encodedNeedles[i].x - sourceNeedles[i].x) <= 0.11);
    assert.ok(Math.abs(encodedNeedles[i].y - sourceNeedles[i].y) <= 0.11);
  }
  assert.equal(
    (await project()).objects[0].operations[1].physicalThread.thread.number,
    "001",
  );
  await page.locator("#undo").click();
  await ready();
  assert.equal(
    (await project()).objects[0].operations[1].physicalThread,
    undefined,
  );
  await page.locator("#redo").click();
  await ready();
  assert.equal(
    (await project()).objects[0].operations[1].physicalThread.thread.number,
    "001",
  );
  await page.locator("#save-project").click();
  await page.waitForTimeout(450);
  await page.reload();
  await ready();
  assert.equal(
    (await project()).objects[0].operations[1].physicalThread.thread.number,
    "001",
  );
  await page.locator("#thread-library").click();
  assert.equal(
    await page.locator("#thread-brand").inputValue(),
    "newbrothread",
  );
  assert.equal(
    await page.locator("#thread-line").inputValue(),
    "newbrothread|personal-fixture",
  );
  await page.locator("#thread-management").evaluate((el) => (el.open = true));
  await page.locator("#thread-remove-line").click();
  await page.locator("#thread-remove-confirm").click();
  await page.locator("#thread-search").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  assert.equal(
    (await project()).objects[0].operations[1].physicalThread.thread.number,
    "001",
  );
  await load({ ...saved, name: "Catalog-independent saved thread" });
  assert.equal(
    (await project()).objects[0].operations[1].physicalThread.thread.brandName,
    "New brothread",
  );
  await page.locator(`[data-select="${o.id}"]`).click();
  await page.locator(`[data-operation="${o.operations[1].id}"]`).click();
  assert.match(
    await page.locator(".physical-thread-controls").innerText(),
    /New brothread.*001/,
  );
  await page.locator("[data-thread-clear]").click();
  await ready();
  assert.equal((await project()).objects[0].operations[1].color, "#102080");
  await page.locator("#thread-library").click();
  await page.locator("#thread-manual").click();
  await page.locator("#manual-thread-brand").fill("New brothread");
  await page.locator("#manual-thread-line").fill("My own spools");
  await page.locator("#manual-thread-number").fill("A009");
  await page.locator("#manual-thread-name").fill("Label only");
  await page.locator("#manual-thread-name").press("Enter");
  await page.locator("#thread-search").waitFor();
  await page.locator("#thread-brand").selectOption("newbrothread");
  await page.locator("#thread-line").selectOption("newbrothread|my-own-spools");
  assert.equal(await page.locator(".physical-swatch.unknown").count(), 2);
  assert.match(
    await page.locator("#thread-detail").innerText(),
    /No HEX reference/,
  );
  await importCatalog(
    "Personal.gpl",
    "GIMP Palette\nName: Own palette\nColumns: 2\n244 244 244 001 White\n18 52 86 S001 Blue\n",
  );
  await page.locator("#catalog-brand").fill("My palette brand");
  await page.locator("#catalog-line").fill("Own chart");
  await page.locator("#catalog-number-prefix").check();
  await page.locator("#catalog-preview-button").click();
  assert.match(
    await page.locator("#catalog-status").innerText(),
    /2 valid entries/,
  );
  await page.locator("#catalog-apply").click();
  await page.locator("#thread-search").waitFor();
  const large = Array.from({ length: 5000 }, (_, i) =>
    normalizeThread({
      brandName: "Synthetic performance fixture",
      lineName: "Synthetic colors",
      number: String(i).padStart(6, "0"),
      colorName: "Fixture color " + i,
      hex: "#" + ((i * 127) % 16777216).toString(16).padStart(6, "0"),
    }),
  );
  await importCatalog(
    "Synthetic-5000.json",
    JSON.stringify({ records: large }),
  );
  const start = Date.now();
  await page.locator("#catalog-preview-button").click();
  await page.locator("#catalog-apply").click();
  await page.locator("#thread-search").waitFor();
  const ms = Date.now() - start;
  await page
    .locator("#thread-brand")
    .selectOption("synthetic-performance-fixture");
  assert.equal(await page.locator(".thread-result").count(), 50);
  assert.match(
    await page.locator("#thread-result-count").innerText(),
    /5,000 entries/,
  );
  await page.locator("#thread-next").click();
  assert.match(
    await page.locator("#thread-result-count").innerText(),
    /page 2/,
  );
  await page.locator("#thread-search").fill("004999");
  await page.waitForFunction(
    () => document.querySelectorAll(".thread-result").length === 1,
  );
  assert.match(await page.locator(".thread-result").innerText(), /004999/);
  assert.ok(ms < 15000, `Import preview and save took ${ms} ms`);
  await writeFile(
    "test-results/thread-catalog-performance.json",
    JSON.stringify({ entries: 5000, previewAndSaveMs: ms, renderedPage: 50 }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#thread-search").scrollIntoViewIfNeeded();
  let box = await page.locator("#thread-dialog").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 391);
  await page.screenshot({ path: "test-results/threads-mobile.png" });
  await page.keyboard.press("Escape");
  box = await page.locator("#export").boundingBox();
  assert.ok(
    box.x >= 0 && box.x + box.width <= 391,
    "Mobile Export remains accessible",
  );
  box = await page.locator("#thread-library").boundingBox();
  assert.ok(
    box.x >= 0 && box.x + box.width <= 391,
    "Mobile Threads remains accessible",
  );
  await page.setViewportSize({ width: 1450, height: 1000 });
  await page.locator("#thread-library").click();
  await page.screenshot({ path: "test-results/threads-desktop.png" });
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "Threads: CSV/JSON/GPL preview/mapping, leading zeros/distinct brands, per-action colors and design-color restoration, Undo/Redo, reload/catalog loss snapshots, manual unknown HEX, defaults, 5000-entry bounded paging/search and mobile passed.",
  );
} finally {
  await browser.close();
}
