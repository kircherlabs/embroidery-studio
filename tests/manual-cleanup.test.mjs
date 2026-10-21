import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  estimateCleanup,
  drawCleanupOverlay,
  cleanupDescription,
} from "../src/manual-cleanup.js";
import {
  timelineMarkers,
  clusterMarkers,
  timelineWindow,
} from "../src/sequence-timeline.js";
import { generate } from "../src/engine.js";
import { object } from "../src/model.js";
const e = (cmd, x, y = 0, extra = {}) => ({
  cmd,
  x,
  y,
  color: "#002b80",
  ...extra,
});
test("cleanup joins consecutive jumps between actual sewn anchors; excludes entry/exit and ignores metadata coordinates", () => {
  const events = [
    e("jump", -20),
    e("stitch", 0),
    e("jump", 4),
    e("stop", 900),
    e("jump", 8),
    e("stitch", 9),
    e("jump", 40),
    e("end", 50),
  ];
  const before = structuredClone(events),
    r = estimateCleanup(events, { format: "pes" });
  assert.equal(r.candidates.length, 1);
  const c = r.candidates[0];
  assert.deepEqual(c.from, { x: 0, y: 0 });
  assert.deepEqual(c.to, { x: 9, y: 0 });
  assert.equal(c.jumpCommands, 2);
  assert.equal(c.length, 9);
  assert.equal(c.movementLength, 8);
  assert.equal(c.endIndex, 4);
  assert.equal(c.resumeIndex, 5);
  assert(c.stopped);
  assert.deepEqual(events, before);
});
test("effective trims suppress connections; represented but unverified trims are conditional, JEF omissions are explicit", () => {
  const events = [
    e("stitch", 0),
    e("trim", 200),
    e("jump", 8),
    e("jump", 10),
    e("stitch", 10),
  ];
  assert.equal(
    estimateCleanup(events, { trimBehavior: "effective" }).candidates.length,
    0,
  );
  for (const format of ["pes", "pec", "exp", "vp3"]) {
    const r = estimateCleanup(events, { format });
    assert.equal(r.untrimmed, 0);
    assert.equal(r.trimDependent, 1);
    assert.equal(r.candidates[0].encoding, "represented");
    assert.equal(r.candidates[0].trimIndex, 1);
  }
  const jef = estimateCleanup(events, { format: "jef" });
  assert.equal(jef.untrimmed, 1);
  assert.equal(jef.candidates[0].encoding, "omitted");
  assert.match(jef.candidates[0].reason, /JEF writer omits/);
  const decoded = estimateCleanup(events, { format: "jef", decoded: true });
  assert.equal(decoded.candidates[0].encoding, "inferred");
  assert.equal(decoded.trimDependent, 0);
  assert.equal(
    estimateCleanup(events, { format: "dst" }).candidates[0].encoding,
    "jump-encoded",
  );
});
test("color changes break thread continuity, stops do not, short jumps are retained without inventing long-stitch travel", () => {
  assert.equal(
    estimateCleanup([
      e("stitch", 0),
      e("color", 500),
      e("jump", 10),
      e("stitch", 10),
    ]).candidates.length,
    0,
  );
  const r = estimateCleanup([
    e("stitch", 0),
    e("jump", 0.1),
    e("stitch", 0.1),
    e("jump", 30),
    e("stitch", 30),
    e("stitch", 50),
  ]);
  assert.equal(r.candidates.length, 2);
  assert.equal(r.candidates[0].length, 0.1);
  assert.equal(r.candidates[1].length, 29.9);
  assert.equal(
    estimateCleanup([
      e("stitch", 0),
      e("jump", 10),
      e("jump", 0),
      e("stitch", 0),
    ]).candidates.length,
    0,
  );
});
test("hidden fill travel, underlay, running and manual sewing are not mislabeled; explicit exposed travel is distinct", () => {
  const events = [
    e("stitch", 0),
    e("stitch", 5, 0, { phase: "travel" }),
    e("stitch", 10, 0, { phase: "underlay-travel" }),
    e("stitch", 15, 0, { phase: "manual" }),
    e("stitch", 16, 0, { phase: "exposed-travel" }),
    e("stitch", 17, 0, { travelVisibility: "exposed" }),
    e("stitch", 18),
  ];
  const r = estimateCleanup(events);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].kind, "travel");
  assert.equal(r.candidates[0].length, 2);
  assert.match(r.candidates[0].reason, /inspect before cutting sewn thread/);
});
test("import provenance and object details survive ambiguous format assessment without assuming hardware capabilities", () => {
  const events = [
    e("stitch", 0, 0, { objectId: "a" }),
    e("trim", 0),
    e("jump", 6),
    e("stitch", 6, 0, { objectId: "b" }),
  ];
  const objects = [
    { id: "a", name: "Island A" },
    { id: "b", name: "Island B", machineSourceFormat: "jef" },
  ];
  const r = estimateCleanup(events, { format: "pes", objects });
  assert.equal(r.candidates[0].format, "pes");
  assert.equal(r.candidates[0].sourceFormat, "jef");
  assert.equal(r.trimDependent, 1);
  assert.match(
    cleanupDescription(r.candidates[0], objects),
    /Island A → Island B/,
  );
  const unknown = estimateCleanup(events, { format: "xxx" });
  assert.equal(unknown.candidates[0].encoding, "unknown");
  assert.equal(unknown.trimDependent, 1);
});
test("timeline keeps distinct important lanes and every clustered event reachable at any zoom", () => {
  const events = [
    e("stitch", 0),
    ...Array.from({ length: 5000 }, (_, i) =>
      e(i % 7 === 0 ? "trim" : i % 3 === 0 ? "jump" : "stitch", i % 40),
    ),
    e("stop", 0),
    e("color", 0),
  ];
  const report = estimateCleanup(events, { format: "pes" }),
    markers = timelineMarkers(events, report);
  const full = clusterMarkers(markers, timelineWindow(events.length), 300);
  assert.equal(
    full.reduce((n, g) => n + g.markers.length, 0),
    markers.length,
  );
  assert(full.some((g) => g.markers.length > 1));
  const hidden = clusterMarkers(
    markers,
    timelineWindow(events.length),
    300,
    false,
  );
  assert(hidden.every((g) => g.kind !== "manual"));
  assert.deepEqual(timelineWindow(5000, 4990, 100), {
    start: 4900,
    span: 100,
    end: 5000,
  });
  const zoomed = clusterMarkers(
    markers,
    timelineWindow(events.length, 100, 16),
    300,
  );
  assert(zoomed.every((g) => g.markers.length === 1));
  assert.deepEqual(timelineWindow(0), { start: 0, span: 0, end: 0 });
});
test("overlay uses actual anchor coordinates, independent screen-pixel outlines and does not mutate plan or exports", () => {
  const o = object(
    "Islands",
    [
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ],
      [
        { x: 12, y: 0 },
        { x: 16, y: 0 },
        { x: 16, y: 4 },
        { x: 12, y: 4 },
      ],
    ],
    { closed: true, underlay: false },
  );
  const p = { version: 1, name: "Coverage", machine: "se700", objects: [o] },
    plan = generate(p),
    before = JSON.stringify(plan);
  const report = estimateCleanup(plan.events, { format: "pes" });
  assert(report.candidates.length > 0);
  const calls = [],
    ctx = new Proxy(
      {},
      {
        get:
          (_, key) =>
          (...args) =>
            calls.push([key, ...args]),
        set: () => true,
      },
    );
  drawCleanupOverlay(ctx, report, { scale: 4, end: plan.events.length });
  assert(
    calls.some(
      ([key, x, y]) =>
        key === "moveTo" &&
        x === report.candidates[0].from.x &&
        y === report.candidates[0].from.y,
    ),
  );
  assert.equal(JSON.stringify(plan), before);
  assert.deepEqual(generate(p).events, plan.events);
});
test("explicit curved travel retains its sewn path and malformed optional import metadata cannot break diagnostics", () => {
  const events = [
    e("stitch", 0, 0),
    e("stitch", 1, 1, { phase: "exposed-travel" }),
    e("stitch", 0, 2, { phase: "exposed-travel", objectId: "a" }),
    e("stitch", 0, 3),
  ];
  const report = estimateCleanup(events, {
    format: "pes",
    objects: [{ id: "a", machineSourceFormat: { invalid: true } }],
  });
  const c = report.candidates[0];
  assert.equal(c.length, 2 * Math.SQRT2);
  assert.deepEqual(c.points, [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 2 },
  ]);
  assert.equal(c.sourceFormat, undefined);
  assert.doesNotThrow(() => cleanupDescription(c));
});

test("250k command estimation and screen clustering are bounded without duplicate decoding", () => {
  const events = Array.from({ length: 250000 }, (_, i) =>
    e(i % 5 === 0 ? "jump" : i % 97 === 0 ? "trim" : "stitch", i % 90, i % 80),
  );
  const start = performance.now(),
    r = estimateCleanup(events, { format: "pes" });
  const markers = timelineMarkers(events, r),
    groups = clusterMarkers(markers, timelineWindow(events.length), 1200);
  const elapsed = performance.now() - start;
  assert(r.candidates.length > 10000);
  assert(groups.length <= 1200);
  assert(elapsed < 4000, `${elapsed.toFixed(1)} ms`);
  console.log(
    `Cleanup + timeline: 250k commands, ${r.candidates.length} connections, ${groups.length} screen clusters, ${elapsed.toFixed(1)} ms`,
  );
});
