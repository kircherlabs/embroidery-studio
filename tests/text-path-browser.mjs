import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { object } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
import {
  identity,
  curveRings,
  compose,
  mapPoint,
} from "../src/smart-geometry.js";
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
  page.on("pageerror", (e) => {
    errors.push(e.stack);
    console.error(e.message);
  });
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    plan = () => page.evaluate(() => window.studio.getPlan());
  const open = async (objects) => {
    const p = {
      version: 1,
      name: "Path lettering " + Math.random(),
      machine: "se700",
      objects,
      groups: [],
    };
    await page.locator("#file-input").setInputFiles({
      name: "path-text.embstudio",
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
  const pick = (id) => page.locator(`[data-select="${id}"]`).click();
  const field = async (id, value) => {
    await reveal(page.locator("#" + id));
    await page.locator("#" + id).fill(String(value));
    await page.locator("#" + id).press("Tab");
    await ready();
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
  const drag = async (a, b) => {
    a = await world(a);
    b = await world(b);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 });
    await page.mouse.up();
    await ready();
  };
  const baseline = (curve) =>
    object("Lettering baseline", curveRings(curve), {
      curve,
      type: "run",
      closed: curve.closed,
    });
  const arc = baseline({
    nodes: [
      { x: -35, y: 8, out: { x: -15, y: -20 } },
      { x: 35, y: 8, in: { x: 15, y: -20 } },
    ],
    closed: false,
    frame: identity(),
  });
  await ready();
  await open([arc]);
  await pick(arc.id);
  await page.locator("#text-tool").click();
  await page.locator("#text-value").fill("MTR");
  await page.locator("#text-height").fill("8");
  await page.locator("#text-use-path").check();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 2 &&
      window.studio.getProject().objects[1].textSource?.path &&
      window.studio.getPlan(),
  );
  let o = (await project()).objects[1],
    id = o.id;
  assert.equal(o.textSource.content, "MTR");
  assert.equal(o.textSource.glyphs.length, 3);
  assert.equal((await project()).objects[0].visible, false);
  assert(
    (await plan()).events
      .filter((e) => e.cmd === "stitch")
      .every((e) => e.objectId === id),
  );
  const original = structuredClone(o.rings);
  await page.locator("#live-font").selectOption("sans-serif");
  await ready();
  o = (await project()).objects[1];
  assert.equal(o.id, id);
  assert.notDeepEqual(o.rings, original);
  assert(o.textSource.path);
  await field("live-text", "OBS");
  for (const font of ["serif", "sans-serif", "monospace", "cursive"]) {
    await page.locator("#live-font").selectOption(font);
    await ready();
    assert.equal((await project()).objects[1].textSource.font, font);
    assert((await plan()).stats.stitches > 0);
  }
  await page.locator("#live-font").selectOption("sans-serif");
  await ready();
  const holes = await page.evaluate(async () => {
    const { fillPolygons } = await import("./src/geometry.js");
    return fillPolygons(
      window.studio.getProject().objects[1].rings,
      "nonzero",
    ).reduce((n, p) => n + p.length - 1, 0);
  });
  assert(holes >= 3, "curved O and B retain their counters");
  await field("live-text", "MTR");
  await field("live-tracking", 0.5);
  await field("text-path-offset", 3);
  await field("text-path-normal", 1);
  o = (await project()).objects[1];
  assert.equal(o.textSource.path.offset, 3);
  assert.equal(o.textSource.path.normal, 1);
  const beforeReverse = structuredClone(o.rings);
  await page.locator("#text-path-reverse").check();
  await ready();
  assert.notDeepEqual((await project()).objects[1].rings, beforeReverse);
  await page.locator("#text-path-reverse").uncheck();
  await ready();
  // Node edits the embedded baseline, not the glyph outlines or original guide.
  await page.locator("#text-path-edit").click();
  const sourceBefore = structuredClone((await project()).objects[0]);
  const baselineCurve = (await project()).objects[1].textSource.path.curve;
  const firstAnchor = await world(
    mapPoint(baselineCurve.nodes[0], baselineCurve.frame),
  );
  await page.mouse.click(firstAnchor.x, firstAnchor.y);
  await drag({ x: -15, y: -20 }, { x: -15, y: -18 });
  o = (await project()).objects[1];
  assert.equal(o.id, id);
  assert(o.textSource.path.curve.nodes[0].out.y > -18.1);
  assert.deepEqual((await project()).objects[0], sourceBefore);
  assert.equal(o.textSource.content, "MTR");
  const mid = { x: 0, y: -12.25 },
    m = await world(mid);
  await page.mouse.dblclick(m.x, m.y);
  await ready();
  o = (await project()).objects[1];
  assert.equal(o.textSource.path.curve.nodes.length, 3);
  const n = mapPoint(
      o.textSource.path.curve.nodes[1],
      compose(o.textSource.frame, o.textSource.path.curve.frame),
    ),
    anchor = await world(n);
  await page.mouse.click(anchor.x, anchor.y);
  await page.keyboard.press("Delete");
  await ready();
  assert.equal(
    (await project()).objects[1].textSource.path.curve.nodes.length,
    2,
  );
  // Overset is an explicit reversible rejection; existing glyphs are retained.
  const beforeOverset = await project();
  await field("text-path-offset", 1000);
  assert.deepEqual((await project()).objects, beforeOverset.objects);
  assert.match(await page.locator("#toast").textContent(), /extends beyond/);
  await field("rotate", 15);
  o = (await project()).objects[1];
  const frame = structuredClone(o.textSource.frame);
  await page.locator("#live-font").selectOption("serif");
  await ready();
  assert.deepEqual((await project()).objects[1].textSource.frame, frame);
  await page.locator(".add-action-picker > summary").click();
  await chooseMethod(page, "run", { add: true });
  await page.locator("#operation-add").click();
  await ready();
  await page.locator('[data-color="#e6ab43"]').click();
  await ready();
  o = (await project()).objects[1];
  assert.equal(o.operations.length, 2);
  const actions = o.operations.map((a) => a.id);
  assert.deepEqual(
    [
      ...new Set(
        (await plan()).events
          .filter((e) => e.cmd === "stitch")
          .map((e) => e.operationId),
      ),
    ],
    actions,
  );
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  // Attach an existing editable text object to a circular baseline and retain Undo.
  await page.locator("#text-path-detach").click();
  await ready();
  assert(!(await project()).objects[1].textSource.path);
  assert.equal((await project()).objects[1].operations.length, 2);
  await page.locator("#undo").click();
  await ready();
  assert((await project()).objects[1].textSource.path);
  const saved = await project(),
    save = page.waitForEvent("download");
  await page.locator("#save-project").click();
  await (await save).saveAs("test-results/text-path.embstudio");
  await page.reload();
  await ready();
  assert.deepEqual((await project()).objects, saved.objects);
  await page
    .locator("#file-input")
    .setInputFiles("test-results/text-path.embstudio");
  await page.locator("#dialog-submit").click();
  await ready();
  assert.deepEqual((await project()).objects, saved.objects);
  const preview = (await plan()).events.filter((e) => e.cmd === "stitch");
  await page.locator("#export").click();
  const pes = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  await (await pes).saveAs("test-results/text-path.pes");
  const decoded = decodePes(await readFile("test-results/text-path.pes"));
  assert.deepEqual(declaredRect(decoded.pec), streamExtents(decoded.pec));
  const stitches = decoded.pec.events.filter((e) => e.type === "stitch");
  assert.equal(stitches.length, preview.length);
  stitches.forEach((e, i) => {
    assert.equal(e.x, Math.round((preview[i].x - preview[0].x) * 10) || 0);
    assert.equal(e.y, Math.round((preview[i].y - preview[0].y) * 10) || 0);
  });
  const circle = baseline({
    nodes: Array.from({ length: 64 }, (_, i) => ({
      x: 30 * Math.cos((i * Math.PI) / 32),
      y: 30 * Math.sin((i * Math.PI) / 32),
    })),
    closed: true,
    frame: identity(),
  });
  const detached = structuredClone(saved.objects[1]);
  delete detached.textSource.path;
  delete detached.textSource.glyphs;
  detached.operations = [detached.operations[0]];
  await open([circle, detached]);
  await pick(detached.id);
  await reveal(page.locator("#text-path-source"));
  await page.locator("#text-path-source").selectOption(circle.id);
  await page.locator("#text-path-attach").click();
  await ready();
  o = (await project()).objects[1];
  assert(o.textSource.path?.curve.closed);
  assert((await project()).objects[0].visible === false);
  assert.equal(o.id, detached.id);
  await field("text-path-offset", 200);
  assert.equal((await project()).objects[1].textSource.path.offset, 200);
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  await page.screenshot({ path: "test-results/text-path.png" });
  circle.operations = [
    makeOperation("placement", circle),
    makeOperation("stop", circle),
  ];
  await open([circle, detached]);
  await pick(detached.id);
  await reveal(page.locator("#text-path-source"));
  await page.locator("#text-path-source").selectOption(circle.id);
  assert(await page.locator("#text-path-hide-source").isDisabled());
  await page.locator("#text-path-attach").click();
  await ready();
  assert((await project()).objects[0].visible !== false);
  assert.equal((await plan()).stats.stops, 1);
  for (const [width, height] of [
    [1024, 768],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    // Media-query/ResizeObserver panel updates follow the viewport change.
    // Await the actual compact mode before deciding whether to open its drawer.
    await page.waitForFunction((width) => {
      const layout = window.studio.getWorkspace(),
        compact = width < 1100,
        open = (compact ? layout.compactOpen : layout.open).right;
      return (
        document
          .querySelector(".workspace")
          .classList.contains("compact-workspace") === compact &&
        document.getElementById("inspector-panel").hidden === !open
      );
    }, width);
    if (!(await page.locator("#inspector-panel").isVisible()))
      await page.locator("#toggle-inspector").click();
    const input = page.locator("#text-path-offset");
    await reveal(input);
    await input.scrollIntoViewIfNeeded();
    const r = await input.boundingBox();
    assert(r.x >= 0 && r.x + r.width <= width + 1);
    const overflow = await page.evaluate(() => ({
      innerWidth,
      body: document.body.scrollWidth,
      offscreen: [...document.body.querySelectorAll("*")]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            id: el.id,
            cls: el.className,
            x: r.x,
            width: r.width,
            right: r.right,
          };
        })
        .filter((r) => r.width > 0 && (r.right > innerWidth + 1 || r.x < -1))
        .slice(0, 20),
    }));
    assert(
      overflow.body <= overflow.innerWidth,
      JSON.stringify({ viewport: { width, height }, ...overflow }),
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Editable path lettering: creation, fonts/tracking/offsets/reverse, baseline handles and nodes, overset rejection, transforms, multiple actions, circular attachment, Undo, project persistence and independently decoded PES needle coordinates/origin passed.",
  );
} finally {
  await browser.close();
}
