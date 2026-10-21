import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { object } from "../src/model.js";
import { makeFillSettings } from "../src/fills/context.js";
import { stampFillFeatures } from "../src/fills/schema.js";
const { chromium } = createRequire(import.meta.url)(
    process.env.PLAYWRIGHT_MODULE || "playwright",
  ),
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
await mkdir("test-results", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1080 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject());
  await ready();
  const ring = (r) => [
      { x: -r, y: -r },
      { x: r, y: -r },
      { x: r, y: r },
      { x: -r, y: r },
    ],
    o = object("Reusable organic fill", [ring(18), ring(4)], {
      id: "reusable-fill",
      closed: true,
      fillRule: "evenodd",
      angle: 0,
      underlay: false,
    });
  o.fillSettings = { version: 1, method: "tatami" };
  await page.locator("#file-input").setInputFiles({
    name: "Fill.embstudio",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify(
        stampFillFeatures({
          version: 1,
          name: "Fill library source",
          machine: "se700",
          objects: [o],
        }),
      ),
    ),
  });
  await page.locator("#dialog-submit").click();
  await ready();
  await page.locator('[data-select="reusable-fill"]').click();
  await page.locator("#fill-method").selectOption("contour");
  await ready();
  assert.equal(
    (await project()).objects[0].operations[0].fillSettings.method,
    "contour",
  );
  await page.locator("#sewing-presets").click();
  await page.locator("#sewing-preset").selectOption("fill");
  await page.locator("#dialog-submit").click();
  await ready();
  assert.equal(
    (await project()).objects[0].operations[0].fillSettings,
    undefined,
  );
  assert.equal((await project()).version, 1);
  await page.locator("#undo").click();
  await ready();
  await page.locator('[data-select="reusable-fill"]').click();
  assert.equal(
    (await project()).objects[0].operations[0].fillSettings.method,
    "contour",
  );
  await page.locator(".fill-method-picker > summary").click();
  assert.equal(await page.locator("[data-fill-method]").count(), 7);
  await page.locator('[data-fill-method="meander"]').focus();
  await page.keyboard.press("Enter");
  await ready();
  await page.locator("#fill-style").selectOption("organic");
  await ready();
  const positions = await page.evaluate(() => ({
    method: document.getElementById("fill-method").getBoundingClientRect().top,
    thread: document.getElementById("thread-color").getBoundingClientRect().top,
  }));
  assert(positions.method < positions.thread);
  const source = await project();
  await page.locator("#artwork-library").click();
  await page.locator("#artwork-save").click();
  await page.locator("#artwork-name").fill("Organic with a counter");
  await page.locator("#artwork-name").press("Enter");
  await page.waitForFunction(() =>
    document.querySelector("#artwork-status")?.textContent.includes("Saved"),
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(await project(), source);
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await ready();
  const empty = await project();
  await page.locator("#artwork-library").click();
  await page.locator("[data-artwork]").click();
  await page.locator("#artwork-insert").click();
  await ready();
  const inserted = await project(),
    copy = inserted.objects[0];
  assert.equal(inserted.version, 2);
  assert.equal(copy.operations[0].fillSettings.method, "meander");
  assert.equal(copy.operations[0].fillSettings.style, "organic");
  assert.notEqual(copy.id, o.id);
  assert.deepEqual(copy.rings, source.objects[0].rings);
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(await project(), empty);
  await page.locator("#redo").click();
  await ready();
  assert.deepEqual(await project(), inserted);
  await page.waitForFunction(
    () =>
      document.getElementById("save-status").textContent ===
      "Saved on this device",
  );
  await page.reload();
  await ready();
  assert.deepEqual(await project(), inserted);
  await page.locator(`[data-select="${copy.id}"]`).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toggle-inspector").click();
  for (const method of [
    "tatami",
    "contour",
    "meander",
    "cross",
    "emboss",
    "ripple",
    "spiral",
  ]) {
    await page.locator("#fill-method").selectOption(method);
    await ready();
    const dimensions = await page
      .locator("#properties")
      .evaluate((e) => ({ width: e.clientWidth, scroll: e.scrollWidth }));
    assert(dimensions.scroll <= dimensions.width + 1, method);
  }
  await page.screenshot({ path: "test-results/fill-integration-mobile.png" });
  // Real module workers, not a mocked callback: an obsolete expensive request
  // must never deliver into the latest-request consumer.
  const expensive = object("Expensive", [ring(48)], { closed: true, angle: 0 });
  expensive.fillSettings = makeFillSettings("meander", expensive, {
    style: "fine",
  });
  const latest = await page.evaluate(
    async ({ expensive, small }) => {
      const { LatestGenerationWorker } = await import(
        "./src/generation-worker.js"
      );
      const worker = new LatestGenerationWorker(
        () =>
          new Worker(new URL("./src/digitize-worker.js", location.href), {
            type: "module",
          }),
      );
      const delivered = [];
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.terminate();
          reject(Error("Latest worker timed out"));
        }, 20000);
        worker.onerror = (e) => {
          clearTimeout(timer);
          worker.terminate();
          reject(Error(e.message));
        };
        worker.onmessage = (e) => {
          delivered.push(e.data.id);
          if (e.data.id === 2) {
            clearTimeout(timer);
            worker.terminate();
            resolve({
              delivered,
              count: e.data.events?.length,
              error: e.data.error,
            });
          }
        };
        worker.postMessage({ id: 1, project: expensive });
        worker.postMessage({ id: 2, project: small });
      });
    },
    {
      expensive: stampFillFeatures({
        version: 1,
        name: "Heavy",
        machine: "se700",
        objects: [expensive],
      }),
      small: stampFillFeatures({
        version: 1,
        name: "Latest",
        machine: "se700",
        objects: [o],
      }),
    },
  );
  assert.deepEqual(latest.delivered, [2]);
  assert(latest.count > 0);
  assert.equal(latest.error, undefined);
  assert.deepEqual(errors, []);
  console.log(
    "Fill integration: keyboard sample picker, adjacent method/thread controls, cross-project My Artwork, version/history/reload, seven mobile methods and real obsolete-worker cancellation pass.",
  );
} finally {
  await browser.close();
}
