import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { object } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
import { normalizeThread, emptyThreads } from "../src/thread-records.js";
import { assignThread, threadTargets } from "../src/thread-assignment.js";
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
  page.setDefaultTimeout(45000);
  page.on("pageerror", (e) => errors.push(e.stack));
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    library = () =>
      page.evaluate(async () => {
        const { loadThreads } = await import("./src/thread-store.js");
        return loadThreads();
      });
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await ready();
  const data = emptyThreads();
  data.records = [
    normalizeThread({
      brandName: "New brothread",
      lineName: "Personal inventory fixture",
      number: "001",
      colorName: "Synthetic pink",
      hex: "#e64caa",
    }),
    normalizeThread({
      brandName: "New brothread",
      lineName: "Personal inventory fixture",
      number: "002",
      colorName: "Synthetic blue",
      hex: "#123456",
    }),
    normalizeThread({
      brandName: "Simthread",
      lineName: "Personal inventory fixture",
      number: "003",
      colorName: "Synthetic white",
      hex: "#f4f4f4",
    }),
    normalizeThread({
      brandName: "Brother",
      lineName: "Personal inventory fixture",
      number: "A004",
      colorName: "Label only",
      hex: null,
    }),
  ];
  await page.evaluate(async (d) => {
    const { saveThreads } = await import("./src/thread-store.js");
    await saveThreads(d);
  }, data);
  const o = object(
    "Inventory circle",
    [
      [
        { x: -7, y: -5 },
        { x: 7, y: -5 },
        { x: 7, y: 5 },
        { x: -7, y: 5 },
      ],
    ],
    { color: "#e64caa", underlay: false },
  );
  o.operations = [makeOperation("fill", o), makeOperation("border", o)];
  o.operations[1].color = "#123456";
  assignThread(
    threadTargets([o], { activeOperationId: o.operations[0].id }, true),
    data.records[0],
  );
  assignThread(
    threadTargets([o], { activeOperationId: o.operations[1].id }, true),
    data.records[1],
  );
  await page.locator("#file-input").setInputFiles({
    name: "inventory.embstudio",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: "Inventory fixture",
        machine: "se700",
        objects: [o],
      }),
    ),
  });
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () => window.studio.getProject().name === "Inventory fixture",
  );
  await ready();
  const before = await project();
  await page.locator("#thread-library").click();
  await page.locator(`[data-collection-check="${data.records[0].id}"]`).check();
  await page.locator(`[data-collection-check="${data.records[2].id}"]`).check();
  await page.locator("#thread-owned-add").click();
  await page.waitForFunction(async () => {
    const { loadThreads } = await import("./src/thread-store.js");
    return (await loadThreads()).inventory.length === 2;
  });
  await page.locator(`[data-thread="${data.records[0].id}"]`).click();
  await page.locator("#thread-collection-edit").click();
  await page.locator("#inventory-quantity").fill("2");
  await page.locator("#inventory-size").fill("500 m");
  await page.locator("#inventory-remaining").fill("120.5");
  await page.locator("#inventory-favorite").check();
  await page.locator("#inventory-notes").fill("Personal spool");
  await page.locator("#inventory-notes").press("Enter");
  assert.equal(await page.locator("#inventory-save").isVisible(), true);
  await page.locator("#inventory-save").click();
  await page.locator("#thread-search").waitFor();
  assert.equal(
    (await library()).inventory.find((i) => i.thread.id === data.records[0].id)
      .quantity,
    2,
  );
  await page.locator("#thread-collection").selectOption("owned");
  assert.equal(await page.locator(".thread-result").count(), 2);
  await page.locator("#thread-management").evaluate((el) => (el.open = true));
  await page.locator("#thread-prefer").click();
  await page.locator("#thread-collection").selectOption("favorites");
  assert.equal(await page.locator(".thread-result").count(), 1);
  await page.locator("#thread-collection").selectOption("missing");
  assert.equal(await page.locator(".thread-result").count(), 2);
  console.log("Inventory CRUD and filters passed");
  await page.locator("#thread-requirements").click();
  await page.screenshot({ path: "test-results/project-threads-desktop.png" });
  assert.match(await page.locator("#shopping-count").innerText(), /1 missing/);
  assert.match(await page.locator("#shopping-text").inputValue(), /"002"/);
  assert.doesNotMatch(
    await page.locator("#shopping-text").inputValue(),
    /"001"/,
  );
  const csvDownload = page.waitForEvent("download");
  await page.locator("#shopping-export").click();
  const csv = await csvDownload;
  assert.match(await readFile(await csv.path(), "utf8"), /New brothread.*002/);
  await page.locator("#requirements-match").click();
  assert.equal(await page.locator("#match-owned").isChecked(), true);
  for (const el of await page.locator("[data-match]").all())
    assert.ok(
      [data.records[0].id, data.records[2].id].includes(await el.inputValue()),
    );
  await page.locator("#thread-match-apply").click();
  await ready();
  let changed = await project();
  assert.ok(
    changed.objects[0].operations.every((op) =>
      [data.records[0].id, data.records[2].id].includes(
        op.physicalThread.thread.id,
      ),
    ),
  );
  assert.equal(
    changed.objects[0].operations[1].physicalThread.designColor,
    "#123456",
  );
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(await project(), before);
  // Exports do not subtract owned stock, even when a physical thread is missing.
  const ownedBefore = await library();
  await page.locator("#export").click();
  const pesDownload = page.waitForEvent("download");
  await page.locator("#dialog-submit").click();
  await pesDownload;
  assert.deepEqual((await library()).inventory, ownedBefore.inventory);
  await page.locator("#thread-library").click();
  await page.locator("#thread-collection").selectOption("owned");
  assert.equal(await page.locator(".thread-result").count(), 2);
  // Removing a catalog retains personally owned spool snapshots.
  await page.locator("#thread-brand").selectOption("newbrothread");
  await page
    .locator("#thread-line")
    .selectOption("newbrothread|personal-inventory-fixture");
  await page.locator("#thread-management").evaluate((el) => (el.open = true));
  await page.locator("#thread-remove-line").click();
  await page.locator("#thread-remove-confirm").click();
  await page.locator("#thread-collection").selectOption("owned");
  assert.match(await page.locator("#thread-results").innerText(), /001/);
  console.log(
    "Project requirements, owned matching and catalog-loss fallback passed",
  );
  const custom = {
    id: "user-inventory-test",
    name: "Personal test field",
    brand: "generic",
    verification: "user-provided",
    maxField: { width: 100, height: 100 },
    hoops: [
      {
        id: "personal100",
        name: "Personal square",
        width: 100,
        height: 100,
        reposition: false,
      },
    ],
    formats: ["pes", "dst"],
    preferred: "pes",
  };
  await page.evaluate(async (m) => {
    const { EQUIPMENT_KEY } = await import("./src/equipment.js");
    const { EXPORT_PREFERENCE_KEY } = await import(
      "./src/export-preferences.js"
    );
    localStorage.setItem(
      EQUIPMENT_KEY,
      JSON.stringify({
        version: 1,
        customMachines: [m],
        default: {
          version: 1,
          machineId: m.id,
          hoopId: m.hoops[0].id,
          custom: m,
        },
      }),
    );
    localStorage.setItem(
      EXPORT_PREFERENCE_KEY,
      JSON.stringify({ se700: "pes", [m.id]: "dst" }),
    );
  }, custom);
  await page.locator("#thread-management").evaluate((el) => (el.open = true));
  await page.locator("#thread-personal").click();
  const backupDownload = page.waitForEvent("download");
  await page.locator("#personal-export").click();
  const downloaded = await backupDownload,
    backup = JSON.parse(await readFile(await downloaded.path(), "utf8"));
  assert.equal(backup.threads.inventory.length, 2);
  assert.equal(backup.equipment.default.machineId, custom.id);
  assert.equal(backup.formats[custom.id], "dst");
  await page.keyboard.press("Escape");
  await page.evaluate(async () => {
    const { saveThreads } = await import("./src/thread-store.js");
    const { emptyThreads } = await import("./src/thread-records.js");
    await saveThreads(emptyThreads());
    localStorage.removeItem("embroidery-equipment-v1");
    localStorage.removeItem("embroidery-export-formats-v1");
  });
  await page.reload();
  await ready();
  const retainedProject = await project();
  await page.locator("#thread-library").click();
  await page.locator("#thread-management").evaluate((el) => (el.open = true));
  await page.locator("#thread-personal").click();
  const chooseBackup = async (value) => {
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#personal-import").click();
    await (
      await chooser
    ).setFiles({
      name: "personal.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
    await page.waitForFunction(() =>
      /Review:|not imported/.test(
        document.getElementById("personal-status").textContent,
      ),
    );
  };
  const bad = structuredClone(backup);
  bad.threads.inventory[0].quantity = -1;
  await chooseBackup(bad);
  assert.match(
    await page.locator("#personal-status").innerText(),
    /not imported/,
  );
  assert.equal((await library()).inventory.length, 0);
  await chooseBackup(backup);
  await page.locator("#personal-apply").click();
  await page.locator("#thread-search").waitFor();
  assert.equal(
    (await library()).inventory.find((i) => i.thread.id === data.records[0].id)
      .quantity,
    2,
  );
  assert.deepEqual(await project(), retainedProject);
  const restored = await page.evaluate(async () => {
    const { exportPersonal } = await import("./src/personal-settings.js");
    return exportPersonal(localStorage);
  });
  assert.deepEqual(restored, backup);
  // Reimport is idempotent, not additive.
  await page.locator("#thread-management").evaluate((el) => (el.open = true));
  await page.locator("#thread-personal").click();
  await chooseBackup(backup);
  await page.locator("#personal-apply").click();
  await page.locator("#thread-search").waitFor();
  assert.equal(
    (await library()).inventory.find((i) => i.thread.id === data.records[0].id)
      .quantity,
    2,
  );
  // Simulate a localStorage failure after the IndexedDB write: both stores roll back.
  const rollback = await page.evaluate(async () => {
    const { exportPersonal, importPersonal } = await import(
        "./src/personal-settings.js"
      ),
      before = await exportPersonal(localStorage),
      incoming = structuredClone(before);
    incoming.threads.inventory[0].quantity = 99;
    const original = Storage.prototype.setItem;
    let failed = false,
      message = "";
    Storage.prototype.setItem = function (k, v) {
      if (k === "embroidery-equipment-v1" && !failed) {
        failed = true;
        throw new DOMException("Synthetic quota error", "QuotaExceededError");
      }
      return original.call(this, k, v);
    };
    try {
      await importPersonal(localStorage, incoming, true);
    } catch (e) {
      message = e.message;
    } finally {
      Storage.prototype.setItem = original;
    }
    return { before, after: await exportPersonal(localStorage), message };
  });
  assert.deepEqual(rollback.after, rollback.before);
  assert.match(rollback.message, /Previous data restored/);
  console.log(
    "Personal backup, validation, idempotent restore and quota rollback passed",
  );
  // Measure the larger catalog and matching workload without rendering every entry.
  const performanceResult = await page.evaluate(async () => {
    const { normalizeThread, emptyThreads } = await import(
        "./src/thread-records.js"
      ),
      { saveThreads } = await import("./src/thread-store.js"),
      { matchIndex } = await import("./src/thread-matching.js"),
      d = emptyThreads();
    d.records = Array.from({ length: 5000 }, (_, i) =>
      normalizeThread({
        brandName: "Synthetic performance",
        lineName: "Fixture",
        number: String(i).padStart(6, "0"),
        hex: "#" + ((i * 127) % 0xffffff).toString(16).padStart(6, "0"),
      }),
    );
    const start = performance.now(),
      match = matchIndex(d.records);
    for (let i = 0; i < 64; i++)
      if (
        !match("#" + ((i * 200003) % 0xffffff).toString(16).padStart(6, "0"))
          .length
      )
        throw Error("No match");
    const matchingMs = performance.now() - start;
    await saveThreads(d);
    return { catalog: 5000, sourceColors: 64, matchingMs };
  });
  await page.keyboard.press("Escape");
  await page.locator("#thread-library").click();
  await page.locator(".thread-result").first().waitFor();
  assert.equal(await page.locator(".thread-result").count(), 50);
  await writeFile(
    "test-results/inventory-performance.json",
    JSON.stringify(performanceResult, null, 2),
  );
  await page.locator(".thread-result").first().click();
  await page.locator("#thread-collection-edit").click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () =>
        document.getElementById("thread-dialog").scrollWidth <=
        document.getElementById("thread-dialog").clientWidth + 2,
    ),
  );
  await page.screenshot({ path: "test-results/thread-inventory-mobile.png" });
  await page.locator("#inventory-quantity").fill("1");
  await page.locator("#inventory-save").click();
  await page.locator("#thread-search").waitFor();
  await page.locator("#thread-collection").selectOption("owned");
  assert.equal(await page.locator(".thread-result").count(), 1);
  await page.locator(".thread-result").click();
  await page.locator("#thread-collection-edit").click();
  await page.locator("#inventory-delete").click();
  await page.locator("#thread-search").waitFor();
  await page.locator("#thread-collection").selectOption("owned");
  assert.equal(await page.locator(".thread-result").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Inventory browser: bulk/individual stock, notes/favorites, filters, requirements/shopping, owned-only matching, original palette, Undo, no export decrement, catalog-loss snapshots, validated portable settings, storage rollback, 5000 entries / 64-color matching and mobile passed.",
    performanceResult,
  );
} finally {
  await browser.close();
}
