import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { object } from "../src/model.js";
import { reveal } from "./helpers/ui.mjs";
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
    needles = (p) => p.events.map(({ cmd, x, y }) => ({ cmd, x, y }));
  const pick = () => page.locator('[data-select="texture"]').click();
  const field = async (id, value) => {
    const el = page.locator("#" + id);
    await reveal(el);
    await el.fill(String(value));
    await el.press("Tab");
    await ready();
  };
  const open = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "textures.embstudio",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      (n) => window.studio.getProject().name === n && window.studio.getPlan(),
      p.name,
    );
  };
  const rect = (r) => [
    { x: -r, y: -r },
    { x: r, y: -r },
    { x: r, y: r },
    { x: -r, y: r },
  ];
  await ready();
  await open({
    version: 1,
    name: "Texture browser",
    machine: "se700",
    objects: [
      object("Fill with a counter", [rect(16), rect(4)], {
        id: "texture",
        closed: true,
        fillRule: "evenodd",
        angle: 0,
        underlay: false,
        compensation: 0,
      }),
    ],
  });
  await pick();
  const original = await project(),
    legacy = needles(await plan());
  assert.equal(await page.locator("#fill-pattern:visible").count(), 1);
  assert.equal(await page.locator("#fill-method").inputValue(), "tatami");
  await page.locator("#fill-pattern").selectOption("twill");
  await ready();
  let p = await project(),
    op = p.objects[0].operations[0];
  assert.equal(p.version, 2);
  assert.equal(op.fillSettings.texture, "twill");
  assert.equal(p.objects[0].operations.length, 1);
  assert.deepEqual(p.objects[0].rings, original.objects[0].rings);
  assert.notDeepEqual(needles(await plan()), legacy);
  assert.equal(await page.locator("#angle:visible").count(), 0);
  const a = needles(await plan());
  await field("fill-period", 5);
  assert.notDeepEqual(needles(await plan()), a);
  await field("fill-period", 1000);
  assert.match(await page.locator("#fill-input-error").innerText(), /period/i);
  assert.equal(
    (await project()).objects[0].operations[0].fillSettings.period,
    5,
  );
  await page.locator(".fill-pattern-picker > summary").click();
  assert.equal(await page.locator("[data-fill-texture]").count(), 11);
  assert(
    (await page.locator(".fill-pattern-picker svg circle").count()) > 100,
    "samples contain real generated needle coordinates",
  );
  await page.locator('[data-fill-texture="random"]').click();
  await ready();
  const seeded = needles(await plan());
  await field("fill-seed", 95);
  assert.notDeepEqual(needles(await plan()), seeded);
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(needles(await plan()), seeded);
  await page.locator("#redo").click();
  await ready();
  await pick();
  await page.locator("#fill-pattern").selectOption("custom");
  await ready();
  await field("fill-sequence", "0, 0.45, 0.1, 0.7");
  assert.deepEqual(
    (await project()).objects[0].operations[0].fillSettings.sequence,
    [0, 0.45, 0.1, 0.7],
  );
  const custom = needles(await plan());
  await field("fill-sequence", "0, , 0.7");
  assert.match(
    await page.locator("#fill-input-error").innerText(),
    /comma-separated/,
  );
  assert.deepEqual(needles(await plan()), custom);
  await reveal(page.locator("#fill-edge"));
  await page.locator("#fill-edge").check();
  await ready();
  assert.equal(
    (await project()).objects[0].operations[0].fillSettings.edgeOptimize,
    true,
  );
  await field("fill-edgeMinimum", 0.7);
  await reveal(page.locator("#fill-anchor"));
  await page.locator("#fill-anchor").selectOption("global");
  await ready();
  assert.deepEqual(
    (await project()).objects[0].operations[0].fillSettings.frame,
    [1, 0, 0, 1, 0, 0],
  );
  await field("fill-originX", 2);
  assert.equal(
    (await project()).objects[0].operations[0].fillSettings.frame[4],
    2,
  );
  await reveal(page.locator("#fill-anchor"));
  await page.locator("#fill-anchor").selectOption("object");
  await ready();
  assert.equal(
    (await project()).objects[0].operations[0].fillSettings.anchor,
    "object",
  );
  await pick();
  await page.locator(".fill-pattern-picker > summary").click();
  await page.screenshot({ path: "test-results/fill-textures-desktop.png" });
  const saved = await project();
  await page.waitForFunction(
    () =>
      document.getElementById("save-status").textContent ===
      "Saved on this device",
  );
  const download = page.waitForEvent("download");
  await page.locator("#save-project").click();
  await (await download).saveAs("test-results/fill-textures.embstudio");
  await page.reload();
  await ready();
  assert.deepEqual(await project(), saved);
  await pick();
  await open({ ...saved, name: "Reopened texture" });
  await pick();
  assert.deepEqual((await project()).objects, saved.objects);
  const beforeExport = await plan();
  assert(!beforeExport.issues.some((i) => i.severity === "error"));
  await page.locator("#export").click();
  const pes = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  await (await pes).saveAs("test-results/fill-textures.pes");
  const decoded = decodePes(await readFile("test-results/fill-textures.pes")),
    sewn = decoded.pec.events.filter((e) => e.type === "stitch"),
    expected = beforeExport.events.filter((e) => e.cmd === "stitch");
  assert.equal(sewn.length, expected.length);
  assert.deepEqual(declaredRect(decoded.pec), streamExtents(decoded.pec));
  sewn.forEach((e, i) => {
    assert.equal(e.x, Math.round((expected[i].x - expected[0].x) * 10) || 0);
    assert.equal(e.y, Math.round((expected[i].y - expected[0].y) * 10) || 0);
  });
  await page.locator("#design-tab").click();
  await pick();
  await reveal(page.locator("#fill-reset"));
  await page.locator("#fill-reset").click();
  await ready();
  assert.equal((await project()).version, 1);
  assert.deepEqual(needles(await plan()), legacy);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toggle-inspector").click();
  await page.locator("#fill-pattern").selectOption("wave");
  await ready();
  await reveal(page.locator(".fill-pattern-picker"));
  await page.locator(".fill-pattern-picker > summary").click();
  await page.screenshot({ path: "test-results/fill-textures-mobile.png" });
  const panel = await page
    .locator("#properties")
    .evaluate((e) => ({ width: e.clientWidth, scroll: e.scrollWidth }));
  assert(panel.scroll <= panel.width + 1);
  assert.deepEqual(errors, []);
  console.log(
    "Fill textures: real samples, action edits, invalid input, Undo/Redo, persistence, legacy reset, decoded PES and responsive UI pass.",
  );
} finally {
  await browser.close();
}
