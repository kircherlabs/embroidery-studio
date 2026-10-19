import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { object } from "../src/model.js";
import { identity, curveRings } from "../src/smart-geometry.js";
import { chooseTool, reveal } from "./helpers/ui.mjs";
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
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.stack);
    console.error("PAGE ERROR", e.message);
  });
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    plan = () => page.evaluate(() => window.studio.getPlan());
  const open = async (objects) => {
    const p = {
      version: 1,
      name: "Manual rails " + Math.random(),
      machine: "se700",
      objects,
      groups: [],
      planning: { smallDetail: 0, optimizeColors: true },
    };
    await page.locator("#file-input").setInputFiles({
      name: "rails.embstudio",
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
  const click = async (x, y) => {
    const p = await world({ x, y });
    await page.mouse.click(p.x, p.y);
  };
  const drag = async (a, b) => {
    a = await world(a);
    b = await world(b);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 14 });
    await page.mouse.up();
    await ready();
  };
  const pick = (id, modifiers = []) =>
    page.locator(`[data-select="${id}"]`).click({ modifiers });
  const field = async (id, value) => {
    const input = page.locator("#" + id);
    await reveal(input);
    await input.fill(String(value));
    await input.press("Tab");
    await ready();
  };
  await ready();
  await open([]);
  await chooseTool(page, "rails");
  const beforeCanvas = await page.locator("#stage").boundingBox();
  await click(-20, -2);
  await click(20, -2);
  assert.equal((await project()).objects.length, 0);
  await page.locator("#finish-draw").click();
  assert.equal(
    beforeCanvas.y,
    (await page.locator("#stage").boundingBox()).y,
    "starting rail B does not move the canvas",
  );
  assert(
    (await page.locator("#draw-message").textContent()).includes("Rail B"),
  );
  assert(await page.locator("#finish-draw").isDisabled());
  await click(-20, 2);
  await click(20, 5);
  assert.equal((await project()).objects.length, 0);
  await page.locator("#finish-draw").click();
  await ready();
  let o = (await project()).objects[0];
  assert(o.satinRails);
  assert.equal(o.operations[0].columnMode, "rails");
  assert((await plan()).stats.stitches > 100);
  assert(!(await plan()).issues.some((i) => i.severity === "error"));

  const originalB = structuredClone(o.satinRails.b);
  await drag({ x: -20, y: -2 }, { x: -20, y: -3 });
  o = (await project()).objects[0];
  assert.deepEqual(o.satinRails.b, originalB);
  assert(Math.abs(o.satinRails.a.nodes[0].y + 3) < 0.1);
  await page.locator("#active-rail").selectOption("b");
  await drag({ x: 20, y: 5 }, { x: 20, y: 6 });
  o = (await project()).objects[0];
  assert(Math.abs(o.satinRails.b.nodes.at(-1).y - 6) < 0.1);
  const end = await world({ x: 0, y: 4 });
  await page.mouse.dblclick(end.x, end.y);
  await ready();
  assert((await project()).objects[0].satinRails.b.nodes.length === 3);
  // Per-action controls modify actual manufacturing without moving the rails.
  const source = structuredClone((await project()).objects[0].satinRails);
  await field("rail-width-scale", 120);
  assert.deepEqual((await project()).objects[0].satinRails, source);
  await page.locator("#rail-sew-reverse").check();
  await ready();
  assert((await project()).objects[0].operations[0].reverse);
  await page.locator("#rail-underlay").selectOption("both");
  await ready();
  assert((await project()).objects[0].operations[0].railUnderlay === "both");
  await page.locator("#satin-guide-edit").click();
  await drag({ x: -5, y: -7 }, { x: 2, y: 10 });
  await page.keyboard.press("Escape");
  await ready();
  o = (await project()).objects[0];
  assert.equal(o.operations[0].satinGuides.length, 1);
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  await field("rail-split-position", 55);
  await page.locator("#split-manual-column").click();
  await ready();
  assert.equal((await project()).objects.length, 2);
  assert(
    (await project()).objects.every(
      (o) => o.satinRails && !o.satinRails.a.closed,
    ),
  );
  await page.locator("#undo").click();
  await ready();
  assert.equal((await project()).objects.length, 1);
  await page.locator("#redo").click();
  await ready();
  assert.equal((await project()).objects.length, 2);
  // Existing open Bézier paths become independent rails; tangent handles stay editable.
  const curvePath = (dy) => {
    const curve = {
      closed: false,
      frame: identity(),
      nodes: [
        { x: -20, y: dy, out: { x: -10, y: dy - 10 } },
        { x: 20, y: dy, in: { x: 10, y: dy - 10 } },
      ],
    };
    return object("Curved rail " + dy, curveRings(curve), {
      curve,
      type: "run",
      closed: false,
    });
  };
  const ca = curvePath(-2),
    cb = curvePath(3);
  await open([ca, cb]);
  await pick(ca.id);
  await pick(cb.id, ["Control"]);
  await chooseTool(page, "rails");
  await page.locator("#rails-from-selection").click();
  await page.locator("#dialog-submit").click();
  // Dialog close is asynchronous: wait for the new source and its own plan.
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 3 &&
      window.studio.getProject().objects.at(-1).satinRails &&
      window.studio.getPlan(),
  );
  o = (await project()).objects[2];
  const railA = structuredClone(o.satinRails.a);
  await page.locator("#active-rail").selectOption("b");
  await drag({ x: -10, y: -7 }, { x: -8, y: -8 });
  o = (await project()).objects[2];
  assert.deepEqual(o.satinRails.a, railA);
  assert(Math.abs(o.satinRails.b.nodes[0].out.x + 8) < 0.05);
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  // Create a ring from existing closed contours; source artwork is retained hidden.
  const circle = (r) => {
    const curve = {
      nodes: Array.from({ length: 64 }, (_, i) => ({
        x: r * Math.cos((i * Math.PI) / 32),
        y: r * Math.sin((i * Math.PI) / 32),
      })),
      closed: true,
      frame: identity(),
    };
    return object("Circle " + r, curveRings(curve), { curve, closed: true });
  };
  const a = circle(16),
    b = circle(12);
  await open([a, b]);
  await pick(a.id);
  await pick(b.id, ["Control"]);
  await chooseTool(page, "rails");
  await page.locator("#rails-from-selection").click();
  await page.locator("#dialog-submit").click();
  // Dialog close is asynchronous: wait for the new source and its own plan.
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 3 &&
      window.studio.getProject().objects.at(-1).satinRails &&
      window.studio.getPlan(),
  );
  let p = await project();
  assert.equal(p.objects.length, 3);
  assert(p.objects.slice(0, 2).every((o) => o.visible === false));
  o = p.objects[2];
  assert(o.satinRails.a.closed && o.rings.length === 2);
  assert(
    (await plan()).events
      .filter((e) => e.cmd === "stitch")
      .every((e) => e.objectId === o.id),
  );
  // Deliberately mismatched direction is reported, not disguised as another method.
  await page.locator("#reverse-rail-b").check();
  await ready();
  assert(
    (await plan()).issues.some(
      (i) => i.code === "manual-satin-rails" && i.severity === "error",
    ),
  );
  assert(await page.locator("#export").isDisabled());
  await page.locator("#reverse-rail-b").uncheck();
  await ready();
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  await field("rail-seam-a", 17);
  await field("rail-seam-b", 17);
  assert.equal((await project()).objects[2].satinRails.seamA, 16);
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  const beforeMirror = structuredClone((await project()).objects[2]);
  await page.locator("#arrange-selection").click();
  await page.locator('[data-arrange="flip-horizontal"]').click();
  await ready();
  o = (await project()).objects[2];
  assert.notDeepEqual(o.satinRails.a.frame, beforeMirror.satinRails.a.frame);
  assert.equal(o.satinRails.seamA, 16);
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  await chooseTool(page, "node");
  await page.locator("#active-rail").selectOption("a");
  const node = o.satinRails.a.nodes[16],
    frame = o.satinRails.a.frame,
    seamPoint = {
      x: frame[0] * node.x + frame[2] * node.y + frame[4],
      y: frame[1] * node.x + frame[3] * node.y + frame[5],
    };
  await click(seamPoint.x, seamPoint.y);
  await page.locator("#rail-set-seam").click();
  await ready();
  assert.equal((await project()).objects[2].satinRails.seamA, 16);
  // Round one rail and preserve its pairing/density, then restore with Undo.
  await pick(o.id);
  await chooseTool(page, "node");
  await page.locator("#active-rail").selectOption("a");
  await field("rail-round-radius", 0.5);
  await page.locator("#round-manual-rail").click();
  await ready();
  assert((await project()).objects[2].satinRails.a.nodes.length > 2);
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  assert((await plan()).stats.stitches > 400);
  await page.locator("#undo").click();
  await ready();
  await pick(o.id);
  const expected = await project();
  const save = page.waitForEvent("download");
  await page.locator("#save-project").click();
  await (await save).saveAs("test-results/manual-rails.embstudio");
  await page.reload();
  await ready();
  assert.deepEqual((await project()).objects, expected.objects);
  await page
    .locator("#file-input")
    .setInputFiles("test-results/manual-rails.embstudio");
  await page.locator("#dialog-submit").click();
  await ready();
  assert.deepEqual((await project()).objects, expected.objects);
  const preview = (await plan()).events.filter((e) => e.cmd === "stitch");
  await page.locator("#export").click();
  const pes = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  await (await pes).saveAs("test-results/manual-rails.pes");
  const decoded = decodePes(await readFile("test-results/manual-rails.pes"));
  assert.deepEqual(declaredRect(decoded.pec), streamExtents(decoded.pec));
  const stitches = decoded.pec.events.filter((e) => e.type === "stitch");
  assert.equal(stitches.length, preview.length);
  stitches.forEach((e, i) => {
    assert.equal(e.x, Math.round((preview[i].x - preview[0].x) * 10) || 0);
    assert.equal(e.y, Math.round((preview[i].y - preview[0].y) * 10) || 0);
  });
  await page.locator("#design-tab").click();
  for (const [width, height] of [
    [1500, 1080],
    [1024, 768],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await chooseTool(page, "rails");
    const dock = await page.locator(".tool-context").boundingBox(),
      canvas = await page.locator("#stage").boundingBox();
    assert(dock.y + dock.height <= canvas.y + 1);
    assert(await page.locator("#rails-closed").isVisible());
  }
  // The same two-rail workflow uses real touch taps without emitting a half-column.
  await page.setViewportSize({ width: 390, height: 844 });
  await open([]);
  await chooseTool(page, "rails");
  const touch = await page.context().newCDPSession(page);
  const tap = async (x, y) => {
    const t = await world({ x, y });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: t.x, y: t.y, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  await tap(-15, -2);
  await tap(15, -2);
  await page.locator("#finish-draw").click();
  assert.equal((await project()).objects.length, 0);
  assert(await page.locator("#rails-closed").isDisabled());
  await page.keyboard.press("Escape");
  assert(!(await page.locator("#rails-closed").isDisabled()));
  assert(await page.locator("#draw-actions").isHidden());
  await tap(-15, -2);
  await tap(15, -2);
  await page.locator("#finish-draw").click();
  await tap(-15, 2);
  await tap(15, 2);
  await page.locator("#finish-draw").click();
  await ready();
  assert.equal((await project()).objects.length, 1);
  assert((await project()).objects[0].satinRails);
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  await open([]);
  await chooseTool(page, "rails");
  await page.locator("#rails-closed").check();
  for (const [x, y] of [
    [0, -12],
    [12, 0],
    [0, 12],
    [-12, 0],
  ])
    await tap(x, y);
  await page.locator("#finish-draw").click();
  for (const [x, y] of [
    [0, -8],
    [8, 0],
    [0, 8],
    [-8, 0],
  ])
    await tap(x, y);
  await page.locator("#finish-draw").click();
  await ready();
  assert((await project()).objects[0].satinRails.a.closed);
  assert.equal((await project()).objects[0].rings.length, 2);
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  await touch.detach();
  // One existing compound contour becomes a ring without losing its counter.
  await page.setViewportSize({ width: 1500, height: 1080 });
  const ring = object("Imported ring", [a.rings[0], b.rings[0]], {
    closed: true,
    fillRule: "evenodd",
  });
  await open([ring]);
  await pick(ring.id);
  await chooseTool(page, "rails");
  await page.locator("#rails-from-selection").click();
  await page.locator("#dialog-submit").click();
  // Dialog close is asynchronous: wait for the new source and its own plan.
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 2 &&
      window.studio.getProject().objects.at(-1).satinRails &&
      window.studio.getPlan(),
  );
  assert.equal((await project()).objects.length, 2);
  assert((await project()).objects[0].visible === false);
  assert((await project()).objects[1].rings.length === 2);
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  await page.screenshot({ path: "test-results/manual-rails.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Manual rail drawing, independent curve edits, direction rungs, width/underlay, splitting/history, ring creation/seams, invalid correspondence, mirrors, project persistence, independent PES needle/origin decoding and five responsive layouts passed.",
  );
} finally {
  await browser.close();
}
