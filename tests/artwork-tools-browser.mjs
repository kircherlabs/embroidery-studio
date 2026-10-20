import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { smartShape } from "../src/creative.js";
import { makeOperation } from "../src/operations.js";
import { objectBounds } from "../src/model.js";
import { reveal, chooseTool } from "./helpers/ui.mjs";
import {
  decodePes,
  streamExtents,
  declaredRect,
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
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.stack);
    console.error(e.message);
  });
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await page.waitForFunction(() => window.studio?.getPlan());
  const project = () => page.evaluate(() => window.studio.getProject()),
    ready = () => page.waitForFunction(() => window.studio.getPlan());
  const open = async (p) => {
    p = { ...p, name: p.name + Math.random() };
    await page.locator("#file-input").setInputFiles({
      name: "artwork-tools.embstudio",
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
  const pick = async (id) => {
    await page.locator(`[data-select="${id}"]`).click();
  };
  const field = async (id, value) => {
    await reveal(page.locator("#" + id));
    await page.locator("#" + id).fill(String(value));
  };
  const arrange = async (key) => {
    await page.locator("#arrange-selection").click();
    await page.locator(`[data-arrange="${key}"]`).click();
  };
  const source = smartShape("rect", 12, 8, {
      frame: [1, 0, 0, 1, -20, 0],
      radius: 0,
    }),
    target = smartShape("rect", 10, 10, {
      frame: [1, 0, 0, 1, 0, 0],
      radius: 0,
    });
  source.name = "Style source";
  target.name = "Repeat target";
  source.operations = [
    { ...makeOperation("bean", source), color: "#ff0000", length: 1.2 },
    makeOperation("stop", source),
    { ...makeOperation("border", source), color: "#ffff00", width: 1 },
  ];
  target.operations = [
    { ...makeOperation("fill", target), color: "#0000ff" },
    makeOperation("border", target),
  ];
  await open({
    version: 1,
    name: "Artwork workflows",
    machine: "se700",
    objects: [source, target],
    groups: [],
    sequencing: {
      mode: "manual",
      origin: "sequence",
      order: [source.id, target.id],
    },
  });
  await pick(target.id);
  await field("effect-simplify", 0.01);
  await field("effect-offset", 1);
  await page.locator("#effects-apply").click();
  await ready();
  let current = (await project()).objects[1];
  assert.equal(current.effects.offset, 1);
  assert(current.effects.source.shape);
  assert(!current.shape);
  assert(Math.abs(objectBounds(current).width - 12) < 0.03);
  await field("effect-offset", 2);
  await page.locator("#effects-apply").click();
  await ready();
  assert(
    Math.abs(objectBounds((await project()).objects[1]).width - 14) < 0.03,
  );
  await page.locator("#undo").click();
  await ready();
  assert.equal((await project()).objects[1].effects.offset, 1);
  await page.locator("#redo").click();
  await ready();
  assert.equal((await project()).objects[1].effects.offset, 2);
  // Real pointer manipulation must not accumulate the effect frame per pointermove.
  await chooseTool(page, "select");
  await page.locator("#snap-objects").uncheck();
  const world = async (p) => {
    await page.waitForFunction(() => {
      const r = document.getElementById("stage").getBoundingClientRect(),
        v = window.studio.getView();
      return (
        Math.abs(r.width - v.width) < 1 && Math.abs(r.height - v.height) < 1
      );
    });
    return page.evaluate((p) => {
      const r = document.getElementById("stage").getBoundingClientRect(),
        v = window.studio.getView();
      return {
        x: r.x + v.center.x + p.x * v.scale,
        y: r.y + v.center.y + p.y * v.scale,
      };
    }, p);
  };
  let a = await world({ x: 0, y: 0 }),
    b = await world({ x: 3, y: 2 });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 15 });
  await page.mouse.up();
  await ready();
  current = (await project()).objects[1];
  assert(Math.abs(current.effects.frame[4] - 3) < 0.15);
  assert(Math.abs(current.effects.frame[5] - 2) < 0.15);
  await reveal(page.locator("#effects-remove"));
  await page.locator("#effects-remove").click();
  await ready();
  current = (await project()).objects[1];
  assert(current.shape);
  assert(!current.effects);
  assert(Math.abs(current.shape.frame[4] - 3) < 0.15);
  await field("effect-offset", 0.5);
  await page.locator("#effects-apply").click();
  await ready();
  const effectRings = (await project()).objects[1].rings;
  await chooseTool(page, "node");
  a = await world(effectRings[0][0]);
  await page.mouse.dblclick(a.x, a.y);
  await ready();
  assert.deepEqual((await project()).objects[1].rings, effectRings);
  await chooseTool(page, "select");
  // Copy from one selected action, then choose exactly what to transfer.
  await pick(source.id);
  await arrange("copy-style");
  await pick(target.id);
  await arrange("transfer-style");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    (id) =>
      window.studio.getProject().objects.find((o) => o.id === id).operations[0]
        .color === "#ff0000" && window.studio.getPlan(),
    target.id,
  );
  current = (await project()).objects[1];
  assert.equal(current.operations[0].type, "fill");
  assert.equal(current.operations.length, 2);
  await arrange("transfer-style");
  await page.locator("#style-mode").selectOption("action");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    (id) =>
      window.studio.getProject().objects.find((o) => o.id === id).operations[0]
        .type === "bean" && window.studio.getPlan(),
    target.id,
  );
  current = (await project()).objects[1];
  assert.equal(current.operations.length, 2);
  assert.equal(current.operations[0].id, target.operations[0].id);
  assert.equal(current.operations[1].color, target.operations[1].color);
  await arrange("transfer-style");
  await page.locator("#style-mode").selectOption("stack");
  await page.locator("#dialog-submit").click();
  assert(await page.locator("#dialog").isVisible());
  assert.equal((await project()).objects[1].operations.length, 2);
  await page.locator("#style-replace").check();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    (id) =>
      window.studio.getProject().objects.find((o) => o.id === id).operations
        .length === 3 && window.studio.getPlan(),
    target.id,
  );
  assert.equal(
    (await page.evaluate(() => window.studio.getPlan())).stats.stops,
    2,
  );
  // Linear repeat and actual stop/order counts, followed by Undo/Redo.
  await arrange("repeat");
  await page.locator("#repeat-count").fill("3");
  await page.locator("#repeat-dx").fill("13");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 4 &&
      window.studio.getPlan(),
  );
  let p = await project();
  assert.equal(p.objects.filter((o) => o.effects).length, 3);
  assert.equal(p.sequencing.order.length, 4);
  assert.equal(
    (await page.evaluate(() => window.studio.getPlan())).stats.stops,
    4,
  );
  assert.deepEqual(p.objects[0], source);
  await page.locator("#undo").click();
  await ready();
  assert.equal((await project()).objects.length, 2);
  await page.locator("#redo").click();
  await ready();
  assert.equal((await project()).objects.length, 4);
  // Project persistence carries source metadata, effects, independent actions and repeat positions.
  let download = page.waitForEvent("download");
  await page.locator("#save-project").click();
  let file = await download,
    saved = JSON.parse(await readFile(await file.path(), "utf8"));
  assert.deepEqual(saved, await project());
  await open(saved);
  p = await project();
  assert.deepEqual(p.objects, saved.objects);
  // Explicit radial and mirrored duplicate modes.
  await pick(target.id);
  await arrange("repeat");
  await page.locator("#repeat-mode").selectOption("radial");
  await page.locator("#repeat-count").fill("2");
  await page.locator("#repeat-angle").fill("90");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 5 &&
      window.studio.getPlan(),
  );
  assert((await project()).objects.at(-1).effects);
  await page.locator("#undo").click();
  await ready();
  await pick(target.id);
  await arrange("repeat");
  await page.locator("#repeat-mode").selectOption("mirror-x");
  await page.locator("#repeat-dx").fill("-13");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 5 &&
      window.studio.getPlan(),
  );
  assert((await project()).objects.at(-1).effects.frame[0] < 0);
  await page.locator("#undo").click();
  await ready();
  // Independent decoding validates actual exported geometry and construction stops.
  const plan = await page.evaluate(() => window.studio.getPlan());
  await page.locator("#export").click();
  download = page.waitForEvent("download", { timeout: 120000 });
  await page.locator("#dialog-submit").click();
  file = await download;
  const decoded = decodePes(new Uint8Array(await readFile(await file.path()))),
    bounds = streamExtents(decoded.pec);
  assert.deepEqual(declaredRect(decoded.pec), bounds);
  assert.equal(decoded.pec.originFieldX, -bounds.left);
  assert.equal(decoded.pec.originFieldY, -bounds.top);
  assert.equal(
    decoded.pec.events.filter((e) => e.type === "colorChange").length,
    plan.stats.stops + plan.stats.changes,
  );
  const stitches = decoded.pec.events.filter((e) => e.type === "stitch"),
    expected = plan.events.filter((e) => e.cmd === "stitch");
  assert.equal(stitches.length, expected.length);
  stitches.forEach((e, i) => {
    assert.equal(e.x, Math.round((expected[i].x - expected[0].x) * 10) || 0);
    assert.equal(e.y, Math.round((expected[i].y - expected[0].y) * 10) || 0);
  });
  await ready();
  assert.equal(
    (await page.evaluate(() => window.studio.getPlan())).stats.stops,
    plan.stats.stops,
  );
  // Linked repeats share live Smart geometry while maintaining instance controls.
  const linkedSource = smartShape("rect", 8, 6, {
    radius: 1,
    frame: [1, 0, 0, 1, -15, 0],
  });
  await open({
    version: 1,
    name: "Linked browser",
    machine: "se700",
    objects: [linkedSource],
    groups: [],
  });
  await pick(linkedSource.id);
  await arrange("repeat");
  await page.locator("#repeat-count").fill("3");
  await page.locator("#repeat-dx").fill("15");
  await page.locator("#repeat-linked").check();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 3 &&
      window.studio.getPlan(),
  );
  p = await project();
  assert(p.objects[1].linkedGeometry);
  assert(p.objects[2].linkedGeometry);
  await pick(linkedSource.id);
  await field("shape-width", 10);
  await page.locator("#shape-width").press("Tab");
  await ready();
  p = await project();
  p.objects.forEach((o) => assert(Math.abs(objectBounds(o).width - 10) < 0.01));
  const linkedId = p.objects[1].id;
  await pick(linkedId);
  await page.locator("#linked-select-source").click();
  assert.deepEqual(
    (await page.evaluate(() => window.studio.getSelection())).ids,
    [linkedSource.id],
  );
  await pick(linkedId);
  await page.locator("#linked-unlink").click();
  await ready();
  assert((await project()).objects[1].shape);
  assert(!(await project()).objects[1].linkedGeometry);
  await page.locator("#undo").click();
  await ready();
  assert((await project()).objects[1].linkedGeometry);
  download = page.waitForEvent("download");
  await page.locator("#save-project").click();
  file = await download;
  saved = JSON.parse(await readFile(await file.path(), "utf8"));
  await open(saved);
  assert.deepEqual((await project()).objects, saved.objects);
  await pick(linkedId);
  // Lettering survives effect removal, and font changes propagate to linked instances.
  await open({
    version: 1,
    name: "Linked lettering",
    machine: "se700",
    objects: [],
    groups: [],
  });
  await page.locator("#design-tab").click();
  await page.locator("#text-tool").click();
  await page.locator("#text-value").fill("Hi");
  await page.locator("#text-height").fill("8");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 1 &&
      window.studio.getProject().objects[0].textSource &&
      window.studio.getPlan(),
  );
  const textId = (await project()).objects[0].id;
  await field("effect-simplify", 0.01);
  await field("effect-offset", 0.1);
  await page.locator("#effects-apply").click();
  await ready();
  assert.equal(
    (await project()).objects[0].effects.source.textSource.content,
    "Hi",
  );
  await reveal(page.locator("#effects-remove"));
  await page.locator("#effects-remove").click();
  await ready();
  assert.equal((await project()).objects[0].textSource.content, "Hi");
  await arrange("repeat");
  await page.locator("#repeat-count").fill("2");
  await page.locator("#repeat-dx").fill("20");
  await page.locator("#repeat-linked").check();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 2 &&
      window.studio.getPlan(),
  );
  await pick(textId);
  await reveal(page.locator("#live-font"));
  await page.locator("#live-font").selectOption("sans-serif");
  await ready();
  p = await project();
  assert.equal(p.objects[0].textSource.font, "sans-serif");
  assert(p.objects[1].linkedGeometry);
  p.objects[0].rings.forEach((r, i) =>
    r.forEach((pt, j) => {
      assert(Math.abs(p.objects[1].rings[i][j].x - pt.x - 20) < 1e-8);
      assert(Math.abs(p.objects[1].rings[i][j].y - pt.y) < 1e-8);
    }),
  );
  await page.screenshot({ path: "test-results/artwork-tools-desktop.png" });
  // All commands remain available via a scrollable Arrange menu on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() =>
    document
      .querySelector(".workspace")
      .classList.contains("compact-workspace"),
  );
  await page.locator("#arrange-selection").click();
  await page.locator('[data-arrange="repeat"]').scrollIntoViewIfNeeded();
  assert(await page.locator('[data-arrange="repeat"]').isVisible());
  await page.locator('[data-arrange="repeat"]').click();
  assert(await page.locator("#repeat-mode").isVisible());
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "test-results/artwork-tools-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Artwork effects, source restoration, style transfer, repeat modes, Undo/Redo, project persistence, PES and mobile workflows passed.",
  );
} finally {
  await browser.close();
}
