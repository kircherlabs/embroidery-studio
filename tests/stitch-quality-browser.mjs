import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  qualityFixtures,
  manualRing,
  autoLetter,
  rect,
  project as fixtureProject,
} from "./helpers/quality-fixtures.mjs";
import { reveal, chooseTool } from "./helpers/ui.mjs";
import { object } from "../src/model.js";
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
      viewport: { width: 1500, height: 1050 },
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  await ready();
  const source = qualityFixtures().narrowNeck;
  delete source.planning.qualitySafeguards;
  const open = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "quality.embstudio",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      ({ name, id }) =>
        window.studio.getProject().name === name &&
        window.studio.getPlan()?.events.some((e) => e.objectId === id),
      { name: p.name, id: p.objects[0].id },
    );
  };
  await open(source);
  const plan = () => page.evaluate(() => window.studio.getPlan());
  const project = () => page.evaluate(() => window.studio.getProject());
  const legacy = (await plan()).events;
  const legacyIssues = (await plan()).issues;
  const riskIndex = legacyIssues.findIndex((i) => i.code === "fill-return");
  assert(riskIndex >= 0);
  const inspect = page.locator(`[data-issue="${riskIndex}"]`);
  await reveal(inspect);
  assert.equal(await inspect.textContent(), "Inspect stitch");
  await inspect.click();
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  assert.equal(await page.evaluate(() => window.studio.getMode()), "preview");
  assert.equal(
    Number(await page.locator("#timeline").inputValue()),
    legacyIssues[riskIndex].eventIndex + 1,
  );
  assert.match(await page.locator("#command-readout").textContent(), /TRAVEL/);
  const pixels = await page.evaluate((index) => {
    const c = document.getElementById("stage"),
      v = window.studio.getView(),
      e = window.studio.getPlan().events[index],
      d = c.width / c.getBoundingClientRect().width;
    const data = c
      .getContext("2d")
      .getImageData(
        Math.round((v.center.x + e.x * v.scale - 7) * d),
        Math.round((v.center.y + e.y * v.scale - 7) * d),
        Math.round(14 * d),
        Math.round(14 * d),
      ).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (
        data[i] < 75 &&
        data[i + 1] > data[i] &&
        data[i + 1] < 100 &&
        data[i + 2] < 80
      )
        count++;
    return count;
  }, legacyIssues[riskIndex].eventIndex);
  assert(pixels > 5, "located needle marker must actually render on screen");
  await page.screenshot({
    path: "test-results/quality-diagnostic-location.png",
  });
  await page.locator("#design-tab").click();
  await reveal(page.locator("#quality-safeguards"));
  assert(!(await page.locator("#quality-safeguards").isChecked()));
  await page.locator("#quality-safeguards").check();
  await page.waitForFunction(() => window.studio.getPlan()?.stats.jumps > 1);
  assert((await plan()).stats.jumps > 1);
  assert(!(await plan()).issues.some((i) => i.code === "fill-return"));
  assert.equal(
    JSON.stringify((await project()).objects),
    JSON.stringify(source.objects),
  );
  const revised = (await plan()).events;
  await page.locator("#undo").click();
  await page.waitForFunction(() => window.studio.getPlan()?.stats.jumps === 1);
  assert.deepEqual((await plan()).events, legacy);
  await page.locator("#redo").click();
  await page.waitForFunction(() => window.studio.getPlan()?.stats.jumps > 1);
  assert.deepEqual((await plan()).events, revised);
  const download = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const saved = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  assert(saved.planning.qualitySafeguards);
  saved.name = "Reopened quality reference";
  await open(saved);
  assert.deepEqual((await plan()).events, revised);
  await page.locator("#preview-tab").click();
  await page.screenshot({ path: "test-results/quality-routing-preview.png" });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await reveal(page.locator("#quality-safeguards"));
    if (!(await page.locator("#quality-safeguards").isVisible()))
      await page.locator("#toggle-layers").click();
    const box = await page.locator("#quality-safeguards").boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= width);
  }
  await page.setViewportSize({ width: 1500, height: 1050 });
  for (const [name, art] of [
    ["Manual satin quality", manualRing(2, 1.6)],
    ["Automatic satin quality", autoLetter()],
  ]) {
    const fixture = fixtureProject([art]);
    fixture.name = name;
    await open(fixture);
    const original = await plan(),
      sourceObjects = JSON.stringify((await project()).objects);
    await reveal(page.locator("#quality-safeguards"));
    await page.locator("#quality-safeguards").check();
    if (name.startsWith("Manual"))
      await page.waitForFunction(
        () => window.studio.getPlan()?.stats.jumps === 1,
      );
    else
      await page.waitForFunction(
        () => window.studio.getPlan()?.stats.travelStitches === 0,
      );
    const improved = await plan();
    const needles = (p) =>
      p.events
        .filter(
          (e) =>
            ["satin-rails", "satin-stroke"].includes(e.phase) &&
            e.cmd === "stitch",
        )
        .map((e) => [e.x, e.y]);
    assert.deepEqual(needles(improved), needles(original));
    assert.equal(JSON.stringify((await project()).objects), sourceObjects);
    if (name.startsWith("Manual"))
      assert(improved.stats.jumps < original.stats.jumps);
    else assert(improved.stats.travelStitches < original.stats.travelStitches);
  }
  const focusSource = qualityFixtures().narrowNeck;
  focusSource.name = "Focused quality inspection";
  focusSource.objects.push(
    object("Quiet fill", [rect(-40, -5, 10, 10)], {
      id: "quiet",
      underlay: false,
      compensation: 0,
    }),
  );
  await open(focusSource);
  await page.locator("#design-tab").click();
  await chooseTool(page, "select");
  await page.locator("#stage").focus();
  await page.keyboard.press("Home");
  const quiet = await page.evaluate(() => {
    const r = document.getElementById("stage").getBoundingClientRect(),
      v = window.studio.getView();
    return { x: r.x + v.center.x - 35 * v.scale, y: r.y + v.center.y };
  });
  await page.mouse.dblclick(quiet.x, quiet.y);
  await page.waitForFunction(
    () => window.studio.getSelection().isolation === "quiet",
  );
  const outsideIndex = (await plan()).issues.findIndex(
    (i) => i.code === "fill-return" && i.objectId === "neck",
  );
  assert(outsideIndex >= 0);
  const outside = page.locator(`[data-issue="${outsideIndex}"]`);
  await reveal(outside);
  await outside.click();
  assert.equal(
    await page.evaluate(() => window.studio.getSelection().isolation),
    null,
  );
  assert.equal(await page.evaluate(() => window.studio.getMode()), "preview");
  assert.equal(
    JSON.stringify((await project()).objects),
    JSON.stringify(focusSource.objects),
  );
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 0 &&
      window.studio.getPlan()?.stats.stitches === 0,
  );
  assert((await project()).planning.qualitySafeguards);
  await page.waitForFunction(() => {
    const saved = JSON.parse(
      localStorage.getItem("embroidery-studio-v1") || "null",
    );
    return saved?.planning?.qualitySafeguards && saved.objects.length === 0;
  });
  await page.reload();
  await ready();
  assert((await project()).planning.qualitySafeguards);
  await page
    .locator("#file-input")
    .setInputFiles(
      fileURLToPath(new URL("./fixtures/picsvg-outline.svg", import.meta.url)),
    );
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 11 &&
      window.studio.getPlan()?.stats.regions === 11,
  );
  const coverage = await page.evaluate(async () => {
    const { generate, fillRows } = await import("./src/engine.js"),
      { preparePlan } = await import("./src/planning.js");
    const p = window.studio.getProject(),
      source = JSON.stringify(p),
      plan = window.studio.getPlan();
    const point = (e) => `${Math.round(e.x * 10)},${Math.round(e.y * 10)}`,
      sewn = new Map();
    for (const e of plan.events)
      if (e.cmd === "stitch") {
        if (!sewn.has(e.objectId)) sewn.set(e.objectId, new Set());
        sewn.get(e.objectId).add(point(e));
      }
    let required = 0,
      missing = 0;
    for (const o of preparePlan(p).units)
      for (const row of fillRows(
        o.rings,
        o.spacing,
        o.angle,
        o.length,
        o.compensation,
        o.fillRule,
      )) {
        if (new Set(row.map(point)).size < 2) continue;
        for (const q of row) {
          required++;
          if (!sewn.get(o.id)?.has(point(q))) missing++;
        }
      }
    const start = performance.now(),
      legacy = generate({
        ...p,
        planning: { ...p.planning, qualitySafeguards: false },
      }),
      legacyMs = performance.now() - start;
    const next = performance.now();
    generate(p);
    const qualityMs = performance.now() - next;
    return {
      required,
      missing,
      legacyJumps: legacy.stats.jumps,
      qualityJumps: plan.stats.jumps,
      legacyTravel: legacy.stats.travelStitches,
      qualityTravel: plan.stats.travelStitches,
      legacyMs,
      qualityMs,
      unchanged: source === JSON.stringify(p),
    };
  });
  assert(coverage.required > 1000);
  assert.equal(coverage.missing, 0);
  assert(coverage.unchanged);
  console.log("Complex imported SVG quality coverage/performance:", coverage);
  assert.deepEqual(errors, []);
  console.log(
    "Stitch quality: legacy opt-in, actual revised routing, unchanged artwork, history, portable reload, new-design default and responsive controls passed.",
  );
} finally {
  await browser.close();
}
