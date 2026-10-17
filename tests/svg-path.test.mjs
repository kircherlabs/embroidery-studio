import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSVGPath, SVGPathError } from "../src/svg-path.js";

test("compact signs, decimals and exponents use SVG number grammar", () => {
  const [c] = parseSVGPath("m10-10 10 0 0 20z");
  assert.deepEqual(c.start, { x: 10, y: -10 });
  assert.deepEqual(
    c.segments.map((s) => s.end),
    [
      { x: 20, y: -10 },
      { x: 20, y: 10 },
      { x: 10, y: -10 },
    ],
  );
  assert.deepEqual(parseSVGPath("m.5-.5 1e1-2e-1")[0].segments[0].end, {
    x: 10.5,
    y: -0.7,
  });
});
test("relative moveto repetitions remain relative lineto and close resets the pen", () => {
  const c = parseSVGPath("M10 20l10 0z m5 5 10 0 0 10z");
  assert.deepEqual(c[1].start, { x: 15, y: 25 });
  assert.deepEqual(
    c[1].segments.map((s) => s.end),
    [
      { x: 25, y: 25 },
      { x: 25, y: 35 },
      { x: 15, y: 25 },
    ],
  );
});
test("move-only contours still set the current point for the next moveto", () => {
  const c = parseSVGPath("M10 20 m5 5 m3-2 10 0 0 10z");
  assert.deepEqual(c[2].start, { x: 18, y: 23 });
  assert.equal(c[0].segments.length, 0);
});
test("smooth curve controls are reflected before independent native sampling", () => {
  const c = parseSVGPath("M0 0c1 2 3 4 5 6s7 8 9 10q2 3 4 5t6 7")[0];
  assert.deepEqual(c.segments[1].args, [7, 8, 12, 14, 14, 16]);
  assert.deepEqual(c.segments[3].args, [20, 23, 24, 28]);
});
test("adjacent arc flags and endpoints are not parsed as one number", () => {
  const [c] = parseSVGPath("M0 0A10 20 30 0110-20a5 5 0 10-2-3");
  assert.deepEqual(c.segments[0].args, [10, 20, 30, 0, 1, 10, -20]);
  assert.deepEqual(c.segments[1].args, [5, 5, 0, 1, 0, 8, -23]);
});
test("open strokes after a close start a separate contour", () => {
  const c = parseSVGPath("M0 0L10 0L10 10Zl20 0");
  assert(c[0].closed);
  assert(!c[1].closed);
  assert.deepEqual(c[1].start, { x: 0, y: 0 });
});
test("invalid and non-finite path data fail before native sampling", () => {
  for (const d of [
    "MNaN 0L1 1",
    "m1e400 0",
    "M0 0L",
    "M0 0X1 1",
    "M0 0A1 1 0 2 0 1 1",
  ])
    assert.throws(() => parseSVGPath(d), SVGPathError);
  assert.deepEqual(parseSVGPath(""), []);
});
test("the unmodified user fixture has 96 nonempty paths, all parse with finite endpoints", () => {
  const xml = readFileSync(
    new URL("./fixtures/generated-artwork.svg", import.meta.url),
    "utf8",
  );
  const paths = [...xml.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map(
    (m) => m[1],
  );
  assert.equal(paths.length, 96);
  for (const d of paths) {
    assert(d.length);
    const contours = parseSVGPath(d);
    assert(contours.length);
    for (const c of contours)
      for (const s of c.segments)
        assert(
          [s.start.x, s.start.y, s.end.x, s.end.y, ...s.args].every(
            Number.isFinite,
          ),
        );
  }
});
