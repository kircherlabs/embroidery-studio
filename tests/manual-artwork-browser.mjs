import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { curveRings, mapPoint } from "../src/smart-geometry.js";
import { object } from "../src/model.js";
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
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  const project = () => page.evaluate(() => window.studio.getProject());
  const plan = () => page.evaluate(() => window.studio.getPlan());
  const pick = (id) => page.locator(`[data-select="${id}"]`).click();
  const world = async (p) =>
    page.evaluate((p) => {
      const r = document.getElementById("stage").getBoundingClientRect(),
        v = window.studio.getView();
      return {
        x: r.x + v.center.x + p.x * v.scale,
        y: r.y + v.center.y + p.y * v.scale,
      };
    }, p);
  const drag = async (a, b, alt = false) => {
    a = await world(a);
    b = await world(b);
    if (alt) await page.keyboard.down("Alt");
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    if (alt) await page.keyboard.up("Alt");
    await ready();
  };
  const field = async (id, value) => {
    const el = page.locator("#" + id);
    await el.evaluate((el) => {
      for (let p = el.parentElement; p; p = p.parentElement)
        if (p.tagName === "DETAILS") p.open = true;
    });
    await el.fill(String(value));
    await el.press("Tab");
    await ready();
  };
  const near = (a, b, t = 0.02) => assert(Math.abs(a - b) <= t, `${a} != ${b}`);
  const images = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#ff0000";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#0000ff";
    g.fillRect(128, 0, 128, 128);
    return {
      png: c.toDataURL("image/png"),
      jpg: c.toDataURL("image/jpeg", 0.95),
      webp: c.toDataURL("image/webp", 0.95),
    };
  });
  const importImage = async (
    name,
    data,
    mode = "reference",
    storage = "original",
  ) => {
    await page.locator("#file-input").setInputFiles({
      name,
      mimeType: name.endsWith(".jpg")
        ? "image/jpeg"
        : name.endsWith(".webp")
          ? "image/webp"
          : "image/png",
      buffer: Buffer.from(data.split(",")[1], "base64"),
    });
    await page.waitForSelector("#image-import-mode");
    assert.equal(
      await page.locator("#image-import-mode").inputValue(),
      "reference",
    );
    await page.locator("#image-import-mode").selectOption(mode);
    if (mode === "reference") {
      await page.locator("#reference-storage summary").click();
      await page.locator("#reference-storage-mode").selectOption(storage);
    }
    await page.locator("#dialog-submit").click();
  };
  await ready();
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () => !window.studio.getProject().objects.length && window.studio.getPlan(),
  );
  await importImage("Manual reference.png", images.png);
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.some((o) => o.type === "reference") &&
      window.studio.getPlan(),
  );
  let p = await project(),
    ref = p.objects[0],
    asset = p.referenceAssets[ref.reference.assetId];
  assert(ref.locked);
  assert.equal(asset.data, images.png);
  assert.equal(asset.width, 256);
  assert.equal(ref.rings[0].length, 4);
  assert.equal((await plan()).events.length, 0);
  assert.equal(await page.locator("#stitch-type").count(), 0);
  assert(
    (await page.locator("#properties").innerText()).includes("no stitches"),
  );
  // Reference is actually painted, rather than only represented in project JSON.
  const sampled = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 100));
    const canvas = document.getElementById("stage"),
      v = window.studio.getView(),
      d = devicePixelRatio;
    return [
      ...canvas
        .getContext("2d")
        .getImageData(
          Math.round((v.center.x - 30 * v.scale) * d),
          Math.round(v.center.y * d),
          1,
          1,
        ).data,
    ];
  });
  assert(sampled[0] - sampled[1] > 40, JSON.stringify(sampled));
  // Locked image does not intercept creating ordinary embroidery artwork.
  await page.locator('[data-tool="rect"]').click();
  await drag({ x: -8, y: -6 }, { x: 8, y: 6 });
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 2 &&
      window.studio.getPlan(),
  );
  await page.locator('[data-tool="pen"]').click();
  await drag({ x: -12, y: 8 }, { x: -10, y: 3 });
  await drag({ x: 10, y: 9 }, { x: 13, y: 3 });
  await page.locator("#finish-draw").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.some((o) => o.curve) &&
      window.studio.getPlan(),
  );
  const artwork = (await project()).objects.find((o) => o.type !== "reference"),
    artBefore = structuredClone(artwork),
    sewing = await plan();
  assert(sewing.stats.stitches > 0);
  assert(sewing.events.every((e) => e.objectId !== ref.id));
  await pick(ref.id);
  await page.locator("#edit-reference").click();
  await ready();
  assert(!(await project()).objects.find((o) => o.id === ref.id).locked);
  // Several pointermove events must not compound the image frame transformation.
  await drag({ x: 30, y: 0 }, { x: 33, y: 4 }, true);
  p = await project();
  ref = p.objects.find((o) => o.id === ref.id);
  near(ref.reference.frame[4], 3);
  near(ref.reference.frame[5], 4);
  assert.deepEqual(
    p.objects.find((o) => o.id === artwork.id),
    artBefore,
  );
  await drag({ x: 43, y: 24 }, { x: 51, y: 28 }, true);
  ref = (await project()).objects.find((o) => o.id === ref.id);
  near(ref.reference.frame[0], 88);
  near(ref.reference.frame[3], 44);
  await page.locator("#proportional").uncheck();
  await field("size-h", 32);
  await field("rotate", 25);
  await field("pos-x", 250);
  await page.locator("#reference-opacity").focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 37; i++) await page.keyboard.press("ArrowRight");
  await ready();
  ref = (await project()).objects.find((o) => o.id === ref.id);
  near(ref.reference.opacity, 0.37);
  assert(Math.abs(ref.reference.frame[1]) > 1);
  assert.deepEqual((await plan()).events, sewing.events);
  assert((await plan()).stats.fits);
  assert.equal((await plan()).issues.length, sewing.issues.length);
  await page.locator(`[data-visibility="${ref.id}"]`).click();
  await ready();
  assert.deepEqual((await plan()).stats, sewing.stats);
  const originalRef = structuredClone(
    (await project()).objects.find((o) => o.id === ref.id),
  );
  await page.locator("#duplicate").click();
  await ready();
  p = await project();
  assert.equal(p.objects.filter((o) => o.type === "reference").length, 2);
  assert.equal(Object.keys(p.referenceAssets).length, 1);
  assert.deepEqual(
    p.objects.find((o) => o.id === ref.id),
    originalRef,
  );
  const copy = p.objects.find((o) => o.type === "reference" && o.id !== ref.id);
  await page.locator("#delete").click();
  await ready();
  assert.equal(
    (await project()).objects.filter((o) => o.type === "reference").length,
    1,
  );
  await pick(ref.id);
  await page.locator("#reference-name").fill("Drawing guide");
  await page.locator("#reference-name").press("Tab");
  await ready();
  await page.locator("#edit-reference").click();
  await ready();
  assert((await project()).objects.find((o) => o.id === ref.id).locked);
  await page.locator("#edit-reference").click();
  await ready();
  await page.locator("#delete").click();
  await ready();
  assert.equal(Object.keys((await project()).referenceAssets).length, 0);
  await page.locator("#undo").click();
  await ready();
  await pick(ref.id);
  assert.equal(
    (await project()).referenceAssets[ref.reference.assetId].data,
    images.png,
  );
  await page.locator("#edit-reference").click();
  await ready();
  const saving = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const download = await saving,
    saved = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(saved.referenceAssets[ref.reference.assetId].data, images.png);
  assert.equal(
    saved.objects.find((o) => o.id === ref.id).name,
    "Drawing guide",
  );
  await page.waitForFunction(
    () =>
      localStorage.getItem("embroidery-studio-v1") ===
      JSON.stringify(window.studio.getProject()),
  );
  await page.reload();
  await ready();
  assert.deepEqual((await project()).referenceAssets, saved.referenceAssets);
  // JPEG is preserved byte-for-byte; optimization is a separate informed choice.
  await importImage("Photo.jpg", images.jpg);
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.filter((o) => o.type === "reference")
        .length === 2 && window.studio.getPlan(),
  );
  p = await project();
  assert(Object.values(p.referenceAssets).some((a) => a.data === images.jpg));
  const large = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 4200;
    c.height = 2100;
    const g = c.getContext("2d");
    g.fillStyle = "orange";
    g.fillRect(0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.95);
  });
  await importImage("Large.jpg", large, "reference", "optimized");
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.filter((o) => o.type === "reference")
        .length === 3 && window.studio.getPlan(),
  );
  p = await project();
  const optimized = Object.values(p.referenceAssets).find((a) => a.optimized);
  assert(optimized);
  assert.equal(optimized.width, 2048);
  assert.equal(optimized.height, 1024);
  assert.equal(optimized.originalWidth, 4200);
  assert.notEqual(optimized.data, large);
  await importImage("Extra.webp", images.webp);
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.filter((o) => o.type === "reference")
        .length === 4 && window.studio.getPlan(),
  );
  assert(
    Object.values((await project()).referenceAssets).some(
      (a) => a.data === images.webp,
    ),
  );
  // Existing automatic tracing retains its complete preview/settings workflow.
  await importImage("Trace.png", images.png, "trace");
  await page.waitForSelector("#trace-preview");
  await page.locator("#raster-colors").fill("2");
  await page.locator("#raster-bg").uncheck();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().groups?.some((g) => g.imageSource) &&
      window.studio.getPlan(),
  );
  assert.equal(
    (await project()).objects.filter((o) => o.type === "reference").length,
    4,
  );
  // Reopen the actual saved project, not a reduced in-memory fixture.
  await page.locator("#file-input").setInputFiles({
    name: "Manual.embstudio",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.filter((o) => o.type === "reference")
        .length === 1 && window.studio.getPlan(),
  );
  assert.deepEqual((await project()).referenceAssets, saved.referenceAssets);
  // Editable asymmetric Bézier paths; Arrange and the canvas context menu use
  // the same real geometric reflection. Node handles remain editable afterwards.
  const curve = {
      closed: false,
      frame: [1, 0, 0, 1, 0, 0],
      nodes: [
        { x: -16, y: -8, out: { x: -9, y: -16 } },
        { x: 4, y: -2, in: { x: -2, y: 6 }, out: { x: 10, y: 2 } },
        { x: 13, y: 10, in: { x: 18, y: 4 } },
      ],
    },
    curveObject = object("Manual Bézier", curveRings(curve), {
      type: "run",
      closed: false,
      curve,
      underlay: false,
    });
  const caseProject = {
    ...saved,
    name: "Flip path",
    objects: [...saved.objects, curveObject],
  };
  await page.locator("#file-input").setInputFiles({
    name: "Flip.embstudio",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(caseProject)),
  });
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().name === "Flip path" &&
      window.studio.getPlan(),
  );
  await pick(curveObject.id);
  const before = structuredClone(
      (await project()).objects.find((o) => o.id === curveObject.id),
    ),
    points = before.rings.flat(),
    cx =
      (Math.min(...points.map((p) => p.x)) +
        Math.max(...points.map((p) => p.x))) /
      2;
  await page.locator("#arrange-selection").click();
  await page.locator('[data-arrange="flip-horizontal"]').click();
  await ready();
  let flipped = (await project()).objects.find((o) => o.id === curveObject.id);
  flipped.rings.flat().forEach((q, i) => {
    near(q.x, 2 * cx - points[i].x, 1e-6);
    near(q.y, points[i].y, 1e-6);
  });
  assert(flipped.curve);
  assert.equal(flipped.curve.closed, false);
  assert.deepEqual(
    (await project()).objects.find((o) => o.id === artwork.id),
    saved.objects.find((o) => o.id === artwork.id),
  );
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(
    (await project()).objects.find((o) => o.id === curveObject.id),
    before,
  );
  await page.locator("#redo").click();
  await ready();
  await pick(curveObject.id);
  assert.deepEqual(
    (await project()).objects.find((o) => o.id === curveObject.id),
    flipped,
  );
  await page.locator('[data-tool="node"]').click();
  const handle = mapPoint(flipped.curve.nodes[0].out, flipped.curve.frame);
  await drag(handle, { x: handle.x + 2, y: handle.y - 1 }, true);
  assert.notDeepEqual(
    (await project()).objects.find((o) => o.id === curveObject.id).curve,
    flipped.curve,
  );
  await page.locator("#undo").click();
  await ready();
  await pick(curveObject.id);
  const center = await world({ x: cx, y: 0 });
  await page.mouse.click(center.x, center.y, { button: "right" });
  assert(await page.locator('[data-arrange="flip-vertical"]').isVisible());
  await page.locator('[data-arrange="flip-vertical"]').click();
  await ready();
  flipped = (await project()).objects.find((o) => o.id === curveObject.id);
  assert(flipped.curve.frame[3] < 0);
  // Draw one half, duplicate, flip the copy: the original remains unchanged.
  await pick(curveObject.id);
  const originalHalf = structuredClone(
    (await project()).objects.find((o) => o.id === curveObject.id),
  );
  await page.locator("#duplicate").click();
  await ready();
  const duplicateId = (await page.evaluate(() => window.studio.getSelection()))
    .objects[0];
  await page.locator("#arrange-selection").click();
  await page.locator('[data-arrange="flip-horizontal"]').click();
  await ready();
  assert.deepEqual(
    (await project()).objects.find((o) => o.id === curveObject.id),
    originalHalf,
  );
  assert.notEqual(duplicateId, curveObject.id);
  // Actual SVG import includes nested source transforms and an evenodd counter.
  const previousIds = new Set((await project()).objects.map((o) => o.id));
  await page.locator("#file-input").setInputFiles({
    name: "Mirror.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30"><g id="Outer" transform="translate(2 3)"><g id="Nested" transform="rotate(15 12 12)"><path fill="#222222" fill-rule="evenodd" d="M4 4H18V24H4ZM8 9V19H13V9Z"/></g><path fill="#cc3355" d="M22 6L35 12L24 24Z"/></g></svg>',
    ),
  });
  await page.waitForFunction(
    (count) =>
      window.studio.getProject().objects.length > count &&
      window.studio.getPlan(),
    previousIds.size,
  );
  const imported = (await project()).objects.filter(
      (o) => !previousIds.has(o.id),
    ),
    svgBounds = imported.flatMap((o) => o.rings.flat()),
    svgCenter =
      (Math.min(...svgBounds.map((q) => q.x)) +
        Math.max(...svgBounds.map((q) => q.x))) /
      2;
  await page.locator("#arrange-selection").click();
  await page.locator('[data-arrange="flip-horizontal"]').click();
  await ready();
  for (const old of imported) {
    const next = (await project()).objects.find((o) => o.id === old.id);
    assert.equal(next.parentId, old.parentId);
    next.rings.flat().forEach((q, i) => {
      near(q.x, 2 * svgCenter - old.rings.flat()[i].x, 1e-6);
      near(q.y, old.rings.flat()[i].y, 1e-6);
    });
  }
  // Live lettering is never silently reversed or converted to fixed outlines.
  const beforeLetteringCount = (await project()).objects.length;
  await page.locator("#text-tool").click();
  await page.locator("#text-value").fill("AB");
  await page.locator("#text-height").fill("12");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction((count) => {
    const p = window.studio.getProject();
    return (
      p.objects.length === count + 1 &&
      p.objects.at(-1).textSource?.content === "AB" &&
      window.studio.getPlan()
    );
  }, beforeLetteringCount);
  const text = (await project()).objects.at(-1);
  await page.locator("#arrange-selection").click();
  await page.locator('[data-arrange="flip-horizontal"]').click();
  await page.waitForSelector("#dialog-submit");
  assert(
    (await page.locator("#dialog-content").innerText()).includes("backwards"),
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(
    (await project()).objects.find((o) => o.id === text.id),
    text,
  );
  await page.locator("#arrange-selection").click();
  await page.locator('[data-arrange="flip-horizontal"]').click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction((id) => {
    const text = window.studio.getProject().objects.find((o) => o.id === id);
    return text?.textSource?.frame[0] < 0 && window.studio.getPlan();
  }, text.id);
  let mirroredText = (await project()).objects.find((o) => o.id === text.id);
  assert(mirroredText.textSource.frame[0] < 0);
  assert.equal(mirroredText.textSource.content, "AB");
  await page.locator("#live-font").selectOption("sans-serif");
  await ready();
  mirroredText = (await project()).objects.find((o) => o.id === text.id);
  assert(mirroredText.textSource.frame[0] < 0);
  assert.equal(mirroredText.id, text.id);
  await pick(ref.id);
  await page.locator("#edit-reference").click();
  await ready();
  await field("pos-x", 0);
  await page.locator(`[data-visibility="${ref.id}"]`).click();
  await ready();
  await page.locator("#edit-reference").click();
  await ready();
  await page.screenshot({ path: "test-results/manual-reference-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toggle-inspector").click();
  await page.locator("#edit-reference").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/manual-reference-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Manual artwork: PNG/JPEG references, shared/optimized storage, painting, edit/lock/hide, canvas transforms, drawing over images, save/reload, tracing, flips/context menu, Bézier nodes, duplication, lettering confirmation and mobile passed.",
  );
} finally {
  await browser.close();
}
