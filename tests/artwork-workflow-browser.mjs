import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { artworkFixture } from "./helpers/artwork-fixtures.mjs";
import { smartShape } from "../src/creative.js";
import { artworkBounds } from "../src/artwork-library.js";
import { decodePes, modelMachineSizeMm } from "./helpers/pes-decoder.mjs";
const { chromium } = createRequire(import.meta.url)(
    process.env.PLAYWRIGHT_MODULE || "playwright",
  ),
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
await mkdir("test-results", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1080 },
    }),
    errors = [];
  page.setDefaultTimeout(45000);
  page.on("pageerror", (e) => errors.push(e.stack));
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject());
  const library = () =>
    page.evaluate(
      async () =>
        (await (await import("./src/artwork-store.js")).loadArtwork()).records,
    );
  const load = async (p) => {
    await page
      .locator("#file-input")
      .setInputFiles({
        name: "Artwork.embstudio",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(p)),
      });
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      (name) => window.studio.getProject().name === name,
      p.name,
    );
    await ready();
  };
  const pick = async (id) => {
    for (const el of await page.locator("#object-list [data-expand]").all()) {
      if ((await el.locator("..").getAttribute("aria-expanded")) === "false")
        await el.click();
    }
    await page.locator(`[data-select="${id}"]`).click();
  };
  const saveName = async (name) => {
    await page.locator("#artwork-name").fill(name);
    await page.locator("#artwork-name").press("Enter");
    await page.waitForFunction(() =>
      document.querySelector("#artwork-status")?.textContent.includes("Saved"),
    );
  };
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await ready();
  const source = artworkFixture();
  await load(source);
  const original = await project();
  await pick("outer");
  await page.locator('[data-select="outer"]').click({ button: "right" });
  await page.locator('[data-arrange="save-artwork"]').click();
  await saveName("Wildlife Patch");
  assert.deepEqual(
    await project(),
    original,
    "saving does not change source project",
  );
  await page.keyboard.press("Control+z");
  assert.deepEqual(
    await project(),
    original,
    "modal keyboard cannot undo the project",
  );
  const saved = (await library())[0];
  assert.equal(saved.artwork.objects.length, 9);
  assert.equal(saved.artwork.groups.length, 2);
  assert.equal(
    saved.artwork.objects[0].operations[0].physicalThread.thread.number,
    "001",
  );
  await page.keyboard.press("Escape");
  // A partial linked source gets named dependency guidance, never a broken record.
  await pick(source.objects[6].id);
  await page.locator("#artwork-library").click();
  await page.locator("#artwork-save").click();
  assert.match(
    await page.locator("#artwork-status").innerText(),
    /Also select related artwork/,
  );
  assert.match(await page.locator("#artwork-status").innerText(), /Star/);
  assert.equal((await library()).length, 1);
  await page.keyboard.press("Escape");
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () => window.studio.getProject().objects.length === 0,
  );
  await ready();
  const empty = await project();
  await page.locator("#artwork-library").click();
  await page.locator("[data-artwork]").click();
  await page.locator("#artwork-insert").click();
  await ready();
  const inserted = await project();
  assert.equal(inserted.objects.length, 9);
  assert.equal(inserted.groups.length, 2);
  assert.equal(inserted.machine, empty.machine);
  assert.notEqual(inserted.groups[0].id, "outer");
  assert.equal(
    new Set([...inserted.groups, ...inserted.objects].map((n) => n.id)).size,
    11,
  );
  const b = artworkBounds(saved.artwork),
    c = artworkBounds(inserted);
  assert.ok(Math.abs(b.width - c.width) < 1e-8);
  assert.ok(Math.abs(b.height - c.height) < 1e-8);
  assert.equal(
    await page.evaluate(
      async () =>
        (await (await import("./src/thread-store.js")).loadThreads()).inventory
          .length,
    ),
    0,
    "insertion never marks physical thread owned",
  );
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(await project(), empty, "one Undo removes complete insert");
  await page.locator("#redo").click();
  await ready();
  assert.deepEqual(await project(), inserted);
  const initialPlan = await page.evaluate(() => window.studio.getPlan());
  assert.ok(initialPlan.events.some((e) => e.cmd === "stitch"));
  assert.ok(initialPlan.events.some((e) => e.cmd === "stop"));
  // Live editable lettering survives insertion and a real font change.
  const text = inserted.objects.find((o) => o.textSource);
  await pick(text.id);
  await page.locator("#live-font").selectOption("sans-serif");
  await page.waitForFunction(
    (id) =>
      window.studio.getProject().objects.find((o) => o.id === id).textSource
        .font === "sans-serif",
    text.id,
  );
  await ready();
  assert.equal(
    (await project()).objects.find((o) => o.id === text.id).textSource.content,
    "O",
  );
  assert.deepEqual(
    (await library())[0],
    saved,
    "editing the inserted copy never changes its library source",
  );
  const plan = await page.evaluate(() => window.studio.getPlan()),
    beforeExport = await project();
  await page.locator("#export").click();
  await page.locator("#export-format").selectOption("pes");
  const pending = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  const file = await pending,
    pes = decodePes(new Uint8Array(await readFile(await file.path())));
  assert.equal(pes.pec.declaredWidth, Math.round(plan.stats.bounds.width * 10));
  assert.equal(
    pes.pec.declaredHeight,
    Math.round(plan.stats.bounds.height * 10),
  );
  const physical = modelMachineSizeMm(pes.pec);
  assert.ok(Math.abs(physical.widthMm - plan.stats.bounds.width) < 0.2);
  assert.ok(Math.abs(physical.heightMm - plan.stats.bounds.height) < 0.2);
  await page.waitForFunction(() =>
    document.querySelector("#sequence-source").textContent.includes("decoded"),
  );
  const decoded = await page.evaluate(() => window.studio.getPlan().events),
    needles = plan.events.filter((e) => e.cmd === "stitch"),
    actual = decoded.filter((e) => e.cmd === "stitch");
  assert.equal(actual.length, needles.length);
  for (let i = 0; i < needles.length; i++) {
    assert.ok(Math.abs(actual[i].x - needles[i].x) <= 0.11);
    assert.ok(Math.abs(actual[i].y - needles[i].y) <= 0.11);
  }
  assert.equal(
    decoded.filter((e) => e.cmd === "stop").length,
    plan.events.filter((e) => e.cmd === "stop").length,
  );
  assert.deepEqual(await project(), beforeExport);
  const download = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const design = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  assert.deepEqual(design, beforeExport);
  await page.reload();
  await ready();
  assert.deepEqual(await project(), beforeExport);
  assert.deepEqual((await library())[0], saved);
  // Header Save Selection handles a true multiselection without introducing a group.
  await pick(inserted.objects[0].id);
  await page.locator(`[data-check="${inserted.objects[1].id}"]`).click();
  await page.locator("#artwork-library").click();
  await page.locator("#artwork-save").click();
  await saveName("Two editable shapes");
  assert.equal(
    (await library()).find((r) => r.name === "Two editable shapes").artwork
      .roots.length,
    2,
  );
  await page.keyboard.press("Escape");
  const wide = smartShape("rect", 140, 80, { radius: 3 });
  await load({
    version: 1,
    name: "Wide source",
    machine: "generic200",
    objects: [wide],
  });
  await pick(wide.id);
  await page.locator("#artwork-library").click();
  await page.locator("#artwork-save").click();
  await saveName("Oversize boundary");
  await page.keyboard.press("Escape");
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () => window.studio.getProject().objects.length === 0,
  );
  await ready();
  await page.locator("#artwork-library").click();
  await page.locator("#artwork-search").fill("Oversize");
  await page.locator("[data-artwork]").click();
  await page.locator("#artwork-insert").click();
  await ready();
  assert.equal((await project()).objects[0].shape.width, 140);
  assert.equal(
    await page.evaluate(() => window.studio.getPlan().stats.fits),
    false,
    "oversize source remains full size and gets normal hoop warning",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS context/header Save, linked dependency guidance, independent nested source, cross-project insert at size, fresh IDs, one Undo/Redo, live fonts, persistence, multiselection, no inventory side effects, actual PES needles/stops/origin/extents and oversize warning",
  );
} finally {
  await browser.close();
}
