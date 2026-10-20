import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { object } from "../src/model.js";
import { chooseTool } from "./helpers/ui.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    draft = () => page.evaluate(() => window.studio.getDrawing()),
    world = (p) =>
      page.evaluate((p) => {
        const r = document.getElementById("stage").getBoundingClientRect(),
          v = window.studio.getView();
        return {
          x: r.x + v.center.x + p.x * v.scale,
          y: r.y + v.center.y + p.y * v.scale,
        };
      }, p);
  await ready();
  const p = {
    version: 1,
    name: "Completed art remains",
    machine: "se700",
    objects: [
      object(
        "Completed",
        [
          [
            { x: -30, y: -25 },
            { x: -20, y: -25 },
            { x: -20, y: -15 },
            { x: -30, y: -15 },
          ],
        ],
        { underlay: false },
      ),
    ],
  };
  await page.locator("#file-input").setInputFiles({
    name: "draft.embstudio",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().name === "Completed art remains" &&
      window.studio.getPlan(),
  );
  const baseline = await project();
  for (const tool of ["polygon", "run", "satin", "manual", "pen"]) {
    await chooseTool(page, tool);
    for (const point of [
      { x: -10, y: -5 },
      { x: 10, y: -5 },
      { x: 10, y: 10 },
      { x: -10, y: 10 },
    ]) {
      const pos = await world(point);
      if (tool === "pen") {
        await page.mouse.move(pos.x, pos.y);
        await page.mouse.down();
        await page.mouse.move(pos.x + 3, pos.y - 4);
        await page.mouse.up();
      } else await page.mouse.click(pos.x, pos.y);
    }
    const original = (await draft()).points;
    assert.equal(original.length, 4);
    await page.keyboard.press("Control+z");
    assert.deepEqual((await draft()).points, original.slice(0, 3));
    assert.deepEqual(await project(), baseline);
    await page.keyboard.press("Meta+z");
    assert.deepEqual((await draft()).points, original.slice(0, 2));
    await page.keyboard.press("Control+Shift+z");
    assert.deepEqual((await draft()).points, original.slice(0, 3));
    await page.locator("#undo").click();
    assert.equal((await draft()).points.length, 2);
    assert.deepEqual(await project(), baseline);
    await page.locator("#redo").click();
    assert.deepEqual((await draft()).points, original.slice(0, 3));
    await page.locator("#stage").focus();
    await page.keyboard.press("Backspace");
    assert.equal((await draft()).points.length, 2);
    await page.locator("#undo-draw-point").click();
    assert.equal((await draft()).points.length, 1);
    await page.locator("#stage").focus();
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    assert.equal((await draft()).points.length, 0);
    assert((await draft()).active);
    assert.deepEqual(await project(), baseline);
    await page.keyboard.press("Control+Shift+z");
    assert.equal((await draft()).points.length, 1);
    for (const point of [
      { x: 8, y: -5 },
      { x: 8, y: 8 },
    ]) {
      const pos = await world(point);
      await page.touchscreen.tap(pos.x, pos.y);
    }
    assert.equal((await draft()).points.length, 3);
    assert.equal((await draft()).redo.length, 0);
    await page.locator("#finish-draw").click();
    await ready();
    assert.equal((await project()).objects.length, 2);
    assert(!(await draft()).active);
    await page.locator("#stage").focus();
    await page.keyboard.press("Control+z");
    await ready();
    assert.deepEqual(await project(), baseline);
    await page.keyboard.press("Control+Shift+z");
    await ready();
    assert.equal((await project()).objects.length, 2);
    await page.keyboard.press("Control+z");
    await ready();
    assert.deepEqual(await project(), baseline);
  }
  assert.deepEqual(errors, []);
  console.log(
    "Draft Undo: Closed Shape, Running, Satin Line, Manual Stitch and Bézier Pen remove/restore exact draft points, protect completed project history at zero points, support Backspace/touch and restore normal Undo/Redo after finishing.",
  );
} finally {
  await browser.close();
}
