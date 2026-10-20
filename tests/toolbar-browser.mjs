import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { TOOL_GROUPS, TOOL_INFO } from "../src/tool-icons.js";
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
      viewport: { width: 1560, height: 1000 },
      colorScheme: "light",
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = process.env.STUDIO_URL || "http://127.0.0.1:5173/";
  await page.goto(base);
  await page.waitForFunction(() => window.studio?.getPlan());
  const initial = await page.evaluate(() => ({
    project: window.studio.getProject(),
    events: window.studio.getPlan().events,
  }));
  const target = (key) =>
    key === "shapes"
      ? page.locator("#shape-family > summary")
      : key === "lettering"
        ? page.locator("#text-tool")
        : page.locator(`[data-tool="${key}"]`);
  assert(await page.locator("#simulator").isHidden());
  assert(await page.locator("#resize-bottom").isHidden());
  const design = await page.locator("#stage").boundingBox();
  assert.equal(await page.locator("#stage-kicker, .stage-top").count(), 0);
  assert(await page.locator(".tool-context").isHidden());
  const machine = await page.locator(".workspace-machine").boundingBox();
  const toolbar = await page.locator(".tool-rail").boundingBox();
  assert(Math.abs(toolbar.y - machine.y - machine.height) < 1);
  assert.equal(await page.locator(".tool-group").count(), 4);
  for (const [i, [name, keys]] of TOOL_GROUPS.entries()) {
    assert.equal(
      await page.locator(".tool-group").nth(i).getAttribute("aria-label"),
      name,
    );
    assert.equal(keys.length, [4, 4, 5, 1][i]);
  }
  const tip = page.locator("#control-description");
  for (const hints of [false, true]) {
    if (hints) await page.locator("#context-help").click();
    for (const key of TOOL_GROUPS.flatMap((g) => g[1])) {
      const el = target(key),
        [name, description] = TOOL_INFO[key];
      assert.equal(await el.getAttribute("aria-label"), name);
      assert.equal(
        await el.locator("svg").getAttribute("viewBox"),
        "0 0 24 24",
      );
      assert.equal(await el.locator("svg").getAttribute("width"), "24");
      assert.equal(await el.locator("img,image").count(), 0);
      const b = await el.locator("svg").evaluate((s) => {
        const r = s.getBBox();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      assert(
        b.w > 8 &&
          b.h > 8 &&
          b.x >= 0 &&
          b.y >= 0 &&
          b.x + b.w <= 24 &&
          b.y + b.h <= 24,
        `${key}: ${JSON.stringify(b)}`,
      );
      await el.hover();
      await page.waitForFunction((name) => {
        const t = document.getElementById("control-description");
        return !t.hidden && t.textContent.startsWith(name);
      }, name);
      const text = await tip.innerText();
      assert(text.startsWith(name));
      assert.equal(text.includes(description), hints);
      assert.equal(await el.getAttribute("title"), null);
      const r = await tip.boundingBox();
      assert(
        r.x >= 0 && r.y >= 0 && r.x + r.width <= 1560 && r.y + r.height <= 1000,
      );
      await page.mouse.move(1520, 970);
      await page.waitForFunction(
        () => document.getElementById("control-description").hidden,
      );
    }
  }
  // All existing tool actions remain directly mapped; changing tools cannot alter stitches.
  for (const key of TOOL_GROUPS.flatMap((g) => g[1]).filter(
    (k) => !["shapes", "lettering"].includes(k),
  )) {
    await target(key).click();
    assert.equal(await target(key).getAttribute("aria-pressed"), "true");
  }
  await target("shapes").click();
  assert(await page.locator('[data-tool="rect"]').isVisible());
  for (const key of ["rect", "ellipse", "regular", "star", "eyelet"]) {
    await page.locator(`[data-tool="${key}"]`).click();
    assert.equal(
      await page.locator(`[data-tool="${key}"]`).getAttribute("aria-pressed"),
      "true",
    );
  }
  await target("select").click();
  await target("lettering").click();
  assert(await page.locator("#text-value").isVisible());
  await page.locator("#dialog").press("Escape");
  await page.locator("#stage").focus();
  await page.keyboard.press("n");
  assert.equal(await target("node").getAttribute("aria-pressed"), "true");
  await page.keyboard.press("h");
  assert.equal(await target("pan").getAttribute("aria-pressed"), "true");
  await page.keyboard.press("v");
  await page.locator("#context-help").click();
  assert.equal(await page.locator("#context-help").innerText(), "Hints: Off");
  await page.keyboard.press("Tab");
  await target("select").focus();
  await page.waitForFunction(
    () => !document.getElementById("control-description").hidden,
  );
  assert((await tip.innerText()).startsWith("Select"));
  assert(!(await tip.innerText()).includes(TOOL_INFO.select[1]));
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.tool),
    "node",
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(
    await page.evaluate(() => window.studio.getProject()),
    initial.project,
  );
  assert.deepEqual(
    await page.evaluate(() => window.studio.getPlan().events),
    initial.events,
  );
  await page.locator("#stage").focus();
  await page.screenshot({ path: "test-results/toolbar-desktop-light.png" });
  await page
    .locator(".tool-rail")
    .screenshot({ path: "test-results/toolbar-detail-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/toolbar-desktop-dark.png" });
  await page
    .locator(".tool-rail")
    .screenshot({ path: "test-results/toolbar-detail-dark.png" });
  // Preview owns sequence controls; Design always reclaims that height, including after reload.
  await page.locator("#preview-tab").click();
  assert(await page.locator("#simulator").isVisible());
  assert(await page.locator(".tool-rail").isHidden());
  const preview = await page.locator("#stage").boundingBox();
  assert(design.height > preview.height + 130);
  await page.locator("#resize-bottom").focus();
  await page.keyboard.press("ArrowUp");
  const size = await page.evaluate(() => window.studio.getWorkspace().bottom);
  await page.locator("#design-tab").click();
  assert(await page.locator("#simulator").isHidden());
  assert(await page.locator(".tool-rail").isVisible());
  await page.locator("#toggle-sequence").click();
  assert.equal(await page.evaluate(() => window.studio.getMode()), "preview");
  assert.equal(
    await page.evaluate(() => window.studio.getWorkspace().bottom),
    size,
  );
  await page.reload();
  await page.waitForFunction(() => window.studio?.getPlan());
  assert(await page.locator("#simulator").isHidden());
  // Toolbar visibility is a device layout preference, never an artwork edit.
  const layoutBaseline = await page.evaluate(() => ({
    project: window.studio.getProject(),
    events: window.studio.getPlan().events,
  }));
  const toolsToggle = page.locator("#toggle-tools");
  const shown = await page.locator("#stage").boundingBox();
  await toolsToggle.click();
  assert(await page.locator(".tool-rail").isHidden());
  assert.equal(await toolsToggle.getAttribute("aria-expanded"), "false");
  const hidden = await page.locator("#stage").boundingBox();
  assert(hidden.height >= shown.height + 50);
  await page.reload();
  await page.waitForFunction(() => window.studio?.getPlan());
  assert(await page.locator(".tool-rail").isHidden());
  // The untouched example gets fresh IDs on startup; compare layout actions
  // within the restored session without confusing example IDs with edits.
  const restoredBaseline = await page.evaluate(() => ({
    project: window.studio.getProject(),
    events: window.studio.getPlan().events,
  }));
  assert.deepEqual(
    restoredBaseline.project.objects.map(({ id, ...o }) => o),
    layoutBaseline.project.objects.map(({ id, ...o }) => o),
  );
  await page.locator("#preview-tab").click();
  await page.locator("#design-tab").click();
  assert(await page.locator(".tool-rail").isHidden());
  await page.locator("#preview-tab").click();
  await toolsToggle.click();
  assert.equal(await page.evaluate(() => window.studio.getMode()), "design");
  assert(await page.locator(".tool-rail").isVisible());
  await page.locator('[data-tool="run"]').click();
  const canvas = await page.locator("#stage").boundingBox();
  await page.mouse.click(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  assert.equal(
    await page.locator("#draw-message").innerText(),
    "1 points placed",
  );
  await toolsToggle.click();
  assert(await page.locator("#draw-actions").isVisible());
  assert.equal(
    await page.locator("#draw-message").innerText(),
    "1 points placed",
  );
  await toolsToggle.click();
  assert.equal(
    await page.locator('[data-tool="run"]').getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#cancel-draw").click();
  await page.locator('[data-tool="select"]').click();
  await page.locator("#maximize-canvas").click();
  assert(await page.locator(".tool-rail").isHidden());
  await page.locator("#maximize-canvas").click();
  assert(await page.locator(".tool-rail").isVisible());
  await toolsToggle.click();
  await page.locator("#reset-layout").click();
  assert(await page.locator(".tool-rail").isVisible());
  assert.deepEqual(
    await page.evaluate(() => window.studio.getProject()),
    restoredBaseline.project,
  );
  assert.deepEqual(
    await page.evaluate(() => window.studio.getPlan().events),
    restoredBaseline.events,
  );
  await page.screenshot({ path: "test-results/workspace-clean-desktop.png" });
  await toolsToggle.click();
  await page.screenshot({
    path: "test-results/workspace-tools-hidden-desktop.png",
  });
  await toolsToggle.click();
  for (const [width, height] of [
    [1280, 800],
    [768, 1024],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    const mobile = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      isMobile: width < 500,
    });
    mobile.on("pageerror", (e) => errors.push(e.message));
    await mobile.goto(base);
    await mobile.waitForFunction(() => window.studio?.getPlan());
    assert(await mobile.locator("#simulator").isHidden());
    const toggle = mobile.locator("#toggle-tools");
    const toggleBox = await toggle.boundingBox();
    assert(toggleBox.x >= 0 && toggleBox.x + toggleBox.width <= width);
    await toggle.tap();
    assert(await mobile.locator(".tool-rail").isHidden());
    assert(await mobile.locator(".tool-context").isHidden());
    if (width === 390)
      await mobile.screenshot({
        path: "test-results/workspace-tools-hidden-mobile.png",
      });
    await toggle.tap();
    assert(await mobile.locator(".tool-rail").isVisible());
    const names = mobile.locator(".drawing-tools [data-tool-name]");
    for (const key of TOOL_GROUPS.flatMap((g) => g[1])) {
      const el =
        key === "shapes"
          ? mobile.locator("#shape-family > summary")
          : key === "lettering"
            ? mobile.locator("#text-tool")
            : mobile.locator(`[data-tool="${key}"]`);
      await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox(),
        rail = await mobile.locator(".tool-rail").boundingBox();
      assert(b.width >= 40 && b.height >= 40);
      assert(
        b.x >= rail.x - 1 &&
          b.y >= rail.y - 1 &&
          b.x + b.width <= rail.x + rail.width + 1 &&
          b.y + b.height <= rail.y + rail.height + 1,
      );
    }
    assert.equal(await names.count(), 19); // 14 primary controls + five Shapes choices.
    assert(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (width === 390) {
      await mobile.locator('[data-tool="run"]').scrollIntoViewIfNeeded();
      const b = await mobile.locator('[data-tool="run"]').boundingBox(),
        cdp = await mobile.context().newCDPSession(mobile);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }],
      });
      await mobile.waitForFunction(
        () => !document.getElementById("control-description").hidden,
      );
      assert(
        (await mobile.locator("#control-description").innerText()).startsWith(
          "Running Stitch",
        ),
      );
      assert(
        !(await mobile.locator("#control-description").innerText()).includes(
          TOOL_INFO.run[1],
        ),
      );
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await mobile.locator("#stage").tap();
      await mobile.screenshot({ path: "test-results/toolbar-mobile.png" });
    }
    await mobile.locator("#toggle-sequence").click();
    assert(await mobile.locator("#timeline").isVisible());
    await mobile.locator("#design-tab").click();
    assert(await mobile.locator("#simulator").isHidden());
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Four SVG tool groups, all 14 mappings, Hints On/Off, keyboard/touch tips, banner-free workspace, saved toolbar visibility, draft preservation, maximize/reset, mobile layouts and preview-only sequence passed without changing project data or needles.",
  );
} finally {
  await browser.close();
}
