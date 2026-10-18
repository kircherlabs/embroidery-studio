import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { smartShape } from "../src/creative.js";
import { makeOperation } from "../src/operations.js";
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
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  const project = () => page.evaluate(() => window.studio.getProject());
  const plan = () => page.evaluate(() => window.studio.getPlan());
  const openDetails = async (locator) => {
    await locator.evaluate((el) => {
      let at = el.parentElement;
      while (at) {
        if (at.tagName === "DETAILS") at.open = true;
        at = at.parentElement;
      }
    });
  };
  const pick = async (id) => {
    await page.locator(`[data-select="${id}"]`).click();
  };
  const field = async (id, value) => {
    const el = page.locator("#" + id);
    await openDetails(el);
    await el.fill(String(value));
    await el.press("Tab");
    await ready();
  };
  const openProject = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "case.embstudio",
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
  await ready();
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await ready();
  await page
    .locator("#file-input")
    .setInputFiles(
      new URL(
        "./fixtures/picsvg-outline.svg",
        import.meta.url,
      ).pathname.replace(/^\/(?=[A-Za-z]:)/, ""),
    );
  await ready();
  let original = await project();
  assert.equal(original.objects.length, 11);
  await page.locator("#applique-recipe").click();
  assert.equal(
    await page.locator("#construction-mode").inputValue(),
    "surround",
  );
  assert(
    (await page.locator("#dialog-content").innerText()).includes(
      "22 machine stops",
    ),
  );
  await page.locator("#dialog-submit").click();
  await page.locator("#patch-kind").waitFor();
  // Every boundary option updates the actual live geometry preview and hoop guidance.
  for (const kind of ["rectangle", "rounded", "circle", "oval"]) {
    await page.locator("#patch-kind").selectOption(kind);
    assert((await page.locator("#patch-preview path").count()) > 11);
    assert(
      (await page.locator("#patch-status").innerText()).includes(
        "2 operator stops",
      ),
    );
  }
  await page.locator("#patch-kind").selectOption("rounded");
  await page.locator("#patch-margin").fill("4");
  await page.locator("#patch-border").fill("2");
  await page.screenshot({ path: "test-results/properties-patch-wizard.png" });
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio
        .getProject()
        .objects.some((o) => o.constructionArtworkIds?.length) &&
      window.studio.getPlan(),
  );
  let p = await project(),
    boundary = p.objects.find((o) => o.constructionArtworkIds);
  assert.equal(p.objects.length, 12);
  assert.equal(boundary.constructionArtworkIds.length, 11);
  for (const source of original.objects) {
    const current = p.objects.find((o) => o.id === source.id);
    assert.deepEqual(current.rings, source.rings);
    assert.deepEqual(current.operations, source.operations);
  }
  let events = (await plan()).events;
  assert.equal(events.filter((e) => e.cmd === "stop").length, 2);
  const finish = boundary.operations.at(-1).id;
  assert(
    events.findLastIndex(
      (e) => e.objectId !== boundary.id && e.cmd === "stitch",
    ) < events.findIndex((e) => e.operationId === finish && e.cmd === "stitch"),
  );
  assert(
    (await page.locator("#sewing-order").innerText()).includes("Finish patch"),
  );
  const before = (await plan()).stats.stitches;
  await field("shape-width", boundary.shape.width + 3);
  assert.notEqual((await plan()).stats.stitches, before);
  await field("patch-refit-margin", 5);
  await page.locator("#patch-refit").click();
  await ready();
  assert.equal(
    (await project()).objects.find((o) => o.id === boundary.id).patchMargin,
    5,
  );
  assert.equal(
    (await project()).objects
      .find((o) => o.id === boundary.id)
      .operations.at(-1).id,
    finish,
  );
  // Active operation is explicit; independent colors and method parameters stay independent.
  await page.locator(`[data-operation="${finish}"]`).click();
  assert(
    (await page.locator(".active-operation").innerText()).includes(
      "Finishing border",
    ),
  );
  await field("satin-width", 1.5);
  p = await project();
  assert.equal(
    p.objects.find((o) => o.id === boundary.id).operations.at(-1).width,
    1.5,
  );
  assert.equal(
    p.objects.find((o) => o.id === boundary.id).operations[0].width,
    2.5,
  );
  await openDetails(page.locator("#corner-adaptive"));
  assert(!(await page.locator("#corner-adaptive").isDisabled()));
  await page.locator("#corner-adaptive").check();
  await ready();
  assert(!(await page.locator("#corner-min").isDisabled()));
  await field("corner-min", 0.8);
  await page.locator("#undo").click();
  await ready();
  assert.equal(
    (await project()).objects
      .find((o) => o.id === boundary.id)
      .operations.at(-1).minCornerStitch,
    undefined,
  );
  await page.locator("#redo").click();
  await ready();
  assert.equal(
    (await project()).objects
      .find((o) => o.id === boundary.id)
      .operations.at(-1).minCornerStitch,
    0.8,
  );
  const saved = await project();
  await page.waitForFunction(
    (expected) => localStorage.getItem("embroidery-studio-v1") === expected,
    JSON.stringify(saved),
  );
  await page.reload();
  await ready();
  assert.deepEqual(await project(), saved);
  await pick(boundary.id);
  await page.screenshot({ path: "test-results/properties-desktop.png" });
  // A simple closed fabric boundary uses direct construction after preflight.
  const simple = smartShape("rect", 30, 20, { radius: 2 });
  await openProject({
    version: 1,
    name: "Simple",
    machine: "se700",
    objects: [simple],
  });
  await pick(simple.id);
  await page.locator("#applique-recipe").click();
  assert.equal(await page.locator("#construction-mode").inputValue(), "direct");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects[0].operations?.length === 5 &&
      window.studio.getPlan()?.stats.stops === 2,
  );
  assert.equal((await plan()).stats.stops, 2);
  await page.locator("#undo").click();
  await ready();
  assert(!(await project()).objects[0].operations);
  // Changing a style on a construction stack requires an explicit replacement and supports undo.
  await pick(simple.id);
  await page.locator("#applique-recipe").click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects[0].operations?.length === 5 &&
      window.studio.getPlan()?.stats.stops === 2,
  );
  await page.locator("#embroidery-style").selectOption("combined");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects[0].operations?.length === 2 &&
      window.studio.getPlan()?.stats.stops === 0,
  );
  assert.deepEqual(
    (await project()).objects[0].operations.map((o) => o.type),
    ["fill", "run"],
  );
  assert.equal((await plan()).stats.stops, 0);
  await page.locator("#undo").click();
  await ready();
  assert.equal((await plan()).stats.stops, 2);
  // Narrow region: direct recipe is blocked with a precise inset explanation; expert manual steps remain available.
  const narrow = smartShape("rect", 0.6, 10, { radius: 0 });
  await openProject({
    version: 1,
    name: "Narrow",
    machine: "se700",
    objects: [narrow],
  });
  await pick(narrow.id);
  await page.locator("#applique-recipe").click();
  assert(
    await page
      .locator('#construction-mode option[value="direct"]')
      .evaluate((el) => el.disabled),
    JSON.stringify({
      project: await project(),
      dialog: await page.locator("#dialog-content").innerText(),
    }),
  );
  assert(
    (await page.locator("#dialog-content").innerText()).includes(
      "tackdown inset collapses",
    ),
  );
  await page.keyboard.press("Escape");
  // Invalid steps are errors, locate the affected operation, and cannot silently export partial artwork.
  const bad = smartShape("rect", 20, 12);
  bad.closed = false;
  bad.type = "run";
  bad.operations = [makeOperation("border", bad)];
  const good = smartShape("ellipse", 12, 8);
  await openProject({
    version: 1,
    name: "Issue navigation",
    machine: "se700",
    objects: [bad, good],
  });
  assert(
    (await plan()).events.some(
      (e) => e.objectId === good.id && e.cmd === "stitch",
    ),
  );
  assert(await page.locator("#export").isDisabled());
  assert((await page.locator("#warnings").innerText()).includes("1 errors"));
  await page.locator("[data-issue]").first().click();
  assert.deepEqual(
    await page.evaluate(() => window.studio.getSelection().ids),
    [bad.id],
  );
  assert(
    (await page.locator(".active-operation").innerText()).includes(
      "Satin border",
    ),
  );
  await page.locator(`[data-op-enabled="${bad.operations[0].id}"]`).uncheck();
  await ready();
  assert(!(await page.locator("#export").isDisabled()));
  // The drawing-style chooser constructs real shared operations on new canvas geometry.
  await openProject({
    version: 1,
    name: "Drawing styles",
    machine: "se700",
    objects: [],
  });
  await openDetails(page.locator("#draw-style"));
  await page.locator("#draw-style").selectOption("combined");
  await page.locator(".drawing-style > summary").click();
  await page.locator('[data-tool="ellipse"]').click();
  const coords = await page.evaluate(() => {
    const r = document.getElementById("stage").getBoundingClientRect(),
      v = window.studio.getView();
    return { x: r.x + v.center.x, y: r.y + v.center.y, s: v.scale };
  });
  await page.mouse.move(coords.x - 12 * coords.s, coords.y - 8 * coords.s);
  await page.mouse.down();
  await page.mouse.move(coords.x + 12 * coords.s, coords.y + 8 * coords.s, {
    steps: 8,
  });
  await page.mouse.up();
  await ready();
  assert.deepEqual(
    (await project()).objects[0].operations.map((op) => op.type),
    ["fill", "run"],
  );
  // Whole-lettering rounding retains editable text and survives live font regeneration.
  const text = await page.evaluate(async () => {
    const { lettering } = await import("./src/importers.js");
    return lettering("O", 14, "#292c31", "sans-serif");
  });
  await openProject({
    version: 1,
    name: "Rounded lettering",
    machine: "se700",
    objects: [text],
  });
  await pick(text.id);
  await field("round-radius", 0.1);
  await page.locator("#round-geometry").click();
  await ready();
  assert((await project()).objects[0].textSource);
  await page.locator("#live-font").selectOption("monospace");
  await ready();
  assert.equal((await project()).objects[0].textSource.font, "monospace");
  assert.equal((await project()).objects[0].rounding.radius, 0.1);
  await openDetails(page.locator("#corner-adaptive"));
  assert(await page.locator("#corner-adaptive").isDisabled());
  assert(
    (await page.locator("#corner-availability").innerText()).includes(
      "Unavailable for tatami",
    ),
  );
  await page.locator("#stitch-type").selectOption("column");
  await ready();
  await openDetails(page.locator("#corner-adaptive"));
  assert(await page.locator("#corner-adaptive").isDisabled());
  assert(await page.locator("#column-max").count());
  // Keyboard-accessible explanations remain present when hover hints are off, including in a compact touch layout.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toggle-inspector").click();
  await page.screenshot({ path: "test-results/properties-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Properties: exact manatee import, patch wizard (4 shapes), stage dependencies, active settings, undo/reload, direct preflight, style replacement, Design Issues and mobile passed",
  );
} finally {
  await browser.close();
}
