import test from "node:test";
import assert from "node:assert/strict";
import { object } from "../src/model.js";
import { generate } from "../src/engine.js";
import { makeFillSettings } from "../src/fills/context.js";
import { estimateCleanup } from "../src/manual-cleanup.js";
import { hoopingRanges, timelineMarkers } from "../src/sequence-timeline.js";
const rings = [
  Array.from({ length: 80 }, (_, i) => {
    const a = (i * Math.PI) / 40,
      r = 25 + 7 * Math.cos(5 * a);
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  }),
];
test("Bloom/decorative fills distinguish inspectable internal routing and trim requests without rewriting commands", () => {
  for (const method of [
    "spiral",
    "ripple",
    "contour",
    "meander",
    "cross",
    "tatami",
    "emboss",
  ]) {
    const o = object("Bloom", rings, {
      spacing: 0.5,
      underlay: false,
      compensation: 0,
    });
    o.operations = [
      { id: "f", type: "fill", fillSettings: makeFillSettings(method, o) },
    ];
    const p = generate({
        version: 1,
        name: "Bloom",
        machine: "se700",
        objects: [o],
      }),
      before = JSON.stringify(p.events),
      r = estimateCleanup(p.events, { format: "pes", objects: [o] });
    assert.equal(
      r.estimated + r.internal + r.trimDependent,
      r.candidates.length,
    );
    assert.equal(JSON.stringify(p.events), before);
    if (["spiral", "cross"].includes(method)) {
      assert(r.internal > 50);
      assert(r.estimated < r.untrimmed / 2);
    }
    console.log(
      `${method}: ${p.stats.jumps} jump commands, ${r.estimated} external cleanup estimates, ${r.internal} internal pattern connections, ${r.trimDependent} trim-dependent`,
    );
  }
});
test("connections across a hole remain external; imported/unknown commands never inherit fill assumptions", () => {
  const o = object("Hole", [
    [
      { x: -5, y: -5 },
      { x: 5, y: -5 },
      { x: 5, y: 5 },
      { x: -5, y: 5 },
    ],
    [
      { x: -0.5, y: -1 },
      { x: 0.5, y: -1 },
      { x: 0.5, y: 1 },
      { x: -0.5, y: 1 },
    ],
  ]);
  o.operations = [{ id: "f", type: "fill" }];
  const events = [
    { cmd: "stitch", x: -1, y: 0, objectId: o.id, operationId: "f" },
    { cmd: "jump", x: 1, y: 0, objectId: o.id, operationId: "f" },
    { cmd: "stitch", x: 1, y: 0, objectId: o.id, operationId: "f" },
  ];
  assert.equal(estimateCleanup(events, { objects: [o] }).estimated, 1);
  assert.equal(
    estimateCleanup(events, { objects: [o], decoded: true }).estimated,
    1,
  );
});
test("hooping transitions reset thread continuity and preserve original numbering in isolated views", () => {
  const e = (cmd, x, hoopingId, number, extra = {}) => ({
    cmd,
    x,
    y: 0,
    hoopingId,
    hoopingNumber: number,
    ...extra,
  });
  const events = [
    e("stitch", 0, "a", 1, { hoopStart: { x: 0, y: 0 } }),
    e("stitch", 1, "a", 1),
    e("jump", 100, "c", 3, { hoopStart: { x: 100, y: 0 } }),
    e("stitch", 100, "c", 3),
  ];
  assert.equal(estimateCleanup(events).candidates.length, 0);
  assert.deepEqual(
    hoopingRanges(events).map((r) => [r.number, r.start, r.end]),
    [
      [1, 0, 2],
      [3, 2, 4],
    ],
  );
  assert.equal(hoopingRanges(events.slice(2))[0].number, 3);
  assert.equal(
    timelineMarkers(events).filter((m) => m.kind === "hoop").length,
    2,
  );
});
