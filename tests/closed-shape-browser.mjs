import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { chooseTool, reveal } from "./helpers/ui.mjs";
import { EDITING_STYLE } from "../src/editing-overlay.js";
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
      viewport: { width: 1500, height: 1000 },
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Observe actual canvas paint, not a separate preview model or test-only app API.
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype;
    for (const method of [
      "clearRect",
      "beginPath",
      "moveTo",
      "lineTo",
      "arc",
      "closePath",
      "stroke",
      "fill",
    ]) {
      const original = proto[method];
      proto[method] = function (...args) {
        if (this.canvas.id === "stage") {
          if (method === "clearRect") window.__outlinePaint = [];
          else if (method === "beginPath") this.__outlinePath = [];
          else if (["stroke", "fill"].includes(method))
            (window.__outlinePaint ||= []).push({
              kind: method,
              path: [...(this.__outlinePath || [])],
              dash: this.getLineDash(),
              color: this.strokeStyle,
              alpha: this.globalAlpha,
            });
          else (this.__outlinePath ||= []).push([method, ...args]);
        }
        return original.apply(this, args);
      };
    }
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.target.id !== "stage" || !window.studio) return;
        const r = e.target.getBoundingClientRect(),
          v = window.studio.getView();
        (window.__placed ||= []).push({
          x: (e.clientX - r.x - v.center.x) / v.scale,
          y: (e.clientY - r.y - v.center.y) / v.scale,
        });
      },
      true,
    );
  });
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject());
  await ready();
  assert.equal(
    await page.locator('[data-tool="polygon"]').getAttribute("aria-label"),
    "Closed Shape",
  );
  const description =
    "Draw a custom closed outline by placing points. Apply satin borders, tatami fills, or other stitch styles.";
  for (const enabled of [false, true]) {
    if (enabled) await page.locator("#context-help").click();
    await page.locator('[data-tool="polygon"]').hover();
    await page.waitForFunction(
      () => !document.getElementById("control-description").hidden,
    );
    const text = await page.locator("#control-description").innerText();
    assert(text.startsWith("Closed Shape"));
    assert.equal(text.includes(description), enabled);
    await page.mouse.move(1490, 990);
  }
  await page.locator("#context-help").click();
  const blank = async (style) => {
    await page.locator("#file-input").setInputFiles({
      name: "outline.embstudio",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          name: "Closed Shape regression",
          machine: "se700",
          objects: [],
        }),
      ),
    });
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      () =>
        window.studio.getProject().objects.length === 0 &&
        window.studio.getPlan(),
    );
    await reveal(page.locator("#draw-style"));
    await page.locator("#draw-style").selectOption(style);
    await page.locator("#draw-style").press("Escape");
    await chooseTool(page, "polygon");
    await page.locator("#zoom-fit").click();
    await page.evaluate(() => {
      window.__placed = [];
    });
  };
  const point = async ([x, y], touch = false) => {
    const p = await page.evaluate(
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
    if (touch) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  const verifyPaint = async (crossing = false) => {
    const paint = await page.evaluate(() => window.__outlinePaint);
    assert(
      !paint.some(
        (p) => p.kind === "fill" && p.path.some((c) => c[0] === "lineTo"),
      ),
      "no filled polygon during construction",
    );
    const strokes = paint.filter(
      (p) =>
        p.kind === "stroke" &&
        [EDITING_STYLE.ink, EDITING_STYLE.warning].includes(p.color) &&
        p.path.length === 2 &&
        p.path[0][0] === "moveTo" &&
        p.path[1][0] === "lineTo",
    );
    const placed = await page.evaluate(() => window.__placed);
    assert.equal(
      strokes.length,
      placed.length >= 3 ? placed.length : placed.length - 1,
    );
    for (let i = 0; i < placed.length - 1; i++) {
      assert.deepEqual(strokes[i].path, [
        ["moveTo", placed[i].x, placed[i].y],
        ["lineTo", placed[i + 1].x, placed[i + 1].y],
      ]);
      assert.deepEqual(strokes[i].dash, []);
    }
    if (placed.length >= 3) {
      assert(strokes.at(-1).dash.length === 2);
      assert.deepEqual(strokes.at(-1).path, [
        ["moveTo", placed.at(-1).x, placed.at(-1).y],
        ["lineTo", placed[0].x, placed[0].y],
      ]);
    }
    assert.equal(
      paint.some(
        (p) =>
          p.color === EDITING_STYLE.warning &&
          p.path.length === 4 &&
          p.kind === "stroke",
      ),
      crossing,
    );
    assert.equal(
      await page
        .locator("#draw-message")
        .evaluate((e) => e.classList.contains("outline-warning")),
      crossing,
    );
    assert.equal((await project()).objects.length, 0);
    assert.equal(
      await page.evaluate(() => window.studio.getPlan().stats.stitches),
      0,
    );
  };
  const cases = [
    {
      name: "tatami",
      style: "auto",
      types: ["fill"],
      points: [
        [-15, -12],
        [15, -12],
        [0, 12],
      ],
    },
    {
      name: "simple",
      style: "border",
      types: ["border"],
      points: [
        [-18.013, -12.027],
        [18.041, -12.027],
        [18.041, 12.059],
        [-18.013, 12.059],
      ],
    },
    {
      name: "concave",
      style: "combined",
      types: ["fill", "run"],
      points: [
        [-20, -15],
        [20, -15],
        [20, 0],
        [0, 0],
        [0, 15],
        [-20, 15],
      ],
    },
    {
      name: "crossing",
      style: "run",
      types: ["run"],
      points: [
        [-15, -12],
        [15, 12],
        [-15, 12],
        [15, -12],
      ],
      crossing: true,
    },
    {
      name: "closing-crossing",
      style: "run",
      types: ["run"],
      points: [
        [-15, -12],
        [15, -12],
        [-15, 12],
        [15, 12],
      ],
      crossing: true,
    },
  ];
  for (const c of cases) {
    await blank(c.style);
    for (let i = 0; i < c.points.length; i++) {
      await point(c.points[i]);
      await verifyPaint(!!c.crossing && i === c.points.length - 1);
    }
    await page.screenshot({ path: `test-results/closed-shape-${c.name}.png` });
    const placed = await page.evaluate(() => window.__placed);
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () =>
        window.studio.getProject().objects.length === 1 &&
        window.studio.getPlan(),
    );
    const made = (await project()).objects[0];
    assert.equal(made.name, "Closed shape");
    assert.equal(made.type, "fill"); // legacy source identifier remains compatible.
    assert.deepEqual(made.rings, [placed]);
    assert.deepEqual(
      (made.operations || [made]).map((o) => o.type),
      c.types,
    );
    assert(
      await page.evaluate(() => window.studio.getPlan().stats.stitches > 0),
    );
    await page.locator("#undo").click();
    await page.waitForFunction(
      () =>
        window.studio.getProject().objects.length === 0 &&
        window.studio.getPlan(),
    );
    await page.locator("#redo").click();
    await page.waitForFunction(
      () =>
        window.studio.getProject().objects.length === 1 &&
        window.studio.getPlan(),
    );
    assert.deepEqual((await project()).objects[0], made);
    await page.waitForFunction(
      () =>
        localStorage.getItem("embroidery-studio-v1") ===
        JSON.stringify(window.studio.getProject()),
    );
    await page.reload();
    await ready();
    assert.deepEqual((await project()).objects[0], made);
  }
  // Edit Points still edits the completed source; Undo restores the placed vertices.
  const made = (await project()).objects[0];
  await page.locator(`[data-select="${made.id}"]`).click();
  await chooseTool(page, "node");
  const a = made.rings[0][0];
  const screen = await page.evaluate(({ x, y }) => {
    const r = document.getElementById("stage").getBoundingClientRect(),
      v = window.studio.getView();
    return {
      x: r.x + v.center.x + x * v.scale,
      y: r.y + v.center.y + y * v.scale,
    };
  }, a);
  await page.mouse.move(screen.x, screen.y);
  await page.mouse.down();
  await page.mouse.move(screen.x + 10, screen.y - 10, { steps: 5 });
  await page.mouse.up();
  await ready();
  assert.notDeepEqual((await project()).objects[0].rings, made.rings);
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual((await project()).objects[0].rings, made.rings);
  // Small screens keep a readable warning and both Finish/Cancel above the canvas.
  await page.setViewportSize({ width: 390, height: 844 });
  await blank("border");
  for (const p of cases.find((c) => c.name === "crossing").points)
    await point(p, true);
  await verifyPaint(true);
  const canvas = await page.locator("#stage").boundingBox();
  for (const id of ["draw-message", "finish-draw", "cancel-draw"]) {
    const b = await page.locator("#" + id).boundingBox();
    assert(b.y + b.height <= canvas.y + 1 && b.x >= 0 && b.x + b.width <= 390);
  }
  await page.screenshot({ path: "test-results/closed-shape-mobile.png" });
  await page.locator("#cancel-draw").click();
  await page.setViewportSize({ width: 1500, height: 1000 });
  await blank("combined");
  for (const p of cases.find((c) => c.name === "concave").points)
    await point(p);
  await page.locator("#finish-draw").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 1 &&
      window.studio.getPlan(),
  );
  const before = await page.evaluate(() =>
    window.studio.getPlan().events.filter((e) => e.cmd === "stitch"),
  );
  await page.locator("#export").click();
  const download = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  await (await download).saveAs("test-results/closed-shape.pes");
  const dec = decodePes(await readFile("test-results/closed-shape.pes")),
    sewn = dec.pec.events.filter((e) => e.type === "stitch");
  assert.deepEqual(declaredRect(dec.pec), streamExtents(dec.pec));
  assert.equal(sewn.length, before.length);
  before.forEach((p, i) => {
    assert.equal(sewn[i].x, Math.round((p.x - before[0].x) * 10) || 0);
    assert.equal(sewn[i].y, Math.round((p.y - before[0].y) * 10) || 0);
  });
  assert.deepEqual(errors, []);
  console.log(
    "Closed Shape: correct name/Hints, real solid/dashed canvas strokes, no draft fill/stitches, simple/concave/crossing/closing-edge outlines, exact point order, selected styles, history/reload/node editing, mobile warnings and independently decoded PES geometry passed.",
  );
} finally {
  await browser.close();
}
