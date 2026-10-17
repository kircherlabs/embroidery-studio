import test from "node:test";
import assert from "node:assert/strict";
import {
  generate,
  inside,
  fillRows,
  resample,
  analyze,
  satin,
} from "../src/engine.js";
import {
  object,
  demo,
  validateProject,
  MACHINES,
  transform,
  objectBounds,
} from "../src/model.js";
import { traceLabels, vectorizePixels } from "../src/importers.js";
const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const project = (objects) => ({
  version: 1,
  name: "Test",
  machine: "se700",
  objects,
});
test("demo produces finite, quantized machine commands inside the SE700 hoop", () => {
  const plan = generate(demo());
  assert(plan.stats.stitches > 1500);
  assert(plan.stats.fits);
  assert(plan.stats.maxLength <= 7.01);
  assert(plan.events.some((e) => e.phase === "underlay"));
  assert(plan.stats.changes > 0);
  assert.equal(plan.events.at(-1).cmd, "end");
  for (const e of plan.events) {
    assert(Number.isFinite(e.x) && Number.isFinite(e.y));
    assert(Math.abs(e.x * 10 - Math.round(e.x * 10)) < 1e-8);
  }
});
test("fill respects holes and disconnected regions without sewing a connector across them", () => {
  const rings = [
    rect(-15, -10, 30, 20),
    rect(-5, -5, 10, 10),
    rect(20, -10, 5, 20),
  ];
  const plan = generate(
    project([
      object("Holed", rings, { angle: 0, compensation: 0, underlay: false }),
    ]),
  );
  let prev = { x: 0, y: 0 };
  for (const e of plan.events) {
    if (e.cmd === "stitch") {
      for (let j = 1; j < 10; j++) {
        const p = {
          x: prev.x + ((e.x - prev.x) * j) / 10,
          y: prev.y + ((e.y - prev.y) * j) / 10,
        };
        assert(
          !(p.x > -4.8 && p.x < 4.8 && p.y > -4.8 && p.y < 4.8),
          "stitch crosses hole",
        );
        assert(!(p.x > 15.2 && p.x < 19.8), "stitch crosses island gap");
      }
    }
    prev = e;
  }
  assert(plan.stats.jumps > 1);
});
test("normal fill joins adjacent rows without excessive trims", () => {
  const p = generate(
    project([
      object("Square", [rect(-10, -10, 20, 20)], {
        angle: 0,
        compensation: 0.15,
        underlay: false,
      }),
    ]),
  );
  assert(p.stats.trims < 5, `got ${p.stats.trims} trims`);
});
test("nonzero and evenodd fill rules differ for same-oriented nested contours", () => {
  const rings = [rect(0, 0, 10, 10), rect(2, 2, 6, 6)];
  assert(!inside({ x: 5, y: 5 }, rings));
  assert(inside({ x: 5, y: 5 }, rings, "nonzero"));
  const holed = [rings[0], [...rings[1]].reverse()];
  assert(!inside({ x: 5, y: 5 }, holed, "nonzero"));
});
test("fill angle and row spacing affect actual stitch coordinates", () => {
  const rings = [rect(-10, -10, 20, 20)],
    a = fillRows(rings, 0.4, 0, 3),
    b = fillRows(rings, 0.8, 90, 3);
  assert(a.length > b.length);
  assert.notDeepEqual(a[0], b[0]);
});
test("running and satin paths enforce a maximum segment length", () => {
  const p = [
    { x: -30, y: 0 },
    { x: 30, y: 0 },
  ];
  const run = resample(p, 2);
  assert.equal(run.length, 31);
  const s = satin(p, 4, 0.4, 7);
  assert(s.some((q) => q.y === 2));
  assert(s.some((q) => q.y === -2));
  const plan = generate(
    project([
      object("satin", [p], { type: "satin", width: 7, underlay: true }),
    ]),
  );
  assert(plan.stats.maxLength <= 7.01);
});
test("out of hoop is detected based on absolute placement", () => {
  const o = object("outside", [rect(48, 0, 10, 10)]);
  assert(!generate(project([o])).stats.fits);
});
test("hidden objects do not generate stitches and empty plans are valid", () => {
  const p = generate(
    project([object("Hidden", [rect(0, 0, 10, 10)], { visible: false })]),
  );
  assert.equal(p.events.length, 0);
  assert.equal(p.stats.colors, 0);
});
test("manual commands preserve order and source indices; long stitches split safely", () => {
  const o = object("manual", [], {
    type: "manual",
    commands: [
      { cmd: "jump", x: 0, y: 0 },
      { cmd: "stitch", x: 20, y: 0 },
      { cmd: "trim", x: 20, y: 0 },
      { cmd: "stop", x: 20, y: 0 },
    ],
  });
  const p = generate(project([o]));
  assert(p.stats.maxLength <= 7.01);
  assert(p.events.some((e) => e.cmd === "stop"));
  assert.equal(p.events.filter((e) => e.sourceIndex === 1).length, 3);
});
test("project validation rejects malformed and unbounded inputs", () => {
  assert.doesNotThrow(() => validateProject(demo()));
  const p = demo();
  p.objects[0].spacing = 0;
  assert.throws(() => validateProject(p));
  const q = demo();
  q.objects[0].rings[0][0].x = Infinity;
  assert.throws(() => validateProject(q));
  assert.throws(() => validateProject({ version: 2 }));
});
test("object transformations preserve expected dimensions", () => {
  const o = object("shape", [rect(-10, -5, 20, 10)]);
  transform(o, 2, 1, 90);
  const b = objectBounds(o);
  assert(Math.abs(b.width - 10) < 1e-6);
  assert(Math.abs(b.height - 40) < 1e-6);
});
test("raster tracing retains counters and handles diagonal contacts", () => {
  const w = 10,
    h = 10,
    l = new Int16Array(w * h).fill(-1);
  for (let y = 1; y < 9; y++)
    for (let x = 1; x < 9; x++)
      if (x < 3 || x > 6 || y < 3 || y > 6) l[y * w + x] = 0;
  const rings = traceLabels(l, w, h, 0);
  assert.equal(rings.length, 2);
  assert(!inside({ x: 5, y: 5 }, rings, "nonzero"));
  assert(inside({ x: 2, y: 2 }, rings, "nonzero"));
  const diagonal = traceLabels(
    new Int16Array([0, 0, -1, 0, 0, -1, -1, -1, 0]),
    3,
    3,
    0,
  );
  assert(diagonal.length >= 1);
});
test("image quantization and dominant border removal produce colored vector regions", () => {
  const width = 20,
    height = 20,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data.set(
        x > 4 && x < 15 && y > 4 && y < 15
          ? [200, 20, 20, 255]
          : [255, 255, 255, 255],
        i,
      );
    }
  const objects = vectorizePixels({ data, width, height }, 3, true, 50);
  assert.equal(objects.length, 1);
  assert.match(objects[0].color, /^#c81414$/);
  assert(generate(project(objects)).stats.stitches > 0);
});
