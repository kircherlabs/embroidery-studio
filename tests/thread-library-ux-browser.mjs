import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { object } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
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
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  const project = () => page.evaluate(() => window.studio.getProject());
  const inventory = () =>
    page.evaluate(
      async () =>
        (await (await import("./src/thread-store.js")).loadThreads()).inventory,
    );
  const view = (v) => page.locator(`.thread-views [data-library-view="${v}"]`);
  const search = async (q, count) => {
    await page.locator("#thread-search").fill(q);
    await page.waitForFunction(
      (n) => document.querySelectorAll(".thread-result").length === n,
      count,
    );
  };
  const open = async () => {
    await page.locator("#thread-library").click();
    await page.locator("#thread-brand").waitFor();
  };
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await ready();
  const initialProject = await project();
  await open();
  assert.equal(await view("all").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".thread-result").count(), 50);
  assert.ok(await page.locator("#thread-use").isDisabled());
  assert.match(
    await page.locator("#thread-assignment-note").innerText(),
    /No sewing action selected/,
  );
  await view("owned").focus();
  await page.keyboard.press("Space");
  assert.match(
    await page.locator(".thread-empty").innerText(),
    /Your collection is empty/,
  );
  await page.locator(".thread-empty [data-library-view]").click();
  await search("New brothread", 50);
  await search("Prussian", 2);
  await page.locator("#thread-brand").selectOption("newbrothread");
  const line = await page
    .locator("#thread-line option")
    .nth(1)
    .getAttribute("value");
  await page.locator("#thread-line").selectOption(line);
  await page.locator(".thread-result").click();
  const id = await page.locator(".thread-result").getAttribute("data-thread");
  assert.match(
    await page.locator("#thread-detail").innerText(),
    /007.*Prussian Blue/,
  );
  assert.equal(
    await page
      .locator(".thread-result")
      .evaluate((e) => document.activeElement === e),
    true,
    "selection retains keyboard focus after rendering",
  );
  await page.locator("#thread-owned-add").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    document.querySelector("#thread-owned-add").textContent.includes("Remove"),
  );
  assert.deepEqual(
    await project(),
    initialProject,
    "ownership never changes the project",
  );
  assert.equal((await inventory())[0].quantity, 1);
  await view("owned").click();
  assert.equal(await page.locator("#thread-search").inputValue(), "Prussian");
  assert.equal(await page.locator("#thread-line").inputValue(), line);
  assert.equal(await page.locator(".thread-result").count(), 1);
  await page.locator("#thread-collection-edit").click();
  await page.locator("#inventory-quantity").fill("3");
  await page.locator("#inventory-size").fill("500 m");
  await page.locator("#inventory-remaining").fill("123");
  await page.locator("#inventory-favorite").check();
  await page.locator("#inventory-notes").fill("Keep these notes when unowned");
  await page.locator("#inventory-save").click();
  await page.locator("#thread-search").waitFor();
  await search("Prussian", 2);
  await page.locator("#thread-brand").selectOption("newbrothread");
  await page.locator(".thread-result").click();
  await view("owned").click();
  const owned = (await inventory())[0];
  await page.locator("#thread-owned-add").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".thread-result").length === 0,
  );
  const unowned = (await inventory())[0];
  assert.deepEqual(
    { ...unowned, quantity: owned.quantity },
    owned,
    "only quantity changes; notes, favorite, lengths and identity survive removal",
  );
  assert.equal(unowned.quantity, 0);
  assert.match(
    await page.locator("#thread-owned-add").innerText(),
    /Add to My Collection/,
  );
  await view("all").click();
  assert.equal(
    await page.locator(".thread-result").count(),
    1,
    "catalog entry survives removal",
  );
  await page.locator("#thread-owned-add").click();
  await page.waitForFunction(() =>
    document.querySelector("#thread-owned-add").textContent.includes("Remove"),
  );
  await search("nonexistent spool", 0);
  assert.match(
    await page.locator(".thread-empty").innerText(),
    /No matching threads/,
  );
  await page.locator("#thread-clear-filters").click();
  assert.equal(await page.locator(".thread-result").count(), 50);
  await page.keyboard.press("Escape");
  await page.reload();
  await ready();
  await open();
  assert.equal(
    await view("all").getAttribute("aria-pressed"),
    "true",
    "Browse is default even with owned spools",
  );
  await view("owned").click();
  assert.equal(await page.locator(".thread-result").count(), 1);
  await page.locator(".thread-result").click();
  assert.equal(
    await page.locator(".thread-result").getAttribute("data-thread"),
    id,
  );
  await page.keyboard.press("Escape");
  // Assigning is independent of stock, and stock changes leave actual needle commands intact.
  const shape = object(
    "Swatch assignment",
    [
      [
        { x: -10, y: -10 },
        { x: 10, y: -10 },
        { x: 10, y: 10 },
        { x: -10, y: 10 },
      ],
    ],
    { color: "#aa3388", underlay: false },
  );
  shape.operations = [
    makeOperation("fill", shape),
    makeOperation("border", shape),
  ];
  await page.locator("#file-input").setInputFiles({
    name: "swatches.embstudio",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: "Swatch UI fixture",
        machine: "se700",
        objects: [shape],
      }),
    ),
  });
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () => window.studio.getProject().name === "Swatch UI fixture",
  );
  await ready();
  await page.locator(`[data-select="${shape.id}"]`).click();
  await page.locator(`[data-operation="${shape.operations[1].id}"]`).click();
  await page.locator("[data-thread-pick]").click();
  await page.locator("#thread-brand").selectOption("newbrothread");
  await search("007", 1);
  await page.locator(".thread-result").click();
  const beforeAssign = await project();
  await page.locator("#thread-use").click();
  await ready();
  const assigned = await project();
  assert.equal(assigned.objects[0].operations[1].physicalThread.thread.id, id);
  assert.deepEqual(
    assigned.objects[0].operations[0],
    beforeAssign.objects[0].operations[0],
  );
  assert.deepEqual(assigned.objects[0].rings, beforeAssign.objects[0].rings);
  const needles = await page.evaluate(() => window.studio.getPlan().events);
  await page.locator("#context-help").click();
  await open();
  await page.locator("#thread-brand").selectOption("newbrothread");
  await search("007", 1);
  await page.locator(".thread-result").click();
  await page.locator("#thread-owned-add").hover();
  await page.waitForFunction(() => {
    const tip = document.querySelector("#control-description");
    return (
      !tip.hidden && tip.textContent.includes("Set owned quantity to zero")
    );
  });
  assert.equal(
    await page.locator("#thread-owned-add").getAttribute("title"),
    null,
    "use Hints rather than a native tooltip",
  );
  await page.locator("#thread-owned-add").click();
  await page.waitForFunction(() =>
    document.querySelector("#thread-owned-add").textContent.includes("Add to"),
  );
  await page.locator("#thread-owned-add").hover();
  await page.waitForFunction(() => {
    const tip = document.querySelector("#control-description");
    return (
      !tip.hidden &&
      tip.textContent.includes("without assigning it to your design")
    );
  });
  assert.deepEqual(await project(), assigned);
  assert.deepEqual(
    await page.evaluate(() => window.studio.getPlan().events),
    needles,
  );
  await page.keyboard.press("Escape");
  await page.locator("#context-help").click();
  await open();
  await page.locator("#thread-brand").selectOption("newbrothread");
  await search("007", 1);
  await page.locator(".thread-result").click();
  await page.locator("#thread-search").fill("");
  await page.locator("#thread-brand").selectOption("");
  await page.waitForFunction(
    () => document.querySelectorAll(".thread-result").length === 50,
  );
  await page.screenshot({
    path: "test-results/ux-after-threads-selected-desktop.png",
  });
  for (const width of [800, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page
        .locator("#thread-dialog")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 2),
    );
    assert.ok(
      await page
        .locator(".thread-library-content")
        .evaluate((e) => e.scrollHeight > e.clientHeight),
    );
    assert.ok(
      await page.locator("#thread-use").evaluate((e) => {
        const b = e.getBoundingClientRect();
        return b.top >= 0 && b.bottom <= innerHeight;
      }),
      "assignment stays visible outside scroll area",
    );
  }
  await page.locator("#thread-detail").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/ux-after-threads-selected-mobile.png",
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1500, height: 1050 });
  await page.locator("#machine-panel").click();
  const boxes = await page
    .locator("#machine-brand, #machine, #machine-hoop")
    .evaluateAll((es) =>
      es.map((e) => {
        const b = e.getBoundingClientRect();
        return { top: b.top, height: b.height };
      }),
    );
  assert.ok(
    boxes.every(
      (b) => Math.abs(b.top - boxes[0].top) < 1 && b.height === boxes[0].height,
    ),
  );
  assert.equal(
    await page
      .locator("#machine-search")
      .evaluate((e) => e.getBoundingClientRect().height),
    boxes[0].height,
  );
  assert.ok(
    await page
      .locator(".workspace-machine")
      .evaluate((e) => e.getBoundingClientRect().height < 290),
  );
  await page.screenshot({
    path: "test-results/ux-after-equipment-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page
      .locator(".machine-settings")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 2),
  );
  await page.screenshot({ path: "test-results/ux-after-equipment-mobile.png" });
  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  touch.on("pageerror", (e) => errors.push(e.message));
  await touch.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await touch.waitForFunction(() => window.studio?.getPlan());
  await touch.locator("#thread-library").tap();
  await touch.locator(".thread-result").first().tap();
  await touch.locator("#thread-owned-add").tap();
  await touch.waitForFunction(() =>
    document.querySelector("#thread-owned-add").textContent.includes("Remove"),
  );
  await touch.locator('.thread-views [data-library-view="owned"]').tap();
  assert.equal(await touch.locator(".thread-result").count(), 1);
  await touch.locator("#thread-owned-add").tap();
  await touch.waitForFunction(
    () => document.querySelectorAll(".thread-result").length === 0,
  );
  await touch.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS visual grid, Browse/Collection, empty states, brand/name/code search, filters, keyboard focus, ownership toggle/metadata/reload, independent action assignment/needles, single-scroll desktop/mobile layout, aligned equipment controls",
  );
} finally {
  await browser.close();
}
