import test from "node:test";
import assert from "node:assert/strict";
import {
  closedOutlinePreview,
  drawClosedOutline,
} from "../src/outline-preview.js";
const points = (a) => a.map(([x, y]) => ({ x, y }));

test("simple and concave Closed Shape drafts keep placed segments and a separate closing edge without changing vertices", () => {
  for (const p of [
    points([
      [0, 0],
      [8, 0],
      [8, 8],
      [0, 8],
    ]),
    points([
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ]),
    points([
      [0.0137, -0.0273],
      [6.541, 0.0129],
      [3.0001, 4.12345],
    ]),
  ]) {
    const before = structuredClone(p),
      preview = closedOutlinePreview(p);
    assert.deepEqual(preview.intersections, []);
    assert.equal(preview.segments.length, p.length);
    assert.deepEqual(
      preview.segments.filter((s) => !s.closing).map((s) => [s.a, s.b]),
      p.slice(1).map((b, i) => [p[i], b]),
    );
    assert.deepEqual(
      [preview.segments.at(-1).a, preview.segments.at(-1).b],
      [p.at(-1), p[0]],
    );
    assert.equal(preview.segments.at(-1).closing, true);
    assert.deepEqual(p, before);
  }
});

test("crossings among committed segments and crossings on the temporary closing edge are distinguished", () => {
  const committed = closedOutlinePreview(
    points([
      [0, 0],
      [4, 4],
      [0, 4],
      [4, 0],
    ]),
  );
  assert.deepEqual(committed.intersections, [{ x: 2, y: 2, overlap: false }]);
  assert.deepEqual(
    committed.segments.map((s) => s.crossing),
    [true, false, true, false],
  );
  const closing = closedOutlinePreview(
    points([
      [0, 0],
      [4, 0],
      [0, 4],
      [4, 4],
    ]),
  );
  assert.deepEqual(closing.intersections, [{ x: 2, y: 2, overlap: false }]);
  assert.equal(closing.segments.at(-1).crossing, true);
  assert.equal(closing.segments.at(-1).closing, true);
});

test("normal shared vertices, repeated endpoints and zero-length segments do not raise false crossings", () => {
  for (const p of [
    [],
    points([[0, 0]]),
    points([
      [0, 0],
      [4, 0],
    ]),
    points([
      [0, 0],
      [4, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ]),
  ])
    assert.deepEqual(closedOutlinePreview(p).intersections, []);
});

test("backtracking overlaps and nonadjacent touches are flagged without moving the outline", () => {
  const p = points([
      [0, 0],
      [6, 0],
      [2, 0],
      [2, 4],
      [0, 4],
    ]),
    before = structuredClone(p);
  const preview = closedOutlinePreview(p);
  assert(preview.intersections.some((p) => p.overlap));
  assert(preview.segments[0].crossing && preview.segments[1].crossing);
  assert.deepEqual(p, before);
  const touching = closedOutlinePreview(
    points([
      [0, 0],
      [4, 0],
      [4, 4],
      [2, 0],
      [0, 4],
    ]),
  );
  assert.equal(touching.intersections.length, 1);
  assert.equal(touching.intersections[0].x, 2);
  assert.equal(touching.intersections[0].y, 0);
});

test("closing-edge warning clears as more points remove that intersection", () => {
  const p = points([
    [0, 0],
    [4, 0],
    [0, 4],
    [4, 4],
  ]);
  assert(closedOutlinePreview(p).segments.at(-1).crossing);
  p.push({ x: 5, y: 5 }, { x: -1, y: 5 }, { x: -1, y: -1 });
  assert.deepEqual(closedOutlinePreview(p).intersections, []);
});

test("outline rendering never fills a region, keeps committed edges solid and closure dashed at constant screen spacing", () => {
  const strokes = [],
    ctx = {
      save() {},
      restore() {},
      setLineDash(d) {
        this.dash = d;
      },
      beginPath() {
        this.path = [];
      },
      moveTo(x, y) {
        this.path.push(["M", x, y]);
      },
      lineTo(x, y) {
        this.path.push(["L", x, y]);
      },
      fill() {
        assert.fail("An unfinished Closed Shape must never be filled");
      },
      stroke() {
        strokes.push({
          path: this.path,
          dash: this.dash,
          alpha: this.globalAlpha,
          color: this.strokeStyle,
          width: this.lineWidth,
        });
      },
    };
  drawClosedOutline(
    ctx,
    closedOutlinePreview(
      points([
        [0, 0],
        [8, 0],
        [8, 8],
      ]),
    ),
    2,
  );
  assert.equal(strokes.length, 6); // coincident halo and foreground per edge.
  for (let i = 0; i < strokes.length; i += 2) {
    assert.deepEqual(strokes[i].path, strokes[i + 1].path);
    assert.deepEqual(strokes[i].dash, strokes[i + 1].dash);
    assert(strokes[i].width > strokes[i + 1].width);
  }
  const foreground = strokes.filter((_, i) => i % 2 === 1);
  assert(
    foreground.slice(0, 2).every((s) => s.dash.length === 0 && s.alpha === 1),
  );
  assert.deepEqual(foreground[2].path, [
    ["M", 8, 8],
    ["L", 0, 0],
  ]);
  assert.deepEqual(foreground[2].dash, [2, 2]);
  assert(foreground[2].alpha < 1);
  strokes.length = 0;
  drawClosedOutline(
    ctx,
    closedOutlinePreview(
      points([
        [0, 0],
        [4, 4],
        [0, 4],
        [4, 0],
      ]),
    ),
    1,
  );
  assert.equal(strokes.length, 10); // four double-stroked edges and an X, no filled bow-tie.
  assert.equal(strokes.at(-1).path.length, 4);
  assert.notEqual(strokes[1].color, strokes[3].color);
  assert.deepEqual(strokes[7].dash, [4, 4]);
});
