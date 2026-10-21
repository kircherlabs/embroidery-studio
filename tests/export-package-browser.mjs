import { makeOperation } from "../src/operations.js";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "../vendor/fflate.js";
import { object, validateProject } from "../src/model.js";
import { selectEquipment } from "../src/equipment.js";
import { packageName } from "../src/export-package.js";
import { decodePes } from "./helpers/pes-decoder.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
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
  page.setDefaultTimeout(180000);
  page.on("pageerror", (e) => errors.push(e.message));
  // Observe actual existing worker outputs without modifying requests, responses or exporter behavior.
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.__formatBytes = {};
    window.Worker = class extends Native {
      constructor(url, options) {
        super(url, options);
        this.formats = new Map();
        if (String(url).includes("format-worker"))
          this.addEventListener("message", ({ data }) => {
            if (data.bytes)
              window.__formatBytes[this.formats.get(data.id)] = Array.from(
                data.bytes,
              );
          });
      }
      postMessage(data, ...rest) {
        if (data.action === "export") this.formats.set(data.id, data.format);
        return super.postMessage(data, ...rest);
      }
    };
  });
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173/");
  await page.waitForFunction(() => window.studio?.getPlan());
  const ring = (r) => [
    { x: -r, y: -r },
    { x: r, y: -r },
    { x: r, y: r },
    { x: -r, y: r },
  ];
  const fixture = {
    version: 1,
    name: "Design / package: test",
    machine: "se700",
    objects: [
      object("Fill with hole", [ring(9), ring(3).reverse()], {
        color: "#123456",
        underlay: false,
      }),
      (() => {
        const o = object("Border", [ring(13)], { color: "#dd6633" });
        o.operations = [makeOperation("border", o)];
        return o;
      })(),
    ],
  };
  const load = async (p) => {
    validateProject(p);
    await page
      .locator("#file-input")
      .setInputFiles({
        name: "package.embstudio",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(p)),
      });
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      (n) => window.studio.getProject().name === n,
      p.name,
    );
    await page.waitForFunction(
      () => document.querySelector("#file-input").value === "",
    );
    await page.waitForFunction(() => window.studio.getPlan());
  };
  const prepare = async () => {
    await page.locator("#export").click();
    await page.locator("#export-format").selectOption("zip");
    await page.locator("#dialog-submit").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#dialog-title")?.textContent ===
        "Review design package",
    );
  };
  await load(fixture);
  const original = await page.evaluate(() => window.studio.getProject()),
    plan = await page.evaluate(() => window.studio.getPlan());
  await prepare();
  assert.match(
    await page.locator("#dialog").innerText(),
    /6 validated machine files/,
  );
  await page.screenshot({ path: "test-results/export-package-desktop.png" });
  const pending = page.waitForEvent("download");
  await page.locator("#dialog-submit").click();
  const file = await pending;
  assert.equal(file.suggestedFilename(), packageName(fixture.name) + ".zip");
  const entries = unzipSync(new Uint8Array(await readFile(await file.path())));
  assert.equal(Object.keys(entries).length, 8);
  const observed = await page.evaluate(() => window.__formatBytes);
  for (const format of ["pes", "pec", "dst", "exp", "jef", "vp3"])
    assert.deepEqual(
      entries[packageName(fixture.name) + "." + format],
      new Uint8Array(observed[format]),
      "archive bytes equal actual standalone writer output for " + format,
    );
  const pes = decodePes(entries[packageName(fixture.name) + ".pes"]);
  assert.equal(pes.pec.declaredWidth, Math.round(plan.stats.bounds.width * 10));
  assert.equal(
    pes.pec.declaredHeight,
    Math.round(plan.stats.bounds.height * 10),
  );
  assert.match(strFromU8(entries["THREAD-SEQUENCE.csv"]), /#123456/);
  assert.match(strFromU8(entries["README.txt"]), /universal|every machine/i);
  assert.deepEqual(
    await page.evaluate(() => window.studio.getProject()),
    original,
  );
  // Independent standalone PES download must be byte-identical to the packaged PES.
  await page.locator("#export").click();
  await page.locator("#export-format").selectOption("pes");
  const standalonePending = page.waitForEvent("download");
  await page.locator("#dialog-submit").click();
  const standalone = await standalonePending;
  assert.deepEqual(
    new Uint8Array(await readFile(await standalone.path())),
    entries[packageName(fixture.name) + ".pes"],
  );
  await page.waitForFunction(() =>
    document.querySelector("#sequence-source").textContent.includes("decoded"),
  );
  // Required construction stop omits VP3 and stays visible both in review and ZIP docs.
  const paused = {
    version: 1,
    name: "Required fabric stop",
    machine: "se700",
    objects: [
      object("Manual stop", [], {
        type: "manual",
        color: "#123456",
        commands: [
          { cmd: "stitch", x: -2, y: -1 },
          { cmd: "stop", x: -2, y: -1 },
          { cmd: "stitch", x: 2, y: 1 },
        ],
      }),
    ],
  };
  await load(paused);
  await prepare();
  assert.match(await page.locator("#dialog").innerText(), /VP3.*standalone/s);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page
      .locator("#dialog")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 2),
  );
  await page.screenshot({ path: "test-results/export-package-mobile.png" });
  const stopPending = page.waitForEvent("download");
  await page.locator("#dialog-submit").click();
  const stopFile = await stopPending;
  const stopEntries = unzipSync(
    new Uint8Array(await readFile(await stopFile.path())),
  );
  assert.ok(!Object.keys(stopEntries).some((n) => n.endsWith(".vp3")));
  assert.match(strFromU8(stopEntries["README.txt"]), /VP3:.*standalone/);
  assert.match(strFromU8(stopEntries["THREAD-SEQUENCE.csv"]), /Operator stop/);
  // Large-field JEF is explicitly unavailable; cancellation downloads nothing and releases busy state.
  const large = {
    version: 1,
    name: "Large guarded package",
    machine: "se700",
    objects: [
      object(
        "Tall path",
        [
          [
            { x: 0, y: -105 },
            { x: 0, y: 105 },
          ],
        ],
        { type: "run", closed: false },
      ),
    ],
  };
  selectEquipment(large, "janome-mc550e", "janome-re36b");
  await load(large);
  await prepare();
  assert.match(await page.locator("#dialog").innerText(), /JEF.*200 mm/s);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#export").disabled);
  assert.deepEqual(
    await page.evaluate(() => window.studio.getProject()),
    large,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser ZIP, all six byte-identical writer entries, standalone PES match, actual dimensions, holes/colors, STOP/JEF omissions, docs, cancel, mobile and project preservation",
  );
} finally {
  await browser.close();
}
