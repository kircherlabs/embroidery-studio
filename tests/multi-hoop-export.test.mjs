import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { object } from "../src/model.js";
import { newLayout } from "../src/multi-hoop-layout.js";
import { generateMultiHoop } from "../src/multi-hoop-split.js";
import {
  prepareMultiHoopPackage,
  multiHoopArchive,
} from "../src/multi-hoop-export.js";
import { unzipSync, strFromU8 } from "../vendor/fflate.js";
import { decodePes } from "./helpers/pes-decoder.mjs";
const native = async (r) => {
  const s = spawnSync(
    process.env.PYTHON || "python",
    ["tests/pes-codec-adapter.py"],
    {
      input: JSON.stringify({
        format: r.format,
        payload: { events: r.events, name: r.name },
      }),
      encoding: "utf8",
      maxBuffer: 16000000,
    },
  );
  assert.equal(s.status, 0, s.stderr);
  const p = JSON.parse(s.stdout);
  return { bytes: new Uint8Array(p.bytes), events: p.preview };
};
const fixture = () => ({
  version: 1,
  name: "Large & editable",
  machine: "se700",
  objects: [
    object(
      "Continuous Tatami",
      [
        [
          { x: -75, y: -8 },
          { x: 75, y: -8 },
          { x: 75, y: 8 },
          { x: -75, y: 8 },
        ],
      ],
      { angle: 0, spacing: 0.8, underlay: false },
    ),
  ],
  multiHoop: {
    ...newLayout(),
    hoops: [
      { id: "a", x: -40, y: 0 },
      { id: "b", x: 40, y: 0 },
    ],
  },
});
test("E: actual six-format two-hoop files independently decode in their field; ZIP origins, order and templates are correct", async () => {
  const p = fixture(),
    original = JSON.stringify(p),
    bundle = generateMultiHoop(p),
    formats = ["pes", "pec", "dst", "exp", "jef", "vp3"];
  assert.deepEqual(bundle.problems, []);
  const result = await prepareMultiHoopPackage(p, bundle, native, formats);
  assert.deepEqual(result.omitted, []);
  assert.equal(result.files.length, 12);
  for (const f of result.files) {
    assert(f.stats.fits);
    assert(f.stats.bounds.width < 100);
    if (f.format === "pes") {
      const s = bundle.sections[f.number - 1],
        d = decodePes(f.bytes),
        a = s.plan.events.filter((e) => e.cmd === "stitch"),
        b = d.pec.events.filter((e) => e.type === "stitch");
      assert.equal(a.length, b.length);
      b.forEach((e, i) => {
        assert.equal(e.x, Math.round((a[i].x - a[0].x) * 10) || 0);
        assert.equal(e.y, Math.round((a[i].y - a[0].y) * 10) || 0);
      });
    }
  }
  const zip = unzipSync(multiHoopArchive(p, bundle, result)),
    manifest = JSON.parse(strFromU8(zip["HOOPING-MANIFEST.json"]));
  assert.equal(manifest.files.length, 12);
  assert.deepEqual(
    manifest.hoopings.map((h) => h.center.x),
    [-40, 40],
  );
  assert.match(
    strFromU8(zip["START-HERE.txt"]),
    /Choose ONE compatible format/,
  );
  assert.match(strFromU8(zip["PRINT-AT-100-PERCENT.html"]), /width="50mm"/);
  assert.equal(JSON.stringify(p), original);
});
test("E: missing/corrupt one section omits the entire format set; registration preserves pauses and VP3 restriction", async () => {
  const p = fixture(),
    bundle = generateMultiHoop(p);
  const r = await prepareMultiHoopPackage(
    p,
    bundle,
    async (r) => {
      const v = await native(r);
      if (r.name.endsWith("02")) v.events = [];
      return v;
    },
    ["pes"],
  );
  assert.equal(r.files.length, 0);
  assert.equal(r.omitted.length, 1);
  assert.throws(() => multiHoopArchive(p, bundle, r), /No complete/);
  p.multiHoop.registration = true;
  const marks = generateMultiHoop(p);
  assert.deepEqual(marks.problems, []);
  const result = await prepareMultiHoopPackage(p, marks, native, [
    "pes",
    "dst",
    "exp",
    "jef",
    "vp3",
  ]);
  assert.equal(result.files.length, 8);
  assert.match(result.omitted[0].reasons.join(" "), /VP3.*stops/);
  assert(result.files.every((f) => f.stats.stops + f.stats.changes > 0));
});
test("E: uncovered layout and unsupported source cuts cannot reach any writer", async () => {
  const p = fixture();
  p.multiHoop.hoops.pop();
  const bundle = generateMultiHoop(p);
  let calls = 0;
  await assert.rejects(
    () =>
      prepareMultiHoopPackage(
        p,
        bundle,
        () => {
          calls++;
        },
        ["pes"],
      ),
    /Resolve every/,
  );
  assert.equal(calls, 0);
  const q = fixture(),
    old = generateMultiHoop(q);
  q.objects[0].rings[0][0].x += 1;
  await assert.rejects(
    () =>
      prepareMultiHoopPackage(
        q,
        old,
        () => {
          calls++;
        },
        ["pes"],
      ),
    /Regenerate all hooping/,
  );
  assert.equal(calls, 0);
});
