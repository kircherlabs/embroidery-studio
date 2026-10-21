import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile, mkdir } from "node:fs/promises";
import { object } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
import { normalizeThread, emptyThreads } from "../src/thread-records.js";
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
      viewport: { width: 1450, height: 1000 },
    }),
    errors = [];
  page.setDefaultTimeout(45000);
  page.on("pageerror", (e) => errors.push(e.stack));
  const ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    project = () => page.evaluate(() => window.studio.getProject());
  const load = async (p) => {
    await page.locator("#file-input").setInputFiles({
      name: "matching.embstudio",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      (name) => window.studio.getProject().name === name,
      p.name,
    );
    await ready();
    await page.evaluate(async () => {
      const { loadThreads, saveThreads } = await import(
        "./src/thread-store.js"
      );
      const d = await loadThreads();
      d.preferences.includeBuiltins = false;
      await saveThreads(d);
    });
  };
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await ready();
  const o = object(
    "Match fill and border",
    [
      [
        { x: -8, y: -6 },
        { x: 8, y: -6 },
        { x: 8, y: 6 },
        { x: -8, y: 6 },
      ],
    ],
    { color: "#e64caa", underlay: false },
  );
  o.operations = [makeOperation("fill", o), makeOperation("border", o)];
  o.operations[1].color = "#123456";
  const p = {
      version: 1,
      name: "Matching fixture",
      machine: "se700",
      objects: [o],
    },
    library = emptyThreads();
  library.preferences.includeBuiltins = false;
  library.records = [
    normalizeThread({
      brandName: "New brothread",
      lineName: "Personal fixture",
      number: "001",
      hex: "#e64caa",
    }),
    normalizeThread({
      brandName: "New brothread",
      lineName: "Personal fixture",
      number: "002",
      hex: "#123456",
    }),
    normalizeThread({
      brandName: "Simthread",
      lineName: "Personal fixture",
      number: "001",
      hex: "#e64caa",
    }),
  ];
  await page.evaluate(async (data) => {
    const { saveThreads } = await import("./src/thread-store.js");
    await saveThreads(data);
  }, library);
  console.log("Load matching fixture");
  await load(p);
  await page.locator(`[data-select="${o.id}"]`).click();
  await page.locator(`[data-operation="${o.operations[1].id}"]`).click();
  await page.locator("[data-thread-pick]").click();
  await page.locator("#thread-match").click();
  console.log("Open matching");
  await page.locator("#match-owned").check();
  assert.equal(await page.locator("#thread-match-apply").isDisabled(), true);
  assert.match(await page.locator("#match-count").innerText(), /No owned/);
  await page.locator("#match-owned").uncheck();
  await page.locator("#match-brand").selectOption("newbrothread");
  assert.equal(await page.locator("[data-match]").count(), 1);
  assert.match(await page.locator("[data-match]").inputValue(), /002/);
  await page.locator("#match-source").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => window.studio.getProject().objects[0].operations[1].physicalThread,
  );
  console.log("First assignment applied");
  let saved = await project();
  assert.equal(saved.objects[0].operations[0].physicalThread, undefined);
  assert.equal(
    saved.objects[0].operations[1].physicalThread.method,
    "algorithmic",
  );
  assert.equal(
    saved.objects[0].operations[1].physicalThread.designColor,
    "#123456",
  );
  await page.locator("#undo").click();
  assert.equal(
    (await project()).objects[0].operations[1].physicalThread,
    undefined,
  );
  await page.locator("#redo").click();
  await page.locator(`[data-select="${o.id}"]`).click();
  await page.locator(`[data-operation="${o.operations[1].id}"]`).click();
  await page.locator("[data-thread-pick]").click();
  await page.locator("#thread-match").click();
  await page.locator("#match-source").selectOption("current");
  await page.locator("#match-brand").selectOption("simthread");
  await page.locator("[data-match]").selectOption(library.records[2].id);
  assert.match(
    await page.locator("[data-match-note]").innerText(),
    /User-chosen.*large color difference/,
  );
  await page.locator("#thread-match-apply").click();
  saved = await project();
  assert.equal(saved.objects[0].operations[1].physicalThread.method, "user");
  assert.equal(
    saved.objects[0].operations[1].physicalThread.designColor,
    "#123456",
  );
  await load({ ...saved, name: "Reloaded substitution" });
  assert.equal(
    (await project()).objects[0].operations[1].physicalThread.thread.brandName,
    "Simthread",
  );
  // Two distinct spools with identical RGB must preserve the actual operator pause in all six writers.
  const a = object("Spool one", [], {
      type: "manual",
      color: "#e64caa",
      commands: [
        { cmd: "stitch", x: -5, y: 0 },
        { cmd: "stitch", x: -1, y: 0 },
      ],
    }),
    b = object("Spool two", [], {
      type: "manual",
      color: "#e64caa",
      commands: [
        { cmd: "stitch", x: 1, y: 0 },
        { cmd: "stitch", x: 5, y: 0 },
      ],
    });
  for (const [obj, r] of [
    [a, library.records[0]],
    [b, library.records[2]],
  ])
    obj.physicalThread = {
      version: 1,
      thread: r,
      designColor: "#e64caa",
      method: "user",
    };
  console.log("Substitution passed");
  const assignedFirst = structuredClone([a, b]),
    assignedLast = structuredClone([a, b]);
  delete assignedFirst[1].physicalThread;
  delete assignedLast[0].physicalThread;
  for (const [label, objects] of [
    ["Both assigned", [a, b]],
    ["Assigned first", assignedFirst],
    ["Assigned last", assignedLast],
  ])
    for (const format of ["pes", "pec", "dst", "exp", "jef", "vp3"]) {
      console.log("Same RGB export", label, format);
      await load({
        version: 1,
        name: label + " " + format,
        machine: "se700",
        objects,
      });
      const source = await page.evaluate(() => window.studio.getPlan().events);
      assert.equal(source.filter((e) => e.cmd === "color").length, 1);
      await page.locator("#export").click();
      await page.locator("#export-format").selectOption(format);
      const download = page.waitForEvent("download");
      await page.locator("#dialog-submit").click();
      await download;
      await page.waitForFunction(() =>
        document
          .getElementById("sequence-source")
          .textContent.includes("decoded"),
      );
      const decoded = await page.evaluate(() => window.studio.getPlan().events),
        pauses = decoded.filter((e) => ["color", "stop"].includes(e.cmd));
      assert.equal(pauses.length, 1);
      assert.equal(
        pauses[0].cmd,
        ["pes", "pec"].includes(format) ? "stop" : "color",
      );
      const needles = decoded.filter((e) => e.cmd === "stitch");
      let at = 0;
      for (const needle of source.filter((e) => e.cmd === "stitch")) {
        while (
          at < needles.length &&
          (Math.abs(needle.x - needles[at].x) > 0.11 ||
            Math.abs(needle.y - needles[at].y) > 0.11)
        )
          at++;
        assert.ok(at < needles.length);
        at++;
      }
      assert.deepEqual((await project()).objects, objects);
    }
  // Smart import can hand off directly to reviewed matches; source image and editable regions stay intact.
  console.log("Import handoff");
  const image = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 40;
    const g = c.getContext("2d");
    g.fillStyle = "#e64caa";
    g.fillRect(0, 0, 20, 40);
    g.fillStyle = "#123456";
    g.fillRect(20, 0, 20, 40);
    return c.toDataURL().split(",")[1];
  });
  await page.locator("#file-input").setInputFiles({
    name: "matching.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await page.locator("#image-import-mode").selectOption("trace");
  await page.locator("#dialog-submit").click();
  await page.locator("#trace-match-threads").check();
  await page.waitForFunction(
    () => !document.getElementById("dialog-submit").disabled,
  );
  await page.locator("#dialog-submit").click();
  await page.locator("#match-results").waitFor();
  assert.equal(await page.locator("[data-match]").count(), 2);
  const before = await project();
  assert.ok(before.groups.some((g) => g.imageSource));
  await page.locator("#thread-match-apply").click();
  const after = await project();
  const imported = after.objects.filter((o) => o.parentId);
  assert.equal(imported.length, 2);
  assert.ok(imported.every((o) => o.operations[0].physicalThread));
  await page.locator("#thread-library").click();
  await page.locator("#thread-match").click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator("#thread-match-apply").isVisible());
  assert.ok(
    await page.evaluate(
      () =>
        document.getElementById("thread-dialog").scrollWidth <=
        document.getElementById("thread-dialog").clientWidth + 2,
    ),
  );
  await page.screenshot({ path: "test-results/thread-matching-mobile.png" });
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator("#thread-dialog").evaluate((d) => d.open),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Thread matching: reviewed substitutions, source palette, Undo/Redo, persistence, 6 real formats, importer handoff and mobile passed.",
  );
} finally {
  await browser.close();
}
