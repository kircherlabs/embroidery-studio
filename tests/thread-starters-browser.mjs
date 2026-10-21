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
      viewport: { width: 1450, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await page.waitForFunction(() => window.studio?.getPlan());
  await page.locator("#thread-library").click();
  await page.locator("#thread-brand").waitFor();
  assert.match(
    await page.locator("#thread-result-count").innerText(),
    /171 entries/,
  );
  assert.equal(await page.locator(".thread-result").count(), 50);
  await page.locator("#thread-brand").selectOption("newbrothread");
  assert.match(
    await page.locator("#thread-result-count").innerText(),
    /70 entries/,
  );
  await page.locator("#thread-search").fill("007");
  await page.waitForFunction(
    () => document.querySelectorAll(".thread-result").length === 1,
  );
  await page.locator(".thread-result").click();
  assert.match(
    await page.locator("#thread-detail").innerText(),
    /Prussian Blue/,
  );
  await page.locator("#thread-detail summary").click();
  assert.match(
    await page.locator("#thread-detail").innerText(),
    /studio-approximation/,
  );
  const id = await page.locator(".thread-result").getAttribute("data-thread");
  await page.locator("[data-collection-check]").check();
  await page.locator("#thread-owned-add").click();
  await page.waitForFunction(() =>
    document.querySelector("#thread-results").textContent.includes("Owned ×1"),
  );
  await page.locator("#thread-edit").click();
  await page.locator("#manual-thread-hex").fill("#153975");
  await page.locator("#manual-thread-save").click();
  await page.locator("#thread-search").waitFor();
  assert.equal(
    await page.locator(".thread-result.selected").getAttribute("data-thread"),
    id,
  );
  assert.match(await page.locator("#thread-detail").innerText(), /#153975/);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForFunction(() => window.studio?.getPlan());
  await page.locator("#thread-library").click();
  await page.locator("#thread-search").fill("Prussian");
  await page.waitForFunction(
    () => document.querySelectorAll(".thread-result").length === 2,
  );
  const stored = await page.evaluate(async () => {
    const { loadThreads } = await import("./src/thread-store.js");
    return loadThreads();
  });
  assert.equal(
    stored.records.length,
    1,
    "only correction is stored, not 171 built-ins",
  );
  assert.match(stored.records[0].source.name, /Personal correction/);
  assert.ok(stored.records[0].source.url.includes("newbrothread-official.com"));
  assert.equal(stored.inventory.length, 1);
  assert.equal(stored.inventory[0].thread.id, id);
  await page.locator("#thread-brand").selectOption("newbrothread");
  await page.locator(".thread-result").click();
  assert.match(await page.locator("#thread-detail").innerText(), /#153975/);
  await page.screenshot({ path: "test-results/thread-starters-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page
      .locator("#thread-dialog")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 2),
  );
  await page.screenshot({ path: "test-results/thread-starters-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS immediate starters, search, exact spool, owned without copying catalog, local correction, reload, mobile",
  );
} finally {
  await browser.close();
}
