import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { object } from "../src/model.js";
import { curveRings, identity } from "../src/smart-geometry.js";
import { makeOperation } from "../src/operations.js";
import { chooseTool, reveal, chooseMethod } from "./helpers/ui.mjs";
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
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    plan = () => page.evaluate(() => window.studio.getPlan());
  const open = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "vectors.embstudio",
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
  const pick = (id, options) =>
    page.locator(`[data-select="${id}"]`).click(options);
  const world = async (p) => {
    await page.waitForFunction(() => {
      const r = document.getElementById("stage").getBoundingClientRect(),
        v = window.studio.getView();
      return (
        Math.abs(v.width - r.width) < 1 && Math.abs(v.height - r.height) < 1
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
  const drag = async (a, b) => {
    a = await world(a);
    b = await world(b);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 20 });
    await page.mouse.up();
    await ready();
  };
  const field = async (id, value) => {
    const el = page.locator("#" + id);
    await reveal(el);
    await el.fill(String(value));
    await el.press("Tab");
    await ready();
  };
  const p = (objects) => ({
    version: 1,
    name: "Vector regression " + Math.random(),
    machine: "se700",
    objects,
    groups: [],
    planning: { smallDetail: 0, optimizeColors: true },
  });
  const rect = [
    { x: -20, y: -15 },
    { x: 20, y: -15 },
    { x: 20, y: 15 },
    { x: -20, y: 15 },
  ];
  await ready();
  await open(p([]));
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#387676";
    g.fillRect(0, 0, 128, 128);
    return c.toDataURL();
  });
  await page.locator("#file-input").setInputFiles({
    name: "Reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(png.split(",")[1], "base64"),
  });
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 1 &&
      window.studio.getPlan(),
  );
  const ref = (await project()).objects[0];
  assert(ref.locked);
  await chooseTool(page, "pencil");
  const canvasBefore = await page.locator("#stage").boundingBox();
  const trace = Array.from({ length: 65 }, (_, i) => ({
    x: -22 + i * 0.65,
    y: 4 * Math.sin(i * 0.12),
  }));
  let a = await world(trace[0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (const q of trace.slice(1)) {
    const r = await world(q);
    await page.mouse.move(r.x, r.y);
  }
  await page.mouse.up();
  assert.equal(
    (await project()).objects.length,
    1,
    "draft stays editable before Finish",
  );
  const canvasAfter = await page.locator("#stage").boundingBox();
  assert.equal(
    canvasBefore.y,
    canvasAfter.y,
    "drawing actions do not shift canvas mid-stroke",
  );
  await field("pencil-smoothing", 0.2);
  await page.locator("#finish-draw").click();
  await ready();
  let drawn = (await project()).objects[1];
  assert(drawn.curve && !drawn.closed);
  assert(drawn.curve.nodes.length < 30);
  assert.deepEqual((await project()).objects[0], ref);
  assert((await plan()).stats.stitches > 0);
  const sculpt = {
      frame: identity(),
      closed: false,
      nodes: [
        { x: -20, y: 0, out: { x: -10, y: -10 } },
        { x: 20, y: 0, in: { x: 10, y: 10 } },
      ],
    },
    sculptPath = object("Sculpt me", curveRings(sculpt), {
      curve: sculpt,
      type: "run",
      closed: false,
      underlay: false,
    });
  await open(p([sculptPath]));
  await pick(sculptPath.id);
  await chooseTool(page, "node");
  await drag({ x: 0, y: 0 }, { x: 0, y: -3 });
  drawn = (await project()).objects[0];
  assert.notDeepEqual(drawn.curve, sculpt);
  assert.deepEqual(
    drawn.curve.nodes.map(({ x, y }) => ({ x, y })),
    sculpt.nodes.map(({ x, y }) => ({ x, y })),
    "segment sculpt preserves anchors",
  );
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual((await project()).objects[0].curve, sculpt);
  await page.locator("#redo").click();
  await ready();
  assert.notDeepEqual((await project()).objects[0].curve, sculpt);
  await pick(sculptPath.id);
  drawn = (await project()).objects[0];
  a = await world(drawn.curve.nodes[0]);
  await page.mouse.click(a.x, a.y);
  await reveal(page.locator("#node-symmetric"));
  await page.locator("#node-symmetric").click();
  await ready();
  assert.equal((await project()).objects[0].curve.nodes[0].mode, "symmetric");
  // Knife, area erasing and manual sequencing all alter real geometry.
  const badge = object("Badge", [rect], { closed: true, underlay: false });
  badge.operations = [
    makeOperation("fill", badge),
    makeOperation("border", { ...badge, color: "#00ffff" }),
  ];
  const batch = p([badge]);
  batch.sequencing = { mode: "manual", origin: "sequence", order: [badge.id] };
  await open(batch);
  await pick(badge.id);
  await chooseTool(page, "knife");
  await drag({ x: -25, y: 0 }, { x: 25, y: 0 });
  let parts = (await project()).objects;
  assert.equal(parts.length, 2);
  assert(parts.every((o) => o.operations.length === 2));
  assert.equal((await project()).sequencing.order.length, 2);
  const split = await project();
  await page.locator("#undo").click();
  await ready();
  assert.equal((await project()).objects.length, 1);
  await page.locator("#redo").click();
  await ready();
  assert.deepEqual((await project()).objects, split.objects);
  await pick(parts[0].id);
  await chooseTool(page, "eraser");
  await field("erase-width", 2);
  a = await world({ x: 0, y: 8 });
  await page.mouse.click(a.x, a.y);
  await ready();
  assert(
    (await project()).objects.find((o) => o.id === parts[0].id).rings.length ===
      2,
    "eraser subtracts a real counter",
  );
  // Split a cubic by an exact click; join the pieces with settings and gap checks.
  const curve = {
      frame: identity(),
      closed: false,
      nodes: [
        { x: -20, y: 0, out: { x: -10, y: -10 } },
        { x: 20, y: 0, in: { x: 10, y: 10 } },
      ],
    },
    path = object("Curve", curveRings(curve), {
      curve,
      type: "run",
      closed: false,
      underlay: false,
    });
  await open(p([path]));
  await pick(path.id);
  await chooseTool(page, "knife");
  a = await world({ x: 0, y: 0 });
  await page.mouse.click(a.x, a.y);
  await ready();
  assert.equal((await project()).objects.length, 2);
  parts = (await project()).objects;
  await pick(parts[0].id);
  await pick(parts[1].id, { modifiers: ["Control"] });
  await chooseTool(page, "node");
  await reveal(page.locator("#join-vectors"));
  await page.locator("#join-vectors").click();
  await ready();
  assert.equal((await project()).objects.length, 1);
  assert((await project()).objects[0].curve.nodes.length === 3);
  await reveal(page.locator("#reverse-vector"));
  const beforeReverse = (await project()).objects[0].curve.nodes[0];
  await page.locator("#reverse-vector").click();
  await ready();
  assert.deepEqual(
    (await project()).objects[0].curve.nodes.at(-1).x,
    beforeReverse.x,
  );
  await page.locator("#close-vector").click();
  await ready();
  assert((await project()).objects[0].closed);
  // Opening a fill needs deliberate conversion; errors must be transactional.
  await open(p([badge]));
  await pick(badge.id);
  await chooseTool(page, "knife");
  await page.locator("#knife-mode").selectOption("path");
  await drag({ x: -25, y: 0 }, { x: 25, y: 0 });
  assert.equal((await project()).objects.length, 1);
  assert.equal((await project()).objects[0].operations[0].type, "fill");
  await page.locator("#allow-open-run").check();
  await drag({ x: -25, y: 0 }, { x: 25, y: 0 });
  assert.equal((await project()).objects.length, 2);
  assert(
    (await project()).objects.every((o) =>
      o.operations.every((op) => op.type === "run"),
    ),
  );
  await pick((await project()).objects[0].id);
  await chooseTool(page, "eraser");
  await page.locator("#erase-mode").selectOption("line");
  await drag({ x: 5, y: -20 }, { x: 5, y: 20 });
  assert((await project()).objects.length >= 3);
  // Locks inherited from groups protect source artwork.
  const locked = structuredClone(path);
  locked.parentId = "locked";
  const lp = p([locked]);
  lp.groups = [
    { id: "locked", kind: "group", name: "Locked group", locked: true },
  ];
  await open(lp);
  await pick("locked");
  await chooseTool(page, "knife");
  await drag({ x: 0, y: -15 }, { x: 0, y: 15 });
  assert.deepEqual((await project()).objects, [locked]);
  // Closed Pencil creates normal fill and border actions; project and export retain it.
  await open(p([]));
  await chooseTool(page, "pencil");
  const loop = Array.from({ length: 65 }, (_, i) => ({
    x: 15 * Math.cos((i / 64) * 2 * Math.PI),
    y: 12 * Math.sin((i / 64) * 2 * Math.PI),
  }));
  a = await world(loop[0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (const q of loop.slice(1)) {
    const r = await world(q);
    await page.mouse.move(r.x, r.y);
  }
  await page.mouse.up();
  await page.locator("#pen-closed").check();
  await page.locator("#finish-draw").click();
  await ready();
  assert((await project()).objects[0].closed);
  await chooseMethod(page, "fill");
  await ready();
  await chooseMethod(page, "border", { add: true });
  await page.locator("#operation-add").click();
  await ready();
  let expected = await project();
  const download = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const saved = await download;
  await saved.saveAs("test-results/vector-edit.embstudio");
  await page.reload();
  await ready();
  assert.deepEqual((await project()).objects, expected.objects);
  await page
    .locator("#file-input")
    .setInputFiles("test-results/vector-edit.embstudio");
  await page.locator("#dialog-submit").click();
  await ready();
  assert.deepEqual((await project()).objects, expected.objects);
  const before = await plan();
  await page.locator("#export").click();
  const pes = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  await (await pes).saveAs("test-results/vector-edit.pes");
  const dec = decodePes(await readFile("test-results/vector-edit.pes"));
  assert.deepEqual(declaredRect(dec.pec), streamExtents(dec.pec));
  const sewn = dec.pec.events.filter((e) => e.type === "stitch"),
    preview = before.events.filter((e) => e.cmd === "stitch");
  assert.equal(sewn.length, preview.length);
  preview.forEach((q, i) => {
    assert.equal(sewn[i].x, Math.round((q.x - preview[0].x) * 10) || 0);
    assert.equal(sewn[i].y, Math.round((q.y - preview[0].y) * 10) || 0);
  });
  // Pencil and repair controls remain docked on narrow and short screens.
  await page.locator("#design-tab").click();
  for (const [width, height] of [
    [1500, 1080],
    [1024, 768],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    console.log("Vector viewport", width, height);
    await page.setViewportSize({ width, height });
    await chooseTool(page, "pencil");
    const dock = await page.locator(".tool-context").boundingBox(),
      canvas = await page.locator("#stage").boundingBox();
    assert(dock.y + dock.height <= canvas.y + 1);
    assert(canvas.height >= 70);
    await chooseTool(page, "rect");
    assert(await page.locator('[data-tool="rect"]').isVisible());
    await chooseTool(page, "node");
    await page.locator("#path-repair > summary").click();
    assert(
      (await page.locator(".tool-context").boundingBox()).y +
        (await page.locator(".tool-context").boundingBox()).height <=
        (await page.locator("#stage").boundingBox()).y + 1,
    );
    await page.locator("#preview-tab").click();
    assert(await page.locator("#vector-controls").isHidden());
    await page.locator("#design-tab").click();
  }
  // Real touch input traces artwork, while a second finger cancels the draft
  // and enters navigation without accidentally committing geometry.
  await page.setViewportSize({ width: 390, height: 844 });
  await open(p([]));
  await chooseTool(page, "pencil");
  const touch = await page.context().newCDPSession(page),
    start = await world({ x: -15, y: 0 });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: start.x, y: start.y, id: 1 }],
  });
  for (let i = 1; i <= 20; i++) {
    const t = await world({ x: -15 + i * 1.5, y: Math.sin(i * 0.3) * 4 });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: t.x, y: t.y, id: 1 }],
    });
  }
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.locator("#finish-draw").click();
  await ready();
  assert.equal((await project()).objects.length, 1);
  assert((await project()).objects[0].curve);
  assert(Math.abs((await project()).objects[0].curve.nodes[0].x + 15) < 0.05);
  await chooseTool(page, "pencil");
  const initial = await project(),
    t = await world({ x: 0, y: 0 });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: t.x, y: t.y, id: 1 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: t.x + 10, y: t.y, id: 1 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: t.x + 10, y: t.y, id: 1 },
      { x: t.x + 30, y: t.y, id: 2 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.deepEqual((await project()).objects, initial.objects);
  assert(await page.locator("#draw-actions").isHidden());
  await touch.detach();
  await page.setViewportSize({ width: 1500, height: 1080 });
  await drag({ x: -10, y: 10 }, { x: 10, y: 10 });
  await page.locator("#pen-closed").uncheck();
  assert.equal((await project()).objects.length, 1);
  await drag({ x: -10, y: 15 }, { x: 10, y: 15 });
  assert.equal(
    (await project()).objects.length,
    2,
    "next stroke completes only the preceding valid stroke",
  );
  await page.locator("#finish-draw").click();
  await ready();
  assert.equal((await project()).objects.length, 3);
  await page.screenshot({ path: "test-results/vector-editing.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Pencil over locked reference, editable fitting/sculpting, node modes, actual area/path Knife and Eraser, joins/close/reverse, inherited locks, manual order, Undo/Redo, project reload, independent PES coordinate/origin decoding and five viewport dock checks passed.",
  );
} finally {
  await browser.close();
}
