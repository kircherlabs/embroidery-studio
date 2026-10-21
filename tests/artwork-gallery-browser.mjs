import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { artworkFixture } from "./helpers/artwork-fixtures.mjs";
import { extractArtwork } from "../src/artwork-library.js";
import { createArtworkRecord } from "../src/artwork-records.js";
const { chromium } = createRequire(import.meta.url)(
    process.env.PLAYWRIGHT_MODULE || "playwright",
  ),
  b = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
await mkdir("test-results", { recursive: true });
try {
  const p = await b.newPage({ viewport: { width: 1500, height: 1050 } }),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await p.waitForFunction(() => window.studio?.getPlan());
  assert.deepEqual(
    await p
      .locator(".file-actions > button")
      .evaluateAll((es) => es.map((e) => e.id)),
    [
      "artwork-library",
      "thread-library",
      "new-project",
      "open-file",
      "save-project",
      "export",
    ],
  );
  await p.locator("#artwork-library").click();
  await p.locator("#artwork-results").waitFor();
  assert.match(
    await p.locator(".thread-empty").innerText(),
    /library is empty/,
  );
  assert.ok(await p.locator("#artwork-save").isDisabled());
  assert.ok(await p.locator("#artwork-insert").isDisabled());
  await p.keyboard.press("Escape");
  const fixture = artworkFixture(),
    payload = extractArtwork(fixture, [fixture.objects[0].id]),
    records = Array.from({ length: 500 }, (_, i) =>
      createArtworkRecord(`Element ${String(i).padStart(4, "0")}`, payload),
    );
  await p.evaluate(
    async (records) =>
      (await import("./src/artwork-store.js")).importArtwork(records),
    records,
  );
  const start = Date.now();
  await p.locator("#artwork-library").click();
  await p.waitForFunction(() =>
    document.querySelector("#artwork-count")?.textContent.includes("500 saved"),
  );
  assert.equal(await p.locator("[data-artwork]").count(), 40);
  assert.ok(Date.now() - start < 12000, "500-record library opens promptly");
  assert.equal(await p.locator(".artwork-thumbnail").count(), 40);
  assert.ok((await p.locator(".artwork-thumbnail path").count()) > 0);
  await p.locator("#artwork-search").fill("Element 0001");
  assert.equal(await p.locator("[data-artwork]").count(), 1);
  await p.locator("[data-artwork]").click();
  assert.ok(await p.locator("#artwork-insert").isEnabled());
  await p.locator("#artwork-management").evaluate((e) => (e.open = true));
  await p.locator("#artwork-rename").click();
  await p.locator("#artwork-name").fill("Named <editable> artwork");
  await p.locator("#artwork-name").press("Enter");
  await p.waitForFunction(() =>
    document.querySelector("#artwork-status")?.textContent.includes("Saved"),
  );
  await p.locator("#artwork-search").fill("Named");
  assert.equal(await p.locator("[data-artwork]").count(), 1);
  assert.match(
    await p.locator("[data-artwork]").innerText(),
    /Named <editable>/,
  );
  assert.equal(
    await p.locator("[data-artwork] editable").count(),
    0,
    "names are text, not markup",
  );
  await p.locator("#artwork-management").evaluate((e) => (e.open = true));
  const exported = p.waitForEvent("download");
  await p.locator("#artwork-export").click();
  const file = await exported,
    backup = await readFile(await file.path());
  assert.equal(JSON.parse(backup).items.length, 500);
  const chooser = p.waitForEvent("filechooser");
  await p.locator("#artwork-import").click();
  await (
    await chooser
  ).setFiles({
    name: "Library.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await p.locator("#artwork-confirm").waitFor();
  assert.match(
    await p.locator("#artwork-dialog").innerText(),
    /500 duplicates skipped/,
  );
  assert.ok(await p.locator("#artwork-confirm").isDisabled());
  await p.locator("#artwork-back").click();
  await p.locator("#artwork-search").fill("Named");
  await p.locator("[data-artwork]").click();
  await p.locator("#artwork-management").evaluate((e) => (e.open = true));
  await p.locator("#artwork-delete").click();
  await p.locator("#artwork-back").click();
  assert.equal(
    await p.locator("[data-artwork]").count(),
    1,
    "cancel preserves item",
  );
  await p.locator("#artwork-management").evaluate((e) => (e.open = true));
  await p.locator("#artwork-delete").click();
  await p.locator("#artwork-confirm").click();
  await p.waitForFunction(() =>
    document
      .querySelector("#artwork-status")
      ?.textContent.includes("Library updated"),
  );
  assert.equal(await p.locator("[data-artwork]").count(), 0);
  await p.locator("#artwork-search").fill("");
  await p.screenshot({ path: "test-results/artwork-gallery-desktop.png" });
  for (const width of [1280, 768, 390]) {
    await p.setViewportSize({ width, height: 844 });
    assert.ok(
      await p
        .locator("#artwork-dialog")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 2),
    );
    assert.ok(
      await p
        .locator("#artwork-insert")
        .evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight),
    );
  }
  await p.screenshot({ path: "test-results/artwork-gallery-mobile.png" });
  await p.keyboard.press("Escape");
  assert.equal(
    await p.evaluate(() => document.activeElement.id),
    "artwork-library",
  );
  assert.ok(
    await p
      .locator(".file-actions")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 2),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS companion gallery, source previews, search/selection, 500 records/40 cards, rename/delete/cancel, real backup/duplicate import, header order, keyboard focus and desktop/tablet/mobile",
  );
} finally {
  await b.close();
}
