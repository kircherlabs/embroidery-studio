import { chooseTool } from "./helpers/ui.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { object } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
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
      viewport: { width: 1500, height: 1050 },
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject());
  const openProject = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "tools.embstudio",
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
  const point = async (x, y, touch = false) => {
    const p = await page.evaluate(
      ({ x, y }) => {
        const r = document.getElementById("stage").getBoundingClientRect(),
          v = window.studio.getView();
        return {
          x: r.x + v.center.x + x * v.scale,
          y: r.y + v.center.y + y * v.scale,
        };
      },
      { x, y },
    );
    if (touch) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  const verifyDock = async () => {
    const actions = await page.locator("#draw-actions").boundingBox(),
      canvas = await page.locator("#stage").boundingBox(),
      toolbar = await page.locator(".tool-context").boundingBox();
    assert(
      actions && actions.y + actions.height <= canvas.y + 1,
      "active actions never overlap canvas",
    );
    assert(
      toolbar.y + toolbar.height <= canvas.y + 1,
      "tool instructions stay outside canvas",
    );
    for (const id of ["finish-draw", "cancel-draw"]) {
      const r = await page.locator("#" + id).boundingBox();
      assert(
        r.x >= 0 && r.x + r.width <= (await page.viewportSize()).width,
        "drawing buttons fit viewport",
      );
      assert(
        r.y >= toolbar.y && r.y + r.height <= toolbar.y + toolbar.height + 1,
        "buttons contained by top toolbar",
      );
    }
  };
  await ready();
  for (const [width, height] of [
    [1500, 1050],
    [1024, 768],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await openProject({
      version: 1,
      name: `Dock ${width}`,
      machine: "se700",
      objects: [],
    });
    for (const tool of ["polygon", "run", "satin", "pen", "manual"]) {
      await chooseTool(page, tool);
      await page.locator("#zoom-fit").click();
      const before = await page.locator("#stage").boundingBox();
      await point(-8, -8, width === 390);
      assert(await page.locator("#finish-draw").isDisabled());
      await verifyDock();
      const after = await page.locator("#stage").boundingBox();
      assert(
        Math.abs(before.y - after.y) < 1 &&
          Math.abs(before.height - after.height) < 1,
        `starting ${tool} at ${width} does not shift canvas: ${JSON.stringify({ before, after })}`,
      );
      await point(8, -8, width === 390);
      await point(8, 8, width === 390);
      assert(
        !(await page.locator("#finish-draw").isDisabled()),
        `Finish ${tool} at ${width} after points: ${await page.locator("#draw-message").innerText()}; canvas ${JSON.stringify(await page.locator("#stage").boundingBox())}`,
      );
      if (tool === "pen") await page.locator("#pen-closed").check();
      await verifyDock();
      if (width === 1500 && tool === "satin")
        await page.screenshot({
          path: "test-results/tool-context-desktop.png",
        });
      if (width === 390 && tool === "pen")
        await page.screenshot({ path: "test-results/tool-context-mobile.png" });
      const n = (await project()).objects.length;
      if (tool === "run") {
        await page.locator("#cancel-draw").click();
        assert.equal((await project()).objects.length, n);
      } else {
        await page.locator("#finish-draw").click();
        await page.waitForFunction(
          (n) =>
            window.studio.getProject().objects.length === n + 1 &&
            window.studio.getPlan(),
          n,
        );
        const o = (await project()).objects.at(-1);
        if (tool === "pen") assert(o.curve.closed);
        assert(
          (await page.evaluate(() => window.studio.getPlan())).events.some(
            (e) => e.objectId === o.id && e.cmd === "stitch",
          ),
        );
      }
      assert(await page.locator("#draw-actions").isHidden());
    }
  }
  await page.setViewportSize({ width: 1500, height: 1050 });
  const o = object(
    "Threaded",
    [
      [
        { x: -12, y: -8 },
        { x: 12, y: -8 },
        { x: 12, y: 8 },
        { x: -12, y: 8 },
      ],
    ],
    { color: "#e6ab43" },
  );
  o.operations = [makeOperation("fill", o), makeOperation("border", o)];
  o.operations[1].color = "#292c31";
  await openProject({
    version: 1,
    name: "Operation colors",
    machine: "se700",
    objects: [o],
  });
  const swatch = page.locator(`[data-select="${o.id}"] .swatch`),
    pick = () => page.locator(`[data-select="${o.id}"]`).click(),
    swatchColors = () => swatch.getAttribute("aria-label");
  await pick();
  assert.equal(await swatchColors(), "Thread colors: #e6ab43, #292c31");
  assert(
    (
      await swatch.evaluate((e) => getComputedStyle(e).backgroundImage)
    ).includes("linear-gradient"),
  );
  await page.locator('[data-color="#ad8aae"]').click();
  await ready();
  assert.equal((await project()).objects[0].color, "#e6ab43");
  assert.equal(await swatchColors(), "Thread colors: #ad8aae, #292c31");
  assert.equal(await page.locator("#thread-color").inputValue(), "#ad8aae");
  assert(
    (
      await page.locator("#sewing-order .object-color-key").innerHTML()
    ).includes("#ad8aae"),
  );
  await page.keyboard.press("Control+z");
  await ready();
  assert.equal(await swatchColors(), "Thread colors: #e6ab43, #292c31");
  await page.keyboard.press("Control+Shift+z");
  await ready();
  assert.equal(await swatchColors(), "Thread colors: #ad8aae, #292c31");
  await pick();
  await page.locator(`[data-op-enabled="${o.operations[1].id}"]`).uncheck();
  await ready();
  assert.equal(await swatchColors(), "Thread colors: #ad8aae");
  assert.equal(
    await swatch.evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(173, 138, 174)",
  );
  const saved = await project();
  await page.waitForFunction(
    () =>
      document.getElementById("save-status").textContent ===
      "Saved on this device",
  );
  await page.reload();
  await ready();
  assert.deepEqual(await project(), saved);
  assert.equal(await swatchColors(), "Thread colors: #ad8aae");
  assert.deepEqual(errors, []);
  console.log(
    "Docked drawing: polygon/run/satin/pen/manual paths on five viewports, touch, no canvas obstruction or draft layout shift, Finish/Cancel, actual stitches; operation-based tree colors, multicolor/disabled steps, sequence agreement, Undo/Redo and reload passed.",
  );
} finally {
  await browser.close();
}
