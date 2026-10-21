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

  await page.evaluate(async () => {
    const { loadThreads, saveThreads } = await import("./src/thread-store.js");
    const d = await loadThreads();
    d.preferences.includeBuiltins = false;
    await saveThreads(d);
  });
  await page.locator("#thread-library").click();
  assert.match(
    await page.locator(".thread-empty").innerText(),
    /Your thread library is empty/,
  );
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
  await page.locator("#thread-more-filters").evaluate((el) => (el.open = true));
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
  await page.locator("#thread-more-filters").evaluate((el) => (el.open = true));
  await page.locator("#thread-collection").selectOption("all");
  assert.equal(await page.locator(".thread-result").count(), 3);
  await page
    .locator(".thread-result")
    .filter({ hasText: "Prussian Blue" })
    .click();
  const ownedId = await page
    .locator(".thread-result.selected")
    .getAttribute("data-thread");
  await page
    .locator(".thread-entry-management")
    .evaluate((el) => (el.open = true));
  await page.locator("#thread-edit").click();
  assert.equal(await page.locator("#manual-thread-number").inputValue(), "007");
  assert.ok(
    await page.locator("#manual-thread-number").evaluate((e) => e.readOnly),
  );
  await page.locator("#manual-thread-hex").fill("#336699");
  assert.equal(
    await page
      .locator("#manual-color-preview")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(51, 102, 153)",
  );
  assert.equal(await page.locator("#manual-color-R").inputValue(), "51");
  await page.locator("#manual-color-R").fill("255");
  assert.equal(
    await page.locator("#manual-thread-hex").inputValue(),
    "#ff6699",
  );
  await page.locator("#manual-color-picker").fill("#123abc");
  assert.equal(
    await page.locator("#manual-thread-hex").inputValue(),
    "#123abc",
  );
  await page.locator("#manual-thread-save").click();
  await page.locator("#thread-search").waitFor();
  assert.equal(
    await page.locator(".thread-result.selected").getAttribute("data-thread"),
    ownedId,
  );
  assert.match(await page.locator("#thread-detail").innerText(), /#123abc/);
  assert.match(await page.locator("#thread-results").innerText(), /Owned ×2/);
  const stored = await page.evaluate(async () => {
    const { loadThreads } = await import("./src/thread-store.js");
    return loadThreads();
  });
  assert.equal(
    stored.inventory.find((i) => i.thread.id === ownedId).thread.hex,
    "#123abc",
  );
  assert.equal(
    stored.records.find((i) => i.id === ownedId).source.colorAccuracy,
    "user-selected",
  );
  await page.locator("#thread-manual").click();
  await page.locator("#manual-thread-brand").fill("My label");
  await page.locator("#manual-thread-number").fill("Z01");
  await page
    .locator("summary")
    .filter({ hasText: "Use an existing catalog color" })
    .click();
  await page.locator("#manual-color-search").fill("Prussian");
  await page.locator("#manual-color-source").selectOption(ownedId);
  assert.equal(
    await page.locator("#manual-thread-hex").inputValue(),
    "#123abc",
  );
  await page.locator("#manual-thread-save").click();
  await page.locator("#thread-search").waitFor();
  await page
    .locator(".thread-entry-management")
    .evaluate((el) => (el.open = true));
  await page.locator("#thread-delete").click();
  await page.locator("#thread-delete-confirm").click();
  await page.locator("#thread-search").waitFor();
  const deleted = await page.evaluate(async () => {
    const { loadThreads } = await import("./src/thread-store.js");
    return loadThreads();
  });
  assert.equal(deleted.records.length, 3);
  assert.equal(deleted.inventory.length, 1);
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
