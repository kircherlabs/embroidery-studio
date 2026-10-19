import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
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
      viewport: { width: 1440, height: 960 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    root = page.locator(".drawing-style"),
    summary = page.locator(".drawing-style > summary"),
    panel = page.locator(".drawing-style-panel"),
    chooser = page.locator("#draw-style"),
    apply = page.locator("#apply-draw-style");
  const open = async () => {
    if (!(await root.evaluate((e) => e.open))) await summary.click();
  };
  const assertLayout = async () => {
    await page.waitForFunction(() => {
      const p = document
        .querySelector(".drawing-style-panel")
        .getBoundingClientRect();
      // Native details toggle and resize callbacks run after the viewport change.
      // Measure only once positioning has settled on every axis.
      return (
        p.top >= 7 &&
        p.bottom <= innerHeight - 7 &&
        p.left >= 7 &&
        p.right <= innerWidth - 7
      );
    });
    const r = await panel.boundingBox(),
      s = await chooser.boundingBox();
    assert(
      s.x >= r.x + 8 && s.x + s.width <= r.x + r.width - 8,
      "dropdown stays inside popup",
    );
    assert(
      r.x >= 7 && r.x + r.width <= (await page.viewportSize()).width - 7,
      "popup fits viewport",
    );
    assert.equal(
      await panel.evaluate((e) => getComputedStyle(e).color),
      "rgb(220, 228, 223)",
    );
    assert.equal(
      await chooser
        .locator("..")
        .evaluate((e) => getComputedStyle(e).whiteSpace),
      "normal",
    );
  };
  await ready();
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 0 &&
      window.studio.getPlan(),
  );
  const initialSummary = await summary.boundingBox();
  await open();
  await assertLayout();
  const openSummary = await summary.boundingBox();
  assert(
    Math.abs(openSummary.x - initialSummary.x) < 1 &&
      Math.abs(openSummary.y - initialSummary.y) < 1,
    "trigger does not jump when opened",
  );
  assert(await apply.isDisabled());
  assert(
    (await page.locator("#draw-style-selection").innerText()).includes(
      "Select editable",
    ),
  );
  await chooser.selectOption("combined");
  await chooser.press("Escape");
  assert(!(await root.evaluate((e) => e.open)));
  assert(await summary.evaluate((e) => e === document.activeElement));
  const drag = async (tool, a, b) => {
    const n = (await project()).objects.length;
    await page.locator(`[data-tool="${tool}"]`).click();
    const coords = await page.evaluate(
      ({ a, b }) => {
        const r = document.getElementById("stage").getBoundingClientRect(),
          v = window.studio.getView();
        return [a, b].map(([x, y]) => ({
          x: r.x + v.center.x + x * v.scale,
          y: r.y + v.center.y + y * v.scale,
        }));
      },
      { a, b },
    );
    await page.mouse.move(coords[0].x, coords[0].y);
    await page.mouse.down();
    await page.mouse.move(coords[1].x, coords[1].y, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(
      (n) =>
        window.studio.getProject().objects.length === n + 1 &&
        window.studio.getPlan(),
      n,
    );
    return (await project()).objects.at(-1);
  };
  const methods = {
    combined: ["fill", "run"],
    run: ["run"],
    border: ["border"],
    auto: ["fill"],
  };
  for (const [style, types] of Object.entries(methods)) {
    await open();
    await chooser.selectOption(style);
    await chooser.press("Escape");
    const o = await drag(
      style === "run" ? "ellipse" : "rect",
      [-18, -10],
      [18, 10],
    );
    assert.deepEqual(o.operations?.map((op) => op.type) || [o.type], types);
    const plan = await page.evaluate(() => window.studio.getPlan());
    assert(plan.events.some((e) => e.objectId === o.id && e.cmd === "stitch"));
    for (const op of o.operations || [])
      assert(
        plan.events.some((e) => e.operationId === op.id && e.cmd === "stitch"),
      );
  }
  // Choosing a default never silently alters an existing selection.
  const before = await project(),
    selection = await page.evaluate(() => window.studio.getSelection().ids);
  await open();
  await chooser.selectOption("run");
  assert.deepEqual(await project(), before);
  await chooser.press("Escape");
  assert.deepEqual(
    await page.evaluate(() => window.studio.getSelection().ids),
    selection,
  );
  await open();
  await apply.click();
  await ready();
  let edited = (await project()).objects.at(-1);
  assert.deepEqual(
    edited.operations.map((op) => op.type),
    ["run"],
  );
  assert.deepEqual(edited.rings, before.objects.at(-1).rings);
  await page.keyboard.press("Control+z");
  await ready();
  assert.deepEqual((await project()).objects.at(-1), before.objects.at(-1));
  await page.keyboard.press("Control+Shift+z");
  await ready();
  assert.deepEqual(
    (await project()).objects.at(-1).operations.map((op) => op.type),
    ["run"],
  );
  // SVG parent selection applies real operations to descendants, with a protected stack replacement.
  const n = (await project()).objects.length;
  await page.locator("#file-input").setInputFiles({
    name: "Style.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 30"><g id="Shapes"><rect x="0" y="0" width="15" height="15" fill="red"/><path d="M25 0L45 0L35 15Z" fill="blue"/></g></svg>',
    ),
  });
  await page.waitForFunction(
    (n) =>
      window.studio.getProject().objects.length > n && window.studio.getPlan(),
    n,
  );
  const imported = (await project()).objects.slice(n);
  await open();
  await chooser.selectOption("combined");
  await apply.click();
  await ready();
  for (const old of imported) {
    const next = (await project()).objects.find((o) => o.id === old.id);
    assert.deepEqual(next.rings, old.rings);
    assert.deepEqual(
      next.operations.map((op) => op.type),
      ["fill", "run"],
    );
  }
  const combined = await project();
  await open();
  await chooser.selectOption("border");
  await apply.click();
  await page.locator("#dialog[open]").waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(await project(), combined);
  await open();
  await apply.click();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    (ids) =>
      ids.every(
        (id) =>
          window.studio.getProject().objects.find((o) => o.id === id).operations
            .length === 1,
      ) && window.studio.getPlan(),
    imported.map((o) => o.id),
  );
  for (const old of imported)
    assert.deepEqual(
      (await project()).objects
        .find((o) => o.id === old.id)
        .operations.map((op) => op.type),
      ["border"],
    );
  const saved = await project();
  await page.waitForFunction(
    () =>
      document.getElementById("save-status").textContent ===
      "Saved on this device",
  );
  await page.reload();
  await ready();
  assert.deepEqual(await project(), saved);
  await open();
  assert.equal(await chooser.inputValue(), "border");
  await assertLayout();
  await page.screenshot({ path: "test-results/drawing-style-desktop.png" });
  // Keyboard/touch use, dismissal and overflow at small, short and tablet sizes.
  await chooser.press("Escape");
  await page
    .locator("#show-stitches")
    .evaluate((e) => (e.closest("details").open = false));
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [844, 390],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await open();
    await assertLayout();
    await chooser.focus();
    await chooser.selectOption("combined");
    await chooser.press("Escape");
    assert(!(await root.evaluate((e) => e.open)));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  await page.screenshot({ path: "test-results/drawing-style-mobile.png" });
  await page.locator("#stage").click({ position: { x: 30, y: 30 } });
  assert(!(await root.evaluate((e) => e.open)));
  assert.deepEqual(errors, []);
  console.log(
    "Drawing style: bounded/legible popup, stable trigger, keyboard dismissal, all new-shape styles, explicit selected/SVG application, confirmation, undo/redo, persistence and four responsive layouts passed.",
  );
} finally {
  await browser.close();
}
