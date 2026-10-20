import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { object, validateProject } from "../src/model.js";
import { selectEquipment } from "../src/equipment.js";
import { decodePes } from "./helpers/pes-decoder.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  browser = await chromium.launch({
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
  page.on("pageerror", (e) => errors.push(e.stack));
  page.setDefaultTimeout(180000);
  const event = (cmd, x = 0, y = 0, color = "#102080") => ({
      cmd,
      x,
      y,
      color,
    }),
    events = [
      event("jump", -9, -7),
      event("stitch", -9, -7),
      event("stitch", -9, -3),
      event("stitch", -5, -3),
      event("trim", -5, -3),
      event("color", -5, -3, "#df2060"),
      event("jump", 20, 15, "#df2060"),
      event("stitch", 20, 15, "#df2060"),
      event("stitch", 24, 17, "#df2060"),
      event("end", 24, 17, "#df2060"),
    ];
  const fixture = (name, commands = events) => {
      const objects = [];
      let points = [],
        color = commands[0]?.color || "#102080";
      const flush = () => {
        if (points.length)
          objects.push(
            object("Manual geometry " + objects.length, [], {
              type: "manual",
              color,
              commands: points,
            }),
          );
        points = [];
      };
      for (const e of commands) {
        if (e.cmd === "color") {
          flush();
          color = e.color;
        } else if (e.cmd !== "end") points.push(e);
      }
      flush();
      return validateProject({ version: 1, name, machine: "se700", objects });
    },
    project = () => page.evaluate(() => window.studio.getProject()),
    ready = () => page.waitForFunction(() => window.studio?.getPlan()),
    load = async (p) => {
      await page.locator("#file-input").setInputFiles({
        name: "format.embstudio",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(p)),
      });
      await page.locator("#dialog-submit").click();
      await page.waitForFunction(
        (n) => window.studio.getProject().name === n,
        p.name,
      );
      await ready();
    };
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await ready();
  for (const format of ["pes", "pec", "jef", "exp", "dst", "vp3"]) {
    console.log("Exporting", format);
    await load(fixture("Actual " + format));
    const original = await project(),
      needles = await page.evaluate(() =>
        window.studio
          .getPlan()
          .events.filter((e) => e.cmd === "stitch")
          .map(({ x, y }) => [x, y]),
      );
    await page.locator("#export").click();
    await page.locator("#export-format").selectOption(format);
    assert.equal(await page.locator("#dialog-submit").isEnabled(), true);
    const downloaded = page.waitForEvent("download");
    await page.locator("#dialog-submit").click();
    const download = await downloaded;
    await page.waitForFunction(
      () =>
        window.studio.getPlan() &&
        document
          .getElementById("sequence-source")
          .textContent.includes("decoded"),
    );
    const decoded = await page.evaluate(() =>
      window.studio
        .getPlan()
        .events.filter((e) => e.cmd === "stitch")
        .map(({ x, y }) => [x, y]),
    );
    assert.equal(decoded.length, needles.length);
    for (let i = 0; i < needles.length; i++)
      for (let axis = 0; axis < 2; axis++)
        assert.ok(Math.abs(decoded[i][axis] - needles[i][axis]) <= 0.11);
    assert.deepEqual(await project(), original);
    if (["dst", "exp", "jef", "vp3"].includes(format))
      assert.ok(
        (await page.locator("#warnings .design-issue.info").count()) > 0,
        "Conversion guidance remains in Design Issues after download",
      );
    if (format === "pes") {
      const parsed = decodePes(
        new Uint8Array(await readFile(await download.path())),
      );
      assert.equal(parsed.pec.declaredWidth, 330);
      assert.equal(parsed.pec.declaredHeight, 240);
    }
  }
  await load(
    fixture("Construction pause", [
      event("stitch"),
      event("stop"),
      event("stitch", 2),
      event("end", 2),
    ]),
  );
  await page.locator("#export").click();
  await page.locator("#export-format").selectOption("vp3");
  assert.equal(await page.locator("#dialog-submit").isDisabled(), true);
  assert.match(
    await page.locator("#export-safety").innerText(),
    /cannot preserve standalone machine stops/,
  );
  await page.locator("#export-format").selectOption("dst");
  assert.equal(await page.locator("#dialog-submit").isEnabled(), true);
  assert.match(
    await page.locator("#export-safety").innerText(),
    /color-change pauses/,
  );
  await page.keyboard.press("Escape");
  const large = fixture("Full RE28b guarded", [
    event("jump", 0, -110),
    event("stitch", 0, -110),
    event("jump", 0, 110),
    event("stitch", 0, 110),
    event("end", 0, 110),
  ]);
  selectEquipment(large, "janome-mc500e", "janome-re28b");
  await load(large);
  await page.locator("#export").click();
  assert.equal(await page.locator("#export-format").inputValue(), "jef");
  assert.equal(await page.locator("#dialog-submit").isDisabled(), true);
  assert.match(
    await page.locator("#export-safety").innerText(),
    /full RE28b field is not yet export-verified/,
  );
  await page.keyboard.press("Escape");
  const b = fixture("BERNINA documented");
  selectEquipment(b, "bernina-b500", "bernina-large-oval");
  await load(b);
  await page.locator("#export").click();
  assert.equal(await page.locator("#export-format").inputValue(), "exp");
  assert.match(
    await page.locator("#export-format-guidance").innerText(),
    /documented/,
  );
  assert.match(await page.locator("#export-safety").innerText(), /oval hoop/);
  assert.match(
    await page.locator("#export-safety").innerText(),
    /not embedded/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#dialog-submit").scrollIntoViewIfNeeded();
  const box = await page.locator("#dialog").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 391);
  await page.screenshot({ path: "test-results/export-safety-mobile.png" });
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "Export safety: six real downloads with every decoded needle, independent PES extents, untouched projects, documented model defaults, blocked VP3 stops and large JEF headers, pause/palette/trim/oval guidance and mobile passed.",
  );
} finally {
  await browser.close();
}
