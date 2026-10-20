import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
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
      viewport: { width: 1500, height: 1050 },
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan());
  const project = () => page.evaluate(() => window.studio.getProject());
  const selection = () => page.evaluate(() => window.studio.getSelection());
  const plan = () => page.evaluate(() => window.studio.getPlan());
  const sewing = async () => {
    const { id, ...commands } = await plan();
    return commands;
  };
  const box = (id, x, y, color, parentId, extra = {}) => ({
    ...object(
      id,
      [
        [
          { x, y },
          { x: x + 12, y },
          { x: x + 12, y: y + 10 },
          { x, y: y + 10 },
        ],
      ],
      { color, type: "fill", closed: true, ...extra },
    ),
    id,
    parentId,
  });
  const p = {
    version: 1,
    name: "Nested focus",
    machine: "se700",
    groups: [
      { id: "svg", kind: "svg", name: "Illustration.svg" },
      { id: "pair", kind: "group", name: "Pair", parentId: "svg" },
      { id: "inner", kind: "group", name: "Inner", parentId: "pair" },
      { id: "other", kind: "group", name: "Other artwork" },
    ],
    objects: [
      box("a", -22, -12, "#168bb5", "inner"),
      box("hidden", -22, 4, "#e0a630", "inner", { visible: false }),
      box("b", -3, -12, "#d47780", "pair"),
      box("accent", 16, -12, "#9eb584", "svg"),
      box("outside", 16, 9, "#a382ad", "other"),
    ],
    planning: { smallDetail: 0, optimizeColors: true },
  };
  await ready();
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "focus.embstudio",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
  await page
    .getByRole("heading", { name: "Open this project?", exact: true })
    .waitFor();
  await page.locator("#dialog-submit").click();
  await page.waitForFunction(
    () =>
      window.studio.getProject().name === "Nested focus" &&
      window.studio.getPlan(),
  );
  const base = await project(),
    basePlan = await sewing(),
    generation = (await plan()).id,
    undoBefore = await page.locator("#undo").isDisabled();
  const row = (id) => page.locator(`.object-row[data-reorder-id="${id}"]`),
    exit = page.getByRole("button", { name: "Exit Focus Mode", exact: true });
  const world = async (point) => {
    await page.waitForFunction(
      () =>
        Math.abs(
          document.getElementById("stage").getBoundingClientRect().width -
            window.studio.getView().width,
        ) < 1,
    );
    return page.evaluate((p) => {
      const r = document.getElementById("stage").getBoundingClientRect(),
        v = window.studio.getView();
      return {
        x: r.x + v.center.x + p.x * v.scale,
        y: r.y + v.center.y + p.y * v.scale,
      };
    }, point);
  };
  const drill = async (id) => {
    const pt = await world({ x: -16, y: -7 });
    await page.mouse.dblclick(pt.x, pt.y);
    assert.equal((await selection()).isolation, id);
    await exit.waitFor({ state: "visible" });
  };
  const check = async (target, included, ancestors, outside) => {
    assert.equal(await row(target).getAttribute("aria-selected"), "true");
    assert.match(await row(target).getAttribute("class"), /focus-target/);
    for (const id of included)
      assert.match(await row(id).getAttribute("class"), /focus-included/);
    for (const id of ancestors)
      assert.match(await row(id).getAttribute("class"), /focus-ancestor/);
    for (const id of outside)
      assert.match(await row(id).getAttribute("class"), /focus-outside/);
    assert(
      await page
        .locator("body")
        .evaluate((el) => el.classList.contains("focus-active")),
    );
    const frame = await page
      .locator(".canvas-surface")
      .evaluate((el) => ({
        border: getComputedStyle(el, "::after").borderWidth,
        pointer: getComputedStyle(el, "::after").pointerEvents,
      }));
    assert.equal(frame.border, "2px");
    assert.equal(frame.pointer, "none");
    assert.equal(await exit.count(), 1);
    assert.deepEqual(await project(), base);
    assert.deepEqual(await sewing(), basePlan);
    assert.equal(
      (await plan()).id,
      generation,
      "focus presentation does not regenerate stitches",
    );
  };
  const normal = async () => {
    assert.equal((await selection()).isolation, null);
    assert(await exit.isHidden());
    assert.equal(
      await page
        .locator(".focus-target,.focus-included,.focus-ancestor,.focus-outside")
        .count(),
      0,
    );
    assert(
      !(await page
        .locator("body")
        .evaluate((el) => el.classList.contains("focus-active"))),
    );
    assert.equal(
      await page.locator("#object-list").getAttribute("aria-description"),
      null,
    );
    assert.deepEqual(await project(), base);
    assert.deepEqual(await sewing(), basePlan);
  };
  const dims = await page.locator("#stage").boundingBox();
  const normalExitHidden = await exit.isHidden();
  assert(normalExitHidden);
  await drill("svg");
  await check(
    "svg",
    ["pair", "inner", "a", "b", "accent", "hidden"],
    [],
    ["other", "outside"],
  );
  const afterDims = await page.locator("#stage").boundingBox();
  assert.deepEqual(afterDims, dims, "focus styling takes no canvas space");
  const colors = await page.evaluate(() => {
    const color = (id) =>
      getComputedStyle(
        document.querySelector(`[data-reorder-id="${id}"] .object-text`),
      ).color;
    const b = getComputedStyle(document.getElementById("exit-isolation"));
    return {
      inside: color("a"),
      outside: color("outside"),
      background: b.backgroundColor,
      weight: b.fontWeight,
    };
  });
  assert.notEqual(
    colors.inside,
    colors.outside,
    "outside text is visibly subdued",
  );
  assert.equal(colors.background, "rgb(192, 209, 161)");
  assert(Number(colors.weight) >= 600);
  assert.equal(
    await page
      .locator('[data-visibility="outside"]')
      .getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await page
      .locator('[data-visibility="hidden"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.match(await row("hidden").getAttribute("class"), /hidden/);
  assert.equal(
    await row("hidden")
      .locator(".object-text")
      .evaluate((el) => getComputedStyle(el).textDecorationLine),
    "line-through",
  );
  await drill("pair");
  await check(
    "pair",
    ["inner", "a", "hidden", "b"],
    ["svg"],
    ["accent", "other", "outside"],
  );
  await drill("inner");
  await check(
    "inner",
    ["a", "hidden"],
    ["svg", "pair"],
    ["b", "accent", "other", "outside"],
  );
  await page.screenshot({ path: "test-results/focus-nested-desktop.png" });
  await page.locator("#preview-tab").click();
  assert.equal((await selection()).isolation, "inner");
  await page.locator("#design-tab").click();
  await check(
    "inner",
    ["a", "hidden"],
    ["svg", "pair"],
    ["b", "accent", "other", "outside"],
  );
  const saving = page.waitForEvent("download");
  await page.locator("#save-project").click();
  const saved = await saving;
  assert.deepEqual(
    JSON.parse(await readFile(await saved.path(), "utf8")),
    base,
    "saved project contains all artwork and no focus state",
  );
  await drill("a");
  await check(
    "a",
    [],
    ["svg", "pair", "inner"],
    ["b", "hidden", "accent", "outside", "other"],
  );
  await drill("a"); // Already at a leaf: a second double-click keeps that scope.
  await exit.hover();
  await page.waitForTimeout(450);
  assert(
    await page.locator("#control-description").isHidden(),
    "Focus hint stays off with Hints Off",
  );
  await page.locator("#context-help").click();
  await exit.hover();
  await page.locator("#control-description").waitFor({ state: "visible" });
  const hint = await page.locator("#control-description").innerText();
  assert.match(hint, /Focus Mode temporarily isolates/);
  assert.match(hint, /one level deeper/);
  assert.match(hint, /directly to the full workspace/);
  assert.match(hint, /Esc.*guide tool/);
  await page.mouse.move(700, 100);
  await exit.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  assert.equal(
    await exit.getAttribute("aria-describedby"),
    "control-description",
  );
  assert.notEqual(
    await exit.evaluate((el) => getComputedStyle(el).outlineStyle),
    "none",
  );
  await page.keyboard.press("Enter");
  await normal();
  assert.equal(
    await page.locator("#undo").isDisabled(),
    undoBefore,
    "focus entry/exit does not create history",
  );
  await drill("svg");
  await drill("pair");
  await drill("inner");
  // Editing within the nested view still uses the existing geometry/history flow.
  const a = await world({ x: -16, y: -7 }),
    b = await world({ x: -14, y: -7 });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await ready();
  assert.equal((await selection()).isolation, "inner");
  assert.notDeepEqual(
    (await project()).objects[0].rings,
    base.objects[0].rings,
  );
  await page.locator("#undo").click();
  await ready();
  assert.deepEqual(await project(), base);
  assert.equal((await selection()).isolation, "inner");
  await page.locator("#redo").click();
  await ready();
  assert.notDeepEqual(
    (await project()).objects[0].rings,
    base.objects[0].rings,
  );
  await page.locator("#undo").click();
  await ready();
  await page.locator("#stage").focus();
  await page.keyboard.press("Escape");
  await normal();
  await drill("svg");
  await drill("pair");
  await page.locator('[data-select="outside"]').click();
  await normal();
  // Tree focus action remains available; its exit preserves manual Show/Hide.
  await page.locator('[data-select="inner"]').click();
  await page.locator("#edit-command").selectOption("isolate");
  assert.equal((await selection()).isolation, "inner");
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    (await page.locator("#toggle-layers").getAttribute("aria-expanded")) !==
    "true"
  )
    await page.locator("#toggle-layers").click();
  await exit.waitFor({ state: "visible" });
  const mobile = await exit.boundingBox();
  assert(
    mobile.x >= 0 && mobile.x + mobile.width <= 390 && mobile.height >= 44,
  );

  // The established touch help gesture does not activate the exit button.
  const session = await page.context().newCDPSession(page),
    x = mobile.x + mobile.width / 2,
    y = mobile.y + mobile.height / 2;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await page.waitForTimeout(550);
  assert(await page.locator("#control-description").isVisible());
  const tip = await page.locator("#control-description").boundingBox();
  assert(tip.x >= 0 && tip.x + tip.width <= 390);
  await page.screenshot({ path: "test-results/focus-mobile.png" });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await session.detach();
  assert.equal((await selection()).isolation, "inner");
  await exit.tap();
  await normal();
  assert.equal(
    await page
      .locator('[data-visibility="hidden"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Focus UI: four real nested double-click levels, readable ancestor/outside styling, unchanged eyes/geometry/plan, no canvas size loss, existing exits and outside selection, edit/Undo/Redo, Hints Off/On/keyboard/touch, desktop/mobile passed.",
  );
} finally {
  await browser.close();
}
