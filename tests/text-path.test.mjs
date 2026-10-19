import test from "node:test";
import assert from "node:assert/strict";
import {
  baselineMeasure,
  layoutPathText,
  regeneratePathText,
  letteringCurve,
  updateLetteringCurve,
  inverseFrame,
  constructionBaseline,
} from "../src/text-path.js";
import { identity, compose, mapPoint } from "../src/smart-geometry.js";
import { transformSelection } from "../src/hierarchy.js";
import { object, validateProject } from "../src/model.js";
import { generate } from "../src/engine.js";
const curve = (nodes, closed = false) => ({ nodes, closed, frame: identity() }),
  glyph = {
    advance: 4,
    rings: [
      [
        { x: 0, y: 0 },
        { x: 0, y: -5 },
        { x: 3, y: -5 },
        { x: 3, y: 0 },
      ],
      [
        { x: 1, y: -1 },
        { x: 2, y: -1 },
        { x: 2, y: -4 },
        { x: 1, y: -4 },
      ],
    ],
  },
  source = (c) => ({
    content: "OOO",
    height: 5,
    font: "serif",
    lineSpacing: 1.3,
    tracking: 1,
    align: "center",
    frame: identity(),
    glyphs: Array.from({ length: 3 }, () => structuredClone(glyph)),
    path: { curve: c, offset: 0, normal: 0, reverse: false },
  }),
  near = (a, b, t = 1e-6) => assert(Math.abs(a - b) < t, `${a} != ${b}`);
test("path text uses physical advances and rigid tangent rotation while preserving glyph counters", () => {
  const s = source(
      curve([
        { x: -20, y: 0 },
        { x: 20, y: 0 },
      ]),
    ),
    r = layoutPathText(s);
  near(r.total, 14);
  near(r.placements[1].center.x, 0);
  near(r.placements[1].angle, 0);
  assert.equal(r.rings.length, 6);
  near(r.rings[0][1].y, -5);
  near(r.rings[0][2].x - r.rings[0][1].x, 3);
  const arc = curve(
    Array.from({ length: 65 }, (_, i) => ({
      x: 25 * Math.cos(Math.PI + (i * Math.PI) / 64),
      y: 25 * Math.sin(Math.PI + (i * Math.PI) / 64),
    })),
  );
  s.path.curve = arc;
  const a = layoutPathText(s);
  assert(a.placements[0].angle < a.placements[2].angle);
  for (let i = 0; i < 3; i++)
    near(
      Math.hypot(
        a.rings[i * 2][1].x - a.rings[i * 2][0].x,
        a.rings[i * 2][1].y - a.rings[i * 2][0].y,
      ),
      5,
    );
});

test("saved glyphs and baseline sources are validated, while old lettering still loads", () => {
  const o = object("Text", [], {
    textSource: source(
      curve([
        { x: -20, y: 0 },
        { x: 20, y: 0 },
      ]),
    ),
  });
  regeneratePathText(o);
  const p = { version: 1, name: "Path text", machine: "se700", objects: [o] };
  validateProject(p);
  for (const change of [
    (q) => (q.objects[0].textSource.path.curve.frame = [0, 0, 0, 0, 0, 0]),
    (q) => (q.objects[0].textSource.glyphs[0].advance = NaN),
    (q) => (q.objects[0].textSource.glyphs[0].rings[0][0].x = Infinity),
    (q) => q.objects[0].textSource.glyphs.pop(),
  ]) {
    const q = structuredClone(p);
    change(q);
    assert.throws(() => validateProject(q));
  }
  const reopened = validateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(reopened.objects, [o]);
  delete reopened.objects[0].textSource.path;
  delete reopened.objects[0].textSource.glyphs;
  validateProject(reopened);
});

test("baseline artwork is metadata, not sewn geometry or a hoop-fit violation", () => {
  const o = object("Text", [], {
    textSource: source(
      curve([
        { x: -90, y: 0 },
        { x: 90, y: 0 },
      ]),
    ),
  });
  regeneratePathText(o);
  const plan = generate({
    version: 1,
    name: "Baseline",
    machine: "se700",
    objects: [o],
    planning: { smallDetail: 0 },
  });
  assert(plan.stats.stitches > 0);
  assert(plan.stats.fits);
  assert(plan.stats.bounds.width < 20);
  assert(
    plan.events
      .filter((e) => e.cmd === "stitch")
      .every((e) => Math.abs(e.x) < 10),
  );
});
test("closed baselines wrap offsets without duplicating letters and reverse changes real contours", () => {
  const c = curve(
      Array.from({ length: 64 }, (_, i) => ({
        x: 20 * Math.cos((i * Math.PI) / 32),
        y: 20 * Math.sin((i * Math.PI) / 32),
      })),
      true,
    ),
    s = source(c),
    a = layoutPathText(s);
  s.path.offset = baselineMeasure(c).length;
  assert.deepEqual(layoutPathText(s).rings, a.rings);
  s.path.reverse = true;
  assert.notDeepEqual(layoutPathText(s).rings, a.rings);
});
test("overset and multiline text fail explicitly without clipping glyphs", () => {
  const s = source(
    curve([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]),
  );
  assert.throws(() => layoutPathText(s), /extends beyond/);
  s.path.curve.nodes[1].x = 40;
  s.path.offset = 30;
  assert.throws(() => layoutPathText(s), /extends beyond/);
  s.content = "O\nO";
  assert.throws(() => layoutPathText(s), /one line/);
});
test("baseline node edits after nonuniform scale and mirror preserve editable lettering frames", () => {
  const s = source(
      curve([
        { x: -20, y: 0, out: { x: -10, y: -10 } },
        { x: 20, y: 0, in: { x: 10, y: -10 } },
      ]),
    ),
    o = object("Text", [], { textSource: s });
  regeneratePathText(o);
  transformSelection([o], { sx: -1.2, sy: 0.8, angle: 25, dx: 3, dy: 2 });
  const before = structuredClone(o.rings);
  regeneratePathText(o);
  before.flat().forEach((p, i) => {
    near(p.x, o.rings.flat()[i].x);
    near(p.y, o.rings.flat()[i].y);
  });
  const frame = structuredClone(s.frame),
    c = letteringCurve(o);
  c.nodes[0].out.y -= 2;
  updateLetteringCurve(o, c);
  assert.deepEqual(s.frame, frame);
  assert.notDeepEqual(o.rings, before);
  const id = compose(frame, inverseFrame(frame));
  identity().forEach((v, i) => near(id[i], v));
});

test("unsupported baseline sources explain their limit and construction sources are retained", () => {
  assert.throws(
    () =>
      baselineMeasure(
        curve(
          [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
          true,
        ),
      ),
    /at least 3/,
  );
  assert.throws(
    () =>
      baselineMeasure(
        curve(Array.from({ length: 2001 }, (_, i) => ({ x: i, y: 0 }))),
      ),
    /Simplify/,
  );
  assert(!constructionBaseline({ operations: [{ type: "fill" }] }));
  assert(
    constructionBaseline({
      operations: [{ type: "placement" }, { type: "stop" }],
    }),
  );
  assert(constructionBaseline({ constructionArtworkIds: ["decoration"] }));
});

test("a rejected baseline reshape preserves the source curves and sewn contours", () => {
  const o = object("Text", [], {
    textSource: source(
      curve([
        { x: -20, y: 0 },
        { x: 20, y: 0 },
      ]),
    ),
  });
  regeneratePathText(o);
  const before = structuredClone(o),
    c = structuredClone(letteringCurve(o));
  c.nodes = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
  ];
  assert.throws(() => updateLetteringCurve(o, c), /extends beyond/);
  assert.deepEqual(o, before);
});
