import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { object } from "../src/model.js";
import { decodePes, declaredRect } from "./helpers/pes-decoder.mjs";
import { reveal } from "./helpers/ui.mjs";
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
      viewport: { width: 1500, height: 1080 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  const plan = () => page.evaluate(() => window.studio.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject());
  const cleanup = () => page.evaluate(() => window.studio.getCleanup()),
    view = () => page.evaluate(() => window.studio.getSequenceView());
  const open = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "cleanup.embstudio",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      (n) => window.studio.getProject().name === n && window.studio.getPlan(),
      p.name,
    );
  };
  const command = (cmd, x, y = -10) => ({ cmd, x, y });
  const manual = object("Blue islands", [], {
    type: "manual",
    color: "#002b80",
    commands: [
      command("jump", -20),
      command("stitch", -20),
      command("stitch", -18),
      command("jump", -10),
      command("jump", -6),
      command("stitch", -6),
      command("stitch", -4),
      command("trim", -4),
      command("jump", 8),
      command("stitch", 8),
      command("stitch", 10),
      command("stop", 10),
      command("jump", 20),
      command("stitch", 20),
      command("stitch", 22),
    ],
  });
  await ready();
  await open({
    version: 1,
    name: "Manual cleanup regression",
    machine: "se700",
    objects: [manual],
  });
  const original = await project(),
    source = await plan(),
    report = await cleanup();
  assert.equal(report.candidates.length, 3);
  assert.equal(report.untrimmed, 2);
  assert.equal(report.trimDependent, 1);
  assert.equal(report.candidates[0].jumpCommands, 2);
  await page.locator("#preview-tab").click();
  await page.waitForFunction(
    () => !document.getElementById("simulator").hidden,
  );
  const redPixels = () =>
    page.locator("#stage").evaluate((c) => {
      const p = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < p.length; i += 4)
        if (p[i] > 150 && p[i] > p[i + 1] * 1.4 && p[i] > p[i + 2] * 1.4) n++;
      return n;
    });
  const off = await redPixels();
  await reveal(page.locator("#show-manual-trims"));
  await page.locator("#show-manual-trims").check();
  await page.locator(".display-options > summary").click();
  assert(
    (await redPixels()) > off + 50,
    "actual red cleanup geometry must render",
  );
  assert.equal(await page.locator("#show-jumps").isChecked(), false);
  const marker = async (kind) => {
    const g = (await view()).groups.find((g) => g.kind === kind);
    assert(g, kind);
    await page.locator("#command-track").scrollIntoViewIfNeeded();
    const b = await page.locator("#command-track").boundingBox();
    return { ...g, cx: b.x + g.x, cy: b.y + g.y };
  };
  let m = await marker("manual");
  await page.mouse.move(m.cx, m.cy);
  await page.waitForFunction(
    () => !document.getElementById("sequence-tooltip").hidden,
  );
  assert.match(
    await page.locator("#sequence-tooltip").textContent(),
    /Estimated manual cleanup.*mm/,
  );
  await page.mouse.click(m.cx, m.cy);
  assert(
    Math.abs(
      (await page
        .locator("#sequence-cursor")
        .evaluate((e) => parseFloat(e.style.left))) - m.x,
    ) < 1,
    "playback cursor aligns with the selected marker",
  );
  assert.equal(
    Number(await page.locator("#timeline").inputValue()),
    report.candidates[0].endIndex + 1,
  );
  assert.match(
    await page.locator("#sequence-event-description").textContent(),
    /2 jump commands/,
  );
  assert((await redPixels()) > off + 50);
  m = await marker("trim");
  await page.mouse.click(m.cx, m.cy);
  assert.match(
    await page.locator("#sequence-event-description").textContent(),
    /Automatic trim command/,
  );
  assert.equal(
    (await plan()).events[
      Number(await page.locator("#timeline").inputValue()) - 1
    ].cmd,
    "trim",
  );
  await page.locator("#sequence-detail-close").click();
  await page.locator("#end").click();
  await page.locator("#sequence-zoom-in").click();
  assert((await view()).span < source.events.length);
  await page.locator("#sequence-pan").fill("0");
  await page.locator("#sequence-pan").dispatchEvent("input");
  assert.equal((await view()).start, 0);
  await page.locator("#sequence-zoom-fit").click();
  assert.equal((await view()).span, source.events.length);
  await page.locator("#rewind").click();
  await page.locator("#command-track").focus();
  await page.keyboard.press("ArrowRight");
  assert(Number(await page.locator("#timeline").inputValue()) > 0);
  let paired = false;
  for (let i = 0; i < 7; i++) {
    const before = await page.locator("#timeline").inputValue();
    const label = await page
      .locator("#sequence-event-description")
      .textContent();
    await page.keyboard.press("ArrowRight");
    if (
      before === (await page.locator("#timeline").inputValue()) &&
      label.startsWith("Jump") &&
      (
        await page.locator("#sequence-event-description").textContent()
      ).startsWith("Estimated manual")
    )
      paired = true;
  }
  assert(
    paired,
    "keyboard inspection must reach both a jump and cleanup at the same command",
  );
  await page.locator("#end").click();
  await reveal(page.locator("#show-jumps"));
  await page.locator("#show-jumps").check();
  await page.locator("#show-manual-trims").uncheck();
  assert.equal(
    (await view()).groups.some((g) => g.kind === "manual"),
    false,
  );
  assert.equal(await redPixels(), off);
  await page.locator("#show-jumps").uncheck();
  await page.locator("#show-manual-trims").check();
  await page.locator(".display-options > summary").click();
  assert.deepEqual(await project(), original);
  assert.deepEqual(await plan(), source);
  await page.locator("#cleanup-count").click();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-cleanup]").length === 3,
  );
  assert.equal(await page.locator("[data-cleanup]").count(), 3);
  await page.locator('[data-cleanup="1"]').click();
  assert.match(
    await page.locator("#sequence-event-description").textContent(),
    /trim command is present/,
  );
  await page.locator("#cleanup-count").click();
  await page.locator("#sequence-detail-close").click();
  await page.locator("#end").click();
  await page.locator("#fit-design").click();
  await page.screenshot({ path: "test-results/cleanup-desktop.png" });
  await page
    .locator("#simulator")
    .screenshot({ path: "test-results/cleanup-timeline.png" });
  const saveExport = async (format, path) => {
    await page.locator("#export").click();
    await page.locator("#export-format").selectOption(format);
    const pending = page.waitForEvent("download", { timeout: 180000 });
    await page.locator("#dialog-submit").click();
    await (await pending).saveAs(path);
    await page.waitForFunction(
      (f) =>
        document.getElementById("sequence-source").textContent ===
        f.toUpperCase() + " file · decoded",
      format,
    );
    await ready();
  };
  // The same project must export byte-for-byte identically with either overlay state.
  await reveal(page.locator("#show-manual-trims"));
  await page.locator("#show-manual-trims").uncheck();
  await saveExport("pes", "test-results/cleanup-off.pes");
  await reveal(page.locator("#show-manual-trims"));
  await page.locator("#show-manual-trims").check();
  await saveExport("pes", "test-results/cleanup-on.pes");
  const bytes = await readFile("test-results/cleanup-on.pes");
  assert.deepEqual(bytes, await readFile("test-results/cleanup-off.pes"));
  const decoded = decodePes(bytes),
    exported = await plan();
  const sewn = decoded.pec.events.filter((e) => e.type === "stitch"),
    expected = exported.events.filter((e) => e.cmd === "stitch");
  assert.equal(sewn.length, expected.length);
  sewn.forEach((e, i) => {
    assert.equal(e.x, Math.round((expected[i].x - expected[0].x) * 10) || 0);
    assert.equal(e.y, Math.round((expected[i].y - expected[0].y) * 10) || 0);
  });
  const extent = declaredRect(decoded.pec);
  assert(extent.right > extent.left);
  assert.match((await cleanup()).assumptions, /Decoded commands · PES/);
  await saveExport("jef", "test-results/cleanup.jef");
  const jef = await plan();
  assert(
    jef.events.some((e) => e.cmd === "trim"),
    "pinned JEF reader infers trims from long travel",
  );
  assert.match((await cleanup()).assumptions, /Decoded commands · JEF/);
  assert((await cleanup()).untrimmed >= 2);
  assert.equal((await cleanup()).trimDependent, 0);
  assert((await cleanup()).candidates.some((c) => c.encoding === "inferred"));
  // Import the actual file, retain its format provenance across project persistence.
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 0 &&
      window.studio.getPlan(),
  );
  await page
    .locator("#file-input")
    .setInputFiles("test-results/cleanup-on.pes");
  await page.waitForFunction(
    () =>
      window.studio
        .getProject()
        .objects.some((o) => o.machineSourceFormat === "pes") &&
      window.studio.getPlan(),
  );
  const imported = await project();
  assert(
    imported.objects.every(
      (o) => o.type === "manual" && o.machineSourceFormat === "pes",
    ),
  );
  await page.waitForFunction(
    () =>
      document.getElementById("save-status").textContent ===
      "Saved on this device",
  );
  await page.reload();
  await ready();
  assert.deepEqual(await project(), imported);
  // Dense tracks keep all important events reachable through clusters, zoom and keyboard.
  const commands = [command("jump", -20), command("stitch", -20)];
  for (let i = 0; i < 1400; i++) {
    commands.push(
      command("jump", i % 2 ? 20 : -20),
      command("stitch", i % 2 ? 20 : -20),
      command("stitch", i % 2 ? 21 : -21),
    );
  }
  await open({
    version: 1,
    name: "Dense cleanup",
    machine: "se700",
    objects: [
      object("Dense manual", [], {
        type: "manual",
        color: "#002b80",
        commands,
      }),
    ],
  });
  await page.locator("#preview-tab").click();
  await reveal(page.locator("#show-manual-trims"));
  await page.locator("#show-manual-trims").check();
  await page.locator(".display-options > summary").click();
  const denseBefore = await plan();
  const g = (await view()).groups.find(
    (g) => g.kind === "manual" && g.indices.length > 1,
  );
  assert(g);
  await page.locator("#command-track").scrollIntoViewIfNeeded();
  const box = await page.locator("#command-track").boundingBox();
  await page.mouse.click(box.x + g.x, box.y + g.y);
  const first = await page.locator("#timeline").inputValue();
  await page.locator("#sequence-overlap-next").click();
  assert.notEqual(await page.locator("#timeline").inputValue(), first);
  await page.locator("#sequence-event-zoom").click();
  assert((await view()).span < denseBefore.events.length);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() =>
    document.querySelector(".compact-workspace"),
  );
  if (await page.locator("#simulator").isHidden())
    await page.locator("#toggle-sequence").click();
  await page.locator("#command-track").scrollIntoViewIfNeeded();
  assert(
    await page
      .locator("#simulator")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  );
  await page.screenshot({ path: "test-results/cleanup-mobile.png" });
  assert.deepEqual(await plan(), denseBefore);
  const denseProject = await project();
  await page.locator("#undo").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().name !== "Dense cleanup" &&
      window.studio.getPlan(),
  );
  await page.locator("#redo").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().name === "Dense cleanup" &&
      window.studio.getPlan(),
  );
  assert.deepEqual(await project(), denseProject);
  assert.deepEqual((await plan()).events, denseBefore.events);
  const performanceResult = await page.evaluate(async () => {
    const { estimateCleanup, drawCleanupOverlay } = await import(
      "./src/manual-cleanup.js"
    );
    const events = Array.from({ length: 250000 }, (_, i) => ({
      cmd: i % 5 === 0 ? "jump" : "stitch",
      x: i % 90,
      y: i % 80,
      color: "#002b80",
    }));
    const start = performance.now(),
      report = estimateCleanup(events, { format: "pes" });
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    const renderStart = performance.now();
    drawCleanupOverlay(ctx, report, { scale: 2, end: events.length });
    const pixels = ctx.getImageData(0, 0, 400, 300).data;
    let red = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        pixels[i] > 150 &&
        pixels[i] > pixels[i + 1] * 1.4 &&
        pixels[i] > pixels[i + 2] * 1.4
      )
        red++;
    return {
      estimateMs: renderStart - start,
      renderMs: performance.now() - renderStart,
      count: report.candidates.length,
      red,
    };
  });
  assert.equal(performanceResult.count, 49999);
  assert(performanceResult.red > 100);
  assert(
    performanceResult.estimateMs + performanceResult.renderMs < 6000,
    JSON.stringify(performanceResult),
  );
  console.log("250k-command actual canvas", performanceResult);
  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  touch.on("pageerror", (e) => errors.push(e.stack));
  await touch.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await touch.waitForFunction(() => window.studio?.getPlan());
  await touch.locator("#file-input").setInputFiles({
    name: "touch.embstudio",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await touch.locator("#dialog-submit").tap();
  await touch.waitForFunction(
    (n) => window.studio.getProject().name === n && window.studio.getPlan(),
    original.name,
  );
  await touch.locator("#preview-tab").tap();
  await touch.locator(".display-options > summary").tap();
  await touch.locator("#show-manual-trims").tap();
  await touch.locator(".display-options > summary").tap();
  await touch.locator("#command-track").scrollIntoViewIfNeeded();
  await touch.waitForFunction(() =>
    window.studio.getSequenceView().groups.some((g) => g.kind === "manual"),
  );
  const touchMarker = await touch.evaluate(() =>
    window.studio.getSequenceView().groups.find((g) => g.kind === "manual"),
  );
  await touch
    .locator("#command-track")
    .tap({ position: { x: touchMarker.x, y: touchMarker.y } });
  assert.match(
    await touch.locator("#sequence-event-description").textContent(),
    /Estimated manual cleanup/,
  );
  await touch.screenshot({ path: "test-results/cleanup-touch.png" });
  await touch.close();
  assert.deepEqual(errors, []);
  console.log(
    "Cleanup preview: sewn-anchor grouping, trim-dependent/JEF states, real red pixels, independent toggles, marker hover/navigation, clusters/zoom/pan/keyboard/mobile, imported provenance/reload, unchanged project/commands and byte-identical decoded PES pass.",
  );
} finally {
  await browser.close();
}
