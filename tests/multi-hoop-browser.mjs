import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { object } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
import { unzipSync, strFromU8 } from "../vendor/fflate.js";
import { decodePes } from "./helpers/pes-decoder.mjs";
import { reveal } from "./helpers/ui.mjs";
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
const ring = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1100 },
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  await ready();
  const project = () => page.evaluate(() => window.studio.getProject()),
    multi = () => page.evaluate(() => window.studio.getMultiHoop());
  const open = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "multi.embstudio",
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
  const p = {
    version: 1,
    name: "Multi-Hoop browser",
    machine: "se700",
    objects: [
      object(
        "Continuous fill with counter",
        [ring(-120, -22, 240, 44), ring(-12, -8, 24, 16)],
        { angle: 0, underlay: true, spacing: 0.6, color: "#123456" },
      ),
    ],
  };
  await open(p);
  const source = (await project()).objects;
  await reveal(page.locator("#multi-hoop-entry"));
  await page.locator("#multi-hoop-entry").click();
  await page.waitForFunction(
    () => window.studio.getMultiHoop().bundle?.sections.length === 3,
  );
  assert.deepEqual((await project()).objects, source);
  assert.equal((await multi()).bundle.problems.length, 0);
  assert((await multi()).bundle.sections.every((s) => s.plan.stats.fits));
  const coordinate = async (p) =>
    page.evaluate((p) => {
      const v = window.studio.getView(),
        b = document.getElementById("stage").getBoundingClientRect();
      return {
        x: b.x + v.center.x + p.x * v.scale,
        y: b.y + v.center.y + p.y * v.scale,
      };
    }, p);
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const before = await project(),
    h = before.multiHoop.hoops[0],
    a = await coordinate({ x: h.x - 50, y: h.y }),
    b = await coordinate({ x: h.x - 47, y: h.y + 2 });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  assert.match(
    await page.locator("#multi-summary").textContent(),
    /release to regenerate/,
  );
  await page.mouse.up();
  await ready();
  assert.notEqual((await project()).multiHoop.hoops[0].x, h.x);
  assert.deepEqual((await project()).objects, source);
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual((await project()).multiHoop, before.multiHoop);
  await page.locator("#redo").click();
  await ready();
  assert.notEqual((await project()).multiHoop.hoops[0].x, h.x);
  await page.locator("#undo").click();
  await ready();
  // The same drag can be canceled without changing history or the source.
  const c = await coordinate({ x: h.x - 50, y: h.y }),
    d = await coordinate({ x: h.x - 45, y: h.y });
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(d.x, d.y);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual((await project()).multiHoop, before.multiHoop);
  await page.locator("#multi-view").selectOption("selected");
  await page
    .locator("#multi-selected")
    .selectOption(before.multiHoop.hoops[1].id);
  await page.locator("#multi-preview").click();
  assert.match(
    await page.locator("#sequence-source").textContent(),
    /Hooping 2/,
  );
  const selectedPlan = await page.evaluate(() => window.studio.getPlan());
  assert.equal(
    selectedPlan.stats.stitches,
    (await multi()).bundle.sections[1].plan.stats.stitches,
  );
  await page.locator("#multi-view").selectOption("all");
  assert.match(
    await page.locator("#sequence-source").textContent(),
    /3 hoopings/,
  );
  assert.equal(await page.locator("#color-timeline button").count(), 3);
  assert.equal(await page.locator(".sewing-object").count(), 3);
  assert.equal(
    await page.locator(".sewing-object [data-sew-grip]:enabled").count(),
    0,
  );
  await page.locator("#design-tab").click();
  await page
    .locator("#multi-selected")
    .selectOption(before.multiHoop.hoops[0].id);
  await page.locator("#multi-down").click();
  await ready();
  assert.equal((await project()).multiHoop.hoops[1].id, h.id);
  await page.locator("#undo").click();
  await ready();
  await page.screenshot({ path: "test-results/multi-hoop-desktop.png" });
  const saved = page.waitForEvent("download");
  await page.locator("#save-project").click();
  await (await saved).saveAs("test-results/multi-hoop-master.embstudio");
  const disk = JSON.parse(
    await readFile("test-results/multi-hoop-master.embstudio", "utf8"),
  );
  assert.deepEqual(disk.multiHoop, (await project()).multiHoop);
  await page.waitForTimeout(500);
  await page.reload();
  await ready();
  assert.equal((await multi()).bundle.sections.length, 3);
  assert.deepEqual((await project()).multiHoop, disk.multiHoop);
  assert.deepEqual((await project()).objects, source);
  await reveal(page.locator("#multi-hoop-entry"));
  await page.locator("#multi-hoop-entry").click();
  await page.locator("#multi-registration").check();
  await ready();
  assert.equal((await multi()).bundle.problems.length, 0);
  assert(
    (await multi()).bundle.sections.every((s) =>
      s.plan.events.some((e) => e.cmd === "stop"),
    ),
  );
  assert.deepEqual((await project()).objects, source);
  await page.locator("#multi-registration").uncheck();
  await ready();
  await page.locator("#multi-export").click();
  await page.locator("#multi-export-format").selectOption("all");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      document.getElementById("dialog-title").textContent ===
      "Review Multi-Hoop package",
    {},
    { timeout: 180000 },
  );
  assert.match(
    await page.locator("#dialog-content").textContent(),
    /18 verified machine files/,
  );
  const download = page.waitForEvent("download");
  await page.locator("#dialog-submit").click();
  await (await download).saveAs("test-results/multi-hoop-package.zip");
  const zip = unzipSync(
      new Uint8Array(await readFile("test-results/multi-hoop-package.zip")),
    ),
    manifest = JSON.parse(strFromU8(zip["HOOPING-MANIFEST.json"]));
  assert.equal(manifest.files.length, 18);
  assert.equal(manifest.hoopings.length, 3);
  for (const f of manifest.files.filter((f) => f.format === "pes")) {
    const decoded = decodePes(zip[f.path]),
      s = (await multi()).bundle.sections[f.hooping - 1],
      a = s.plan.events.filter((e) => e.cmd === "stitch"),
      b = decoded.pec.events.filter((e) => e.type === "stitch");
    assert.equal(a.length, b.length);
    b.forEach((e, i) => {
      assert.equal(e.x, Math.round((a[i].x - a[0].x) * 10) || 0);
      assert.equal(e.y, Math.round((a[i].y - a[0].y) * 10) || 0);
    });
  }
  const print = await browser.newPage();
  await print.setContent(strFromU8(zip["PRINT-AT-100-PERCENT.html"]));
  await print.emulateMedia({ media: "print" });
  const ruler = await print.locator("header svg").first().boundingBox();
  assert(Math.abs(ruler.width - (50 * 96) / 25.4) < 0.1);
  assert.equal(await print.locator(".sheet").count(), 3);
  await print.close();
  // Any master edit invalidates all derived plans. A nudge is ordinary source editing.
  await page.locator("#multi-done").click();
  await page.locator(`[data-select="${source[0].id}"]`).click();
  await page.locator("#stage").focus();
  await page.keyboard.press("ArrowRight");
  await ready();
  assert.notDeepEqual((await project()).objects, source);
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual((await project()).objects, source);
  await reveal(page.locator("#multi-hoop-entry"));
  await page.locator("#multi-hoop-entry").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  assert(
    await page
      .locator("#multi-hoop-controls")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  );
  await page.screenshot({ path: "test-results/multi-hoop-mobile.png" });
  const mobileBefore = await project(),
    mh = mobileBefore.multiHoop.hoops[0],
    scale = (await page.evaluate(() => window.studio.getView())).scale;
  const touchFrom = await coordinate({
      x: mh.x - 50 + 17 / scale,
      y: mh.y - 50 + 17 / scale,
    }),
    touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchFrom],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchFrom.x + 6, y: touchFrom.y + 3 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await ready();
  assert.notDeepEqual(
    (await project()).multiHoop.hoops,
    mobileBefore.multiHoop.hoops,
  );
  assert.deepEqual((await project()).objects, source);
  await page.screenshot({ path: "test-results/multi-hoop-touch.png" });
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual((await project()).multiHoop, mobileBefore.multiHoop);
  await touch.detach();
  await page.locator("#multi-x").scrollIntoViewIfNeeded();
  await page.locator("#multi-x").fill("5");
  await page.locator("#multi-x").press("Tab");
  await ready();
  const chosen = (await multi()).selected;
  assert.equal(
    (await project()).multiHoop.hoops.find((h) => h.id === chosen).x,
    5,
  );
  // Unsafe oversized satin is actionable, not silently cut into tatami.
  await page.setViewportSize({ width: 1600, height: 1100 });
  const wide = object("Oversized satin", [ring(-100, -5, 200, 10)]);
  wide.operations = [makeOperation("column", wide)];
  await open({
    version: 1,
    name: "Unsupported satin",
    machine: "se700",
    objects: [wide],
  });
  await reveal(page.locator("#multi-hoop-entry"));
  await page.locator("#multi-hoop-entry").click();
  await page.waitForFunction(() => window.studio.getMultiHoop().bundle);
  assert((await multi()).bundle.problems.length > 0);
  assert.match(
    await page.locator("#multi-issues").textContent(),
    /cannot be cut automatically/,
  );
  assert(await page.locator("#multi-export").isDisabled());
  // Oversized single-hoop Export offers the production workflow, without bypassing a field check.
  await open({ ...p, name: "Export entry large" });
  await page.locator("#export").click();
  assert.match(
    await page.locator("#dialog-title").textContent(),
    /exceeds one sewing field/,
  );
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () => window.studio.getMultiHoop().bundle?.sections.length === 3,
  );
  assert.equal((await multi()).mode, true);
  await page.locator("[data-inspect-join]").first().click();
  assert.equal(
    (await page.evaluate(() => window.studio.getPlan())).events.length,
    Number(await page.locator("#timeline").inputValue()),
  );
  await page.locator("#multi-complete").click();
  assert.equal(
    (await page.evaluate(() => window.studio.getPlan())).events.length,
    Number(await page.locator("#timeline").inputValue()),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Multi-Hoop browser: actual fields/drag/cancel/history, source independence, selected/assembled sequence, order/reload, three-hoop/six-format ZIP, independent PES needles, measured print scale, mobile controls and blocked unsafe satin passed.",
  );
} finally {
  await browser.close();
}
