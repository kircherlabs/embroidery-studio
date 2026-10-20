import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { object } from "../src/model.js";
import { transformSelection } from "../src/hierarchy.js";
import { selectionBox, boxHandles } from "../src/transform-box.js";
import {
  identity,
  curveRings,
  mapPoint,
  railRings,
} from "../src/smart-geometry.js";
import { railArtwork } from "../src/rail-ui.js";
import { reveal, chooseTool } from "./helpers/ui.mjs";
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
const near = (a, b, t = 0.06) => assert(Math.abs(a - b) < t, `${a} != ${b}`),
  point = (a, b, t) => {
    near(a.x, b.x, t);
    near(a.y, b.y, t);
  },
  rect = (x, y, w, h) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ],
  pof = (objects) => ({
    version: 1,
    name: "Transform regression",
    machine: "se700",
    groups: [],
    objects,
    planning: { smallDetail: 0, optimizeColors: true },
  });
await mkdir("test-results", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1060 },
      hasTouch: true,
    }),
    errors = [],
    pixels = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.addInitScript(() => {
    const native = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (...args) {
      if (args[0]?.project)
        window.__generations = (window.__generations || 0) + 1;
      return native.apply(this, args);
    };
  });
  const base = process.env.STUDIO_URL || "http://127.0.0.1:5173/";
  await page.goto(base);
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    plan = () => page.evaluate(() => window.studio.getPlan()),
    settle = () =>
      page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
  let opening = 0;
  const open = async (source) => {
    const p = { ...source, name: source.name + " " + ++opening };
    await page
      .locator("#file-input")
      .setInputFiles({
        name: "transform.embstudio",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(p)),
      });
    await page.locator("#dialog-submit").click();
    await ready();
    await page.waitForFunction(
      (name) => window.studio.getProject().name === name,
      p.name,
    );
    await page.locator("#design-tab").click();
    await chooseTool(page, "select");
    await settle();
  };
  const pick = (id, modifiers = []) =>
    page.locator(`[data-select="${id}"]`).click({ modifiers });
  const field = async (id, v) => {
    const el = page.locator("#" + id);
    await reveal(el);
    await el.fill(String(v));
    await el.press("Tab");
    await ready();
    await settle();
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
      const v = window.studio.getView(),
        r = document.getElementById("stage").getBoundingClientRect();
      return {
        x: r.x + v.center.x + p.x * v.scale,
        y: r.y + v.center.y + p.y * v.scale,
      };
    }, p);
  };
  const selected = async () => {
    const p = await project(),
      ids = await page.evaluate(() => window.studio.getSelection().objects);
    return p.objects.filter((o) => ids.includes(o.id));
  };
  const handles = async (mode = "object") => {
    const b = selectionBox(await selected(), mode),
      v = await page.evaluate(() => window.studio.getView());
    return { b, hs: boxHandles(b, v.scale) };
  };
  const drag = async (
    a,
    b,
    { cancel = false, center = false, touch = false, during } = {},
  ) => {
    a = await world(a);
    b = await world(b);
    if (center) await page.keyboard.down("Alt");
    if (touch) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [a],
      });
      for (let i = 1; i <= 12; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: a.x + ((b.x - a.x) * i) / 12,
              y: a.y + ((b.y - a.y) * i) / 12,
            },
          ],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await cdp.detach();
    } else {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 16 });
      if (during) await during();
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
    }
    if (center) await page.keyboard.up("Alt");
    await ready();
    await settle();
  };
  const compare = async (mode, label) => {
    const { hs } = await handles(mode);
    const result = await page.evaluate((hs) => {
      const c = document.getElementById("stage"),
        v = window.studio.getView(),
        d = c.width / v.width,
        data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      return hs.slice(0, 8).map((h) => {
        let light = false,
          dark = false;
        const x = (v.center.x + h.x * v.scale) * d,
          y = (v.center.y + h.y * v.scale) * d;
        for (let yy = Math.round(y - 6 * d); yy <= y + 6 * d; yy++)
          for (let xx = Math.round(x - 6 * d); xx <= x + 6 * d; xx++) {
            if (xx < 0 || yy < 0 || xx >= c.width || yy >= c.height) continue;
            const i = (yy * c.width + xx) * 4;
            light ||= Math.min(data[i], data[i + 1], data[i + 2]) > 240;
            dark ||= Math.max(data[i], data[i + 1], data[i + 2]) < 125;
          }
        return { handle: h.id, light, dark };
      });
    }, hs);
    assert(
      result.every((r) => r.light && r.dark),
      label + ": actual rendered handle contrast " + JSON.stringify(result),
    );
    pixels.push({ label, result });
  };
  await ready();
  // A compact Cuban flag with a common source orientation: group selection must
  // show the rotated rectangle, rather than an oversized canvas-aligned cage.
  const flag = pof([
    object("Flag field", [rect(-24, -14, 48, 28)], {
      id: "field",
      color: "#e6ab43",
      parentId: "flag",
      underlay: false,
      compensation: 0,
    }),
    object("Upper stripe", [rect(-24, -8, 48, 5)], {
      id: "stripe",
      color: "#f3dfb3",
      parentId: "flag",
      underlay: false,
      compensation: 0,
    }),
    object("Lower stripe", [rect(-24, 3, 48, 5)], {
      id: "stripe2",
      color: "#f3dfb3",
      parentId: "flag",
      underlay: false,
      compensation: 0,
    }),
    object(
      "Triangle",
      [
        [
          { x: -24, y: -14 },
          { x: -3, y: 0 },
          { x: -24, y: 14 },
        ],
      ],
      {
        id: "triangle",
        color: "#b44759",
        parentId: "flag",
        underlay: false,
        compensation: 0,
      },
    ),
    object(
      "Blue satin line",
      [
        [
          { x: -16, y: 0 },
          { x: 20, y: 0 },
        ],
      ],
      {
        id: "line",
        color: "#263e6b",
        type: "satin",
        closed: false,
        width: 2,
        parentId: "flag",
        underlay: false,
        compensation: 0,
      },
    ),
  ]);
  flag.groups = [{ id: "flag", kind: "group", name: "Cuban flag" }];
  await open(flag);
  await pick("flag");
  await field("rotate", 30);
  let { b, hs } = await handles();
  near(b.angle, 30);
  near(b.width, 48);
  near(b.height, 28);
  await compare("object", "Cuban flag at 30 degrees");
  await page.screenshot({
    path: "test-results/transform-cuban-flag-object.png",
  });
  let before = await project(),
    h = hs.find((h) => h.id === "e"),
    anchor = hs.find((h) => h.id === "w");
  await drag(h, { x: h.x + 6 * b.u.x, y: h.y + 6 * b.u.y });
  let after = await handles();
  near(after.b.width, 54);
  near(after.b.height, 28);
  near(after.b.angle, 30);
  point(
    after.hs.find((h) => h.id === "w"),
    anchor,
  );
  assert((await plan()).stats.fits);
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(await project(), before);
  await page.locator("#redo").click();
  await ready();
  await pick("flag");
  near((await handles()).b.width, 54);
  before = await project();
  after = await handles();
  h = after.hs.find((h) => h.id === "se");
  await drag(h, { x: h.x + 7, y: h.y + 5 }, { cancel: true });
  assert.deepEqual(await project(), before);
  await pick("flag");
  // A view preference changes no source, history or worker generation.
  const generation = await page.evaluate(() => window.__generations),
    oldPlan = await plan();
  await page.locator("#transform-orientation").selectOption("canvas");
  await settle();
  assert.deepEqual(await project(), before);
  assert.deepEqual(await plan(), oldPlan);
  assert.equal(await page.evaluate(() => window.__generations), generation);
  await compare("canvas", "Cuban flag Canvas cage");
  await page.screenshot({
    path: "test-results/transform-cuban-flag-canvas.png",
  });
  await page.locator("#transform-orientation").selectOption("object");
  await field("size-w", 60);
  near((await handles()).b.width, 60);
  near((await handles()).b.height, (28 * 60) / 54);
  // Reset is a real edit with Undo, rather than a second display rotation.
  const rotated = await project();
  await page.locator("#reset-object-rotation").click();
  await ready();
  near((await handles()).b.angle, 0);
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(await project(), rotated);
  await pick("flag");
  // Save/reopen preserves metadata. Object/Canvas preference persists separately.
  const saving = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const saved = JSON.parse(await readFile(await (await saving).path(), "utf8"));
  assert.deepEqual(saved, await project());
  await page.locator("#transform-orientation").selectOption("canvas");
  await page.reload();
  await ready();
  await pick("flag");
  await reveal(page.locator("#transform-orientation"));
  assert.equal(
    await page.locator("#transform-orientation").inputValue(),
    "canvas",
  );
  await open(saved);
  await pick("flag");
  await page.locator("#transform-orientation").selectOption("object");
  near((await handles()).b.angle, 30);
  // True PES instructions and PEC extents, independently decoded after local resize.
  const expected = (await plan()).events.filter((e) => e.cmd === "stitch");
  await page.locator("#export").click();
  const download = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  const pes = await download;
  await pes.saveAs("test-results/transform-flag.pes");
  const decoded = decodePes(await readFile("test-results/transform-flag.pes")),
    sewn = decoded.pec.events.filter((e) => e.type === "stitch");
  assert.deepEqual(declaredRect(decoded.pec), streamExtents(decoded.pec));
  assert.equal(sewn.length, expected.length);
  expected.forEach((q, i) => {
    assert.equal(sewn[i].x, Math.round((q.x - expected[0].x) * 10) || 0);
    assert.equal(sewn[i].y, Math.round((q.y - expected[0].y) * 10) || 0);
  });
  // Browser SVG sampling: nested transforms, reflection, compound counters.
  const svgResult = await page.evaluate(async () => {
    const { importSVG } = await import("./src/importers.js"),
      { selectionBox } = await import("./src/transform-box.js");
    const os = importSVG(
      '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(40 30) rotate(30)"><g transform="scale(-1 1)"><path fill-rule="evenodd" d="M0 0H30V20H0Z M8 5H22V15H8Z"/></g></g></svg>',
    );
    return { objects: os, groups: os.groups, box: selectionBox(os) };
  });
  near(svgResult.box.angle, -150);
  near(svgResult.box.width / svgResult.box.height, 1.5, 0.003);
  assert.equal(svgResult.objects[0].rings.length, 2);
  await open({ ...pof(svgResult.objects), groups: svgResult.groups });
  await pick(svgResult.groups[0].id);
  await compare("object", "nested mirrored SVG with hole");
  // Real handle hit testing at several zooms and touch sizing on a small viewport.
  const simple = object("Rectangle", [rect(-15, -8, 30, 16)], {
    id: "simple",
    closed: true,
    underlay: false,
  });
  for (const angle of [0, 45, 90, 175]) {
    const q = structuredClone(simple);
    transformSelection([q], { angle });
    await open(pof([q]));
    await pick("simple");
    ({ b, hs } = await handles());
    h = hs.find((h) => h.id === "e");
    anchor = hs.find((h) => h.id === "w");
    await drag(h, { x: h.x + b.u.x * 3, y: h.y + b.u.y * 3 });
    after = await handles();
    near(after.b.width, 33);
    near(after.b.angle, angle);
    point(
      after.hs.find((h) => h.id === "w"),
      anchor,
    );
  }
  // Rotation handle uses the center and produces one logical Undo step.
  await open(pof([simple]));
  await pick("simple");
  ({ b, hs } = await handles());
  h = hs.find((h) => h.id === "rotate");
  const radians = Math.PI / 6,
    rx = h.x - b.center.x,
    ry = h.y - b.center.y;
  await drag(h, {
    x: b.center.x + rx * Math.cos(radians) - ry * Math.sin(radians),
    y: b.center.y + rx * Math.sin(radians) + ry * Math.cos(radians),
  });
  near((await handles()).b.angle, 30);
  point((await handles()).b.center, b.center);
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual((await project()).objects[0], simple);
  await pick("simple");
  ({ b, hs } = await handles());
  h = hs.find((h) => h.id === "se");
  await drag(h, { x: h.x + 6, y: h.y + 1 });
  after = await handles();
  near(after.b.width / after.b.height, 30 / 16, 0.001);
  // Touch checks use a steep rotation and independent width/height handles.
  const steep = structuredClone(simple);
  transformSelection([steep], { angle: 175 });
  await open(pof([steep]));
  await pick("simple");
  await page.setViewportSize({ width: 840, height: 950 });
  await settle();
  await page.keyboard.press("+");
  await settle();
  ({ b, hs } = await handles());
  h = hs.find((h) => h.id === "s");
  const oldCenter = b.center;
  await drag(h, { x: h.x + b.v.x * 2, y: h.y + b.v.y * 2 }, { touch: true });
  near((await handles()).b.height, 18);
  near((await handles()).b.angle, 175);
  ({ b, hs } = await handles());
  h = hs.find((h) => h.id === "e");
  await drag(h, { x: h.x + b.u.x * 2, y: h.y + b.u.y * 2 }, { center: true });
  point((await handles()).b.center, b.center);
  near((await handles()).b.width, 34);
  await compare("object", "touch and zoom rotated cage");
  await page.screenshot({ path: "test-results/transform-touch.png" });
  await page.setViewportSize({ width: 1600, height: 1060 });
  await settle();
  // Repeated pointer samples must restore BOTH rail frames before each matrix.
  const curve = (y) => ({
      frame: identity(),
      closed: false,
      nodes: [
        { x: -15, y, out: { x: -5, y: y - 1 } },
        { x: 15, y, in: { x: 5, y: y + 1 } },
      ],
    }),
    rail = railArtwork(curve(-2), curve(2), { id: "rails" });
  rail.operations[0].satinGuides = [{ a: { x: 0, y: -8 }, b: { x: 0, y: 8 } }];
  transformSelection([rail], { angle: 30 });
  await open(pof([rail]));
  await pick("rails");
  ({ b, hs } = await handles());
  h = hs.find((h) => h.id === "e");
  const expectedRail = structuredClone(rail);
  transformSelection([expectedRail], {
    sx: (b.width + 5) / b.width,
    axes: 30,
    pivot: hs.find((h) => h.id === "w"),
  });
  await drag(h, { x: h.x + b.u.x * 5, y: h.y + b.u.y * 5 });
  const actual = (await project()).objects[0];
  actual.satinRails.a.frame.forEach((v, i) =>
    near(v, expectedRail.satinRails.a.frame[i], 0.001),
  );
  actual.satinRails.b.frame.forEach((v, i) =>
    near(v, expectedRail.satinRails.b.frame[i], 0.001),
  );
  point(
    actual.operations[0].satinGuides[0].a,
    expectedRail.operations[0].satinGuides[0].a,
    0.001,
  );
  assert(!(await plan()).issues.some((i) => i.severity === "error"));
  await chooseTool(page, "node");
  await page.locator("#active-rail").selectOption("a");
  const node = mapPoint(
    actual.satinRails.a.nodes[0],
    actual.satinRails.a.frame,
  );
  await drag(node, { x: node.x + 1, y: node.y + 1 });
  assert.notDeepEqual(
    (await project()).objects[0].satinRails.a.nodes,
    actual.satinRails.a.nodes,
  );
  // Hidden descendants stay hidden but share their parent's cage and transform.
  const visible = structuredClone(simple),
    hidden = structuredClone(simple);
  hidden.id = "hidden";
  hidden.visible = false;
  transformSelection([hidden], { dx: 24 });
  for (const q of [visible, hidden]) q.parentId = "with-hidden";
  transformSelection([visible, hidden], { angle: 30 });
  await open({
    ...pof([visible, hidden]),
    groups: [{ id: "with-hidden", name: "Partly hidden", kind: "group" }],
  });
  await chooseTool(page, "select");
  await pick("with-hidden");
  ({ b, hs } = await handles());
  h = hs.find((h) => h.id === "e");
  await compare("object", "group with hidden descendant");
  await drag(h, { x: h.x + b.u.x * 3, y: h.y + b.u.y * 3 });
  near((await handles()).b.width, b.width + 3);
  assert.equal((await project()).objects[1].visible, false);
  assert.notDeepEqual((await project()).objects[1].rings, hidden.rings);
  // Mixed selection uses Canvas without overwriting either member's orientation.
  const a = structuredClone(simple),
    c = structuredClone(simple);
  c.id = "second";
  transformSelection([a], { angle: 30, dx: -18 });
  transformSelection([c], { angle: -20, dx: 18 });
  await open(pof([a, c]));
  await chooseTool(page, "select");
  await pick(a.id);
  await pick(c.id, ["Control"]);
  assert(!(await handles()).b.local);
  assert.match(
    await page.locator("#transform-settings").innerText(),
    /mixed object orientations/,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/transform-pixel-report.json",
    JSON.stringify(pixels, null, 2),
  );
  console.log(
    "Object transforms: actual rotated cage pixels, Cuban flag local/Canvas resizing, exact anchors, numeric/reset, cancel/history, save/reload/preference, nested mirrored SVG counters, touch/zoom, rail frames/guides/node edits, mixed orientation and independent PES coordinates passed.",
  );
} finally {
  await browser.close();
}
