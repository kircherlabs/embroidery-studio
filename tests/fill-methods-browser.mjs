import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
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
    pick = () => page.locator('[data-select="fill-methods"]').click();
  const field = async (id, v) => {
    const e = page.locator("#" + id);
    await reveal(e);
    await e.fill(String(v));
    await e.press("Tab");
    await ready();
  };
  const exportCheck = async (name) => {
    const before = await plan();
    assert(
      !before.issues.some((i) => i.severity === "error"),
      JSON.stringify(before.issues),
    );
    await page.locator("#export").click();
    const dl = page.waitForEvent("download", { timeout: 180000 });
    await page.locator("#dialog-submit").click();
    await (await dl).saveAs(`test-results/${name}.pes`);
    const d = decodePes(await readFile(`test-results/${name}.pes`)),
      actual = d.pec.events.filter((e) => e.type === "stitch"),
      expected = before.events.filter((e) => e.cmd === "stitch");
    assert.equal(actual.length, expected.length);
    assert.deepEqual(declaredRect(d.pec), streamExtents(d.pec));
    actual.forEach((e, i) => {
      assert.equal(e.x, Math.round((expected[i].x - expected[0].x) * 10) || 0);
      assert.equal(e.y, Math.round((expected[i].y - expected[0].y) * 10) || 0);
    });
    await page.locator("#design-tab").click();
    await pick();
  };
  const outer = [
      { x: -18, y: -14 },
      { x: 18, y: -14 },
      { x: 18, y: 14 },
      { x: -18, y: 14 },
    ],
    hole = [
      { x: -4, y: -4 },
      { x: 4, y: -4 },
      { x: 4, y: 4 },
      { x: -4, y: 4 },
    ],
    o = object("Decorative fill", [outer, hole], {
      id: "fill-methods",
      closed: true,
      fillRule: "evenodd",
      angle: 0,
      compensation: 0,
      underlay: false,
      color: "#6689a5",
    });
  await ready();
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "methods.embstudio",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          name: "Decorative methods",
          machine: "se700",
          objects: [o],
        }),
      ),
    });
  await page.locator("#dialog-submit").click();
  await ready();
  await pick();
  await page.locator("#fill-method").selectOption("contour");
  await ready();
  let p = await project(),
    id = p.objects[0].operations[0].id;
  assert.equal(p.objects[0].operations.length, 1);
  assert.equal(p.objects[0].operations[0].color, o.color);
  assert.deepEqual(p.objects[0].rings, o.rings);
  assert.equal(p.objects[0].operations[0].name, "Contour Fill");
  assert((await page.locator("#fill-pattern").count()) === 0);
  assert(await page.locator("#underlay").isHidden());
  assert(await page.locator("#compensation").isHidden());
  const outside = (await plan()).events;
  await page.locator("#fill-direction").selectOption("inside-out");
  await ready();
  assert.notDeepEqual((await plan()).events, outside);
  await field("spacing", 0.7);
  assert((await plan()).diagnostics.fills[0].levels > 5);
  await page.locator("#undo").click();
  await ready();
  await page.locator("#redo").click();
  await ready();
  await pick();
  assert.equal((await project()).objects[0].operations[0].id, id);
  await exportCheck("contour-fill");
  await page.screenshot({ path: "test-results/contour-fill-desktop.png" });
  const saved = await project();
  await page.waitForFunction(
    () =>
      document.getElementById("save-status").textContent ===
      "Saved on this device",
  );
  await page.reload();
  await ready();
  assert.deepEqual(await project(), saved);
  await pick();
  await page.locator("#fill-method").selectOption("tatami");
  await ready();
  assert.equal((await project()).objects[0].operations[0].id, id);
  assert(await page.locator("#fill-pattern").isVisible());
  assert.equal((await project()).objects[0].operations.length, 1);
  assert.deepEqual(errors, []);
  console.log(
    "Decorative fills: Contour order/spacing, holes, one action, contextual controls, history, persistence and exact decoded PES pass.",
  );
} finally {
  await browser.close();
}
