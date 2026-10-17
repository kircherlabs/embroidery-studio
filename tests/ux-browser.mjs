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
const base = process.env.STUDIO_URL || "http://127.0.0.1:5173";
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1050 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  const project = () => page.evaluate(() => window.studio.getProject());
  const actual = () =>
    page.evaluate(() => [
      ...new Set(
        window.studio
          .getPlan()
          .events.filter((e) => e.cmd === "stitch")
          .map((e) => e.objectId),
      ),
    ]);
  const selected = () => page.evaluate(() => window.studio.getSelection().ids);
  const drag = async (grip, target, after, horizontal = false) => {
    await grip.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    const a = await grip.boundingBox(),
      b = await target.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      horizontal ? b.x + b.width * (after ? 0.8 : 0.2) : b.x + b.width / 2,
      horizontal ? b.y + b.height / 2 : b.y + b.height * (after ? 0.8 : 0.2),
      { steps: 12 },
    );
    assert(
      await target.evaluate(
        (el) =>
          el.classList.contains("drop-before") ||
          el.classList.contains("drop-after"),
      ),
    );
    await page.mouse.up();
    await ready();
  };
  await page.goto(base);
  await ready();
  const demoStats = await page.evaluate(() => window.studio.getPlan().stats);
  assert.equal(demoStats.colors, 4);
  assert.equal(demoStats.manualChanges, 3);
  assert.equal(await page.locator("#layers-panel #machine").count(), 0);
  assert.equal(await page.locator(".workspace-machine #machine").count(), 1);
  await page.locator("#machine-panel").click();
  await page.locator("#machine").selectOption("brother130");
  await ready();
  assert.match(await page.locator("#hoop-size").innerText(), /130 × 180/);
  await page.locator("#undo").click();
  await ready();
  await page.locator("#machine-panel").click();
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await ready();
  await page.locator("#file-input").setInputFiles({
    name: "Order.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 20"><g id="Regions"><rect id="A" x="0" width="10" height="15" fill="#e6ab43"/><rect id="B" x="30" width="10" height="15" fill="#e5765e"/><rect id="C" x="60" width="10" height="15" fill="#e6ab43"/></g></svg>',
    ),
  });
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 3 &&
      window.studio.getPlan(),
  );
  const p = await project(),
    [a, b, c] = p.objects.map((o) => o.id),
    parent = p.objects[0].parentId;
  const row = (id) => page.locator(`.object-row[data-reorder-id="${id}"]`);
  const pick = (id) => page.locator(`[data-select="${id}"]`).click();
  await row(a).click({ position: { x: 3, y: 2 } });
  assert.deepEqual(await selected(), [a]);
  await page.locator(`[data-select="${b}"]`).click({ modifiers: ["Control"] });
  assert.deepEqual(new Set(await selected()), new Set([a, b]));
  await page.locator(`[data-check="${b}"]`).focus();
  await page.keyboard.press("Space");
  assert.deepEqual(await selected(), [a]);
  assert.equal(
    await page
      .locator(`[data-check="${b}"]`)
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.keyboard.press("Space");
  assert.deepEqual(new Set(await selected()), new Set([a, b]));
  await page.locator(`[data-visibility="${c}"]`).click();
  await ready();
  assert.equal(
    await row(c)
      .getAttribute("class")
      .then((s) => s.includes("hidden")),
    true,
  );
  assert.equal(await page.locator(`[data-visibility="${c}"] svg`).count(), 1);
  assert(!(await actual()).includes(c));
  assert.deepEqual(new Set(await selected()), new Set([a, b]));
  await page.locator("#undo").click();
  await ready();
  await page.locator(`[data-visibility="${c}"]`).focus();
  assert.match(
    await page.locator("#control-description").innerText(),
    /stitch|embroidery/i,
  );
  assert.equal(
    await page
      .locator(`[data-visibility="${c}"]`)
      .getAttribute("aria-describedby"),
    "control-description",
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#control-description").isVisible(), false);
  await pick(a);
  await page.locator(`[data-check="${b}"]`).click();
  await drag(row(a).locator("[data-tree-grip]"), row(c), true);
  let changed = await project();
  assert.deepEqual(
    changed.objects.map((o) => o.id),
    [c, a, b],
  );
  assert(changed.objects.every((o) => o.parentId === parent));
  assert.deepEqual(await actual(), [c, a, b]);
  assert.equal(changed.sequencing.origin, "tree");
  assert.match(await page.locator("#order-relationship").innerText(), /Linked/);
  assert.equal(await page.locator("#optimize-colors").isDisabled(), true);
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(
    (await project()).objects.map((o) => o.id),
    [a, b, c],
  );
  assert.equal((await project()).sequencing, undefined);
  await page.locator("#redo").click();
  await ready();
  await page.locator("#preview-tab").click();
  const chip = (id) => page.locator(`.sewing-object[data-reorder-id="${id}"]`);
  await drag(chip(b).locator("[data-sew-grip]"), chip(c), false, true);
  assert.deepEqual(await actual(), [b, c, a]);
  assert.deepEqual(
    (await project()).objects.map((o) => o.id),
    [c, a, b],
  );
  assert.match(
    await page.locator("#order-relationship").innerText(),
    /Independent/,
  );
  const calculated = await page.evaluate(
    async () =>
      (await import("./src/engine.js")).generate(window.studio.getProject())
        .stats,
  );
  assert.deepEqual(
    await page.evaluate(() => window.studio.getPlan().stats),
    calculated,
  );
  await chip(b).locator("[data-sew-grip]").focus();
  await page.keyboard.press("Alt+ArrowRight");
  await ready();
  assert.deepEqual(await actual(), [c, b, a]);
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(await actual(), [b, c, a]);
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("embroidery-studio-v1")).sequencing
        ?.order[0] === window.studio.getProject().sequencing.order[0],
  );
  await page.reload();
  await ready();
  assert.deepEqual(await actual(), [b, c, a]);
  const download = page.waitForEvent("download");
  await page.locator("#save-project").click();
  await (await download).saveAs("test-results/ux-manual-order.embstudio");
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await ready();
  await page
    .locator("#file-input")
    .setInputFiles("test-results/ux-manual-order.embstudio");
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().sequencing?.mode === "manual" &&
      window.studio.getPlan(),
  );
  assert.deepEqual(await actual(), [b, c, a]);
  await page.locator("#order-mode").selectOption("auto");
  await ready();
  assert.equal((await project()).sequencing, undefined);
  assert.equal(
    await page.evaluate(() => window.studio.getPlan().stats.colors),
    2,
  );
  await pick(a);
  await page.locator("#spacing").focus();
  assert.match(
    await page.locator("#control-description").innerText(),
    /puckering|denser/,
  );
  assert.match(
    await page.locator("#spacing").getAttribute("aria-description"),
    /millimeters/,
  );
  await page.keyboard.press("Escape");
  await page.locator("#spacing").hover();
  await page.waitForFunction(
    () => !document.getElementById("control-description").hidden,
  );
  assert.match(
    await page.locator("#control-description").innerText(),
    /puckering|denser/,
  );
  await page.keyboard.press("Escape");
  await page.locator("#stage").focus();
  await page.screenshot({ path: "test-results/ux-desktop.png" });

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(base);
  await mobile.waitForFunction(() => window.studio?.getPlan());
  await mobile.locator("#toggle-layers").tap();
  const mp = await mobile.evaluate(() => window.studio.getProject()),
    [m1, m2, m3] = mp.objects.map((o) => o.id);
  await mobile.locator(`[data-check="${m1}"]`).tap();
  await mobile.locator(`[data-check="${m2}"]`).tap();
  assert.equal(
    await mobile.evaluate(() => window.studio.getSelection().objects.length),
    2,
  );
  assert.equal(
    await mobile
      .locator("#layers-panel")
      .evaluate((el) => el.classList.contains("open")),
    true,
  );
  const hit = await mobile.locator(`[data-visibility="${m1}"]`).boundingBox();
  assert(hit.width >= 44 && hit.height >= 44);
  const before = await mobile.evaluate(() =>
    JSON.stringify(window.studio.getProject()),
  );
  await mobile.locator("#context-help").tap();
  await mobile.locator(`[data-visibility="${m1}"]`).tap();
  assert.match(
    await mobile.locator("#control-description").innerText(),
    /without deleting/,
  );
  assert.equal(
    await mobile.evaluate(() => JSON.stringify(window.studio.getProject())),
    before,
  );
  await mobile.locator("#context-help").tap();
  const touch = await mobile.context().newCDPSession(mobile),
    grip = await mobile
      .locator(`.object-row[data-reorder-id="${m1}"] [data-tree-grip]`)
      .boundingBox(),
    target = await mobile
      .locator(`.object-row[data-reorder-id="${m3}"]`)
      .boundingBox(),
    x = grip.x + grip.width / 2,
    y = grip.y + grip.height / 2,
    to = target.y + target.height * 0.8;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let i = 1; i <= 8; i++)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + ((to - y) * i) / 8, id: 1 }],
    });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await mobile.waitForFunction(
    () =>
      window.studio.getProject().sequencing?.mode === "manual" &&
      window.studio.getPlan(),
  );
  assert.deepEqual(
    await mobile.evaluate(() =>
      window.studio
        .getProject()
        .objects.slice(0, 3)
        .map((o) => o.id),
    ),
    [m3, m1, m2],
  );
  await mobile.screenshot({ path: "test-results/ux-mobile-tree.png" });
  // Raw CDP drag injection suppresses an immediate tap even on plain HTML.
  // Let Chromium's native gesture recognizer settle before testing activation.
  await mobile.waitForTimeout(600);
  await mobile.locator("#toggle-layers").tap();
  await mobile.waitForFunction(
    () => !document.getElementById("layers-panel").classList.contains("open"),
  );
  assert(await mobile.evaluate(() => document.body.scrollWidth <= innerWidth));
  const sewing = (id) =>
    mobile.locator(`.sewing-object[data-reorder-id="${id}"]`);
  const from = await sewing(m2).locator("[data-sew-grip]").boundingBox(),
    toFirst = await sewing(m3).boundingBox();
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: from.x + from.width / 2, y: from.y + from.height / 2, id: 1 },
    ],
  });
  for (let i = 1; i <= 8; i++)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x:
            from.x +
            from.width / 2 +
            ((toFirst.x + 8 - from.x - from.width / 2) * i) / 8,
          y: from.y + from.height / 2,
          id: 1,
        },
      ],
    });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await mobile.waitForFunction(
    () =>
      window.studio.getProject().sequencing?.origin === "sequence" &&
      window.studio.getPlan(),
  );
  assert.deepEqual(
    await mobile.evaluate(() =>
      window.studio.getProject().sequencing.order.slice(0, 3),
    ),
    [m2, m3, m1],
  );
  assert.deepEqual(
    await mobile.evaluate(() =>
      window.studio
        .getProject()
        .objects.slice(0, 3)
        .map((o) => o.id),
    ),
    [m3, m1, m2],
  );
  await mobile.screenshot({ path: "test-results/ux-mobile.png" });
  await mobile.setViewportSize({ width: 360, height: 640 });
  assert(await mobile.evaluate(() => document.body.scrollWidth <= innerWidth));
  await mobile.locator('[data-tool="pan"]').scrollIntoViewIfNeeded();
  assert(await mobile.locator('[data-tool="pan"]').isVisible());
  assert((await mobile.locator(".drawing-tools").boundingBox()).height <= 50);
  assert.equal(
    await mobile.locator(".object-sequence").evaluate((el) => el.open),
    false,
  );
  await mobile.screenshot({ path: "test-results/ux-mobile-short.png" });
  assert.deepEqual(errors, []);
  console.log(
    "UI refinement: row/keyboard/touch selection, eye controls, help, machine layout, tree multi-drag, sewing drag, keyboard order, persistence and automatic restoration passed.",
  );
} finally {
  await browser.close();
}
