import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { object } from "../src/model.js";
import { curveRings } from "../src/smart-geometry.js";
import { cubic } from "../src/path-editing.js";
import { chooseTool } from "./helpers/ui.mjs";
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
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1100 },
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = async () => {
    await page.waitForFunction(() => window.studio?.getPlan());
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  };
  const shape = (cx) => {
    const o = object("Curve " + cx, [], {
      type: "fill",
      closed: true,
      color: "#e7b34a",
      underlay: false,
      compensation: 0,
    });
    o.curve = {
      closed: true,
      frame: [1, 0, 0, 1, 0, 0],
      nodes: [
        {
          x: cx - 8,
          y: -8,
          in: { x: cx - 8, y: -4 },
          out: { x: cx - 8, y: -18 },
          mode: "corner",
        },
        {
          x: cx + 8,
          y: -8,
          in: { x: cx + 8, y: -18 },
          out: { x: cx + 8, y: -4 },
          mode: "corner",
        },
        { x: cx + 8, y: 8 },
        { x: cx - 8, y: 8 },
      ],
    };
    o.rings = curveRings(o.curve);
    return o;
  };
  const a = shape(-20),
    b = shape(20);
  await ready();
  await page.locator("#file-input").setInputFiles({
    name: "node-ui.embstudio",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: "Node UI",
        machine: "se700",
        objects: [a, b],
      }),
    ),
  });
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () => window.studio.getProject().name === "Node UI",
  );
  await ready();
  const project = () => page.evaluate(() => window.studio.getProject());
  const pick = async (o, modifiers) => {
    await page
      .locator(`[data-select="${o.id}"] .object-title`)
      .click({ modifiers });
    await ready();
  };
  const world = (p) =>
    page.evaluate((p) => {
      const v = window.studio.getView(),
        r = document.getElementById("stage").getBoundingClientRect();
      return {
        x: r.x + v.center.x + p.x * v.scale,
        y: r.y + v.center.y + p.y * v.scale,
      };
    }, p);
  const click = async (p, touch = false) => {
    const q = await world(p);
    if (touch) await page.touchscreen.tap(q.x, q.y);
    else await page.mouse.click(q.x, q.y);
    await ready();
  };
  const purple = async (p) =>
    page.evaluate((p) => {
      const c = document.getElementById("stage"),
        v = window.studio.getView(),
        d = c.width / c.getBoundingClientRect().width,
        x = (v.center.x + p.x * v.scale) * d,
        y = (v.center.y + p.y * v.scale) * d;
      const data = c
        .getContext("2d")
        .getImageData(
          Math.round(x - 7 * d),
          Math.round(y - 7 * d),
          Math.round(14 * d),
          Math.round(14 * d),
        ).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i] > 95 &&
          data[i] < 165 &&
          data[i + 1] < 95 &&
          data[i + 2] > 75 &&
          data[i + 2] < 150
        )
          n++;
      return n;
    }, p);
  const controls = async (id) =>
    page
      .locator("#stage")
      .getAttribute("data-node-editing-object")
      .then((actual) => assert.equal(actual, id));
  const ah = a.curve.nodes[0].out,
    bh = b.curve.nodes[0].out;
  const untouched = JSON.stringify((await project()).objects);
  const baselineA = (await project()).objects[0];
  await pick(a);
  await chooseTool(page, "node");
  await controls(a.id);
  assert.equal(await purple(ah), 0);
  assert.equal(await purple(bh), 0);
  assert.equal(await page.locator("#closed-curve-action").count(), 0);
  assert.equal(await page.locator("#closed-curve-actions > button").count(), 4);
  for (const id of ["corner", "smooth", "break", "points"]) {
    assert.equal(await page.locator(`#node-${id}`).count(), 1);
    assert.equal(await page.locator(`#node-${id} svg`).count(), 1);
  }
  assert(await page.locator("#node-smooth").isDisabled());
  await click(a.curve.nodes[0]);
  assert(await page.locator("#node-smooth").isEnabled());
  assert((await purple(ah)) > 5);
  assert((await purple(a.curve.nodes[0].in)) > 5);
  assert.equal(await purple(a.curve.nodes[1].in), 0);
  assert.equal(await purple(a.curve.nodes[1].out), 0);
  await page.screenshot({ path: "test-results/selected-node-handles.png" });
  const segmentMid = cubic(
    [a.curve.nodes[0], ah, a.curve.nodes[1].in, a.curve.nodes[1]],
    0.5,
  );
  await click(segmentMid);
  assert(await page.locator("#node-smooth").isDisabled());
  assert((await purple(ah)) > 5);
  assert((await purple(a.curve.nodes[1].in)) > 5);
  assert.equal(await purple(a.curve.nodes[0].in), 0);
  assert.equal(await purple(a.curve.nodes[1].out), 0);
  await page.screenshot({ path: "test-results/selected-edge-handles.png" });
  // A segment handle remains in segment scope during dragging and undo.
  const from = await world(ah),
    to = await world({ x: ah.x - 1, y: ah.y - 1 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await ready();
  assert(
    Math.abs((await project()).objects[0].curve.nodes[0].out.x - (ah.x - 1)) <
      0.05,
  );
  assert((await purple(a.curve.nodes[1].in)) > 5);
  assert.equal(await purple(a.curve.nodes[0].in), 0);
  assert(await page.locator("#node-smooth").isDisabled());
  await page.locator("#undo").click();
  await ready();
  assert.equal(JSON.stringify((await project()).objects), untouched);
  // A hidden handle on the same active object must not accept a drag.
  await click(a.curve.nodes[0]);
  const hidden = await world(a.curve.nodes[1].in);
  await page.mouse.move(hidden.x, hidden.y);
  await page.mouse.down();
  await page.mouse.move(hidden.x + 20, hidden.y - 20);
  await page.mouse.up();
  await ready();
  assert.equal(JSON.stringify((await project()).objects), untouched);
  await pick(b);
  await controls(b.id);
  assert.equal(await purple(ah), 0);
  assert.equal(await purple(bh), 0);
  await click(b.curve.nodes[0], true);
  assert((await purple(bh)) > 5);
  assert.equal(await purple(b.curve.nodes[1].in), 0);
  // Clicking an inactive handle cannot drag or change its old source.
  await click(ah);
  assert.equal(JSON.stringify((await project()).objects), untouched);
  await pick(a);
  await pick(b, ["Control"]);
  await controls("");
  assert.equal(await purple(ah), 0);
  assert.equal(await purple(bh), 0);
  await pick(b);
  await chooseTool(page, "select");
  await controls("");
  assert.equal(await purple(bh), 0);
  await chooseTool(page, "node");
  await controls(b.id);
  const tip = page.locator("#control-description");
  const readable = async (selector) => {
    const result = await page.locator(selector).evaluate((el) => {
      const style = getComputedStyle(el),
        luminance = (color) => {
          const rgb = color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((n) => {
              n /= 255;
              return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
            });
          return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        },
        a = luminance(style.color),
        b = luminance(style.backgroundColor);
      return {
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        opacity: style.opacity,
      };
    });
    assert(result.ratio >= 4.5, selector + " contrast " + result.ratio);
    assert.equal(result.opacity, "1");
  };
  await page.locator("#node-points").hover();
  await tip.waitFor({ state: "visible" });
  assert.match(await tip.textContent(), /Add & Remove Points.*4/);
  await page.locator("#context-help").click();
  await page.locator("#node-points").hover();
  await tip.waitFor({ state: "visible" });
  assert.match(await tip.textContent(), /Ctrl.*double-click|subdivided/);
  await page.locator("#context-help").click();
  await page.locator("#path-repair > summary").click();
  assert.equal(await page.locator("#path-repair fieldset").count(), 2);
  const contrast = await page.locator("#split-node").evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      opacity: s.opacity,
      color: s.color,
      background: s.backgroundColor,
    };
  });
  assert.equal(contrast.opacity, "1");
  assert.notEqual(contrast.color, contrast.background);
  await readable("#close-vector");
  await readable("#split-node");
  await page.screenshot({ path: "test-results/node-controls-desktop.png" });
  await page.locator("#path-repair > summary").click();
  const edge = cubic(
    [
      b.curve.nodes[0],
      b.curve.nodes[0].out,
      b.curve.nodes[1].in,
      b.curve.nodes[1],
    ],
    0.5,
  );
  await page.locator("#node-points").click();
  assert.equal(
    await page.locator("#node-points").getAttribute("aria-pressed"),
    "true",
  );
  await readable("#node-points");
  await page.locator("#node-points").hover();
  await readable("#node-points");
  const hover = await world(edge);
  await page.mouse.move(hover.x, hover.y);
  await page.screenshot({ path: "test-results/node-point-hover.png" });
  await click(edge);
  assert.equal((await project()).objects[1].curve.nodes.length, 5);
  assert.equal(
    JSON.stringify((await project()).objects[0]),
    JSON.stringify(baselineA),
  );
  await click(edge);
  assert.equal((await project()).objects[1].curve.nodes.length, 4);
  await page.locator("#undo").click();
  await ready();
  assert.equal((await project()).objects[1].curve.nodes.length, 5);
  await page.locator("#redo").click();
  await ready();
  assert.equal((await project()).objects[1].curve.nodes.length, 4);
  await pick(b);
  assert.equal(
    await page.locator("#node-points").getAttribute("aria-pressed"),
    "false",
  );
  // Ordinary modified double-click inserts once; it must not toggle the edge.
  await page.keyboard.down("Control");
  const q = await world(edge);
  await page.mouse.dblclick(q.x, q.y);
  await page.keyboard.up("Control");
  await ready();
  assert.equal((await project()).objects[1].curve.nodes.length, 5);
  await page.locator("#undo").click();
  await ready();
  await pick(b);
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseTool(page, "node");
  await page.locator("#node-points").tap();
  await click(edge, true);
  assert.equal((await project()).objects[1].curve.nodes.length, 5);
  await click(edge, true);
  assert.equal((await project()).objects[1].curve.nodes.length, 4);
  await page.locator("#node-points").tap();
  assert.equal(
    await page.locator("#node-points").getAttribute("aria-pressed"),
    "false",
  );
  await page.locator("#path-repair > summary").click();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await ready();
    assert(
      await page
        .locator("#vector-controls")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    for (const id of [
      "node-corner",
      "node-smooth",
      "node-break",
      "node-points",
      "split-node",
      "close-vector",
      "reverse-vector",
      "join-gap",
      "join-vectors",
    ]) {
      const r = await page.locator("#" + id).boundingBox();
      assert(r && r.width > 20 && r.x >= 0 && r.x + r.width <= width + 1);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await ready();
  await page.screenshot({ path: "test-results/node-controls-mobile.png" });
  await page.setViewportSize({ width: 1500, height: 1100 });
  await ready();
  // Groups remain ordinary selection; only a directly edited child gets controls.
  await pick(a);
  await pick(b, ["Control"]);
  await page.keyboard.press("Control+g");
  await ready();
  await controls("");
  assert.equal(await purple(ah), 0);
  assert.equal(await purple(bh), 0);
  await chooseTool(page, "select");
  const center = await world({ x: -20, y: 0 });
  await page.mouse.dblclick(center.x, center.y);
  await ready();
  assert(await page.locator("#exit-isolation").isVisible());
  await chooseTool(page, "node");
  await controls("");
  const child = await world({ x: -20, y: 0 });
  await page.keyboard.down("Alt");
  await page.mouse.click(child.x, child.y);
  await page.keyboard.up("Alt");
  await ready();
  await controls(a.id);
  assert.equal(await purple(ah), 0);
  await click(a.curve.nodes[0]);
  assert((await purple(ah)) > 5);
  assert.equal(await purple(bh), 0);
  await page.locator("#exit-isolation").click();
  await ready();
  await chooseTool(page, "select");
  await controls("");
  await page.locator("#preview-tab").click();
  await controls("");
  assert.equal(await purple(ah), 0);
  assert.equal(await purple(bh), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Node UI: real handle pixels/active hit scope, selection transitions, four icons and readable repair groups, point hover/add/remove/history, Ctrl-double-click, touch and narrow layouts passed.",
  );
} finally {
  await browser.close();
}
