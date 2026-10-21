import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  builtinThreads,
  emptyThreads,
  inventoryEntry,
} from "../src/thread-records.js";
import { object } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
import { assignThread, threadTargets } from "../src/thread-assignment.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await page.waitForFunction(() => window.studio?.getPlan());
  const [a, b, c] = builtinThreads().slice(0, 3),
    data = emptyThreads();
  data.inventory = [
    {
      ...inventoryEntry(a),
      quantity: 4,
      notes: "Do not lose",
      favorite: true,
      remainingMetres: 50,
    },
  ];
  await page.evaluate(
    async (d) => (await import("./src/thread-store.js")).saveThreads(d),
    data,
  );
  const shape = object("Assigned", [
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
  ]);
  shape.operations = [makeOperation("fill", shape)];
  assignThread(threadTargets([shape], {}, true), a);
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "bulk.embstudio",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          name: "Bulk fixture",
          machine: "se700",
          objects: [shape],
        }),
      ),
    });
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () => window.studio.getProject().name === "Bulk fixture",
  );
  await page.waitForFunction(() => window.studio.getPlan());
  const before = await page.evaluate(() => ({
    project: window.studio.getProject(),
    events: window.studio.getPlan().events,
  }));
  const stock = () =>
    page.evaluate(
      async () =>
        (await (await import("./src/thread-store.js")).loadThreads()).inventory,
    );
  await page.locator("#thread-library").click();
  await page.locator("#thread-search").waitFor();
  for (const r of [a, b, c])
    await page.locator(`[data-collection-check="${r.id}"]`).check();
  assert.match(
    await page.locator("#thread-checked-count").innerText(),
    /3 checked/,
  );
  assert.match(
    await page.locator("#thread-owned-add").innerText(),
    /Add Unowned/,
  );
  assert.match(
    await page.locator("#thread-owned-remove").innerText(),
    /Remove Owned/,
  );
  await page.locator("#thread-owned-add").click();
  await page.waitForFunction(
    () => !document.querySelector("[data-collection-check]:checked"),
  );
  assert.equal((await stock()).length, 3);
  assert.equal((await stock())[0].quantity, 4);
  await page.locator('.thread-views [data-library-view="owned"]').click();
  assert.equal(await page.locator(".thread-result").count(), 3);
  for (const r of [a, b])
    await page.locator(`[data-collection-check="${r.id}"]`).check();
  assert.match(
    await page.locator("#thread-owned-add").innerText(),
    /Remove Selected/,
  );
  await page.locator("#thread-owned-add").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.querySelectorAll(".thread-result").length === 1,
  );
  const removed = (await stock())[0];
  assert.equal(removed.quantity, 0);
  assert.equal(removed.notes, "Do not lose");
  assert.equal(removed.remainingMetres, 50);
  assert.equal(removed.favorite, true);
  await page.locator('.thread-views [data-library-view="all"]').click();
  for (const r of [a, b])
    await page.locator(`[data-collection-check="${r.id}"]`).check();
  assert.match(
    await page.locator("#thread-owned-add").innerText(),
    /Add Selected/,
  );
  await page.locator("#thread-clear-checked").click();
  assert.equal(
    await page.locator("[data-collection-check]:checked").count(),
    0,
  );
  // Mixed removal affects only owned entries, leaving unowned details intact.
  for (const r of [a, c])
    await page.locator(`[data-collection-check="${r.id}"]`).check();
  await page.locator("#thread-owned-remove").click();
  await page.waitForFunction(
    () => !document.querySelector("[data-collection-check]:checked"),
  );
  assert.ok((await stock()).every((i) => i.quantity === 0));
  assert.deepEqual(
    await page.evaluate(() => ({
      project: window.studio.getProject(),
      events: window.studio.getPlan().events,
    })),
    before,
  );
  await page.locator(`[data-collection-check="${a.id}"]`).focus();
  await page.keyboard.press("Space");
  await page.locator('.thread-views [data-library-view="owned"]').click();
  assert.equal(
    await page.locator("[data-collection-check]:checked").count(),
    0,
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForFunction(() => window.studio?.getPlan());
  await page.locator("#thread-library").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".thread-result").length === 50,
  );
  assert.equal(await page.locator(".thread-result").count(), 50);
  assert.equal((await stock())[0].notes, "Do not lose");
  assert.deepEqual(errors, []);
  console.log(
    "PASS bulk unowned add, owned removal, mixed actions, metadata, quantities, catalog/assignment/needles, clear/view switch, keyboard and reload",
  );
} finally {
  await browser.close();
}
