import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
      viewport: { width: 1500, height: 1100 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  const project = () => page.evaluate(() => window.studio.getProject());
  const selection = () => page.evaluate(() => window.studio.getSelection());
  const pick = (id) => page.locator(`[data-select="${id}"]`).click();
  await ready();
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await ready();
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><g id="Artwork"><g id="Pair" transform="translate(5 4)"><rect id="Left" x="0" y="0" width="20" height="25" fill="#aabbcc"/><rect id="Right" x="30" y="0" width="20" height="25" fill="#cc8899"/></g><path id="Accent" d="M10 45H60V55H10Z" fill="#aabbcc"/></g></svg>';
  await page.locator("#file-input").setInputFiles([
    {
      name: "Dogs.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(source),
    },
    {
      name: "Border.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="30" r="25" fill="#6689a5"/></svg>',
      ),
    },
  ]);
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 4 &&
      window.studio.getPlan(),
  );
  let p = await project();
  const svg = p.groups.filter((g) => g.kind === "svg"),
    first = svg[0].id,
    second = svg[1].id,
    a = p.objects[0].id,
    b = p.objects[1].id,
    c = p.objects[3].id;
  assert.deepEqual(
    svg.map((g) => g.name),
    ["Dogs.svg", "Border.svg"],
  );
  assert(p.groups.some((g) => g.name === "Pair"));
  assert(p.groups.some((g) => g.name === "Artwork"));
  await pick(first);
  assert.equal((await selection()).objects.length, 3);
  await page.locator("#spacing").fill("0.6");
  await page.locator("#spacing").press("Tab");
  await ready();
  p = await project();
  assert(
    p.objects
      .slice(0, 3)
      .every((o) => (o.operations?.[0] || o).spacing === 0.6),
  );
  assert.equal(p.objects[3].spacing, 0.42);
  const before = p.objects
    .slice(0, 3)
    .flatMap((o) => o.rings.flat().map((q) => ({ ...q })));
  await page.locator("#stage").focus();
  await page.keyboard.press("Control+a");
  assert.equal((await selection()).objects.length, 4);
  await page.locator('[data-color="#e6ab43"]').click();
  await ready();
  assert(
    (await project()).objects.every(
      (o) => (o.operations?.[0] || o).color === "#e6ab43",
    ),
  );
  await page.locator("#undo").click();
  await ready();
  await page.locator("#stage").focus();
  await page.keyboard.press("Control+a");
  await page.locator("#stitch-type").selectOption("run");
  await ready();
  assert(
    (await project()).objects.every((o) => o.operations?.[0].type === "run"),
  );
  await page.locator("#undo").click();
  await ready();
  await pick(a);
  await page.locator("#stitch-type").selectOption("run");
  await ready();
  await page.locator(`[data-select="${c}"]`).click({ modifiers: ["Shift"] });
  await page.locator("#spacing").fill(".8");
  await page.locator("#spacing").press("Tab");
  await ready();
  assert.equal((await project()).objects[0].operations[0].spacing, 0.6);
  assert.equal((await project()).objects[3].operations[0].spacing, 0.8);
  await page.locator("#undo").click();
  await ready();
  await page.locator("#undo").click();
  await ready();
  await pick(first);
  const bbox = (pts) => ({
    minX: Math.min(...pts.map((q) => q.x)),
    maxX: Math.max(...pts.map((q) => q.x)),
    minY: Math.min(...pts.map((q) => q.y)),
    maxY: Math.max(...pts.map((q) => q.y)),
  });
  const frame = () =>
    page.evaluate(() => {
      const r = document.getElementById("stage").getBoundingClientRect(),
        v = window.studio.getView();
      return {
        x: r.x + v.center.x,
        y: r.y + v.center.y,
        scale: v.scale,
      };
    });
  await page.locator("#zoom-fit").click();
  const f = await frame(),
    old = bbox(before),
    toScreen = (q) => ({ x: f.x + q.x * f.scale, y: f.y + q.y * f.scale });
  const corner = toScreen({ x: old.maxX, y: old.maxY }),
    target = toScreen({
      x: old.minX + (old.maxX - old.minX) * 0.75,
      y: old.minY + (old.maxY - old.minY) * 0.75,
    });
  await page.keyboard.press("Escape");
  const boxStart = toScreen({ x: -49, y: -49 }),
    boxEnd = toScreen({ x: 49, y: 49 });
  await page.mouse.move(boxStart.x, boxStart.y);
  await page.mouse.down();
  await page.mouse.move(boxEnd.x, boxEnd.y, { steps: 8 });
  await page.mouse.up();
  assert.equal((await selection()).objects.length, 4);
  await pick(first);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await ready();
  let changed = (await project()).objects
    .slice(0, 3)
    .flatMap((o) => o.rings.flat());
  changed.forEach((q, i) => {
    assert(Math.abs(q.x - (old.minX + (before[i].x - old.minX) * 0.75)) < 0.3);
    assert(Math.abs(q.y - (old.minY + (before[i].y - old.minY) * 0.75)) < 0.3);
  });
  await page.keyboard.press("Control+z");
  await ready();
  assert.deepEqual(
    (await project()).objects.slice(0, 3).flatMap((o) => o.rings.flat()),
    before,
  );
  await page.keyboard.press("Control+Shift+z");
  await ready();
  await pick(first);
  const scaled = bbox(
      (await project()).objects.slice(0, 3).flatMap((o) => o.rings.flat()),
    ),
    center = {
      x: (scaled.minX + scaled.maxX) / 2,
      y: (scaled.minY + scaled.maxY) / 2,
    };
  const handle = toScreen({ x: center.x, y: scaled.minY - 22 / f.scale }),
    rotation = toScreen({
      x: center.x + center.y - scaled.minY + 22 / f.scale,
      y: center.y,
    });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(rotation.x, rotation.y, { steps: 12 });
  await page.mouse.up();
  await ready();
  const rotated = bbox(
    (await project()).objects.slice(0, 3).flatMap((o) => o.rings.flat()),
  );
  assert(
    Math.abs(rotated.maxX - rotated.minX - (scaled.maxY - scaled.minY)) < 0.4,
  );
  assert(
    (await project()).objects
      .slice(0, 3)
      .every((o) => Math.abs(o.angle - 55) < 1),
  );
  await pick(a);
  await page.locator(`[data-select="${c}"]`).click({ modifiers: ["Shift"] });
  assert.deepEqual(new Set((await selection()).objects), new Set([a, c]));
  assert.equal(await page.locator("#spacing").inputValue(), "");
  await page.locator("#spacing").fill(".7");
  await page.locator("#spacing").press("Tab");
  await ready();
  p = await project();
  assert.equal((p.objects[0].operations?.[0] || p.objects[0]).spacing, 0.7);
  assert.equal((p.objects[3].operations?.[0] || p.objects[3]).spacing, 0.7);
  assert.equal((p.objects[1].operations?.[0] || p.objects[1]).spacing, 0.6);
  await page.locator("#undo").click();
  await ready();
  await pick(first);
  const lockedSource = JSON.stringify((await project()).objects),
    stats = await page.evaluate(() => window.studio.getPlan().stats.stitches);
  await page.locator(`[data-lock="${first}"]`).click();
  await ready();
  assert.match(
    await page.locator(".selection-summary").innerText(),
    /3 locked/,
  );
  await page.locator("#stage").focus();
  await page.keyboard.press("ArrowRight");
  await ready();
  assert.equal(JSON.stringify((await project()).objects), lockedSource);
  assert.equal(
    await page.evaluate(() => window.studio.getPlan().stats.stitches),
    stats,
  );
  await page.locator(`[data-lock="${first}"]`).click();
  await ready();
  await page.locator(`[data-expand="${first}"]`).click();
  assert.equal(await page.locator(`[data-select="${a}"]`).count(), 0);
  await page.locator(`[data-expand="${first}"]`).click();
  await page.locator("#edit-command").selectOption("isolate");
  assert.equal((await selection()).isolation, first);
  await pick(second);
  assert.equal((await selection()).isolation, null);
  await pick(first);
  await page.locator("#edit-command").selectOption("isolate");
  await page.locator("#exit-isolation").click();
  assert.equal((await selection()).isolation, null);
  await page
    .locator(`[data-select="${second}"]`)
    .click({ modifiers: ["Shift"] });
  await page.locator("#group-selection").click();
  await ready();
  p = await project();
  const parentId = (await selection()).ids[0],
    parent = p.groups.find((g) => g.id === parentId);
  assert(parent);
  assert(
    p.groups
      .filter((g) => g.kind === "svg")
      .every((g) => g.parentId === parent.id),
  );
  await page.locator("#ungroup-selection").click();
  await ready();
  assert(
    (await project()).groups
      .filter((g) => g.kind === "svg")
      .every((g) => !g.parentId),
  );
  await page.locator("#stage").focus();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await ready();
  assert.equal((await project()).objects.length, 8);
  await page.keyboard.press("Delete");
  await ready();
  assert.equal((await project()).objects.length, 4);
  await pick(a);
  await page.locator("#applique-recipe").click();
  await page.locator("#construction-mode").selectOption("direct");
  await page.locator("#dialog-submit").click();
  await ready();
  p = await project();
  const ops = p.objects[0].operations;
  assert.equal(ops.length, 5);
  assert.equal(
    await page.evaluate(() => window.studio.getPlan().stats.stops),
    2,
  );
  const order = await page.evaluate(() =>
    window.studio
      .getPlan()
      .events.filter(
        (e) =>
          e.objectId === window.studio.getProject().objects[0].id &&
          ["stitch", "stop"].includes(e.cmd),
      )
      .map((e) => e.operationId)
      .filter((id, i, arr) => !i || arr[i - 1] !== id),
  );
  assert.deepEqual(
    order,
    ops.map((op) => op.id),
  );
  await page.locator(`[data-operation="${ops[2].id}"]`).click();
  await page.locator("#length").fill("1.6");
  await page.locator("#length").press("Tab");
  await ready();
  assert.equal((await project()).objects[0].operations[2].length, 1.6);
  assert.equal((await project()).objects[0].operations[0].length, 2.5);
  await page.locator(`[data-op-enabled="${ops[2].id}"]`).uncheck();
  await ready();
  assert(
    !(await page.evaluate(
      (id) => window.studio.getPlan().events.some((e) => e.operationId === id),
      ops[2].id,
    )),
  );
  await page.locator("#undo").click();
  await ready();
  await pick(a);
  await page.locator("#add-operation").selectOption("bean");
  await page.locator("#operation-add").click();
  await ready();
  let added = (await project()).objects[0].operations.at(-1);
  assert.equal(added.type, "bean");
  await page
    .locator(`[data-op-action="copy"][data-op-id="${added.id}"]`)
    .click();
  await ready();
  const copyOp = (await project()).objects[0].operations.at(-1);
  assert.notEqual(copyOp.id, added.id);
  assert.equal((await project()).objects[0].operations.length, 7);
  await page
    .locator(`[data-op-action="delete"][data-op-id="${copyOp.id}"]`)
    .click();
  await ready();
  await page.locator(`[data-op-action="up"][data-op-id="${added.id}"]`).click();
  await ready();
  assert.equal((await project()).objects[0].operations[4].id, added.id);
  await page
    .locator(`[data-op-action="down"][data-op-id="${added.id}"]`)
    .click();
  await ready();
  await page
    .locator(`[data-op-action="delete"][data-op-id="${added.id}"]`)
    .click();
  await ready();
  assert.equal((await project()).objects[0].operations.length, 5);
  await pick(a);
  await page.locator("#preview-tab").click();
  const sequence = await page.evaluate(() =>
    JSON.stringify(window.studio.getPlan().events),
  );
  await page.locator(".display-options > summary").click();
  await page.locator("#preview-selection").check();
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.studio.getPlan().events)),
    sequence,
  );
  await page.locator("#show-events").check();
  await page.screenshot({ path: "test-results/advanced-editor-preview.png" });
  const savedPromise = page.waitForEvent("download");
  await page.locator("#save-project").click();
  await (await savedPromise).saveAs("test-results/advanced-editor.embstudio");
  const saved = JSON.parse(
    await readFile("test-results/advanced-editor.embstudio", "utf8"),
  );
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await ready();
  await page
    .locator("#file-input")
    .setInputFiles("test-results/advanced-editor.embstudio");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    (count) => window.studio.getProject().objects.length === count,
    saved.objects.length,
  );
  await ready();
  assert.deepEqual(await project(), saved);
  if (process.env.TEST_MACHINE === "1") {
    const needle = await page.evaluate(() =>
      window.studio
        .getPlan()
        .events.filter((e) => e.cmd === "stitch")
        .map((e) => [e.x, e.y]),
    );
    await page.locator("#export").click();
    const pending = page.waitForEvent("download", { timeout: 180000 });
    await page.locator("#dialog-submit").click();
    await (await pending).saveAs("test-results/advanced-editor.pes");
    const dec = decodePes(await readFile("test-results/advanced-editor.pes"));
    assert.equal(await page.locator("#preview-selection").isChecked(), false);
    assert.equal(await page.locator("#preview-selection").isDisabled(), true);
    assert.deepEqual(declaredRect(dec.pec), streamExtents(dec.pec));
    assert.equal(
      await page.evaluate(() => window.studio.getPlan().stats.stops),
      2,
    );
    const decoded = dec.pec.events.filter((e) => e.type === "stitch");
    assert.equal(decoded.length, needle.length);
    decoded.forEach((e, i) => {
      assert.equal(e.x, Math.round((needle[i][0] - needle[0][0]) * 10) || 0);
      assert.equal(e.y, Math.round((needle[i][1] - needle[0][1]) * 10) || 0);
    });
  }
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  await mobile.waitForFunction(() => window.studio?.getPlan());
  await mobile.locator("#toggle-layers").click();
  await mobile.locator("#select-all").click();
  assert.equal(
    await mobile.evaluate(() => window.studio.getSelection().objects.length),
    12,
  );
  await mobile.locator("#toggle-layers").click();
  await mobile.locator("#toggle-inspector").click();
  await mobile.locator("#spacing").fill(".6");
  await mobile.locator("#spacing").press("Tab");
  await mobile.waitForFunction(() => window.studio.getPlan());
  assert(
    await mobile.evaluate(() =>
      window.studio
        .getProject()
        .objects.every((o) => (o.operations?.[0] || o).spacing === 0.6),
    ),
  );
  assert(await mobile.evaluate(() => document.body.scrollWidth <= innerWidth));
  await mobile.screenshot({ path: "test-results/advanced-editor-mobile.png" });
  await mobile.locator("#toggle-inspector").click();
  const baseline = await mobile.evaluate(() =>
      JSON.stringify(window.studio.getProject()),
    ),
    touch = await mobile.context().newCDPSession(mobile),
    r = await mobile.locator("#stage").boundingBox(),
    cx = r.x + r.width / 2,
    cy = r.y + r.height / 2;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: cx - 30, y: cy, id: 1 },
      { x: cx + 30, y: cy, id: 2 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: cx - 50, y: cy, id: 1 },
      { x: cx + 50, y: cy, id: 2 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert(
    Number((await mobile.locator("#zoom-value").innerText()).replace("%", "")) >
      120,
  );
  assert.equal(
    await mobile.evaluate(() => JSON.stringify(window.studio.getProject())),
    baseline,
  );
  await mobile.close();
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/advanced-editor-report.json",
    JSON.stringify(
      {
        hierarchy: true,
        multipleSvgImports: true,
        parentResize: true,
        sharedRotation: true,
        mixedBulkEditing: true,
        lockAndIsolation: true,
        copyAndGrouping: true,
        operationOrder: ops.map((op) => op.type),
        stops: 2,
        persistence: true,
        pesRoundTrip: process.env.TEST_MACHINE === "1",
      },
      null,
      2,
    ),
  );
  console.log(
    "Advanced editor: nested SVGs, parent canvas transforms, multiselection, mixed settings, locks, grouping, clipboard, operation order, real stops and persistence passed.",
  );
} finally {
  await browser.close();
}
