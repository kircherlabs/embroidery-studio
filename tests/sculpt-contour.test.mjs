import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { sculptArtwork, nearestSegment } from "../src/path-editing.js";
import { sculptIntersections, sculptTolerance } from "../src/sculpt-contour.js";
import { fillPolygons, inside } from "../src/geometry.js";
import { object, validateProject } from "../src/model.js";
import { generate } from "../src/engine.js";
import { identity, curveRings } from "../src/smart-geometry.js";
import { makeOperation } from "../src/operations.js";
import {
  sculptFixtures,
  lineHit,
  intendedContour,
  deviation,
  rect,
  project,
} from "./helpers/sculpt-fixture.mjs";

const report = [];
test("repeated imported-contour sculpts retain only geometry justified by physical tolerance", () => {
  for (const original of sculptFixtures())
    for (const reach of [1, 2, 5, 10]) {
      const o = structuredClone(original),
        counts = [o.rings[0].length];
      let maximumError = 0;
      const started = performance.now();
      for (let i = 0; i < 50; i++) {
        const before = structuredClone(o.rings),
          hit = lineHit(o.rings[0], { x: 0, y: -15 - i * 0.08 });
        const intended = intendedContour(
          before[0],
          hit,
          { x: 0, y: -0.08 },
          reach,
        );
        sculptArtwork(o, hit, { x: 0, y: -0.08 }, reach);
        const error = deviation(o.rings[0], intended);
        maximumError = Math.max(error, maximumError);
        assert(
          error <= sculptTolerance(reach) + 0.0001,
          `${o.name}/${reach}: ${error} mm`,
        );
        assert(!sculptIntersections(o.rings), `${o.name}: valid edges`);
        assert.deepEqual(
          o.rings.slice(1),
          before.slice(1),
          "other counters and islands unchanged",
        );
        assert.equal(
          fillPolygons(o.rings, o.fillRule).length,
          fillPolygons(before, o.fillRule).length,
        );
        assert.equal(o.spacing, original.spacing);
        if ([0, 9, 49].includes(i)) counts.push(o.rings[0].length);
      }
      // Compare retained complexity with the independent dense target, rather than
      // imposing an editor node limit. Distant original anchors deliberately stay.
      const hit = lineHit(o.rings[0], { x: 0, y: -19 });
      const unchanged = JSON.stringify(o);
      sculptArtwork(o, hit, { x: 0, y: 0 }, reach);
      assert.equal(
        JSON.stringify(o),
        unchanged,
        "no-motion gesture does not refine or detach sources",
      );
      validateProject(JSON.parse(JSON.stringify(project([o]))));
      report.push({
        shape: o.name,
        reach,
        counts,
        maximumPerEditDeviationMM: maximumError,
        milliseconds: performance.now() - started,
      });
    }
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/sculpt-accuracy.json",
    JSON.stringify(report, null, 2),
  );
});

test("revisiting the same bend does not add two permanent support-boundary nodes per drag", () => {
  const o = sculptFixtures()[0],
    counts = [];
  for (let i = 0; i < 100; i++) {
    const hit = lineHit(o.rings[0], { x: 0, y: -15 });
    sculptArtwork(o, hit, { x: 0, y: i % 2 ? 0.12 : -0.12 }, 2);
    counts.push(o.rings[0].length);
  }
  assert(Math.max(...counts.slice(20)) <= Math.max(...counts.slice(0, 20)) + 2);
  assert(!sculptIntersections(o.rings));
});

test("small-reach edits preserve distant sharp detail, holes, islands, colors and operations", () => {
  const o = sculptFixtures()[3];
  o.rings.push(rect(-3, -2, 6, 4).reverse(), rect(35, -2, 2, 2));
  o.operations = [
    makeOperation("fill", { color: "#ba4662", spacing: 0.42 }),
    makeOperation("border", { color: "#000080" }),
  ];
  const source = structuredClone(o),
    settings = JSON.stringify(o.operations);
  sculptArtwork(
    o,
    lineHit(o.rings[0], { x: 0, y: -15 }),
    { x: 0.2, y: -0.4 },
    1,
  );
  assert.deepEqual(o.rings.slice(1), source.rings.slice(1));
  for (const p of source.rings[0].filter((p) => p.y >= 6))
    assert(
      o.rings[0].some((q) => q.x === p.x && q.y === p.y),
      "small sharp cutout kept exactly",
    );
  assert.equal(JSON.stringify(o.operations), settings);
  assert(!inside({ x: 0, y: 0 }, o.rings, o.fillRule));
  const a = generate(project([source])),
    b = generate(project([o]));
  assert.notDeepEqual(a.events, b.events);
  assert(b.events.some((e) => e.cmd === "stitch"));
  assert(!sculptIntersections(o.rings));
});

test("Bézier sources retain anchors and handles, not flattened editing nodes", () => {
  const curve = {
    frame: identity(),
    closed: false,
    nodes: [
      { x: -20, y: 0, out: { x: -8, y: -8 } },
      { x: 20, y: 0, in: { x: 8, y: -8 } },
    ],
  };
  const o = object("Curve", curveRings(curve), {
    type: "run",
    closed: false,
    curve,
  });
  for (let i = 0; i < 50; i++) {
    const hit = nearestSegment(o, { x: 0, y: -6 });
    sculptArtwork(o, hit, { x: 0, y: i % 2 ? 0.1 : -0.1 }, 2);
  }
  assert.equal(o.curve.nodes.length, 2);
  assert(o.rings[0].length > 2);
  assert.deepEqual(
    o.curve.nodes.map(({ x, y }) => ({ x, y })),
    curve.nodes.map(({ x, y }) => ({ x, y })),
  );
});

test("open endpoints, wrapped closed seams and explicit duplicate closures stay valid", () => {
  for (const closed of [false, true])
    for (const duplicate of [false, true]) {
      const ring = rect(-10, -10, 20, 20);
      if (closed && duplicate) ring.push({ ...ring[0] });
      const o = object("Seam", [ring], {
        type: closed ? "fill" : "run",
        closed,
      });
      const hit = lineHit(ring, { x: -8, y: -10 }, closed);
      const end = { ...ring.at(-1) };
      sculptArtwork(o, hit, { x: -0.1, y: -0.4 }, 5);
      assert(!sculptIntersections(o.rings, closed));
      if (!closed) assert.deepEqual(o.rings[0].at(-1), end);
      if (closed && duplicate)
        assert.deepEqual(o.rings[0][0], o.rings[0].at(-1));
    }
});

test("topology guard detects crossings/touches without mistaking adjacent or closure edges", () => {
  assert(!sculptIntersections([rect(0, 0, 10, 10), rect(2, 2, 2, 2)]));
  assert(
    sculptIntersections([
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ],
    ]),
  );
  assert(sculptIntersections([rect(0, 0, 10, 10), rect(9, 2, 2, 2)]));
  assert(sculptIntersections([rect(0, 0, 10, 10), rect(10, 2, 2, 2)]));
  assert(
    sculptIntersections([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    ]),
    "adjacent backtracking overlaps are invalid too",
  );
  assert(
    !sculptIntersections([
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
      ],
    ]),
    "duplicate samples/closure do not create false crossings",
  );
});

test("strong and tiny sculpt drags satisfy the same physical error budget", () => {
  for (const reach of [0.2, 1, 2, 5, 10])
    for (const amount of [0.03, 0.5, 2]) {
      const o = sculptFixtures()[0],
        hit = lineHit(o.rings[0], { x: 2.5, y: -15 }),
        delta = { x: amount / 3, y: -amount },
        target = intendedContour(o.rings[0], hit, delta, reach);
      sculptArtwork(o, hit, delta, reach);
      assert(deviation(o.rings[0], target) <= sculptTolerance(reach) + 0.0001);
    }
  const o = object("Small closed", [rect(-1, -1, 2, 2)], {
    type: "fill",
    closed: true,
  });
  const hit = lineHit(o.rings[0], { x: 0, y: -1 }),
    delta = { x: 0, y: -0.4 };
  const target = intendedContour(o.rings[0], hit, delta, 10);
  sculptArtwork(o, hit, delta, 10);
  assert(deviation(o.rings[0], target) <= 0.025);
  assert(!sculptIntersections(o.rings));
});
