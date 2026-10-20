import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  contrastProject,
  cubanContrastProject,
  rectangle,
} from "./helpers/contrast-fixture.mjs";
import { chooseTool, reveal } from "./helpers/ui.mjs";
import { object } from "../src/model.js";
import { identity, curveRings } from "../src/smart-geometry.js";
import { railArtwork } from "../src/rail-ui.js";
import { letteringCurve } from "../src/text-path.js";
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
      viewport: { width: 1600, height: 1050 },
      hasTouch: true,
    }),
    errors = [],
    report = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (...args) {
      if (args[0]?.project)
        window.__generations = (window.__generations || 0) + 1;
      return original.apply(this, args);
    };
  });
  const base = process.env.STUDIO_URL || "http://127.0.0.1:5173/";
  await page.goto(base);
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject());
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  await ready();
  const open = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "contrast.embstudio",
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
    await chooseTool(page, "select");
    await page.locator("#snap-objects").uncheck();
    await page.locator("#snap-grid").uncheck();
    await page.locator("#zoom-fit").click();
    await settle();
  };
  const pick = async (id, modifiers = []) => {
    await page.locator(`[data-select="${id}"]`).click({ modifiers });
    await settle();
  };
  const world = async (p) =>
    page.evaluate((p) => {
      const r = document.getElementById("stage").getBoundingClientRect(),
        v = window.studio.getView();
      return {
        x: r.x + v.center.x + p.x * v.scale,
        y: r.y + v.center.y + p.y * v.scale,
      };
    }, p);
  const points = async (id) =>
    (await project()).objects.find((o) => o.id === id).rings;
  const probes = (rings) =>
    rings
      .flatMap((r) =>
        r
          .slice(1)
          .map((b, i) => ({ x: (r[i].x + b.x) / 2, y: (r[i].y + b.y) / 2 })),
      )
      .filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 24)) === 0);
  const visibility = async (
    rings,
    label,
    { min = 0.88, radius = 3.3, target = page } = {},
  ) => {
    const result = await target.evaluate(
      ({ ps, radius }) => {
        const canvas = document.getElementById("stage"),
          v = window.studio.getView(),
          dpr = canvas.width / v.width,
          pixels = canvas
            .getContext("2d")
            .getImageData(0, 0, canvas.width, canvas.height).data;
        const luminance = (r, g, b) => {
          const c = [r, g, b].map((x) => {
            x /= 255;
            return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        };
        const values = [];
        for (const p of ps) {
          const x = (v.center.x + p.x * v.scale) * dpr,
            y = (v.center.y + p.y * v.scale) * dpr,
            r = radius * dpr;
          if (x < r || y < r || x >= canvas.width - r || y >= canvas.height - r)
            continue;
          let lo = 1,
            hi = 0;
          for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++)
            for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
              if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 > r * r) continue;
              const i = (yy * canvas.width + xx) * 4,
                L = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
              lo = Math.min(lo, L);
              hi = Math.max(hi, L);
            }
          values.push({ lo, hi });
        }
        return {
          count: values.length,
          visible: values.filter((p) => p.lo < 0.22 && p.hi > 0.94).length,
          values,
          scale: v.scale,
          dpr,
        };
      },
      { ps: probes(rings), radius },
    );
    assert(result.count > 0, label + ": probes in canvas");
    const ratio = result.visible / result.count;
    report.push({
      label,
      ratio,
      count: result.count,
      scale: result.scale,
      dpr: result.dpr,
    });
    assert(
      ratio >= min,
      label +
        ": actual light/dark silhouette missing " +
        JSON.stringify(result),
    );
    return result;
  };
  const checkLine = async (label) => visibility(await points("line"), label);
  const drag = async (a, b, { during, cancel = false } = {}) => {
    const x = await world(a),
      y = await world(b);
    await page.mouse.move(x.x, x.y);
    await page.mouse.down();
    await page.mouse.move(y.x, y.y, { steps: 12 });
    if (during) await during();
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
    await ready();
    await settle();
  };
  // Pixel contrast on equal-color and opposite-color artwork, with actual stitches underneath.
  for (const [bg, color, label] of [
    ["#e6ab43", "#303e64", "blue over yellow"],
    ["#e6ab43", "#e6ab43", "yellow over yellow"],
    ["#000000", "#000000", "black over black"],
    ["#ffffff", "#ffffff", "white over white"],
    ["#175db3", "#175db3", "blue over blue"],
    ["#b53737", "#b53737", "red over red"],
  ]) {
    await open(contrastProject([bg], color));
    const before = await project(),
      events = await page.evaluate(() => window.studio.getPlan().events);
    await pick("line");
    await checkLine(label + " selected");
    const p = (await points("line"))[0][20],
      generations = await page.evaluate(() => window.__generations);
    await drag(
      p,
      { x: p.x + 3, y: p.y + 2 },
      {
        during: async () => {
          await checkLine(label + " moving");
          assert.equal(
            await page.evaluate(() => window.__generations),
            generations,
            "no per-move stitch regeneration",
          );
          assert.deepEqual(
            await page.evaluate(() => window.studio.getPlan().events),
            events,
          );
        },
        cancel: true,
      },
    );
    assert.deepEqual(await project(), before);
  }
  await open(
    contrastProject(["#000000", "#ffffff", "#e6ab43", "#175db3", "#b53737"]),
  );
  await pick("line");
  await checkLine("crosses five different backgrounds");
  await open(cubanContrastProject());
  await pick("line");
  const original = await project();
  await checkLine("Cuban flag selection");
  await page.screenshot({
    path: "test-results/geometry-contrast-cuba-selected.png",
  });
  // Completion and cancellation both track live transformed geometry, not cached plan positions.
  let p = (await points("line"))[0][25];
  let canceledRings;
  await drag(
    p,
    { x: p.x, y: p.y + 14 },
    {
      cancel: true,
      during: async () => {
        canceledRings = await points("line");
        await checkLine("canceled drag while active");
      },
    },
  );
  assert.deepEqual(await project(), original);
  assert.equal(
    (await page.evaluate(() => window.studio.getSelection().objects)).length,
    0,
  );
  const removed = await visibility(canceledRings, "canceled preview absent", {
    min: 0,
  });
  assert(
    removed.visible / removed.count < 0.2,
    "no stale outline at canceled transform position",
  );
  await pick("line");
  await drag(
    p,
    { x: p.x + 4, y: p.y + 4 },
    {
      during: async () => {
        await checkLine("Cuban flag drag");
        await page.screenshot({
          path: "test-results/geometry-contrast-cuba-moving.png",
        });
      },
    },
  );
  assert.notDeepEqual(await project(), original);
  await checkLine("completed drag");
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(await project(), original);
  await page.locator("#redo").click();
  await ready();
  await pick("line");
  await checkLine("redo drag");
  await page.locator("#undo").click();
  await ready();
  await pick("line");
  const getBounds = async () => {
    const r = (await points("line")).flat();
    return {
      minX: Math.min(...r.map((p) => p.x)),
      minY: Math.min(...r.map((p) => p.y)),
      maxX: Math.max(...r.map((p) => p.x)),
      maxY: Math.max(...r.map((p) => p.y)),
    };
  };
  let b = await getBounds(),
    v = await page.evaluate(() => window.studio.getView());
  const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
    rot = { x: center.x, y: b.minY - 22 / v.scale };
  await drag(
    rot,
    { x: center.x + 22 / v.scale, y: b.minY },
    {
      during: async () => {
        await checkLine("rotation in progress");
        await page.screenshot({
          path: "test-results/geometry-contrast-cuba-rotating.png",
        });
      },
    },
  );
  await checkLine("rotation completed");
  await page.locator("#undo").click();
  await ready();
  await pick("line");
  b = await getBounds();
  await drag(
    { x: b.maxX, y: b.maxY },
    { x: b.maxX + 5, y: b.maxY + 4 },
    { during: async () => checkLine("resize in progress") },
  );
  await checkLine("resize completed");
  await page.locator("#undo").click();
  await ready();
  await pick("line");
  await page.locator("#arrange-selection").click();
  await page.locator('[data-arrange="flip-horizontal"]').click();
  await ready();
  await checkLine("mirrored source");
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(await project(), original);
  // Node anchors and Bezier sculpting use the same perimeter over the old thread data.
  await pick("line");
  await chooseTool(page, "node");
  let o = (await project()).objects.find((o) => o.id === "line"),
    node = o.curve.nodes[1];
  await visibility([[node, node.out]], "Bezier tangent guide", { min: 0.5 });
  await drag(
    node,
    { x: node.x + 3, y: node.y + 2 },
    { during: async () => checkLine("Bezier node edit") },
  );
  await page.locator("#undo").click();
  await ready();
  await pick("line");
  o = (await project()).objects.find((o) => o.id === "line");
  p = o.rings[0][Math.floor(o.rings[0].length / 3)];
  await drag(
    p,
    { x: p.x, y: p.y - 2 },
    { during: async () => checkLine("curve sculpt") },
  );
  await page.locator("#undo").click();
  await ready();
  await pick("line");
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    for (const clicks of [0, 2, -4]) {
      for (let i = 0; i < Math.abs(clicks); i++)
        await page.locator(clicks < 0 ? "#zoom-out" : "#zoom-in").click();
      await checkLine(theme + " theme zoom " + clicks);
    }
    await page.locator("#zoom-fit").click();
  }
  // Filled contours include actual counters; group/multi-selection adds no stitch outlines.
  const hole = object(
    "Region with hole",
    [rectangle(-12, 8, 12, 25), rectangle(-4, 12, 4, 20)],
    { id: "hole", fillRule: "evenodd", color: "#e6ab43", underlay: false },
  );
  const grouped = contrastProject();
  grouped.objects.push(hole);
  grouped.groups = [{ id: "pair", name: "Editable pair", kind: "group" }];
  grouped.objects
    .filter((o) => ["line", "hole"].includes(o.id))
    .forEach((o) => (o.parentId = "pair"));
  await open(grouped);
  await pick("hole");
  // Edge midpoints coincide with resize handles: include the handle border,
  // rather than testing only its deliberately white center.
  await visibility(await points("hole"), "hole and outer perimeter", {
    radius: 5.5,
  });
  await pick("pair");
  await checkLine("group child geometry");
  await visibility(await points("hole"), "group hole perimeter", {
    radius: 5.5,
  });
  const groupBefore = await project(),
    groupPoint = (await points("line"))[0][20];
  await drag(
    groupPoint,
    { x: groupPoint.x + 2, y: groupPoint.y - 2 },
    {
      during: async () => {
        await checkLine("group transform path");
        await visibility(await points("hole"), "group transform hole", {
          radius: 5.5,
        });
      },
    },
  );
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(await project(), groupBefore);
  await pick("line");
  await pick("hole", ["Control"]);
  await checkLine("multi-selection geometry");
  await pick("hole");
  const beforeEffect = (await project()).objects.find((o) => o.id === "hole");
  await reveal(page.locator("#effect-offset"));
  await page.locator("#effect-offset").fill("0.3");
  await page.locator("#effects-apply").click();
  await ready();
  assert.notDeepEqual(
    (await project()).objects.find((o) => o.id === "hole").rings,
    beforeEffect.rings,
  );
  await visibility(await points("hole"), "evaluated offset and counters", {
    radius: 5.5,
  });
  await page.locator("#undo").click();
  await ready();
  // Manual paired rails, seam markers and direction-guide handles stay distinct.
  const rail = railArtwork(
    {
      frame: identity(),
      closed: false,
      nodes: [
        { x: -25, y: -3, out: { x: -10, y: -9 } },
        { x: 25, y: 5, in: { x: 10, y: -5 } },
      ],
    },
    {
      frame: identity(),
      closed: false,
      nodes: [
        { x: -25, y: 2, out: { x: -10, y: -4 } },
        { x: 25, y: 10, in: { x: 10, y: 0 } },
      ],
    },
    { id: "rails", color: "#e6ab43" },
  );
  const railsProject = contrastProject();
  railsProject.objects = railsProject.objects.filter((o) => o.id !== "line");
  railsProject.objects.push(rail);
  await open(railsProject);
  await pick("rails");
  await chooseTool(page, "node");
  await visibility(
    (await project()).objects.find((o) => o.id === "rails").rings,
    "manual rail boundaries",
  );
  await drag(
    { x: -25, y: -3 },
    { x: -24, y: -5 },
    {
      during: async () =>
        visibility(
          (await project()).objects.find((o) => o.id === "rails").rings,
          "rail anchor drag",
        ),
    },
  );
  await page.locator("#undo").click();
  await ready();
  await pick("rails");
  await reveal(page.locator("#satin-guide-edit"));
  await page.locator("#satin-guide-edit").click();
  await drag({ x: -3, y: -9 }, { x: 3, y: 8 });
  await page.keyboard.press("Escape");
  await ready();
  const g = (await project()).objects.find((o) => o.id === "rails")
    .operations[0].satinGuides[0];
  assert(g);
  await visibility([[g.a, g.b]], "direction guide", { min: 0.5 });
  await page.screenshot({ path: "test-results/geometry-contrast-rails.png" });
  // Editable lettering and path baselines retain their actual transformed glyph contours.
  await open(contrastProject());
  await pick("line");
  await page.locator("#text-tool").click();
  await page.locator("#text-value").fill("MC");
  await page.locator("#text-height").fill("12");
  await page.locator("#text-use-path").check();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.some((o) => o.textSource) &&
      window.studio.getPlan(),
  );
  const text = (await project()).objects.find((o) => o.textSource);
  await pick(text.id);
  await chooseTool(page, "node");
  await visibility(text.rings, "editable glyph contours");
  await visibility(curveRings(letteringCurve(text)), "lettering baseline", {
    min: 0.6,
  });
  // Draft paths are readable over gold, while eraser diameter stays physical.
  for (const tool of [
    "pen",
    "pencil",
    "polygon",
    "run",
    "satin",
    "manual",
    "rails",
    "knife",
    "eraser",
  ]) {
    await open(contrastProject());
    await pick("line");
    await chooseTool(page, tool);
    if (["pen", "polygon", "run", "satin", "manual", "rails"].includes(tool)) {
      await page.mouse.click(
        (await world({ x: -15, y: 15 })).x,
        (await world({ x: -15, y: 15 })).y,
      );
      const q = await world({ x: 15, y: 15 });
      await page.mouse.click(q.x, q.y);
    } else {
      const a = await world({ x: -15, y: 15 }),
        b = await world({ x: 15, y: 15 });
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 15 });
    }
    await visibility(
      [
        [
          { x: -15, y: 15 },
          { x: 15, y: 15 },
        ],
      ],
      tool + " draft",
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await ready();
  }
  // Real high-DPI raster checks in a fresh touch context, with mobile layout.
  const hi = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  await hi.goto(base);
  await hi.waitForFunction(() => window.studio?.getPlan());
  await hi.locator("#file-input").setInputFiles({
    name: "mobile.embstudio",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(contrastProject())),
  });
  await hi
    .getByRole("heading", { name: "Open this project?", exact: true })
    .waitFor();
  await hi.locator("#dialog-submit").click();
  await hi.waitForFunction(
    () =>
      window.studio.getProject().objects.some((o) => o.id === "line") &&
      window.studio.getPlan(),
  );
  await hi.locator("#toggle-layers").click();
  await hi.locator('[data-select="line"]').click();
  for (const id of ["toggle-layers", "toggle-inspector"])
    if ((await hi.locator("#" + id).getAttribute("aria-expanded")) === "true")
      await hi.locator("#" + id).click();
  await hi.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const hiRings = await hi.evaluate(
    () => window.studio.getProject().objects.find((o) => o.id === "line").rings,
  );
  const hiContrast = await visibility(hiRings, "mobile high-DPI source path", {
    target: hi,
  });
  assert.equal(hiContrast.dpr, 2);
  await hi.screenshot({
    path: "test-results/geometry-contrast-mobile-hidpi.png",
  });
  await hi.close();
  // Export only real machine coordinates. Selection/guide overlays cannot enter PES.
  await open(cubanContrastProject());
  const baseline = await project(),
    before = await page.evaluate(() =>
      window.studio.getPlan().events.filter((e) => e.cmd === "stitch"),
    );
  const exportFile = async (path) => {
    await page.locator("#export").click();
    const download = page.waitForEvent("download", { timeout: 180000 });
    await page.locator("#dialog-submit").click();
    await (await download).saveAs(path);
    return readFile(path);
  };
  const normalBytes = await exportFile(
    "test-results/geometry-contrast-unselected.pes",
  );
  await open(baseline); // restore the generated plan, rather than re-exporting decoded commands.
  await pick("line");
  await chooseTool(page, "node");
  assert.deepEqual(await project(), baseline);
  const selectedBytes = await exportFile("test-results/geometry-contrast.pes");
  assert(
    normalBytes.equals(selectedBytes),
    "editing overlays cannot change a single PES byte",
  );
  const dec = decodePes(selectedBytes),
    sewn = dec.pec.events.filter((e) => e.type === "stitch");
  assert.deepEqual(declaredRect(dec.pec), streamExtents(dec.pec));
  assert.equal(sewn.length, before.length);
  before.forEach((q, i) => {
    assert.equal(sewn[i].x, Math.round((q.x - before[0].x) * 10) || 0);
    assert.equal(sewn[i].y, Math.round((q.y - before[0].y) * 10) || 0);
  });
  assert.deepEqual(await project(), baseline);
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/geometry-contrast-pixel-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Active geometry: actual pixel contrast across equal/mixed colors, Cuban flag movement/rotation/resize, node/sculpt/rails/guides, glyphs/baselines, holes/groups, drafts, themes/zoom/high-DPI, cancel/history, deferred generation and independent PES coordinates passed.",
  );
} finally {
  await browser.close();
}
