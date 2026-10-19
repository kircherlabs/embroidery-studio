import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { object } from "../src/model.js";
import { smartShape } from "../src/creative.js";
import { generate } from "../src/engine.js";
import { OPERATION_TYPES, makeOperation } from "../src/operations.js";
import { methodCategory } from "../src/method-ui.js";
import { chooseMethod, reveal } from "./helpers/ui.mjs";
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
      viewport: { width: 1500, height: 1080 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject()),
    plan = () => page.evaluate(() => window.studio.getPlan()),
    pick = (id) => page.locator(`[data-select="${id}"]`).click(),
    open = async (p) => {
      await page
        .locator("#file-input")
        .setInputFiles({
          name: "categories.embstudio",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(p)),
        });
      await page.locator("#dialog-submit").click();
      await page.waitForFunction(
        (name) =>
          window.studio.getProject().name === name && window.studio.getPlan(),
        p.name,
      );
    },
    field = async (id, value) => {
      const e = page.locator("#" + id);
      await reveal(e);
      await e.fill(String(value));
      await e.press("Tab");
      await ready();
    },
    action = async (id) => {
      const e = page.locator(`[data-operation="${id}"]`);
      if ((await e.getAttribute("aria-expanded")) !== "true") await e.click();
    },
    categories = async () =>
      assert.deepEqual(
        await page
          .locator("#stitch-type option:not([disabled])")
          .evaluateAll((es) => es.map((e) => e.value)),
        ["run", "fill", "satin"],
      );
  await ready();
  const line = object(
    "Running line",
    [
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
    ],
    {
      type: "run",
      closed: false,
      length: 2,
      underlay: false,
      compensation: 0,
      tieIn: false,
      tieOff: false,
    },
  );
  line.operations = [makeOperation("run", line)];
  await open({
    version: 1,
    name: "Reinforcement",
    machine: "se700",
    objects: [line],
  });
  await pick(line.id);
  await categories();
  const id = line.operations[0].id,
    expected = {
      run: [0, 2, 4],
      bean: [0, 2, 0, 2, 4, 2, 4],
      triple: [0, 2, 4, 2, 0, 2, 4],
    };
  for (const type of ["run", "bean", "triple"]) {
    await page.locator("#reinforcement").selectOption(type);
    await ready();
    const o = (await project()).objects[0];
    assert.equal(o.operations.length, 1);
    assert.equal(o.operations[0].id, id);
    assert.equal(o.operations[0].type, type);
    assert.deepEqual(
      (await plan()).events.filter((e) => e.cmd === "stitch").map((e) => e.x),
      expected[type],
    );
  }
  await page.locator("#undo").click();
  await ready();
  assert.equal((await project()).objects[0].operations[0].type, "bean");
  await page.locator("#redo").click();
  await ready();
  assert.equal((await project()).objects[0].operations[0].type, "triple");
  await pick(line.id);
  await page.locator("#context-help").click();
  await page.locator("#reinforcement").focus();
  assert.match(
    await page.locator("#control-description").innerText(),
    /whole path forward, backward/,
  );
  await page.locator("#context-help").click();
  await page.locator("#reinforcement").focus();
  assert(await page.locator("#control-description").isHidden());
  await page.screenshot({ path: "test-results/method-running.png" });
  const before = await project(),
    beforePlan = await plan();
  await page.locator("#stitch-type").selectOption("satin");
  assert.deepEqual(await project(), before);
  assert.deepEqual((await plan()).events, beforePlan.events);
  assert.equal(await page.locator("#satin-construction").inputValue(), "");
  assert(await page.locator("#thread-color").isHidden());
  await page.locator("#cancel-satin-choice").click();
  assert.deepEqual(await project(), before);
  await chooseMethod(page, "satin");
  await ready();
  assert.equal((await project()).objects[0].operations[0].type, "satin");
  await chooseMethod(page, "border");
  assert(await page.locator("#close-artwork").isDisabled());
  await page.locator("#cancel-method-change").click();
  assert.equal((await project()).objects[0].operations[0].type, "satin");
  await reveal(page.locator("#add-operation"));
  await page.locator("#add-operation").selectOption("satin");
  assert(
    await page
      .locator('#add-satin-construction option[value="border"]')
      .evaluate((e) => e.disabled),
  );
  assert(
    await page
      .locator('#add-satin-construction option[value="column"]')
      .evaluate((e) => e.disabled),
  );

  // Every legacy type remains inspectable without rewriting the saved stack or commands.
  const shape = smartShape("rect", 12, 20, { radius: 1 }),
    p = {
      version: 1,
      name: "All legacy actions",
      machine: "se700",
      objects: [shape],
      planning: { smallDetail: 0 },
    };
  shape.operations = Object.keys(OPERATION_TYPES).map((type, i) => ({
    ...makeOperation(type, shape),
    color: i % 2 ? "#6689a5" : "#e6ab43",
  }));
  const baseline = generate(p);
  await open(p);
  await pick(shape.id);
  for (const op of shape.operations) {
    await action(op.id);
    await categories();
    const cat = methodCategory(op.type);
    assert.equal(
      await page.locator("#stitch-type").inputValue(),
      cat === "construction" ? "" : cat,
    );
    if (cat === "run")
      assert.equal(await page.locator("#reinforcement").inputValue(), op.type);
    if (cat === "satin")
      assert.equal(
        await page.locator("#satin-construction").inputValue(),
        op.type,
      );
    if (cat === "construction")
      assert.equal(
        await page.locator("#construction-method").inputValue(),
        op.type,
      );
    assert.deepEqual((await project()).objects[0].operations, shape.operations);
  }
  assert.deepEqual((await plan()).events, baseline.events);
  const placement = shape.operations.find((o) => o.type === "placement");
  await action(placement.id);
  await chooseMethod(page, "tackdown");
  await ready();
  let current = (await project()).objects[0];
  assert.equal(current.operations.length, shape.operations.length);
  assert.equal(
    current.operations.find((o) => o.id === placement.id).type,
    "tackdown",
  );
  await chooseMethod(page, "contour");
  await field("op-offset", -1);
  const inward = await plan();
  await field("op-offset", 1);
  const outward = await plan();
  assert.notDeepEqual(outward.events, inward.events);
  await chooseMethod(page, "basting", { add: true });
  await page.locator("#construction-add").click();
  await ready();
  current = (await project()).objects[0];
  assert.equal(current.operations.length, shape.operations.length + 1);
  assert.equal(current.operations.at(-1).type, "basting");
  assert.equal(current.operations.at(-1).length, 5);
  await page.screenshot({ path: "test-results/method-construction.png" });

  // Mixed reinforcement is explicit; bulk editing retains IDs, colors and lists.
  const a = smartShape("rect", 5, 8),
    b = smartShape("rect", 5, 8);
  a.parentId = b.parentId = "group";
  b.rings = b.rings.map((r) => r.map((p) => ({ x: p.x + 10, y: p.y })));
  a.operations = [makeOperation("run", a)];
  b.operations = [makeOperation("bean", b)];
  await open({
    version: 1,
    name: "Mixed reinforcement",
    machine: "se700",
    objects: [a, b],
    groups: [{ id: "group", name: "Group", kind: "group", parentId: null }],
  });
  await pick("group");
  assert.equal(await page.locator("#stitch-type").inputValue(), "run");
  assert.equal(await page.locator("#reinforcement").inputValue(), "");
  await page.locator("#reinforcement").selectOption("triple");
  await ready();
  const bulk = await project();
  assert(
    bulk.objects.every(
      (o) => o.operations.length === 1 && o.operations[0].type === "triple",
    ),
  );
  assert.deepEqual(
    bulk.objects.map((o) => o.operations[0].id),
    [a.operations[0].id, b.operations[0].id],
  );

  // Fill + independently colored satin border still exports in operation order.
  const circle = smartShape("ellipse", 16, 16);
  circle.operations = [{ ...makeOperation("fill", circle), color: "#6689a5" }];
  await open({
    version: 1,
    name: "Fill and satin border",
    machine: "se700",
    objects: [circle],
  });
  await pick(circle.id);
  await chooseMethod(page, "border", { add: true });
  await page.locator("#operation-add").click();
  await ready();
  await page.locator('[data-color="#e6ab43"]').click();
  await ready();
  const final = await project(),
    machine = await plan();
  assert.equal(final.objects[0].operations.length, 2);
  assert.deepEqual(
    final.objects[0].operations.map((o) => o.type),
    ["fill", "border"],
  );
  assert.equal(machine.stats.manualChanges, 1);
  await page.screenshot({ path: "test-results/method-satin.png" });
  await page.waitForFunction(
    () =>
      document.getElementById("save-status").textContent ===
      "Saved on this device",
  );
  await page.reload();
  await ready();
  assert.deepEqual(await project(), final);
  const saved = page.waitForEvent("download");
  await page.locator("#save-project").click();
  await (await saved).saveAs("test-results/method-categories.embstudio");
  await page
    .locator("#file-input")
    .setInputFiles("test-results/method-categories.embstudio");
  await page.locator("#dialog-submit").click();
  await ready();
  assert.deepEqual(await project(), final);
  await page.locator("#export").click();
  const download = page.waitForEvent("download", { timeout: 180000 });
  await page.locator("#dialog-submit").click();
  await (await download).saveAs("test-results/method-categories.pes");
  const dec = decodePes(await readFile("test-results/method-categories.pes")),
    needles = dec.pec.events.filter((e) => e.type === "stitch"),
    expectedNeedles = machine.events.filter((e) => e.cmd === "stitch");
  assert.deepEqual(declaredRect(dec.pec), streamExtents(dec.pec));
  assert.equal(needles.length, expectedNeedles.length);
  needles.forEach((e, i) => {
    assert.equal(
      e.x,
      Math.round((expectedNeedles[i].x - expectedNeedles[0].x) * 10) || 0,
    );
    assert.equal(
      e.y,
      Math.round((expectedNeedles[i].y - expectedNeedles[0].y) * 10) || 0,
    );
  });
  assert.equal(
    dec.pec.events.filter((e) => e.type === "colorChange").length,
    1,
  );
  await page.locator("#design-tab").click();
  await pick(circle.id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toggle-inspector").click();
  await page.screenshot({ path: "test-results/method-mobile.png" });
  const size = await page
    .locator("#properties")
    .evaluate((e) => ({ w: e.clientWidth, scroll: e.scrollWidth }));
  assert(size.scroll <= size.w + 1);
  assert.deepEqual(errors, []);
  console.log(
    "Method categories: three primary choices, exact Single/Bean/Triple commands, explicit satin choice, all legacy methods, construction offsets/addition, mixed bulk settings, action identity, Undo/Redo, Hints, persistence, independent PES coordinates/colors/origin and mobile passed.",
  );
} finally {
  await browser.close();
}
