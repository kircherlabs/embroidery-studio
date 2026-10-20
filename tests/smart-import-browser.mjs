import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { signedArea, inside, fillPolygons } from "../src/geometry.js";
import {
  decodePes,
  declaredRect,
  streamExtents,
} from "./helpers/pes-decoder.mjs";
import { reveal } from "./helpers/ui.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
await mkdir("test-results", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1050 },
    }),
    errors = [],
    times = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (...args) {
      if (args[0]?.project)
        window.__planningImages =
          (window.__planningImages || 0) +
          (args[0].project.groups || []).filter(
            (g) => g.imageSource || g.traceSettings || g.paletteSettings,
          ).length;
      return original.apply(this, args);
    };
  });
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    plan = () => page.evaluate(() => window.studio.getPlan()),
    preview = () =>
      page.waitForFunction(
        () =>
          document.getElementById("dialog-submit")?.disabled === false &&
          document.querySelectorAll("#trace-palette .trace-color").length > 0,
      ),
    row = (color) =>
      page.locator(".trace-color").filter({
        has: page.getByRole("checkbox", {
          name: `Retain ${color} as a separate color`,
          exact: true,
        }),
      }),
    keep = (color) =>
      page.getByRole("checkbox", {
        name: `Retain ${color} as a separate color`,
        exact: true,
      });
  const png = async (kind, count = 10) =>
    page.evaluate(
      ({ kind, count }) => {
        const c = document.createElement("canvas"),
          g = c.getContext("2d");
        c.width = kind === "ten" ? 200 : 128;
        c.height = kind === "ten" ? 140 : 128;
        if (kind === "ten") {
          const colors = [
            "#ffffff",
            "#eb1478",
            "#f26ea8",
            "#a01455",
            "#145ae6",
            "#15bfa0",
            "#e2a526",
            "#772bd0",
            "#1c3345",
            "#e35a20",
          ];
          g.fillStyle = colors[0];
          g.fillRect(0, 0, c.width, c.height);
          for (let i = 1; i < colors.length; i++) {
            g.fillStyle = colors[i];
            g.fillRect(10 + (i - 1) * 20, 20, 20, 100);
          }
        } else if (kind === "background") {
          g.fillStyle = "white";
          g.fillRect(0, 0, 128, 128);
          g.fillStyle = "#e32660";
          g.fillRect(16, 16, 96, 96);
          g.fillStyle = "white";
          g.fillRect(48, 48, 32, 32);
        } else {
          const colors = Array.from(
            { length: count },
            (_, i) =>
              `rgb(${32 + (i % 4) * 65},${24 + (Math.floor(i / 4) % 4) * 65},${36 + (Math.floor(i / 16) % 4) * 65})`,
          );
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
              g.fillStyle = colors[(y * 8 + x) % count];
              g.fillRect(x * 16, y * 16, 16, 16);
            }
        }
        return c.toDataURL("image/png");
      },
      { kind, count },
    );
  const begin = async (data, name) => {
    await page.locator("#file-input").setInputFiles({
      name,
      mimeType: name.endsWith(".jpg") ? "image/jpeg" : "image/png",
      buffer: Buffer.from(data.split(",")[1], "base64"),
    });
    await page.locator("#image-import-mode").selectOption("trace");
    await page.locator("#dialog-submit").click();
    await page.locator("#trace-preview").waitFor();
    await preview();
  };
  const field = async (id, value) => {
    await reveal(page.locator("#" + id));
    await page.locator("#" + id).fill(String(value));
    await preview();
  };
  const commit = async () => {
    await preview();
    const id = (await plan()).id;
    await page.locator("#dialog-submit").click();
    await page.locator("#dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(
      (id) => window.studio.getPlan() && window.studio.getPlan().id !== id,
      id,
    );
    await ready();
  };
  const latest = async () => {
    const p = await project(),
      g = p.groups.filter((g) => g.imageSource).at(-1);
    return { p, g, objects: p.objects.filter((o) => o.parentId === g.id) };
  };
  await ready();
  const original = await png("ten");
  await begin(original, "Ten colors.png");
  assert(
    (await page.locator("#dialog").boundingBox()).width > 900,
    "Desktop importer uses available width for readable comparison and palette controls",
  );
  assert.equal(await page.locator(".trace-color").count(), 10);
  assert(!(await page.locator("#raster-bg").isChecked()));
  assert(await keep("#ffffff").isChecked());
  await field("trace-area", 0);
  await field("trace-simplify", 0);
  for (const color of ["#f26ea8", "#a01455", "#15bfa0", "#e2a526", "#772bd0"]) {
    await keep(color).uncheck();
    await preview();
    assert.match(await row(color).innerText(), /→/);
  }
  await row("#f26ea8").locator("select").selectOption("#eb1478");
  await preview();
  assert.match(await row("#f26ea8").innerText(), /→ #eb1478/);
  assert.match(
    await page.locator("#trace-palette-count").innerText(),
    /5 retained/,
  );
  await page.screenshot({ path: "test-results/smart-import-palette.png" });
  await page.locator("#raster-width").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      window.studio.getProject().groups?.some((g) => g.imageSource) &&
      window.studio.getPlan(),
  );
  let { p, g, objects } = await latest();
  assert.equal(objects.length, 5);
  assert.equal(g.imageSource.data, original);
  assert.equal(g.imageSource.width, 200);
  const area = objects.reduce(
    (sum, o) => sum + o.rings.reduce((n, r) => n + signedArea(r), 0),
    0,
  );
  assert(
    Math.abs(area - 70 * 49) < 1e-5,
    "Merging must retain full opaque image area",
  );
  assert(objects.every((o) => fillPolygons(o.rings, "nonzero")));
  assert.equal(
    new Set(
      (await plan()).events
        .filter(
          (e) => e.cmd === "stitch" && objects.some((o) => o.id === e.objectId),
        )
        .map((e) => e.color),
    ).size,
    5,
  );
  // Preserve actual edited geometry and independent operations during palette-only revision.
  await page.locator(`[data-select="${g.id}"]`).click();
  await reveal(page.locator("#retrace-image"));
  await page.locator("#retrace-image").click();
  await preview();
  assert.equal(await page.locator("#trace-apply-mode").inputValue(), "palette");
  assert(await page.locator("#trace-area").isDisabled());
  const before = await project();
  await keep("#145ae6").uncheck();
  await preview();
  await commit();
  let current = await project();
  assert.deepEqual(
    current.objects.map((o) => o.rings),
    before.objects.map((o) => o.rings),
  );
  assert(current.objects.some((o, i) => o.color !== before.objects[i].color));
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(await project(), before);
  await page.locator("#redo").click();
  await ready();
  // Last-color protection, explicit transparency and modal cancellation do not alter project/history.
  const stable = await project();
  await page.locator(`[data-select="${g.id}"]`).click();
  await reveal(page.locator("#retrace-image"));
  await page.locator("#retrace-image").click();
  await preview();
  await page.locator("#trace-retain-all").click();
  await preview();
  const all = await page
    .locator('.trace-color input[data-action="keep"]')
    .evaluateAll((es) =>
      es.map((e) => e.getAttribute("aria-label").slice(7, 14)),
    );
  for (const color of all.slice(1)) {
    await keep(color).uncheck();
    await preview();
  }
  await keep(all[0]).click();
  assert(await keep(all[0]).isChecked());
  assert.match(await page.locator("#trace-status").innerText(), /at least one/);
  await page.keyboard.press("Escape");
  assert.deepEqual(await project(), stable);
  // A revised trace fits the current bounds uniformly; background cropping must
  // not stretch a 180 x 100 illustration back to the old 200 x 140 frame.
  await page.locator(`[data-select="${g.id}"]`).click();
  await reveal(page.locator("#retrace-image"));
  await page.locator("#retrace-image").click();
  await preview();
  await page.locator("#trace-apply-mode").selectOption("new");
  await preview();
  await page
    .locator("#trace-background-color")
    .selectOption({ label: "#ffffff" });
  await page.locator("#trace-background-review").waitFor({ state: "visible" });
  await page.locator("#trace-background-confirm").click();
  await preview();
  await commit();
  const cropped = (await latest()).objects.flatMap((o) => o.rings.flat()),
    cw =
      Math.max(...cropped.map((p) => p.x)) -
      Math.min(...cropped.map((p) => p.x)),
    ch =
      Math.max(...cropped.map((p) => p.y)) -
      Math.min(...cropped.map((p) => p.y));
  assert(
    Math.abs(cw / ch - 1.8) < 1e-6,
    "Revised traces preserve aspect ratio after removing background",
  );
  // Explicit region-aware background proposal: verify real preview pixels before/after approval.
  await begin(await png("background"), "Background and foreground.png");
  await field("trace-area", 0);
  await field("trace-simplify", 0);
  await page.locator("#raster-bg").check();
  await page.locator("#trace-background-review").waitFor({ state: "visible" });
  assert(await page.locator("#dialog-submit").isDisabled());
  let pixel = await page
    .locator("#trace-preview")
    .evaluate((c) => [...c.getContext("2d").getImageData(220, 10, 1, 1).data]);
  assert(pixel[0] > 200 && pixel[3] > 0 && pixel[3] < 255);
  await page.locator("#trace-background-confirm").click();
  await preview();
  pixel = await page
    .locator("#trace-preview")
    .evaluate((c) => [...c.getContext("2d").getImageData(220, 10, 1, 1).data]);
  assert.equal(pixel[3], 0);
  await commit();
  ({ g, objects } = await latest());
  assert(g.traceSettings.removeBackground);
  assert(
    objects.some(
      (o) =>
        o.color === "#ffffff" && inside({ x: 0, y: 0 }, o.rings, "nonzero"),
    ),
  );
  assert(objects.some((o) => o.color === "#e32660"));
  // Palette-only reduction after background removal must preserve the actual
  // removed geometry and original construction settings, even after rescanning.
  const backgroundGroup = g,
    backgroundBefore = await project();
  await page.locator(`[data-select="${g.id}"]`).click();
  await reveal(page.locator("#retrace-image"));
  await page.locator("#retrace-image").click();
  await preview();
  await field("raster-colors", 4);
  await commit();
  const backgroundAfter = await project();
  assert.deepEqual(
    backgroundAfter.objects.map((o) => o.rings),
    backgroundBefore.objects.map((o) => o.rings),
  );
  assert.deepEqual(
    backgroundAfter.groups.find((x) => x.id === backgroundGroup.id)
      .traceSettings,
    backgroundGroup.traceSettings,
  );
  assert.equal(
    backgroundAfter.groups.find((x) => x.id === backgroundGroup.id)
      .paletteSettings.colors,
    4,
  );
  // Deliberate global transparency has separate Undo; background cancellation restores coverage.
  await begin(original, "Transparency.png");
  await row("#ffffff")
    .getByRole("button", { name: "Make transparent", exact: true })
    .click();
  await preview();
  assert.match(await row("#ffffff").innerText(), /area removed/);
  await page.locator("#trace-undo").click();
  await preview();
  assert(await keep("#ffffff").isChecked());
  await page.locator("#raster-bg").check();
  await page.locator("#trace-background-review").waitFor({ state: "visible" });
  await page.locator("#trace-background-cancel").click();
  await preview();
  assert(!(await page.locator("#raster-bg").isChecked()));
  await page.keyboard.press("Escape");
  // JPEG retains original bytes and uses the same interactive, editable workflow.
  const jpeg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#156dc9";
    g.fillRect(12, 12, 40, 40);
    return c.toDataURL("image/jpeg", 0.96);
  });
  await begin(jpeg, "Graphic.jpg");
  await commit();
  assert.equal((await latest()).g.imageSource.data, jpeg);
  // Advanced imports preserve 12, 24, 32 and 64 colors in actual stitch plans.
  for (const count of [12, 24, 32, 64]) {
    const start = Date.now();
    await begin(await png("grid", count), `Detailed ${count}.png`);
    await field("raster-colors", count);
    await field("trace-area", 0);
    assert.equal(await page.locator(".trace-color").count(), count);
    await page.locator("#trace-sort").selectOption("hex");
    if (count === 64) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator(".trace-color").last().scrollIntoViewIfNeeded();
      const b = await page.locator("#trace-palette").boundingBox();
      assert(b.x >= 0 && b.x + b.width <= 390);
      await page.screenshot({
        path: "test-results/smart-import-mobile-64.png",
      });
      await page.setViewportSize({ width: 1500, height: 1050 });
    }
    await commit();
    ({ g, objects } = await latest());
    assert.equal(objects.length, count);
    const stitchColors = new Set(
      (await plan()).events
        .filter(
          (e) => e.cmd === "stitch" && objects.some((o) => o.id === e.objectId),
        )
        .map((e) => e.color),
    );
    assert.equal(stitchColors.size, count);
    times.push({ count, ms: Date.now() - start });
  }
  // Revised trace preserves edited original; replacement is explicit and reversible.
  await page.locator(`[data-select="${g.id}"]`).click();
  await reveal(page.locator("#retrace-image"));
  await page.locator("#retrace-image").click();
  await preview();
  await page.locator("#trace-apply-mode").selectOption("new");
  await preview();
  await page.locator("#trace-target").selectOption("4");
  await preview();
  const oldObjects = (await project()).objects.map((o) => structuredClone(o));
  await commit();
  current = await project();
  assert(
    oldObjects.every(
      (o, i) => JSON.stringify(current.objects[i]) === JSON.stringify(o),
    ),
  );
  assert(current.groups.some((g) => g.name.includes("revised trace")));
  ({ g } = await latest());
  await page.locator(`[data-select="${g.id}"]`).click();
  await reveal(page.locator("#retrace-image"));
  await page.locator("#retrace-image").click();
  await preview();
  await page.locator("#trace-apply-mode").selectOption("replace");
  await preview();
  await field("trace-area", 1);
  await page.locator("#dialog-submit").click();
  await page
    .getByRole("heading", { name: "Replace edited trace?", exact: true })
    .waitFor();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    (id) =>
      window.studio.getProject().groups.find((g) => g.id === id).traceSettings
        .minArea === 1 && window.studio.getPlan(),
    g.id,
  );
  assert.equal(
    (await project()).groups.find((x) => x.id === g.id).traceSettings.minArea,
    1,
  );
  // Save/reopen persists source bytes and palette mappings, with all operations intact.
  const saved = await project(),
    saving = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const file = await saving,
    bytes = await readFile(await file.path());
  assert.deepEqual(JSON.parse(bytes), saved);
  await page.locator("#file-input").setInputFiles({
    name: "smart.embstudio",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page.locator("#dialog-submit").click();
  await ready();
  assert.deepEqual(await project(), saved);
  // Export every actual needle from the large-palette project and independently decode PES/PEC.
  const expected = (await plan()).events.filter((e) => e.cmd === "stitch"),
    changes = (await plan()).stats.changes;
  await page.locator("#export").click();
  assert.equal(await page.locator("#export-format").inputValue(), "pes");
  const downloading = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  await (await downloading).saveAs("test-results/smart-import.pes");
  const decoded = decodePes(await readFile("test-results/smart-import.pes")),
    needles = decoded.pec.events.filter((e) => e.type === "stitch");
  assert.equal(needles.length, expected.length);
  assert.deepEqual(declaredRect(decoded.pec), streamExtents(decoded.pec));
  assert.equal(
    decoded.pec.events.filter((e) => e.type === "colorChange").length,
    changes,
  );
  expected.forEach((e, i) => {
    assert.equal(needles[i].x, Math.round((e.x - expected[0].x) * 10) || 0);
    assert.equal(needles[i].y, Math.round((e.y - expected[0].y) * 10) || 0);
  });
  // Remember successful format choices per exact machine/profile, without brand inference.
  await page.locator("#export").click();
  await page.locator("#export-format").selectOption("dst");
  const dst = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  await dst;
  await page.locator("#export").click();
  assert.equal(await page.locator("#export-format").inputValue(), "dst");
  await page.keyboard.press("Escape");
  await reveal(page.locator("#machine"));
  await page.locator("#machine").selectOption("brother130");
  await ready();
  await page.locator("#export").click();
  assert.equal(await page.locator("#export-format").inputValue(), "pes");
  assert.match(
    await page.locator("#export-format-guidance").innerText(),
    /not a verified machine/,
  );
  await page.keyboard.press("Escape");
  await page.locator("#machine").selectOption("se700");
  await ready();
  await page.locator("#export").click();
  assert.equal(await page.locator("#export-format").inputValue(), "dst");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => window.__planningImages || 0), 0);
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/smart-import-performance.json",
    JSON.stringify(times, null, 2),
  );
  console.log(
    "Smart import: all colors retained by default, 10→5 complete coverage, manual merge targets, last-color protection, explicit/Undo transparency, confirmed connected background with same-color foreground retained, 12/24/32/64 palettes, mobile scrolling/sorting, safe recolor/revised/confirmed replace, persistence, every PES needle/color change/origin and per-machine export preferences passed.",
  );
} finally {
  await browser.close();
}
