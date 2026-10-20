import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  detectColors,
  remapLabels,
  paletteMapping,
  borderMask,
  lab,
} from "../src/image-colors.js";
import { traceModel, applyTracePalette } from "../src/image-tracing.js";
import { inside, fillPolygons } from "../src/geometry.js";
import { generate } from "../src/engine.js";
import { validateProject, object } from "../src/model.js";
import { preferredExport, exportGuidance } from "../src/export-preferences.js";
const image = (w, h, paint) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) data.set(paint(x, y), 4 * (y * w + x));
    return { width: w, height: h, data };
  },
  index = (m, hex) => m.palette.findIndex((p) => p.hex === hex),
  settings = {
    width: 70,
    minArea: 0,
    simplify: 0,
    smoothing: false,
    choices: {},
    background: -1,
  },
  project = (objects) => ({
    version: 1,
    name: "Smart trace",
    machine: "se700",
    objects,
    groups: [],
    planning: { smallDetail: 0, optimizeColors: true },
  });
for (const bg of [
  [255, 255, 255, 255],
  [0, 0, 0, 255],
])
  test(`background ${bg[0]} is kept by default; connected-only proposal preserves enclosed identical details`, () => {
    const src = image(30, 30, (x, y) =>
        x >= 5 && x < 25 && y >= 5 && y < 25
          ? x >= 12 && x < 18 && y >= 12 && y < 18
            ? bg
            : [255, 40, 80, 255]
          : bg,
      ),
      m = detectColors(src, 8),
      b = index(m, bg[0] ? "#ffffff" : "#000000");
    assert.equal(m.background.color, b);
    assert.equal(m.background.confidence, "high");
    assert.equal(remapLabels(m).labels.filter((c) => c >= 0).length, 900);
    const mask = borderMask(m, b);
    assert.equal(mask.count, 500);
    assert.equal(mask.mask[15 * 30 + 15], 0);
    const removed = remapLabels(m, {}, b).labels;
    assert.equal(removed.filter((c) => c >= 0).length, 400);
    assert.equal(removed[15 * 30 + 15], b);
  });
test("transparent borders and uncertain/multicolor edges never trigger removal by themselves", () => {
  const transparent = detectColors(
    image(24, 24, (x, y) =>
      x < 4 || x > 19 || y < 4 || y > 19 ? [0, 0, 0, 0] : [10, 130, 220, 255],
    ),
    4,
  );
  assert.equal(transparent.background.confidence, "none");
  assert.equal(traceModel(transparent, settings).coverage, 256);
  const varied = detectColors(
    image(24, 24, (x, y) => [(x % 3) * 100, (y % 3) * 100, 120, 255]),
    12,
  );
  assert.equal(traceModel(varied, settings).coverage, 576);
  assert.equal(varied.background.confidence, "low");
});
test("unchecking shades merges every pixel; manual targets, remapping and last-color validation are deterministic", () => {
  const values = [
      [235, 20, 120, 255],
      [242, 110, 168, 255],
      [160, 20, 85, 255],
      [20, 90, 230, 255],
      [255, 255, 255, 255],
    ],
    m = detectColors(
      image(50, 20, (x) => values[Math.floor(x / 10)]),
      8,
    ),
    light = index(m, "#f26ea8"),
    dark = index(m, "#a01455"),
    pink = index(m, "#eb1478"),
    blue = index(m, "#145ae6"),
    choices = { "#f26ea8": { keep: false }, "#a01455": { keep: false } };
  const result = remapLabels(m, choices);
  assert.equal(result.mapping[light], pink);
  assert.equal(result.mapping[dark], pink);
  assert(result.labels.every((c) => c >= 0));
  choices["#f26ea8"].target = "#145ae6";
  assert.equal(paletteMapping(m.palette, choices)[light], blue);
  choices["#145ae6"] = { keep: false };
  assert.notEqual(paletteMapping(m.palette, choices)[light], blue);
  const allOff = Object.fromEntries(
    m.palette.map((p) => [p.hex, { keep: false }]),
  );
  assert.throws(() => paletteMapping(m.palette, allOff), /at least one/);
  const removed = remapLabels(m, { "#f26ea8": { transparent: true } });
  assert.equal(removed.labels.filter((c) => c < 0).length, 200);
  assert.deepEqual(
    detectColors(
      image(50, 20, (x) => values[Math.floor(x / 10)]),
      8,
    ).labels,
    m.labels,
  );
});
test("merged adjacent regions consolidate before tracing; holes and full coverage are retained", () => {
  const m = detectColors(
      image(24, 24, (x, y) =>
        x >= 9 && x < 15 && y >= 9 && y < 15
          ? [0, 0, 0, 0]
          : x < 12
            ? [200, 20, 100, 255]
            : [250, 130, 170, 255],
      ),
      8,
    ),
    choices = { "#fa82aa": { keep: false } },
    result = traceModel(m, { ...settings, choices });
  assert.equal(result.objects.length, 1);
  assert.equal(result.objects[0].rings.length, 2);
  assert.equal(result.coverage, 540);
  assert(!inside({ x: 0, y: 0 }, result.objects[0].rings, "nonzero"));
  assert(fillPolygons(result.objects[0].rings, "nonzero"));
  // Exact source pixel-center classification is preserved by the actual vector contours.
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++)
      assert.equal(
        inside(
          { x: ((x + 0.5) * 70) / 24 - 35, y: ((y + 0.5) * 70) / 24 - 35 },
          result.objects[0].rings,
          "nonzero",
        ),
        m.labels[y * 24 + x] >= 0,
      );
});
test("shared color boundaries remain exact through smoothing/simplification; noise reassignment makes no holes", () => {
  const m = detectColors(
      image(40, 30, (x, y) =>
        x < 20 + (y % 6 < 3 ? 2 : 0)
          ? [240, 100, 90, 255]
          : [40, 100, 220, 255],
      ),
      4,
    ),
    result = traceModel(m, {
      ...settings,
      smoothing: true,
      simplify: 0.25,
      minArea: 0.1,
    });
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 40; x++) {
      const p = {
        x: ((x + 0.5) * 70) / 40 - 35,
        y: ((y + 0.5) * 70) / 40 - 26.25,
      };
      assert.equal(
        result.objects.filter((o) => inside(p, o.rings, "nonzero")).length,
        1,
      );
    }
  const noise = detectColors(
      image(40, 30, (x, y) =>
        x === 12 && y === 12 ? [0, 0, 0, 255] : [255, 255, 255, 255],
      ),
      4,
    ),
    clean = traceModel(noise, { ...settings, minArea: 4 });
  assert.equal(clean.coverage, 1200);
  assert.equal(clean.objects.length, 1);
  assert.equal(clean.cleaned, 1);
});
for (const count of [4, 6, 8, 12, 24, 32, 64])
  test(`${count}-color realistic-size trace retains palette, valid geometry and machine-safe generated instructions`, () => {
    const colors = Array.from({ length: count }, (_, i) => [
        32 + (i % 4) * 65,
        24 + (Math.floor(i / 4) % 4) * 65,
        36 + (Math.floor(i / 16) % 4) * 65,
        255,
      ]),
      src = image(
        384,
        288,
        (x, y) => colors[(Math.floor(x / 48) + Math.floor(y / 36) * 8) % count],
      ),
      start = performance.now(),
      m = detectColors(src, count),
      result = traceModel(m, {
        ...settings,
        width: 70,
        minArea: 0.01,
        simplify: 0.03,
      });
    assert.equal(m.palette.length, count);
    assert.equal(result.objects.length, count);
    assert.equal(result.coverage, 384 * 288);
    assert(result.objects.every((o) => fillPolygons(o.rings, "nonzero")));
    const p = project(result.objects);
    validateProject(p);
    const plan = generate(p);
    assert(plan.stats.fits);
    assert(plan.stats.stitches > 0);
    assert(plan.stats.maxLength <= 7.001);
    assert.equal(plan.stats.uniqueColors, count);
    assert(
      performance.now() - start < 15000,
      "Representative color traces must not stall processing",
    );
  });
test("64 colors at one-megapixel processing resolution are deterministic and bounded", () => {
  const src = image(1024, 768, (x, y) => [
      32 + (Math.floor(x / 128) % 4) * 64,
      32 + (Math.floor(y / 96) % 4) * 64,
      32 + (Math.floor(x / 512) + Math.floor(y / 384) * 2) * 64,
      255,
    ]),
    start = performance.now(),
    m = detectColors(src, 64);
  assert.equal(m.palette.length, 64);
  assert(m.histogramBins <= 32768);
  assert(performance.now() - start < 10000);
});

for (const count of [12, 24, 32, 64])
  test(`${count}-color curved flower illustration retains its counter and practical contours`, () => {
    const colors = Array.from({ length: count }, (_, i) => [
      32 + (i % 4) * 65,
      24 + (Math.floor(i / 4) % 4) * 65,
      36 + (Math.floor(i / 16) % 4) * 65,
      255,
    ]);
    const src = image(512, 384, (x, y) => {
        const dx = x - 256,
          dy = y - 192,
          r = Math.hypot(dx, dy),
          angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
        return r > 30 && r < 125 + 20 * Math.cos(angle * 8)
          ? colors[Math.floor((angle * count) / (Math.PI * 2))]
          : [255, 255, 255, 255];
      }),
      start = performance.now(),
      model = detectColors(src, count),
      result = traceModel(model, {
        ...settings,
        minArea: 0.015,
        simplify: 0.04,
        smoothing: true,
      });
    assert.equal(model.palette.length, count);
    assert.equal(result.coverage, 512 * 384);
    assert(result.nodes < 30000);
    assert(result.objects.every((o) => fillPolygons(o.rings, "nonzero")));
    const white = index(model, "#ffffff"),
      removed = remapLabels(model, {}, white);
    assert(white >= 0);
    assert.equal(model.background.color, white);
    assert.equal(removed.labels[192 * 512 + 256], white);
    const plan = generate(project(result.objects));
    assert(plan.stats.fits);
    assert(plan.stats.maxLength <= 7.001);
    assert(plan.stats.stitches > 1000);
    assert(performance.now() - start < 15000);
  });
test("post-import palette edits preserve rings, overrides, operations, manual ordering and persisted source choices", () => {
  const palette = ["#e81880", "#f588b6", "#2369d0"].map((hex) => ({
      hex,
      lab: lab(
        hex
          .slice(1)
          .match(/../g)
          .map((x) => parseInt(x, 16)),
      ),
    })),
    o = object(
      "Edited",
      [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 6 },
          { x: 0, y: 6 },
        ],
      ],
      {
        color: "#f588b6",
        operations: [
          {
            id: "fill",
            name: "Fill",
            type: "fill",
            color: "#f588b6",
            spacing: 0.43,
          },
          {
            id: "border",
            name: "Border",
            type: "border",
            color: "#12ab34",
            width: 2,
          },
        ],
      },
    ),
    before = structuredClone(o),
    choices = { "#f588b6": { keep: false, target: "#e81880" } };
  assert.equal(applyTracePalette([o], palette, choices), 1);
  assert.deepEqual(o.rings, before.rings);
  assert.equal(o.operations[0].color, "#e81880");
  assert.equal(o.operations[1].color, "#12ab34");
  assert.equal(o.operations[0].spacing, 0.43);
  const p = project([o]);
  p.groups = [
    {
      id: "trace",
      name: "Source",
      kind: "svg",
      imageSource: {
        data: "data:image/png;base64,YQ==",
        width: 100,
        height: 100,
        name: "Source",
      },
      traceSettings: {
        colors: 64,
        width: 70,
        minArea: 0,
        simplify: 0,
        alpha: 100,
        smoothing: false,
        removeBackground: false,
        background: -1,
        resolution: 640,
        palette: palette.map((p) => p.hex),
        choices,
      },
    },
  ];
  validateProject(JSON.parse(JSON.stringify(p)));
  p.groups[0].traceSettings.colors = 10;
  validateProject(p);
  p.groups[0].traceSettings.colors = 129;
  assert.throws(() => validateProject(p));
});
test("export defaults are exact-model preferences, including future verified JEF profiles; unknown hoops are explicit", () => {
  assert.equal(preferredExport("se700"), "pes");
  assert.equal(preferredExport("se700", { se700: "dst" }), "dst");
  assert.equal(preferredExport("se700", { generic200: "jef" }), "pes");
  assert.equal(
    preferredExport(
      "janome-exact",
      {},
      { "janome-exact": { preferred: "jef" } },
    ),
    "jef",
  );
  assert.match(exportGuidance("brother130", "pes"), /not a verified/);
  assert.match(exportGuidance("se700", "jef"), /does not list/);
});
