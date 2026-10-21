import { normalizeThread } from "../src/thread-records.js";
import { assignThread, threadTargets } from "../src/thread-assignment.js";
import { makeOperation } from "../src/operations.js";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { unzipSync, strFromU8 } from "../vendor/fflate.js";
import {
  packageName,
  packageFormats,
  preparePackage,
  packageArchive,
} from "../src/export-package.js";
import { object } from "../src/model.js";
import { generate } from "../src/engine.js";
import { selectEquipment } from "../src/equipment.js";
import { decodePes } from "./helpers/pes-decoder.mjs";
const native = async (request) => {
  const code = `import sys,json,pathlib,tempfile,base64
root=pathlib.Path.cwd()
sys.path[:0]=[str(root/'src'),str(root/'vendor'/'pyembroidery.zip')]
import codec
r=json.load(sys.stdin)
(root/'test-results').mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(dir=root/'test-results') as d:
 p=pathlib.Path(d)/('design.'+r['format'])
 events=codec.encode_file({'events':r['events'],'name':r['name']},str(p))
 print(json.dumps({'events':events,'bytes':base64.b64encode(p.read_bytes()).decode()}))`;
  const r = spawnSync(process.env.PYTHON || "python", ["-c", code], {
    input: JSON.stringify(request),
    encoding: "utf8",
    maxBuffer: 16000000,
  });
  assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout);
  return {
    events: parsed.events,
    bytes: new Uint8Array(Buffer.from(parsed.bytes, "base64")),
  };
};
const ring = (r) => [
  { x: -r, y: -r },
  { x: r, y: -r },
  { x: r, y: r },
  { x: -r, y: r },
];
const fixture = () => ({
  version: 1,
  name: "Test / unsafe: package ♥",
  machine: "se700",
  objects: [
    object("Tatami with hole", [ring(9), ring(3).reverse()], {
      color: "#123456",
      underlay: false,
    }),
    (() => {
      const o = object("Border", [ring(13)], { color: "#dd6633" });
      o.operations = [makeOperation("border", o)];
      return o;
    })(),
  ],
});
test("package names are portable, bounded and cannot create paths or reserved device names", () => {
  for (const n of [
    "../x\\y: test",
    "CON",
    "prn",
    "A".repeat(400),
    "♥",
    "trailing. ",
  ]) {
    const s = packageName(n);
    assert.match(s, /^[a-z0-9_-]+$/i);
    assert.ok(s.length <= 67);
    assert.ok(!/^(con|prn)$/i.test(s));
  }
  assert.deepEqual(packageFormats(), [
    "pes",
    "pec",
    "dst",
    "exp",
    "jef",
    "vp3",
  ]);
});
test("ZIP extracts exact real writer bytes with complete generated geometry, holes, dimensions and ordered documentation", async () => {
  const p = fixture(),
    plan = generate(p),
    original = structuredClone(p),
    standalone = new Map();
  const result = await preparePackage(p, plan, async (r) => {
    const out = await native(r);
    standalone.set(r.format, out.bytes.slice());
    return out;
  });
  assert.equal(result.files.length, 6, JSON.stringify(result.omitted));
  assert.deepEqual(result.omitted, []);
  const zip = packageArchive(p, plan, result),
    entries = unzipSync(zip),
    name = packageName(p.name);
  const crc = spawnSync(
    process.env.PYTHON || "python",
    [
      "-c",
      "import zipfile,io,sys; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; assert len(z.namelist())==8",
    ],
    { input: Buffer.from(zip), encoding: "utf8" },
  );
  assert.equal(crc.status, 0, crc.stderr);
  assert.equal(Object.keys(entries).length, 8);
  for (const f of result.files)
    assert.deepEqual(
      entries[name + "." + f.format],
      standalone.get(f.format),
      "archive must not rewrite " + f.format,
    );
  const pes = decodePes(entries[name + ".pes"]);
  assert.equal(pes.pec.declaredWidth, Math.round(plan.stats.bounds.width * 10));
  assert.equal(
    pes.pec.declaredHeight,
    Math.round(plan.stats.bounds.height * 10),
  );
  const readme = strFromU8(entries["README.txt"]),
    csv = strFromU8(entries["THREAD-SEQUENCE.csv"]);
  assert.match(readme, /not a physical machine sew-out/);
  assert.ok(readme.includes(String(plan.stats.stitches)));
  assert.match(csv, /#123456/);
  assert.match(csv, /#dd6633/);
  assert.deepEqual(p, original);
});
test("per-format failures, unsafe STOP and large JEF omissions are explicit and cannot create empty packages", async () => {
  const p = fixture(),
    plan = generate(p);
  const failed = await preparePackage(p, plan, async () => {
    throw Error("Simulated writer failure");
  });
  assert.equal(failed.omitted.length, 6);
  assert.equal(failed.files.length, 0);
  assert.throws(() => packageArchive(p, plan, failed), /No safely/);
  const malformed = await preparePackage(p, plan, async () => ({
    bytes: new Uint8Array([1]),
    events: [],
  }));
  assert.equal(malformed.files.length, 0);
  assert.ok(
    malformed.omitted.every((o) => o.reasons.join().includes("needle")),
  );
  const paused = structuredClone(plan);
  paused.events.splice(2, 0, { ...paused.events[1], cmd: "stop" });
  let called = [];
  const mixed = await preparePackage(p, paused, async (r) => {
    called.push(r.format);
    if (r.format === "pec") throw Error("PEC simulated");
    return native(r);
  });
  assert.ok(!called.includes("vp3"));
  assert.ok(
    mixed.omitted
      .find((o) => o.format === "vp3")
      .reasons.join()
      .includes("standalone"),
  );
  assert.ok(
    mixed.omitted
      .find((o) => o.format === "pec")
      .reasons.join()
      .includes("simulated"),
  );
  assert.ok(mixed.files.length);
  assert.match(
    strFromU8(unzipSync(packageArchive(p, paused, mixed))["README.txt"]),
    /VP3:.*standalone/,
  );
  const large = {
    version: 1,
    name: "Large",
    machine: "se700",
    objects: [
      object(
        "Line",
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
  const omitted = await preparePackage(large, generate(large), async (r) =>
    native(r),
  );
  assert.ok(
    omitted.omitted
      .find((o) => o.format === "jef")
      .reasons.join()
      .includes("200 mm"),
  );
});

test("ZIP thread chart and all six machine files preserve distinct physical spools sharing a screen color", async () => {
  const p = fixture();
  for (const [i, o] of p.objects.entries()) {
    const r = normalizeThread({
      brandName: i ? "Another brand" : "Personal brand",
      lineName: "Synthetic test line",
      number: i ? "001" : "007",
      colorName: i ? "Second spool" : "First spool",
      hex: "#123456",
    });
    assignThread(threadTargets([o], { bulkOperations: "all" }, false), r);
  }
  const plan = generate(p),
    result = await preparePackage(p, plan, native);
  assert.equal(plan.stats.changes, 1);
  assert.equal(result.files.length, 6, JSON.stringify(result.omitted));
  const entries = unzipSync(packageArchive(p, plan, result)),
    csv = strFromU8(entries["THREAD-SEQUENCE.csv"]);
  assert.match(csv, /"Personal brand".*"007".*"First spool"/);
  assert.match(csv, /"Another brand".*"001".*"Second spool"/);
  assert.ok(csv.indexOf('"007"') < csv.indexOf('"001"'));
  assert.match(strFromU8(entries["README.txt"]), /repeated-color/);
});
