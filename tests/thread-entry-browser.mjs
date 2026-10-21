import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
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
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await page.waitForFunction(() => window.studio?.getPlan());
  await page.locator("#thread-library").click();
  await page.locator("#thread-manual").click();
  await page.locator("#manual-thread-save").click();
  assert.match(await page.locator("#manual-thread-error").innerText(), /brand/);
  await page.locator("#manual-thread-brand").fill("New brothread");
  await page.locator("#manual-thread-save").click();
  assert.match(
    await page.locator("#manual-thread-error").innerText(),
    /spool number/,
  );
  await page.locator("#manual-thread-number").fill("007");
  await page.locator("#manual-thread-name").fill("Prussian Blue");
  await page.locator("#manual-thread-hex").fill("#23436f");
  await page.locator("#manual-thread-hex").press("Enter");
  await page.locator("#thread-search").waitFor();
  assert.match(await page.locator("#library-status").innerText(), /Saved.*007/);
  assert.match(
    await page.locator("#thread-results").innerText(),
    /Unspecified product line/,
  );
  assert.equal(await page.locator(".thread-result").count(), 1);
  // Enter on collection editor saves that editor, not a different modal action.
  await page.locator("#thread-collection-edit").click();
  await page.locator("#inventory-quantity").fill("2");
  await page.locator("#inventory-quantity").press("Enter");
  await page.locator("#thread-search").waitFor();
  assert.match(await page.locator("#thread-results").innerText(), /Owned ×2/);
  // Preferences and collection filters cannot hide a successfully added new spool.
  await page.locator("#thread-brand").selectOption("newbrothread");
  await page.locator("#thread-collection").selectOption("owned");
  await page.locator("#thread-management summary").click();
  await page.locator("#thread-prefer").click();
  await page.locator("#thread-manual").click();
  await page.locator("#manual-thread-brand").fill("Simthread");
  await page.locator("#manual-thread-number").fill("007");
  await page.locator("#manual-thread-save").click();
  await page.locator("#thread-search").waitFor();
  assert.match(await page.locator("#thread-results").innerText(), /Simthread/);
  assert.equal(await page.locator("#thread-collection").inputValue(), "all");
  await page.locator("#thread-manual").click();
  await page.locator("#manual-thread-brand").fill("Simthread");
  await page.locator("#manual-thread-number").fill("007");
  await page.locator("#manual-thread-save").click();
  assert.match(
    await page.locator("#manual-thread-error").innerText(),
    /already exist/,
  );
  await page.locator("#manual-thread-number").fill("008");
  await page.locator("#manual-thread-hex").fill("#xyz");
  await page.locator("#manual-thread-save").click();
  assert.match(await page.locator("#manual-thread-error").innerText(), /HEX/);
  await page.locator("#manual-thread-hex").fill("#123456");
  // A failed IndexedDB transaction must remain inline and leave earlier records intact.
  await page.evaluate(() => {
    window.originalDB = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw Error("Simulated storage quota exceeded");
    };
  });
  await page.locator("#manual-thread-save").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#manual-thread-error")
      .textContent.includes("quota"),
  );
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.originalDB;
  });
  await page.locator("#manual-thread-save").click();
  await page.locator("#thread-search").waitFor();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForFunction(() => window.studio?.getPlan());
  await page.locator("#thread-library").click();
  await page.locator("#thread-brand").selectOption("");
  await page.locator("#thread-collection").selectOption("all");
  assert.equal(await page.locator(".thread-result").count(), 3);
  await page.screenshot({ path: "test-results/library-entry-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#thread-manual").click();
  assert.ok(await page.locator("#manual-thread-save").isVisible());
  assert.ok(
    await page
      .locator("#thread-dialog")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 2),
  );
  await page.screenshot({ path: "test-results/library-entry-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS manual entry, unknown line, exact codes, duplicates, inline storage error, filtered success, Enter collection, reload, desktop/mobile",
  );
} finally {
  await browser.close();
}
