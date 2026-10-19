import { chooseTool } from "./helpers/ui.mjs";
import { reveal, chooseMethod } from "./helpers/ui.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
      viewport: { width: 1580, height: 1060 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  const project = () => page.evaluate(() => window.studio.getProject());
  const pick = (id) => page.locator(`[data-select="${id}"]`).click();
  const world = async (x, y) =>
    page.evaluate(
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
  const drag = async (a, b) => {
    const start = await world(...a),
      end = await world(...b);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  };
  const box = (o) => {
    const p = o.rings.flat();
    return {
      minX: Math.min(...p.map((q) => q.x)),
      maxX: Math.max(...p.map((q) => q.x)),
      minY: Math.min(...p.map((q) => q.y)),
      maxY: Math.max(...p.map((q) => q.y)),
    };
  };
  const fill = async (id, value) => {
    await page.locator("#" + id).fill(String(value));
    await page.locator("#" + id).press("Tab");
    await ready();
  };
  const details = async (text) => {
    const summary = page
      .locator("#properties summary")
      .filter({ hasText: text });
    if (!(await summary.evaluate((e) => e.parentElement.open)))
      await summary.click();
  };
  await ready();
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await ready();
  await page.locator("#file-input").setInputFiles({
    name: "Overlap.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 50"><g id="Under group"><rect id="Under" x="10" y="10" width="40" height="30" fill="#cc8899"/></g><g id="Over group"><rect id="Over" x="15" y="15" width="30" height="20" fill="#6689a5"/></g></svg>',
    ),
  });
  await ready();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 2 &&
      window.studio.getPlan(),
  );
  let p = await project(),
    under = p.objects[0],
    over = p.objects[1],
    order = p.objects.map((o) => o.id),
    parent = under.parentId;
  await page.locator("#snap-objects").uncheck();
  await pick(under.id);
  let b = box(under),
    cx = (b.minX + b.maxX) / 2,
    cy = (b.minY + b.maxY) / 2;
  await drag([cx, cy], [cx + 3, cy + 4]);
  await ready();
  p = await project();
  assert(Math.abs(box(p.objects[0]).minX - b.minX - 3) < 0.05);
  assert.deepEqual(p.objects[1], over);
  assert.deepEqual(
    p.objects.map((o) => o.id),
    order,
  );
  assert.equal(p.objects[0].parentId, parent);
  assert.equal(p.sequencing, undefined);
  // Resize handles keep the selected lower region despite higher geometry.
  b = box(p.objects[0]);
  const overBefore = structuredClone(p.objects[1]);
  await drag([b.maxX, b.maxY], [b.maxX + 3, b.maxY + 3]);
  await ready();
  p = await project();
  assert(box(p.objects[0]).maxX > b.maxX + 2.9);
  assert.deepEqual(p.objects[1], overBefore);
  // Parent selection moves the selected subtree even under the higher SVG group.
  await pick(parent);
  b = box(p.objects[0]);
  await drag(
    [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
    [(b.minX + b.maxX) / 2 + 2, (b.minY + b.maxY) / 2],
  );
  await ready();
  assert.deepEqual((await project()).objects[1], over);
  const root = (await project()).groups.find((g) => g.kind === "svg");
  await pick(root.id);
  const overlap = box(over),
    overlapPoint = await world(
      (overlap.minX + overlap.maxX) / 2,
      (overlap.minY + overlap.maxY) / 2,
    );
  await page.keyboard.down("Alt");
  await page.mouse.click(overlapPoint.x, overlapPoint.y);
  await page.keyboard.up("Alt");
  assert.deepEqual(
    await page.evaluate(() => window.studio.getSelection().ids),
    [under.id],
  );
  await pick(under.id);
  await page.locator(`[data-select="${under.id}"] .object-title`).dblclick();
  await page.locator(".tree-rename").fill("Renamed underlying");
  await page.locator(".tree-rename").press("Enter");
  assert.equal((await project()).objects[0].name, "Renamed underlying");
  await page.locator(`[data-select="${under.id}"]`).press("F2");
  await page.locator(".tree-rename").fill("Cancelled");
  await page.locator(".tree-rename").press("Escape");
  assert.equal((await project()).objects[0].name, "Renamed underlying");
  // Smart rectangle, radius handle, non-destructive parameter changes and transforms.
  await chooseTool(page, "rect");
  await drag([-32, 24], [-4, 40]);
  await ready();
  p = await project();
  let rect = p.objects.at(-1);
  assert.equal(rect.shape.kind, "rect");
  await fill("shape-radius", 4);
  rect = (await project()).objects.at(-1);
  const old = rect.rings;
  await fill("pos-x", -15);
  await fill("rotate", 20);
  await fill("shape-radius", 3);
  rect = (await project()).objects.at(-1);
  assert.notDeepEqual(rect.rings, old);
  assert.equal(rect.shape.radius, 3);
  assert.equal(rect.spacing, 0.42);
  await chooseTool(page, "star");
  await drag([10, 25], [28, 42]);
  await ready();
  await fill("shape-sides", 7);
  assert.equal((await project()).objects.at(-1).shape.sides, 7);
  // Lettering remains one object through content/font/direction edits and gets real filled-region satin.
  const beforeLetteringCount = (await project()).objects.length;
  await page.locator("#text-tool").click();
  await page.locator("#text-value").fill("MTR");
  await page.locator("#text-height").fill("9");
  await page.locator("#dialog-submit").click();
  // Dialog close dispatch can follow click completion. Do not accept the previous
  // object's still-ready plan before lettering is added and regenerated.
  await page.waitForFunction((count) => {
    const p = window.studio.getProject();
    return (
      p.objects.length === count + 1 &&
      p.objects.at(-1).textSource?.content === "MTR" &&
      window.studio.getPlan()
    );
  }, beforeLetteringCount);
  let text = (await project()).objects.at(-1),
    textId = text.id;
  await fill("pos-x", 12);
  await fill("pos-y", -16);
  const frame = (await project()).objects.at(-1).textSource.frame;
  await page.locator("#live-text").fill("MTR\nOB");
  await page.locator("#live-text").press("Tab");
  await ready();
  await page.locator("#live-font").selectOption("sans-serif");
  await ready();
  text = (await project()).objects.at(-1);
  assert.equal(text.id, textId);
  assert.equal(text.textSource.content, "MTR\nOB");
  assert.equal(text.textSource.font, "sans-serif");
  assert.deepEqual(text.textSource.frame, frame);
  await chooseMethod(page, "column");
  await ready();
  await page.locator("#column-mode").selectOption("directional");
  await ready();
  await fill("angle", 85);
  await reveal(page.locator("#underlay"));
  await page.locator("#underlay").uncheck();
  await ready();
  assert(
    (await project()).objects
      .at(-1)
      .operations.some((op) => op.type === "column"),
  );
  assert(
    (await page.evaluate(() => window.studio.getPlan())).events.some(
      (e) => e.objectId === textId && e.phase === "top" && e.cmd === "stitch",
    ),
  );
  // Pen anchors and cubic handles are edited without losing source data.
  await chooseTool(page, "pen");
  await drag([-30, -25], [-22, -32]);
  await drag([-10, -25], [-5, -18]);
  await page.locator("#finish-draw").click();
  await ready();
  let curve = (await project()).objects.at(-1);
  assert(curve.curve);
  assert.equal(curve.curve.nodes.length, 2);
  assert(curve.rings[0].length > 5);
  await chooseTool(page, "node");
  await drag([-22, -32], [-22, -28]);
  await ready();
  curve = (await project()).objects.at(-1);
  assert(curve.curve);
  assert(Math.abs(curve.curve.nodes[0].out.y + 28) < 0.1);
  // Construction template and a real geometric eyelet opening.
  await page.locator("#edit-command").selectOption("template");
  await page.locator("#dialog-submit").click();
  await ready();
  p = await project();
  const body = p.objects.at(-2),
    eye = p.objects.at(-1);
  assert.equal(eye.shape.kind, "eyelet");
  assert(body.operations.some((op) => op.type === "stop"));
  await pick(eye.id);
  await page.locator("#hole-target").selectOption(body.id);
  await page.locator("#cut-eyelet").click();
  await ready();
  p = await project();
  assert(p.objects.find((o) => o.id === body.id).rings.length >= 2);
  await chooseTool(page, "eyelet");
  const placement = await world(28, 0);
  await page.mouse.click(placement.x, placement.y);
  await ready();
  assert.equal((await project()).objects.at(-1).shape.kind, "eyelet");
  await page.locator("#eyelet-marker").check();
  await ready();
  assert(
    (await project()).objects
      .at(-1)
      .operations.some((op) => op.type === "marker"),
  );
  await page.screenshot({ path: "test-results/creative-desktop.png" });
  // Save/reopen and independently decode actual PES commands from the new operations.
  const saved = await project();
  assert(saved.objects.some((o) => o.curve));
  assert(saved.objects.some((o) => o.textSource));
  const events = await page.evaluate(() => window.studio.getPlan().events);
  const result = spawnSync(
    process.env.PYTHON || "python",
    [fileURLToPath(new URL("./pes-codec-adapter.py", import.meta.url))],
    {
      input: JSON.stringify({ payload: { name: "Creative features", events } }),
      maxBuffer: 16000000,
    },
  );
  assert.equal(result.status, 0, result.stderr?.toString());
  const exported = JSON.parse(result.stdout),
    decoded = decodePes(Uint8Array.from(exported.bytes));
  assert.deepEqual(declaredRect(decoded.pec), streamExtents(decoded.pec));
  assert.equal(decoded.pec.originFieldX, -streamExtents(decoded.pec).left);
  assert.equal(decoded.pec.originFieldY, -streamExtents(decoded.pec).top);
  const sourceNeedles = events.filter((e) => e.cmd === "stitch"),
    fileNeedles = decoded.pec.events.filter((e) => e.type === "stitch");
  assert.equal(fileNeedles.length, sourceNeedles.length);
  const first = sourceNeedles[0];
  fileNeedles.forEach((e, i) => {
    assert.equal(
      e.x,
      Math.round(sourceNeedles[i].x * 10) - Math.round(first.x * 10),
    );
    assert.equal(
      e.y,
      Math.round(sourceNeedles[i].y * 10) - Math.round(first.y * 10),
    );
  });
  await writeFile("test-results/creative.pes", Uint8Array.from(exported.bytes));
  await page.locator("#file-input").setInputFiles({
    name: "Creative.embstudio",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.locator("#dialog-submit").click();
  await ready();
  assert.deepEqual(await project(), saved);
  const letteringChecks = await page.evaluate(async () => {
    const { lettering } = await import("./src/importers.js"),
      { makeOperation } = await import("./src/operations.js"),
      { generate } = await import("./src/engine.js"),
      { distance, fillPolygons, safeConnector } = await import(
        "./src/geometry.js"
      );
    return ["M", "T", "R", "O", "B"].map((char) => {
      const o = lettering(char, 12, "#000000", "serif");
      o.operations = [
        {
          ...makeOperation("column", o),
          columnMode: "directional",
          angle: 0,
          compensation: 0,
          underlay: false,
          tieIn: false,
          tieOff: false,
        },
      ];
      const plan = generate({
        version: 1,
        name: char,
        machine: "se700",
        objects: [o],
        planning: { smallDetail: 0 },
      });
      const polygons = fillPolygons(o.rings, o.fillRule),
        holes = polygons.flatMap((poly) =>
          poly.slice(1).map((r) => r.map(([x, y]) => ({ x, y }))),
        );
      let previous = null,
        longest = 0,
        crosses = 0,
        bad = [];
      for (const e of plan.events) {
        if (e.cmd === "stitch" && previous) {
          longest = Math.max(longest, distance(e, previous));
          if (!safeConnector(previous, e, o.rings, 0.12, holes, o.fillRule)) {
            crosses++;
            if (bad.length < 4) bad.push({ from: previous, to: e });
          }
        }
        if (["stitch", "jump"].includes(e.cmd)) previous = e;
      }
      return {
        char,
        stitches: plan.stats.stitches,
        longest,
        crosses,
        holes: holes.length,
        bad,
        warnings: plan.warnings,
      };
    });
  });
  for (const check of letteringChecks) {
    assert(check.stitches > 20);
    assert(check.longest <= 7.001);
    assert.equal(check.crosses, 0, JSON.stringify(check));
  }
  assert(letteringChecks.find((c) => c.char === "O").holes > 0);
  assert(letteringChecks.find((c) => c.char === "B").holes >= 2);
  // Actual image tracing UI with repeatable source reference and explicit speck filtering.
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 100;
    c.height = 70;
    const g = c.getContext("2d");
    g.fillStyle = "white";
    g.fillRect(0, 0, 100, 70);
    g.fillStyle = "red";
    g.fillRect(10, 10, 35, 50);
    g.fillStyle = "white";
    g.fillRect(20, 20, 15, 30);
    g.fillStyle = "blue";
    g.fillRect(55, 15, 35, 40);
    g.fillRect(3, 3, 1, 1);
    return c.toDataURL().split(",")[1];
  });
  await page.locator("#file-input").setInputFiles({
    name: "Logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.locator("#image-import-mode").selectOption("trace");
  await page.locator("#dialog-submit").click();
  await page.waitForSelector("#trace-preview");
  await page.locator("#raster-colors").fill("3");
  await page.locator("#trace-area").fill("0");
  await page.locator("#trace-smooth").check();
  await page.waitForTimeout(250);
  await page.locator("#dialog-submit").click();
  await ready();
  p = await project();
  let traced = p.groups.find((g) => g.imageSource);
  assert(traced);
  assert(traced.traceSettings.smoothing);
  assert(p.objects.filter((o) => o.parentId === traced.id).length === 2);
  await pick(traced.id);
  await details("Image tracing reference");
  await page.locator("#retrace-image").click();
  await page.locator("#trace-area").fill("1");
  await page.waitForTimeout(200);
  await page.locator("#dialog-submit").click();
  await ready();
  p = await project();
  assert.equal(
    p.groups.find((g) => g.id === traced.id).traceSettings.minArea,
    1,
  );
  await page.locator("#undo").click();
  await ready();
  assert.equal(
    (await project()).groups.find((g) => g.id === traced.id).traceSettings
      .minArea,
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toggle-layers").click();
  await page.locator(`[data-check="${textId}"]`).click();
  await page.locator("#edit-command").selectOption("rename");
  await page.locator(".tree-rename").fill("Touch lettering");
  await page.locator(".tree-rename").press("Enter");
  assert.equal(
    (await project()).objects.find((o) => o.id === textId).name,
    "Touch lettering",
  );
  await page.screenshot({ path: "test-results/creative-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Creative editor: overlapping selection, nested transforms, inline rename, smart shapes, live lettering, satin columns, Bézier handles, shared templates, eyelet cutouts, tracing, persistence and independent PES origin decoding passed.",
  );
} finally {
  await browser.close();
}
