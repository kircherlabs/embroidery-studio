import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chooseTool } from "./helpers/ui.mjs";
import {
  sculptFixtures,
  project as fixtureProject,
  intendedContour,
  deviation,
  lineHit,
} from "./helpers/sculpt-fixture.mjs";
import { sculptIntersections, sculptTolerance } from "../src/sculpt-contour.js";
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
      viewport: { width: 1600, height: 1080 },
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  // Observe real canvas anchor drawing, not just serialized geometry. Keep the
  // renderer unchanged; its six-CSS-pixel Node squares identify actual controls.
  await page.addInitScript(() => {
    const clear = CanvasRenderingContext2D.prototype.clearRect,
      rect = CanvasRenderingContext2D.prototype.rect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.id === "stage") window.__drawnNodes = [];
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.rect = function (x, y, w, h) {
      const m = this.getTransform(),
        scale = Math.hypot(m.a, m.b) / devicePixelRatio;
      if (
        this.canvas.id === "stage" &&
        Math.abs(w * scale - 6) < 0.01 &&
        Math.abs(h * scale - 6) < 0.01
      )
        (window.__drawnNodes ||= []).push({ x: x + w / 2, y: y + h / 2 });
      return rect.call(this, x, y, w, h);
    };
  });
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  const project = () => page.evaluate(() => window.studio.getProject());
  const plan = () => page.evaluate(() => window.studio.getPlan());
  const select = async (id) => {
    await page.locator(`[data-select="${id}"]`).click();
    await chooseTool(page, "node");
  };
  const open = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "Sculpt.embstudio",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page
      .getByRole("heading", { name: "Open this project?", exact: true })
      .waitFor();
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      (name) =>
        window.studio.getProject().name === name && window.studio.getPlan(),
      p.name,
    );
    await page.locator("#design-tab").click();
  };
  const world = async (p) => {
    await page.waitForFunction(
      () =>
        Math.abs(
          document.getElementById("stage").getBoundingClientRect().width -
            window.studio.getView().width,
        ) < 1,
    );
    return page.evaluate((p) => {
      const r = document.getElementById("stage").getBoundingClientRect(),
        v = window.studio.getView();
      return {
        x: r.x + v.center.x + p.x * v.scale,
        y: r.y + v.center.y + p.y * v.scale,
      };
    }, p);
  };
  const drag = async (a, b, { cancel = false, touch = false } = {}) => {
    const start = await world(a),
      end = await world(b);
    if (touch) {
      const session = await page.context().newCDPSession(page);
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: start.x, y: start.y }],
      });
      for (let i = 1; i <= 5; i++)
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: start.x + ((end.x - start.x) * i) / 5,
              y: start.y + ((end.y - start.y) * i) / 5,
            },
          ],
        });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await session.detach();
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 5 });
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
    }
    await ready();
  };
  // Use a visible segment midpoint away from existing Node hit targets. Editing
  // anchor drags are a different gesture and must not masquerade as Sculpt.
  const spot = async (o, target = { x: 0, y: -14 }) => {
    const scale = await page.evaluate(() => window.studio.getView().scale);
    const candidates = o.rings[0]
      .slice(1)
      .map((b, i) => {
        const a = o.rings[0][i],
          p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return {
          p,
          gap:
            Math.min(
              ...o.rings.flat().map((q) => Math.hypot(q.x - p.x, q.y - p.y)),
            ) * scale,
          score: Math.hypot(p.x - target.x, p.y - target.y),
        };
      })
      .filter((q) => q.gap > 8);
    candidates.sort((a, b) => a.score - b.score);
    assert(
      candidates.length,
      "there is a real segment Sculpt target, away from anchor handles",
    );
    return candidates[0].p;
  };
  await ready();
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 0 &&
      window.studio.getPlan(),
  );
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 360;
    c.height = 210;
    const g = c.getContext("2d");
    g.fillStyle = "#e8a929";
    g.beginPath();
    g.moveTo(25, 80);
    g.bezierCurveTo(90, 20, 240, 30, 320, 80);
    g.lineTo(320, 175);
    g.lineTo(25, 175);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.ellipse(170, 130, 18, 13, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#183065";
    g.fillRect(325, 80, 20, 95);
    return c.toDataURL("image/png");
  });
  await page.locator("#file-input").setInputFiles({
    name: "Traced-contour.png",
    mimeType: "image/png",
    buffer: Buffer.from(png.split(",")[1], "base64"),
  });
  await page.locator("#image-import-mode").selectOption("trace");
  await page.locator("#dialog-submit").click();
  await page.locator("#raster-colors").fill("2");
  await page.locator("#raster-bg").uncheck();
  await page
    .locator("#trace-simplify")
    .evaluate((el) => (el.closest("details").open = true));
  await page.locator("#trace-simplify").fill("0.08");
  await page.waitForFunction(
    () =>
      document
        .getElementById("trace-status")
        ?.textContent.includes("contours") &&
      !document.getElementById("dialog-submit").disabled,
  );
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().groups?.some((g) => g.imageSource) &&
      window.studio.getPlan(),
  );
  const imported = await project(),
    original = imported.objects.find((o) => o.rings.length > 1);
  assert(
    original,
    "actual PNG tracing produced editable fill geometry with a hole",
  );
  assert.equal(original.type, "fill");
  await select(original.id);
  await page.locator("#sculpt-radius").fill("2");
  await page.locator("#sculpt-radius").press("Tab");
  // Imported image is placed at center; choose the longest upper contour segment.
  let o = (await project()).objects.find((o) => o.id === original.id);
  const outer = o.rings[0],
    aim = {
      x:
        (Math.min(...outer.map((p) => p.x)) +
          Math.max(...outer.map((p) => p.x))) /
        2,
      y: Math.min(...outer.map((p) => p.y)),
    };
  const target = await spot(o, aim),
    focus = await world(target);
  await page.mouse.move(focus.x, focus.y);
  await page.mouse.wheel(0, -1800);
  await page.waitForTimeout(100);
  const unchangedNeighbors = imported.objects.filter(
    (o) => o.id !== original.id,
  );
  await page.screenshot({ path: "test-results/sculpt-trace-before.png" });
  const counts = [o.rings[0].length],
    baselineEvents = (await plan()).events;
  const renderedCounts = [];
  const checkDrawnNodes = async (artwork) => {
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const controls = await page.evaluate(() => window.__drawnNodes);
    assert.equal(
      controls.length,
      artwork.rings.flat().length,
      "canvas draws true polygon controls, not extra flattened samples",
    );
    for (const point of controls)
      assert(
        artwork.rings
          .flat()
          .some((p) => Math.hypot(p.x - point.x, p.y - point.y) < 1e-7),
      );
    renderedCounts.push(
      controls.filter((p) => Math.hypot(p.x - target.x, p.y - target.y) < 4)
        .length,
    );
  };
  await checkDrawnNodes(o);
  let maxError = 0;
  for (let i = 0; i < 50; i++) {
    o = (await project()).objects.find((o) => o.id === original.id);
    const start = await spot(o, target),
      delta = { x: 0, y: i % 2 ? 0.18 : -0.18 },
      hit = lineHit(o.rings[0], start);
    const ideal = intendedContour(o.rings[0], hit, delta, 2);
    await drag(start, { x: start.x, y: start.y + delta.y });
    const after = (await project()).objects.find((o) => o.id === original.id);
    assert.notDeepEqual(after.rings, o.rings, "segment drag actually sculpts");
    assert.deepEqual(after.rings.slice(1), original.rings.slice(1));
    assert(!sculptIntersections(after.rings));
    maxError = Math.max(maxError, deviation(after.rings[0], ideal));
    assert(maxError <= sculptTolerance(2) + 0.001);
    if ([0, 9, 49].includes(i)) {
      counts.push(after.rings[0].length);
      await checkDrawnNodes(after);
    }
    assert.deepEqual(
      (await project()).objects.filter((o) => o.id !== original.id),
      unchangedNeighbors,
    );
  }
  assert(
    Math.max(...counts.slice(1)) - Math.min(...counts.slice(1)) < 12,
    "repeat edits stay compact instead of adding support samples each time",
  );
  assert.notDeepEqual(
    (await plan()).events,
    baselineEvents,
    "stitches regenerated from edited contour",
  );
  const edited = await project();
  await page.screenshot({ path: "test-results/sculpt-trace-after.png" });
  await page.locator("#undo").click();
  await ready();
  const undone = await project();
  assert.notDeepEqual(undone.objects, edited.objects);
  await page.locator("#redo").click();
  await ready();
  assert.deepEqual((await project()).objects, edited.objects);
  const saving = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const saved = await saving;
  await saved.saveAs("test-results/sculpt-edit.embstudio");
  await page.reload();
  await ready();
  assert.deepEqual((await project()).objects, edited.objects);
  await open(
    JSON.parse(await readFile("test-results/sculpt-edit.embstudio", "utf8")),
  );
  assert.deepEqual((await project()).objects, edited.objects);
  await select(original.id);
  o = (await project()).objects.find((o) => o.id === original.id);
  const beforeCancel = await project(),
    start = await spot(o, target);
  await drag(start, { x: start.x, y: start.y - 1 }, { cancel: true });
  assert.deepEqual(
    await project(),
    beforeCancel,
    "Escape restores exact geometry and source metadata",
  );
  // Mouse drags at several camera zooms produce the same physical contour.
  const single = sculptFixtures()[0];
  single.id = "zoom-contour";
  const zoomResults = [];
  for (const clicks of [-1, 0, 2]) {
    await open({ ...fixtureProject([single]), name: "Zoom sculpt " + clicks });
    await select(single.id);
    await page.locator("#fit-design").click();
    for (let i = 0; i < Math.abs(clicks); i++)
      await page.locator(clicks < 0 ? "#zoom-out" : "#zoom-in").click();
    const hit = lineHit(single.rings[0], { x: 2.5, y: -15 });
    await drag(hit.point, { x: hit.point.x, y: hit.point.y - 0.6 });
    zoomResults.push((await project()).objects[0].rings);
  }
  assert(deviation(zoomResults[0][0], zoomResults[1][0]) < 0.0001);
  assert(deviation(zoomResults[1][0], zoomResults[2][0]) < 0.0001);
  // Touch uses the same pointer contour edit and history path.
  await open({ ...fixtureProject([single]), name: "Touch sculpt" });
  await select(single.id);
  await page.locator("#fit-design").click();
  const touchHit = lineHit(single.rings[0], { x: 2.5, y: -15 });
  await drag(
    touchHit.point,
    { x: touchHit.point.x, y: touchHit.point.y - 0.6 },
    { touch: true },
  );
  const touched = (await project()).objects[0];
  assert(deviation(touched.rings[0], zoomResults[0][0]) < 1e-5);
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual((await project()).objects[0].rings, single.rings);
  // Crossing a counter is rejected with exact Undo/source restoration.
  const hole = sculptFixtures()[2];
  hole.id = "hole-guard";
  await open({ ...fixtureProject([hole]), name: "Counter protection" });
  await select(hole.id);
  await page.locator("#fit-design").click();
  await page.locator("#sculpt-radius").fill("10");
  await page.locator("#sculpt-radius").press("Tab");
  const unsafeStart = await spot(hole, { x: 0, y: -15 }),
    safe = await project();
  await drag(unsafeStart, { x: unsafeStart.x, y: 8 });
  assert.deepEqual(
    await project(),
    safe,
    "invalid crossing/counter loss restores source",
  );
  assert.match(
    await page.locator("#toast").innerText(),
    /cross|counter|island/,
  );
  // Reopen the real traced edit and compare independently decoded PES needle data.
  await open(edited);
  const beforeExport = await plan();
  await page.locator("#export").click();
  const downloading = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  const file = await downloading;
  await file.saveAs("test-results/sculpt-edit.pes");
  const decoded = decodePes(await readFile("test-results/sculpt-edit.pes"));
  assert.deepEqual(declaredRect(decoded.pec), streamExtents(decoded.pec));
  const needle = decoded.pec.events.filter((e) => e.type === "stitch"),
    preview = beforeExport.events.filter((e) => e.cmd === "stitch");
  assert.equal(needle.length, preview.length);
  preview.forEach((p, i) => {
    assert.equal(needle[i].x, Math.round((p.x - preview[0].x) * 10) || 0);
    assert.equal(needle[i].y, Math.round((p.y - preview[0].y) * 10) || 0);
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/sculpt-browser-report.json",
    JSON.stringify(
      {
        counts,
        renderedLocalControls: renderedCounts,
        maximumPerEditDeviationMM: maxError,
        sewingStitches: preview.length,
      },
      null,
      2,
    ),
  );
  console.log(
    "Sculpt: actual PNG trace, local 2 mm edits, stored/visible control counts",
    counts,
    "max deviation mm",
    maxError,
    "; holes/neighbors, multiple zooms, touch pointers, cancel/history, saved project and every PES needle passed.",
  );
} finally {
  await browser.close();
}
