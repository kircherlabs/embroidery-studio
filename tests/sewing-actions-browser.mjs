import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { object } from "../src/model.js";
import { smartShape } from "../src/creative.js";
import { makeOperation } from "../src/operations.js";
import { reveal, chooseMethod } from "./helpers/ui.mjs";
import {
  decodePes,
  declaredRect,
  streamExtents,
} from "./helpers/pes-decoder.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
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
    project = () => page.evaluate(() => window.studio.getProject()),
    plan = () => page.evaluate(() => window.studio.getPlan()),
    pick = (id) => page.locator(`[data-select="${id}"]`).click(),
    action = async (id) => {
      const button = page.locator(`[data-operation="${id}"]`);
      if ((await button.getAttribute("aria-expanded")) !== "true")
        await button.click();
    },
    field = async (id, value) => {
      const el = page.locator("#" + id);
      await reveal(el);
      await el.fill(String(value));
      await el.press("Tab");
      await ready();
    },
    openProject = async (p) => {
      await page.locator("#file-input").setInputFiles({
        name: "actions.embstudio",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(p)),
      });
      await page.locator("#dialog-submit").click();
      await page.waitForFunction(
        (name) =>
          window.studio.getProject().name === name && window.studio.getPlan(),
        p.name,
      );
    };
  await ready();
  await openProject({
    version: 1,
    name: "Simple circle",
    machine: "se700",
    objects: [],
  });
  await page.locator('[data-tool="ellipse"]').click();
  const v = await page.evaluate(() => {
    const r = document.getElementById("stage").getBoundingClientRect(),
      v = window.studio.getView();
    return { x: r.x + v.center.x, y: r.y + v.center.y, s: v.scale };
  });
  await page.mouse.move(v.x - 12 * v.s, v.y - 12 * v.s);
  await page.mouse.down();
  await page.mouse.move(v.x + 12 * v.s, v.y + 12 * v.s, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 1 &&
      window.studio.getPlan(),
  );
  let circle = (await project()).objects[0];
  const circleId = circle.id,
    geometry = structuredClone(circle.rings);
  assert.equal(
    await page
      .locator("#embroidery-style,.active-operation,.operations-panel")
      .count(),
    0,
  );
  assert.equal(
    await page.locator("#embroidery-settings > h3").innerText(),
    "Embroidery",
  );
  assert.equal(await page.locator("#stitch-type:visible").count(), 1);
  assert(await page.locator("#add-operation").isHidden());
  assert.equal(await page.locator(".sewing-action").count(), 1);
  await page.locator("#stitch-type").selectOption("fill");
  await ready();
  await page.locator('[data-color="#6689a5"]').click();
  await ready();
  await field("spacing", 0.6);
  await field("angle", 45);
  circle = (await project()).objects[0];
  const fillId = circle.operations[0].id;
  assert.equal(circle.operations.length, 1);
  assert.equal(circle.operations[0].color, "#6689a5");
  assert.equal(circle.operations[0].spacing, 0.6);
  assert(
    (await plan()).events
      .filter((e) => e.cmd === "stitch")
      .every((e) => e.color === "#6689a5"),
  );
  assert(
    await page.locator(`#action-body-${fillId} #thread-color`).isVisible(),
  );
  assert(await page.locator(`#action-body-${fillId} #spacing`).isVisible());
  assert(await page.locator("#underlay").isHidden());
  assert(await page.locator("#corner-adaptive").isHidden());
  await page.screenshot({
    path: "test-results/sewing-action-simple-circle.png",
  });
  // A second pass is deliberate, independent and follows the fill in actual commands.
  await page.locator(".add-action-picker > summary").click();
  await chooseMethod(page, "border", { add: true });
  await page.locator("#operation-add").click();
  await ready();
  circle = (await project()).objects[0];
  let borderId = circle.operations[1].id;
  await page.locator('[data-color="#e6ab43"]').click();
  await ready();
  await field("satin-width", 1.8);
  circle = (await project()).objects[0];
  assert.equal(circle.operations.length, 2);
  assert.equal(circle.operations[0].color, "#6689a5");
  assert.equal(circle.operations[1].color, "#e6ab43");
  assert.deepEqual(circle.rings, geometry);
  assert.deepEqual(
    [
      ...new Set(
        (await plan()).events
          .filter((e) => e.cmd === "stitch")
          .map((e) => e.operationId),
      ),
    ],
    [fillId, borderId],
  );
  assert.equal((await plan()).stats.manualChanges, 1);
  assert(await page.locator(`#action-body-${fillId}`).isHidden());
  assert(
    await page.locator(`#action-body-${borderId} #stitch-type`).isVisible(),
  );
  await page.screenshot({ path: "test-results/sewing-action-fill-border.png" });
  // Method changes reuse the first action; collapse/expand is view state only.
  await action(fillId);
  await page.locator("#stitch-type").selectOption("run");
  await ready();
  await chooseMethod(page, "satin");
  await ready();
  circle = (await project()).objects[0];
  assert.equal(circle.operations.length, 2);
  assert.equal(circle.operations[0].id, fillId);
  assert.equal(circle.operations[0].type, "satin");
  assert.equal(circle.operations[1].id, borderId);
  const beforeCollapse = await project();
  await page.locator(`[data-operation="${fillId}"]`).press("Enter");
  assert(await page.locator("#stitch-type").isHidden());
  await page.locator(`[data-operation="${fillId}"]`).press("Enter");
  assert(await page.locator("#stitch-type").isVisible());
  assert.deepEqual(await project(), beforeCollapse);
  await field("operation-name", "Blue centerline");
  await page
    .locator(`[data-op-action="copy"][data-op-id="${borderId}"]`)
    .click();
  await ready();
  let copy = (await project()).objects[0].operations[2];
  assert.equal(copy.color, "#e6ab43");
  assert.equal(copy.width, 1.8);
  await page
    .locator(`[data-op-action="delete"][data-op-id="${copy.id}"]`)
    .click();
  await ready();
  await page.locator(`[data-op-action="up"][data-op-id="${borderId}"]`).click();
  await ready();
  assert.equal((await project()).objects[0].operations[0].id, borderId);
  await page.locator(`[data-op-enabled="${borderId}"]`).uncheck();
  await ready();
  assert(!(await plan()).events.some((e) => e.operationId === borderId));
  await page.locator("#undo").click();
  await ready();
  await pick(circleId);
  assert((await plan()).events.some((e) => e.operationId === borderId));
  await page.locator("#redo").click();
  await ready();
  await pick(circleId);
  assert(!(await plan()).events.some((e) => e.operationId === borderId));
  // Empty lists and legacy objects remain editable, without phantom actions.
  const legacy = smartShape("ellipse", 24, 24),
    legacyProject = {
      version: 1,
      name: "Legacy circle",
      machine: "se700",
      objects: [legacy],
    };
  await openProject(legacyProject);
  await pick(legacy.id);
  assert.deepEqual(await project(), legacyProject);
  await page.locator('[data-op-action="delete"]').click();
  await ready();
  assert.equal((await project()).objects[0].operations.length, 0);
  assert.equal((await plan()).stats.stitches, 0);
  assert(await page.locator("#method-settings").isHidden());
  await page.locator(".add-action-picker > summary").click();
  await page.locator("#add-operation").selectOption("fill");
  await page.locator("#operation-add").click();
  await ready();
  assert.equal((await project()).objects[0].operations.length, 1);
  // Geometry compatibility offers an explicit, reversible closure.
  const open = object(
    "Open outline",
    [
      [
        { x: -10, y: -8 },
        { x: 10, y: -8 },
        { x: 10, y: 8 },
      ],
    ],
    { type: "run", closed: false },
  );
  open.operations = [makeOperation("run", open)];
  const openSource = structuredClone(open);
  await openProject({
    version: 1,
    name: "Open path",
    machine: "se700",
    objects: [open],
  });
  await pick(open.id);
  await page.locator("#stitch-type").selectOption("fill");
  assert(await page.locator(".method-closure").isVisible());
  assert.deepEqual((await project()).objects[0], openSource);
  await page.locator("#close-artwork").click();
  await ready();
  assert.equal((await project()).objects[0].closed, true);
  assert.equal(
    (await project()).objects[0].operations[0].id,
    open.operations[0].id,
  );
  assert.equal((await project()).objects[0].operations[0].type, "fill");
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual((await project()).objects[0], openSource);
  const line = object(
    "Two points",
    [
      [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
      ],
    ],
    { type: "run", closed: false },
  );
  await openProject({
    version: 1,
    name: "Open line",
    machine: "se700",
    objects: [line],
  });
  await pick(line.id);
  await page.locator("#stitch-type").selectOption("fill");
  assert(await page.locator("#close-artwork").isDisabled());
  assert((await page.locator(".method-closure").innerText()).includes("nodes"));
  await page.locator("#cancel-method-change").click();
  assert.equal(await page.locator("#stitch-type").inputValue(), "run");
  // Group/multiselection edits preserve independent action stacks and explain scope.
  const a = smartShape("ellipse", 20, 16),
    b = smartShape("rect", 18, 12);
  a.parentId = b.parentId = "svg";
  a.operations = [makeOperation("fill", a), makeOperation("border", a)];
  b.operations = [makeOperation("run", b)];
  a.operations[1].color = "#e6ab43";
  b.operations[0].color = "#e5765e";
  await openProject({
    version: 1,
    name: "Group bulk",
    machine: "se700",
    objects: [a, b],
    groups: [{ id: "svg", kind: "svg", name: "Artwork" }],
  });
  await pick("svg");
  assert.equal(await page.locator("#bulk-scope").inputValue(), "primary");
  assert.equal(await page.locator("#stitch-type").inputValue(), "");
  await page.locator('[data-color="#6689a5"]').click();
  await ready();
  let bulk = (await project()).objects;
  assert.equal(bulk[0].operations.length, 2);
  assert.equal(bulk[0].operations[0].color, "#6689a5");
  assert.equal(bulk[0].operations[1].color, "#e6ab43");
  assert.equal(bulk[1].operations[0].color, "#6689a5");
  await page.locator("#bulk-scope").selectOption("all");
  await page.locator("#stitch-type").selectOption("run");
  await page
    .getByRole("heading", { name: "Change all sewing actions?", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal((await project()).objects[0].operations[0].type, "fill");
  await page.locator("#bulk-action-enabled").uncheck();
  await ready();
  assert.equal((await plan()).stats.stitches, 0);
  await page.locator("#bulk-action-enabled").check();
  await ready();
  assert((await plan()).stats.stitches > 0);
  // Advanced construction retains every action and real operator stops.
  await openProject({
    version: 1,
    name: "Applique circle",
    machine: "se700",
    objects: [legacy],
  });
  await pick(legacy.id);
  await page.locator("#applique-recipe").click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects[0].operations?.length === 5 &&
      window.studio.getPlan()?.stats.stops === 2,
  );
  let construction = (await project()).objects[0];
  assert.deepEqual(
    construction.operations.map((op) => op.type),
    ["placement", "stop", "tackdown", "stop", "border"],
  );
  assert.equal(await page.locator(".sewing-action").count(), 5);
  await action(construction.operations[1].id);
  assert.equal(await page.locator("#thread-color").count(), 0);
  await field("operation-name", "Position felt");
  assert.equal((await plan()).stats.stops, 2);
  await action(construction.operations[4].id);
  await page.locator('[data-color="#6689a5"]').click();
  await ready();
  await page.screenshot({
    path: "test-results/sewing-action-construction.png",
  });
  const saved = await project();
  await page.waitForFunction(
    () =>
      document.getElementById("save-status").textContent ===
      "Saved on this device",
  );
  const download = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const file = await download;
  await file.saveAs("test-results/unified-actions.embstudio");
  await page.reload();
  await ready();
  assert.deepEqual(await project(), saved);
  await pick(legacy.id);
  await page
    .locator("#file-input")
    .setInputFiles("test-results/unified-actions.embstudio");
  await page.locator("#dialog-submit").click();
  await ready();
  assert.deepEqual(await project(), saved);
  const beforeExport = await plan();
  assert.equal(beforeExport.stats.stops, 2);
  await page.locator("#export").click();
  const pesDownload = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  await (await pesDownload).saveAs("test-results/unified-actions.pes");
  await page.waitForFunction(() =>
    document.getElementById("sequence-source").textContent.includes("decoded"),
  );
  const dec = decodePes(await readFile("test-results/unified-actions.pes")),
    sewn = dec.pec.events.filter((e) => e.type === "stitch"),
    expected = beforeExport.events.filter((e) => e.cmd === "stitch"),
    x0 = expected[0].x,
    y0 = expected[0].y;
  assert.equal(sewn.length, expected.length);
  assert.deepEqual(declaredRect(dec.pec), streamExtents(dec.pec));
  sewn.forEach((e, i) => {
    assert.equal(e.x, Math.round((expected[i].x - x0) * 10) || 0);
    assert.equal(e.y, Math.round((expected[i].y - y0) * 10) || 0);
  });
  assert.equal(
    dec.pec.events.filter((e) => e.type === "colorChange").length,
    beforeExport.stats.stops + beforeExport.stats.manualChanges,
  );
  assert.equal((await plan()).stats.stops, 2);
  await page.locator("#design-tab").click();
  await pick(legacy.id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toggle-inspector").click();
  await page.screenshot({ path: "test-results/sewing-action-mobile.png" });
  const panel = await page
    .locator("#properties")
    .evaluate((e) => ({ width: e.clientWidth, scroll: e.scrollWidth }));
  assert(panel.scroll <= panel.width + 1);
  assert.deepEqual(errors, []);
  console.log(
    "Unified Embroidery: one visible method selector, real circle/fill/color/density, independent fill+border order, in-place method changes, cards, rename/copy/delete/reorder/disable, open-path guidance, group bulk scopes, legacy projects, construction stops, save/reopen, independently decoded PES coordinates/origin and mobile passed.",
  );
} finally {
  await browser.close();
}
