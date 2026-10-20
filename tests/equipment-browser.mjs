import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { object, validateProject } from "../src/model.js";
import { getMachine } from "../src/equipment.js";
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
      viewport: { width: 1500, height: 1050 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  const project = () => page.evaluate(() => window.studio.getProject()),
    ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    // Native dialog close is queued differently across Chromium versions. An old
    // plan can still exist until the close handler commits the equipment edit.
    // Wait for that transaction, then for its new plan; keep every dimension assertion.
    submitEdit = async () => {
      const before = JSON.stringify(await project());
      await page.locator("#dialog-submit").click();
      await page.waitForFunction(
        (before) => JSON.stringify(window.studio.getProject()) !== before,
        before,
      );
      await ready();
    },
    load = async (p) => {
      await page.locator("#file-input").setInputFiles({
        name: "equipment.embstudio",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(p)),
      });
      await page.locator("#dialog-submit").click();
      await page.waitForFunction(
        (name) => window.studio?.getProject().name === name,
        p.name,
      );
      await ready();
    };
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await ready();
  await load({
    version: 1,
    machine: "brother130",
    name: "Legacy hoop",
    objects: [
      object(
        "Wide closed shape",
        [
          [
            { x: -70, y: -10 },
            { x: 70, y: -10 },
            { x: 70, y: 10 },
            { x: -70, y: 10 },
          ],
        ],
        { underlay: false },
      ),
    ],
  });
  const before = (await project()).objects;
  await page.locator("#machine-panel").click();
  assert.equal(await page.locator("#machine-brand").inputValue(), "generic");
  assert.equal(
    await page.locator("#machine-hoop").inputValue(),
    "field-130-180",
  );
  await page.locator("#machine-brand").selectOption("janome");
  await ready();
  assert.equal((await project()).machine, "janome-mc500e");
  assert.equal(await page.locator("#machine-hoop option").count(), 4);
  assert.equal(
    await page.evaluate(() => window.studio.getPlan().stats.fits),
    true,
  );
  await page.locator("#machine-hoop").selectOption("janome-sq14b");
  await ready();
  assert.equal(getMachine(await project()).width, 140);
  assert.deepEqual((await project()).objects, before);
  await page.locator("#machine-brand").selectOption("brother");
  await ready();
  assert.equal(await page.locator("#machine-hoop option").count(), 1);
  assert.equal(
    await page.evaluate(() => window.studio.getPlan().stats.fits),
    false,
  );
  assert.match(
    await page.locator("#fit-status").innerText(),
    /outside|exceed|not fit/i,
  );
  assert.deepEqual((await project()).objects, before);
  await page.locator("#machine-brand").selectOption("bernina");
  await ready();
  assert.match(
    await page.locator("#fit-status").innerText(),
    /check oval template/,
  );
  assert.deepEqual((await project()).objects, before);
  await page.locator("#machine-brand").selectOption("brother");
  await ready();
  await page.locator("#equipment-new").click();
  await page.locator("#eq-name").fill("My custom Janome");
  await page.locator("#eq-units").selectOption("in");
  await page.locator("#eq-width").fill("8");
  await page.locator("#eq-height").fill("10");
  await page.locator("#eq-format").selectOption("jef");
  await submitEdit();
  let p = await project(),
    id = p.machine;
  assert.ok(id.startsWith("user-"));
  assert.equal(getMachine(p).width, 203.2);
  assert.equal(getMachine(p).height, 254);
  validateProject(p);
  assert.deepEqual(p.objects, before);
  await page.locator("#export").click();
  assert.equal(await page.locator("#export-format").inputValue(), "jef");
  await page.keyboard.press("Escape");
  await page.locator("#equipment-hoop-add").click();
  await page.locator("#eq-hname").fill("Small 100");
  await page.locator("#eq-hw").fill("100");
  await page.locator("#eq-hh").fill("100");
  await submitEdit();
  assert.equal(getMachine(await project()).width, 100);
  await page.locator("#equipment-hoop-edit").click();
  await page.locator("#eq-hname").fill("Square 120");
  await page.locator("#eq-hw").fill("120");
  await page.locator("#eq-hh").fill("120");
  await submitEdit();
  assert.equal(getMachine(await project()).width, 120);
  await page.locator("#equipment-default").click();
  await page.locator("#new-project").click();
  await submitEdit();
  assert.equal((await project()).machine, id);
  assert.equal((await project()).objects.length, 0);
  assert.equal(getMachine(await project()).width, 120);
  await page.locator("#equipment-copy").click();
  await page.locator("#eq-name").fill("Copy of my machine");
  await submitEdit();
  assert.notEqual((await project()).machine, id);
  await page.locator("#equipment-delete").click();
  await submitEdit();
  assert.equal((await project()).machine, "generic");
  await page.locator("#undo").click();
  await ready();
  assert.match(getMachine(await project()).name, /Copy/);
  await page.locator("#redo").click();
  await ready();
  assert.equal((await project()).machine, "generic");
  await page.locator("#machine").selectOption(id);
  await ready();
  await page.locator("#equipment-edit").click();
  await page.locator("#eq-name").fill("Renamed machine");
  await submitEdit();
  assert.equal(getMachine(await project()).name, "Renamed machine");
  const pref = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("embroidery-equipment-v1")),
  );
  assert.equal(pref.default.custom.name, "Renamed machine");
  const saved = await project();
  await load({ ...saved, name: "Transferred equipment" });
  assert.deepEqual((await project()).equipment, saved.equipment);
  await page.waitForTimeout(450);
  await page.reload();
  await ready();
  assert.equal((await project()).name, "Transferred equipment");
  assert.equal(getMachine(await project()).name, "Renamed machine");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  if (!(await page.locator("#machine-brand").isVisible()))
    await page.locator("#machine-panel").click();
  await page.locator("#machine-hoop").scrollIntoViewIfNeeded();
  const box = await page.locator("#machine-hoop").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 391);
  await page.screenshot({ path: "test-results/equipment-mobile.png" });
  await page.setViewportSize({ width: 1500, height: 1050 });
  await page.screenshot({ path: "test-results/equipment-desktop.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Equipment: legacy migrations, exact hoop filtering, real generation bounds, no artwork changes, custom inches/profile and hoop CRUD, My Machine defaults, history, transferable snapshots, reload and mobile passed.",
  );
} finally {
  await browser.close();
}
