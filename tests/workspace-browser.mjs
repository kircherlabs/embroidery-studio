import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
await mkdir("test-results", { recursive: true });
const base = process.env.STUDIO_URL || "http://127.0.0.1:5173";
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    view = () => page.evaluate(() => window.studio.getView()),
    layout = () => page.evaluate(() => window.studio.getWorkspace()),
    box = () => page.locator("#stage").boundingBox();
  const resize = async (key, delta) => {
    const r = await page.locator(`#resize-${key}`).boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      r.x + r.width / 2 + (key === "bottom" ? 0 : delta),
      r.y + r.height / 2 + (key === "bottom" ? delta : 0),
      { steps: 8 },
    );
    await page.mouse.up();
  };
  await page.goto(base);
  await ready();
  await page.locator("#save-project").click();
  const initial = await project(),
    original = JSON.stringify(initial),
    old = await box();
  await resize("left", 70);
  await page.waitForFunction(() => window.studio.getWorkspace().left >= 369);
  assert(Math.abs((await box()).width - old.width + 70) < 3);
  await resize("right", -40);
  assert(Math.abs((await layout()).right - 320) < 2);
  const beforeBottom = await box();
  await resize("bottom", -55);
  assert((await box()).height < beforeBottom.height - 50);
  await page.locator("#resize-left").focus();
  await page.keyboard.press("ArrowRight");
  assert((await layout()).left >= 379);
  await page.keyboard.press("Home");
  assert.equal((await layout()).left, 240);
  const limits = await page
    .locator("#resize-right")
    .getAttribute("aria-valuemax");
  await resize("right", -3000);
  assert((await layout()).right <= Number(limits));
  assert((await box()).width >= 250);
  await page.locator("#reset-layout").click();
  const cancelSize = (await layout()).left,
    cancelGrip = await page.locator("#resize-left").boundingBox();
  await page.mouse.move(cancelGrip.x + cancelGrip.width / 2, cancelGrip.y + 30);
  await page.mouse.down();
  await page.mouse.move(cancelGrip.x + 60, cancelGrip.y + 30);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal((await layout()).left, cancelSize);
  await page.locator('[data-close-panel="left"]').click();
  assert(await page.locator("#layers-panel").isHidden());
  const wider = await box();
  assert(wider.width > old.width + 280);
  await page.locator("#toggle-inspector").click();
  await page.locator("#toggle-sequence").click();
  assert((await box()).width > wider.width + 260);
  assert((await box()).height > old.height + 220);
  await page.locator("#toggle-layers").click();
  await page.locator("#toggle-inspector").click();
  await page.locator("#toggle-sequence").click();
  const previous = await layout();
  await page.locator("#maximize-canvas").click();
  assert(await page.locator("#simulator").isHidden());
  assert(await page.locator("#inspector-panel").isHidden());
  assert(await page.locator("#layers-panel").isHidden());
  assert((await box()).width > old.width + 550);
  await page.locator("#stage").focus();
  await page.keyboard.press("Escape");
  assert.equal((await layout()).maximized, false);
  assert.deepEqual((await layout()).open, previous.open);
  await resize("left", 35);
  await page.locator("#toggle-inspector").click();
  const savedLayout = await layout();
  await page.reload();
  await ready();
  assert.equal((await layout()).left, savedLayout.left);
  assert.equal((await layout()).open.right, false);
  await page.locator("#toggle-inspector").click();
  await page.locator("#reset-layout").click();
  // Navigation changes the camera, never the source geometry or operations.
  await page.locator("#navigation-mode").selectOption("mouse");
  let r = await box();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  let v = await view();
  await page.mouse.wheel(0, -120);
  await page.waitForFunction((z) => window.studio.getView().zoom > z, v.zoom);
  await page.locator("#navigation-mode").selectOption("trackpad");
  v = await view();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.wheel(20, 50);
  await page.waitForFunction((y) => window.studio.getView().pan.y < y, v.pan.y);
  assert.equal((await view()).zoom, v.zoom);
  await page.locator("#stage").dispatchEvent("wheel", {
    deltaY: -15,
    ctrlKey: true,
    deltaMode: 0,
    clientX: r.x + r.width / 2,
    clientY: r.y + r.height / 2,
  });
  assert((await view()).zoom > v.zoom);
  await page.locator('[data-tool="pan"]').click();
  v = await view();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 45, r.y + r.height / 2 + 20);
  await page.mouse.up();
  assert((await view()).pan.x > v.pan.x + 40);
  await page.locator('[data-tool="select"]').click();
  await page.locator("#stage").focus();
  await page.keyboard.down("Space");
  v = await view();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 - 30, r.y + r.height / 2);
  await page.mouse.up();
  await page.keyboard.up("Space");
  assert((await view()).pan.x < v.pan.x - 25);
  v = await view();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(r.x + r.width / 2 + 25, r.y + r.height / 2);
  await page.mouse.up({ button: "middle" });
  assert((await view()).pan.x > v.pan.x + 20);
  await page.locator("#view-command").selectOption("center");
  assert.deepEqual((await view()).pan, { x: 0, y: 0 });
  await page.locator("#view-command").selectOption("reset");
  assert.equal((await view()).zoom, 1);
  await page.locator("#fit-design").click();
  v = await view();
  assert(v.zoom > 1);
  const fitted = await page.evaluate(() => {
    const p = window.studio.getProject(),
      v = window.studio.getView();
    return p.objects
      .flatMap((o) => o.rings.flat())
      .every((q) => {
        const x = v.center.x + q.x * v.scale,
          y = v.center.y + q.y * v.scale;
        return x >= 0 && x <= v.width && y >= 0 && y <= v.height;
      });
  });
  assert(fitted);
  assert.equal(JSON.stringify(await project()), original);
  await page.screenshot({ path: "test-results/workspace-desktop.png" });
  // Real imported geometry exercises context alignment, source changes and undo.
  await page.locator("#new-project").click();
  await page.locator("#dialog-submit").click();
  await ready();
  await page.locator("#file-input").setInputFiles({
    name: "Position.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 30"><g id="Shapes"><rect x="0" y="2" width="10" height="10" fill="#6689a5"/><rect x="30" y="10" width="15" height="12" fill="#e6ab43"/><rect x="65" y="5" width="10" height="18" fill="#e5765e"/></g></svg>',
    ),
  });
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 3 &&
      window.studio.getPlan(),
  );
  let p = await project();
  const [a, b, c] = p.objects.map((o) => o.id),
    svg = p.groups.find((g) => g.kind === "svg").id;
  const pick = (id) => page.locator(`[data-select="${id}"]`).click(),
    bounds = (o) => {
      const pts = o.rings.flat();
      return {
        minX: Math.min(...pts.map((q) => q.x)),
        maxX: Math.max(...pts.map((q) => q.x)),
        minY: Math.min(...pts.map((q) => q.y)),
        maxY: Math.max(...pts.map((q) => q.y)),
      };
    },
    coords = async (id) => {
      const o = (await project()).objects.find((o) => o.id === id),
        b = bounds(o),
        v = await view(),
        r = await box();
      return {
        x: r.x + v.center.x + ((b.minX + b.maxX) / 2) * v.scale,
        y: r.y + v.center.y + ((b.minY + b.maxY) / 2) * v.scale,
      };
    };
  await pick(a);
  await page.locator(`[data-select="${b}"]`).click({ modifiers: ["Shift"] });
  await page.locator(`[data-select="${c}"]`).click({ modifiers: ["Shift"] });
  const params = p.objects.map(({ spacing, length, width, angle }) => ({
    spacing,
    length,
    width,
    angle,
  }));
  await page.locator("#arrange-selection").click();
  await page.locator('[data-arrange="match-width"]').click();
  await ready();
  p = await project();
  const widths = p.objects.map((o) => {
    const q = bounds(o);
    return q.maxX - q.minX;
  });
  assert(widths.every((w) => Math.abs(w - widths[0]) < 1e-8));
  assert.deepEqual(
    p.objects.map(({ spacing, length, width, angle }) => ({
      spacing,
      length,
      width,
      angle,
    })),
    params,
  );
  await page.locator("#undo").click();
  await ready();
  await pick(a);
  await page.locator(`[data-select="${b}"]`).click({ modifiers: ["Shift"] });
  await page.locator(`[data-select="${c}"]`).click({ modifiers: ["Shift"] });
  await page.locator("#arrange-selection").click();
  await page.locator('[data-arrange="align-top"]').click();
  await ready();
  p = await project();
  assert(
    p.objects.every(
      (o) => Math.abs(bounds(o).minY - bounds(p.objects[0]).minY) < 1e-6,
    ),
  );
  await page.locator("#undo").click();
  await ready();
  await pick(a);
  const anchor = await coords(a);
  await page.mouse.click(anchor.x, anchor.y, { button: "right" });
  assert(await page.locator("#arrange-menu").isVisible());
  assert.equal(await page.locator('[data-arrange="match-width"]').count(), 0);
  await page.locator('[data-arrange="hoop-x"]').click();
  await ready();
  let q = bounds((await project()).objects[0]);
  assert(Math.abs(q.minX + q.maxX) < 1e-8);
  await page.locator("#undo").click();
  await ready();
  await pick(svg);
  await page.locator("#stage").focus();
  await page.keyboard.press("Shift+F10");
  assert(await page.locator("#arrange-menu").isVisible());
  await page.keyboard.press("Escape");
  assert(await page.locator("#arrange-menu").isHidden());
  // Alignment guides modify only translation, and Alt bypasses them.
  await pick(a);
  await page.locator("#zoom-fit").click();
  p = await project();
  const beforeDrag = JSON.stringify(p),
    ab = bounds(p.objects[0]),
    centerX = (ab.minX + ab.maxX) / 2;
  let from = await coords(a);
  v = await view();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (-centerX + 0.3) * v.scale, from.y, {
    steps: 10,
  });
  assert((await view()).guides.some((g) => g.axis === "x"));
  await page.mouse.up();
  await ready();
  q = bounds((await project()).objects[0]);
  assert(Math.abs(q.minX + q.maxX) < 1e-7);
  await page.locator("#undo").click();
  await ready();
  assert.equal(JSON.stringify(await project()), beforeDrag);
  await pick(a);
  from = await coords(a);
  v = await view();
  await page.keyboard.down("Alt");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (-centerX + 1) * v.scale, from.y, {
    steps: 10,
  });
  assert.equal((await view()).guides.length, 0);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await ready();
  q = bounds((await project()).objects[0]);
  assert(Math.abs((q.minX + q.maxX) / 2 - 1) < 1.1 / v.scale);
  assert(Math.abs((q.minX + q.maxX) / 2) > 0.2);
  // Viewport changes do not mutate artwork, and every tool remains reachable.
  for (const [width, height] of [
    [1366, 768],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    const mobile = await browser.newPage({
      viewport: { width, height },
      isMobile: width < 1100,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    mobile.on("pageerror", (e) => errors.push(e.message));
    await mobile.goto(base);
    await mobile.waitForFunction(() => window.studio?.getPlan());
    const baseline = await mobile.evaluate(() =>
      JSON.stringify(window.studio.getProject()),
    );
    assert(
      await mobile.evaluate(() => document.body.scrollWidth <= innerWidth),
    );
    await mobile.locator("#toggle-layers").click();
    assert(
      (await mobile.locator("#layers-panel").isVisible()) || width >= 1100,
    );
    if (width < 1100) {
      await mobile.locator("#resize-left").focus();
      await mobile.keyboard.press("ArrowRight");
      assert(await mobile.locator("#layers-panel").isVisible());
      if (height <= 600) {
        const lastRow = await mobile
            .locator(".object-row")
            .last()
            .boundingBox(),
          actions = await mobile.locator(".layer-actions").boundingBox();
        assert(lastRow.y + lastRow.height <= actions.y);
        await mobile.locator(".layer-actions").scrollIntoViewIfNeeded();
        const visibleActions = await mobile
            .locator(".layer-actions")
            .boundingBox(),
          drawer = await mobile.locator("#layers-panel").boundingBox();
        assert(
          visibleActions.y >= drawer.y &&
            visibleActions.y + visibleActions.height <=
              drawer.y + drawer.height + 1,
        );
      }
      if (width === 390) {
        const touch = await mobile.context().newCDPSession(mobile),
          grip = await mobile.locator("#resize-left").boundingBox(),
          start = await mobile
            .locator("#resize-left")
            .getAttribute("aria-valuenow"),
          x = grip.x + grip.width / 2,
          y = grip.y + 80;
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y, id: 1 }],
        });
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + 22, y, id: 1 }],
        });
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        assert(
          Number(
            await mobile.locator("#resize-left").getAttribute("aria-valuenow"),
          ) >=
            Number(start) + 20,
        );
        await mobile.waitForTimeout(600);
      }
      await mobile.locator('[data-close-panel="left"]').click();
    } else await mobile.locator("#toggle-layers").click();
    const tools = mobile.locator(".drawing-tools");
    for (
      let i = 0;
      i < 5 && (await mobile.locator("#tools-next").isEnabled());
      i++
    ) {
      await mobile.locator("#tools-next").click();
      // Wait for smooth overflow scrolling to settle before checking the next
      // button again: its enabled state can change on the animation's last frame.
      await tools.evaluate(
        (el) =>
          new Promise((resolve) => {
            let previous = el.scrollLeft + el.scrollTop,
              quiet = 0;
            const frame = () => {
              const at = el.scrollLeft + el.scrollTop;
              quiet = at === previous ? quiet + 1 : 0;
              previous = at;
              if (quiet >= 4) resolve();
              else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          }),
      );
    }
    await mobile.locator('[data-tool="pan"]').scrollIntoViewIfNeeded();
    const tool = await mobile.locator('[data-tool="pan"]').boundingBox(),
      rail = await mobile.locator(".tool-rail").boundingBox();
    assert(
      tool.y >= rail.y - 1 &&
        tool.y + tool.height <= rail.y + rail.height + 1 &&
        tool.x >= rail.x - 1 &&
        tool.x + tool.width <= rail.x + rail.width + 1,
    );
    await mobile.locator('[data-tool="pan"]').click();
    assert.equal(
      await mobile.locator('[data-tool="pan"]').getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await mobile.evaluate(() => JSON.stringify(window.studio.getProject())),
      baseline,
    );
    await mobile.locator("#zoom-fit").click();
    const fittedHoop = await mobile.evaluate(() => window.studio.getView());
    assert(
      Math.abs(
        fittedHoop.scale * 112 -
          Math.min(fittedHoop.width, fittedHoop.height) +
          40,
      ) < 0.1,
      JSON.stringify({
        viewport: { width, height },
        fittedHoop,
        canvas: await mobile.locator("#stage").boundingBox(),
        header: await mobile.locator(".app-header").boundingBox(),
      }),
    );
    assert(
      Math.abs(fittedHoop.center.x - fittedHoop.width / 2) < 0.1 &&
        Math.abs(fittedHoop.center.y - fittedHoop.height / 2) < 0.1,
    );
    if (width === 390) {
      await mobile.locator('[data-tool="polygon"]').click();
      const touch = await mobile.context().newCDPSession(mobile),
        r = await mobile.locator("#stage").boundingBox(),
        before = await mobile.evaluate(() => window.studio.getView().zoom),
        cx = r.x + r.width / 2,
        cy = r.y + r.height / 2;
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: cx - 20, y: cy, id: 1 },
          { x: cx + 20, y: cy, id: 2 },
        ],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: cx - 35, y: cy + 10, id: 1 },
          { x: cx + 55, y: cy + 10, id: 2 },
        ],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      assert(
        (await mobile.evaluate(() => window.studio.getView().zoom)) > before,
      );
      assert(await mobile.locator("#draw-actions").isHidden());
      assert.equal(
        await mobile.evaluate(() => JSON.stringify(window.studio.getProject())),
        baseline,
      );
      await mobile.waitForTimeout(600);
      await mobile.locator("#arrange-selection").tap();
      assert(await mobile.locator("#arrange-menu").isVisible());
      await mobile.keyboard.press("Escape");
    }
    await mobile.screenshot({
      path: `test-results/workspace-${width}x${height}.png`,
    });
    await mobile.locator("#preview-tab").click();
    assert(await mobile.locator("#play").isVisible());
    assert(await mobile.locator("#timeline").isVisible());
    const playBounds = await mobile.locator("#play").boundingBox(),
      panelBounds = await mobile.locator("#simulator").boundingBox();
    assert(
      playBounds.y + playBounds.height <=
        panelBounds.y + panelBounds.height + 1,
    );

    await mobile.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Workspace: independent panel resizing/collapse, restoration, maximization, camera navigation, context alignment, guides and six responsive tool-rail layouts passed.",
  );
} finally {
  await browser.close();
}
