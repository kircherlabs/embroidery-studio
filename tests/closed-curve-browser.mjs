import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { object } from "../src/model.js";
import { mapPoint } from "../src/smart-geometry.js";
import { cubic } from "../src/path-editing.js";
import { chooseTool, reveal } from "./helpers/ui.mjs";
import { decodePes } from "./helpers/pes-decoder.mjs";
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
      viewport: { width: 1500, height: 1100 },
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = async () => {
      await page.waitForFunction(() => window.studio?.getPlan());
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
    },
    project = () => page.evaluate(() => window.studio.getProject());
  const load = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "curves.embstudio",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      ({ name, ids }) =>
        window.studio.getProject().name === name &&
        window.studio
          .getProject()
          .objects.map((o) => o.id)
          .join(",") === ids &&
        window.studio.getPlan(),
      { name: p.name, ids: p.objects.map((o) => o.id).join(",") },
    );
    await ready();
  };
  const o = object(
    "Closed Shape",
    [
      [
        { x: -20, y: -20 },
        { x: 20, y: -20 },
        { x: 20, y: 20 },
        { x: -20, y: 20 },
      ],
    ],
    { closed: true, underlay: false, compensation: 0 },
  );
  await ready();
  await load({
    version: 1,
    name: "Closed curve browser",
    machine: "se700",
    objects: [o],
  });
  const pick = async () => {
    await page.locator("#design-tab").click();
    await page.locator(`[data-select="${o.id}"] .object-title`).click();
    await chooseTool(page, "node");
  };
  await page.locator(`[data-select="${o.id}"] .object-title`).click();
  assert(await page.locator("#node-smooth").isDisabled());
  await pick();
  assert(await page.locator("#closed-curve-actions").isVisible());
  assert.equal(await page.locator("#closed-curve-action").count(), 0);
  const world = async (p) =>
    page.evaluate((p) => {
      const v = window.studio.getView(),
        r = document.getElementById("stage").getBoundingClientRect();
      return {
        x: r.x + v.center.x + p.x * v.scale,
        y: r.y + v.center.y + p.y * v.scale,
      };
    }, p);
  const dbl = async (p) => {
    const a = await world(p);
    await page.mouse.dblclick(a.x, a.y);
    await ready();
  };
  const leaf = async () => (await project()).objects[0];
  const contour = async () => {
    await page.locator("#stage").focus();
    await page.keyboard.press("Shift+F10");
    await page.locator('[data-arrange="node:1"]').click();
    await ready();
  };
  await dbl({ x: 0, y: -20 });
  let current = await leaf();
  assert(current.curve.nodes[0].out && current.curve.nodes[1].in);
  const anchors = current.curve.nodes.map(({ x, y }) => ({ x, y }));
  assert.deepEqual(anchors, o.rings[0]);
  const mid = () => {
    const a = current.curve.nodes[0],
      b = current.curve.nodes[1];
    return mapPoint(
      cubic([a, a.out || a, b.in || b, b], 0.5),
      current.curve.frame,
    );
  };
  const curved = structuredClone([
    current.curve.nodes[0].out,
    current.curve.nodes[1].in,
  ]);
  await dbl(mid());
  current = await leaf();
  assert(!current.curve.nodes[0].out && !current.curve.nodes[1].in);
  await page.locator("#undo").click();
  await ready();
  current = await leaf();
  assert.deepEqual(
    [current.curve.nodes[0].out, current.curve.nodes[1].in],
    curved,
  );
  await page.locator("#redo").click();
  await ready();
  current = await leaf();
  assert(!current.curve.nodes[0].out);
  await pick();
  await dbl({ x: 0, y: -20 });
  current = await leaf();
  const corner = structuredClone(current.curve.nodes[0]);
  await dbl({ x: -20, y: -20 });
  current = await leaf();
  assert.equal(
    current.curve.nodes[0].mode,
    "smooth",
    await page.locator("#toast").textContent(),
  );
  // A visible tangent handle remains draggable and enforces tangent alignment.
  let n = current.curve.nodes[0],
    a = await world(mapPoint(n.out, current.curve.frame)),
    b = await world({ x: n.out.x + 1, y: n.out.y + 1 });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await ready();
  current = await leaf();
  n = current.curve.nodes[0];
  assert(
    Math.abs(
      (n.in.x - n.x) * (n.out.y - n.y) - (n.in.y - n.y) * (n.out.x - n.x),
    ) < 1e-6,
  );
  await dbl({ x: -20, y: -20 });
  current = await leaf();
  assert.deepEqual(current.curve.nodes[0], corner);
  await dbl({ x: -20, y: -20 });
  current = await leaf();
  const controls = structuredClone([
    current.curve.nodes[0].in,
    current.curve.nodes[0].out,
  ]);
  await reveal(page.locator("#node-break"));
  await page.locator("#node-break").click();
  await ready();
  current = await leaf();
  assert(current.curve.nodes[0].broken);
  assert.deepEqual(
    [current.curve.nodes[0].in, current.curve.nodes[0].out],
    controls,
  );
  await page.locator("#node-smooth").click();
  await ready();
  assert.equal((await leaf()).curve.nodes[0].mode, "smooth");
  const beforeWhole = await leaf();
  await dbl({ x: 0, y: 0 });
  assert((await leaf()).curve.wholeMemory);
  await dbl({ x: 0, y: 0 });
  current = await leaf();
  assert.deepEqual(current.rings, beforeWhole.rings);
  assert.deepEqual(current.curve.nodes, beforeWhole.curve.nodes);
  const beforeHandle = JSON.stringify(current);
  await dbl(mapPoint(current.curve.nodes[0].out, current.curve.frame));
  assert.equal(JSON.stringify(await leaf()), beforeHandle);
  const beforeBackground = JSON.stringify(current);
  await dbl({ x: 42, y: 42 });
  assert.equal(JSON.stringify(await leaf()), beforeBackground);
  await pick();
  await contour();
  await ready();
  const download = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const saved = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  await load(saved);
  await pick();
  await contour();
  await ready();
  assert.deepEqual((await leaf()).rings, beforeWhole.rings);
  // Touch uses the same contextual actions; double-click is never mandatory.
  const pt = await world({ x: -20, y: -20 });
  await page.touchscreen.tap(pt.x, pt.y);
  await page.locator("#node-smooth").click();
  await ready();
  assert.equal((await leaf()).curve.nodes[0].mode, "smooth");
  await page.locator("#node-break").click();
  await ready();
  assert((await leaf()).curve.nodes[0].broken);
  await page.screenshot({ path: "test-results/closed-curve-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseTool(page, "node");
  await contour();
  await ready();
  assert((await leaf()).curve.wholeMemory);
  await page.screenshot({ path: "test-results/closed-curve-mobile.png" });
  assert(
    (await page.evaluate(() => window.studio.getPlan())).stats.stitches > 100,
  );
  await page.setViewportSize({ width: 1500, height: 1100 });
  const holed = {
    ...structuredClone(o),
    rings: [
      ...structuredClone(o.rings),
      [
        { x: -6, y: -6 },
        { x: 6, y: -6 },
        { x: 6, y: 6 },
        { x: -6, y: 6 },
      ],
    ],
  };
  await load({
    version: 1,
    name: "Closed contour with hole",
    machine: "se700",
    objects: [holed],
  });
  await pick();
  await reveal(page.locator("#closed-contour"));
  await page.locator("#closed-contour").selectOption("1");
  await contour();
  await ready();
  assert((await leaf()).curve.contours[0].wholeMemory);
  await contour();
  await ready();
  assert.deepEqual((await leaf()).rings, holed.rings);
  const originalProject = await project(),
    needles = await page.evaluate(() =>
      window.studio.getPlan().events.filter((e) => e.cmd === "stitch"),
    );
  await page.locator("#export").click();
  await page.locator("#export-format").selectOption("pes");
  const pesDownload = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  const decoded = decodePes(
    new Uint8Array(await readFile(await (await pesDownload).path())),
  ).pec.events.filter((e) => e.type === "stitch");
  assert.equal(decoded.length, needles.length);
  decoded.forEach((e, i) => {
    assert.equal(e.x, Math.round((needles[i].x - needles[0].x) * 10) || 0);
    assert.equal(e.y, Math.round((needles[i].y - needles[0].y) * 10) || 0);
  });
  assert.deepEqual(await project(), originalProject);
  const other = object(
    "Other artwork",
    [
      [
        { x: 28, y: -8 },
        { x: 40, y: -8 },
        { x: 40, y: 8 },
        { x: 28, y: 8 },
      ],
    ],
    { closed: true },
  );
  await load({ ...saved, objects: [saved.objects[0], other] });
  await pick();
  const otherPoint = await world({ x: 33, y: 0 });
  await page.mouse.click(otherPoint.x, otherPoint.y);
  // A slow render between native click 1 and click 2 must not change the
  // selection that owned the double-click gesture (Linux CI regression).
  await page.waitForTimeout(650);
  await page.mouse.move(otherPoint.x, otherPoint.y);
  await page.mouse.down({ clickCount: 2 });
  await page.mouse.up({ clickCount: 2 });
  await ready();
  assert(
    !(await project()).objects[1].curve,
    "Double-clicking a different object must not smooth it",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Closed Shape: actual segment/vertex/interior double-clicks, exact restoration, independent Break Handles, dragged tangent alignment, Undo/Redo, portable project reload, touch/context controls, responsive layout, regenerated stitches and independently decoded PES needle geometry passed.",
  );
} finally {
  await browser.close();
}
