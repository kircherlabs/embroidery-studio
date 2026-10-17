import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  decodePes,
  decodePec,
  streamExtents,
  declaredRect,
  modelMachineSizeMm,
} from "./helpers/pes-decoder.mjs";
import { generate } from "../src/engine.js";
import { demo } from "../src/model.js";
import { object } from "../src/model.js";
import { applique } from "../src/operations.js";
mkdirSync(new URL("../test-results/", import.meta.url), { recursive: true });
const python = process.env.PYTHON || "python",
  adapter = fileURLToPath(new URL("./pes-codec-adapter.py", import.meta.url));
const fixture = (name) =>
  new Uint8Array(readFileSync(new URL("./fixtures/" + name, import.meta.url)));
const call = (request) => {
  const r = spawnSync(python, [adapter], {
    input: JSON.stringify(request),
    maxBuffer: 16000000,
  });
  assert.equal(r.status, 0, r.stderr?.toString());
  return r.stdout;
};
const exportDesign = (events) =>
  JSON.parse(call({ payload: { name: "Compatibility", events } }).toString());
const event = (cmd, x, y, color = "#000000") => ({ cmd, x, y, color });
function rectangle(x, y, w, h) {
  const result = [event("jump", x, y), event("stitch", x, y)];
  for (const [a, b, c, d] of [
    [x, y, x + w, y],
    [x + w, y, x + w, y + h],
    [x + w, y + h, x, y + h],
    [x, y + h, x, y],
  ]) {
    const n = Math.ceil(Math.hypot(c - a, d - b) / 2);
    for (let i = 1; i <= n; i++)
      result.push(
        event(
          "stitch",
          Math.round((a + ((c - a) * i) / n) * 10) / 10,
          Math.round((b + ((d - b) * i) / n) * 10) / 10,
        ),
      );
  }
  result.push(event("end", x, y));
  return result;
}
function check(events) {
  const result = exportDesign(events),
    dec = decodePes(Uint8Array.from(result.bytes)),
    ext = streamExtents(dec.pec);
  assert.deepEqual(declaredRect(dec.pec), ext);
  assert.equal(dec.pec.originFieldX, 0 - ext.left);
  assert.equal(dec.pec.originFieldY, 0 - ext.top);
  const width = ext.right - ext.left,
    height = ext.bottom - ext.top;
  assert.equal(dec.pec.declaredWidth, width);
  assert.equal(dec.pec.declaredHeight, height);
  assert.deepEqual(modelMachineSizeMm(dec.pec), {
    widthMm: width / 10,
    heightMm: height / 10,
  });
  const input = events.filter((e) => e.cmd === "stitch"),
    decoded = dec.pec.events.filter((e) => e.type === "stitch"),
    preview = result.preview.filter((e) => e.cmd === "stitch");
  assert.equal(decoded.length, input.length);
  assert.equal(preview.length, input.length);
  const ax = Math.round(input[0].x * 10),
    ay = Math.round(input[0].y * 10);
  decoded.forEach((e, i) => {
    assert.equal(e.x, Math.round(input[i].x * 10) - ax);
    assert.equal(e.y, Math.round(input[i].y * 10) - ay);
    assert.equal(preview[i].x, Math.round(input[i].x * 10) / 10 || 0);
    assert.equal(preview[i].y, Math.round(input[i].y * 10) / 10 || 0);
  });
  const pesStitches = dec.pes.blocks
    .filter((b) => b.type === 0)
    .flatMap((b) => b.points);
  assert.equal(pesStitches.length, decoded.length);
  pesStitches.forEach(([x, y], i) => {
    assert.equal(x, decoded[i].x - ext.left);
    assert.equal(y, decoded[i].y - ext.bottom);
  });
  assert.equal(dec.pes.width, width);
  assert.equal(dec.pes.height, height);
  assert.equal(
    dec.pec.stitchBlockOffset + dec.pec.stitchBlockLength,
    dec.pec.streamEnd,
  );
  assert.equal(dec.pec.thumbnails.length, dec.pec.colorIndices.length + 1);
  return { result, dec };
}
test("the production repair exactly matches the hardware-verified four-byte fixture", () => {
  const broken = fixture("HayDave.broken.pes"),
    fixed = fixture("HayDave.fixed.pes");
  const repaired = call({ repair: true, bytes: [...broken] });
  assert.deepEqual(repaired, Buffer.from(fixed));
  const changed = [...broken].flatMap((b, i) => (b !== fixed[i] ? [i] : []));
  assert.deepEqual(changed, [24693, 24694, 24695, 24696]);
  assert.deepEqual(
    call({ repair: true, bytes: [...fixed] }),
    Buffer.from(fixed),
  );
  const before = decodePes(broken).pec,
    after = decodePes(fixed).pec;
  assert.deepEqual([before.originFieldX, before.originFieldY], [54, -33]);
  assert.deepEqual([after.originFieldX, after.originFieldY], [430, 169]);
  assert.deepEqual(modelMachineSizeMm(before), {
    widthMm: 37.6,
    heightMm: 20.2,
  });
  assert.deepEqual(modelMachineSizeMm(after), {
    widthMm: 75.2,
    heightMm: 40.4,
  });
  assert.deepEqual(after.events, before.events);
  assert.deepEqual(after.thumbnails, before.thumbnails);
  assert.equal(after.events.filter((e) => e.type === "stitch").length, 5660);
});
test("production PES exporter preserves known dimensions, placement-independent geometry and signed coordinates", () => {
  for (const [x, y, w, h] of [
    [-25, -15, 50, 30],
    [-37.6, -20.2, 75.2, 40.4],
    [10, 15, 30, 20],
    [-40, 7, 33.3, 12.8],
  ]) {
    const { dec } = check(rectangle(x, y, w, h));
    assert.equal(dec.pec.declaredWidth, Math.round(w * 10));
    assert.equal(dec.pec.declaredHeight, Math.round(h * 10));
  }
});
test("origin follows -min rather than -centre when the first needle is inside the design", () => {
  const events = [
    event("jump", 5.4, -3.3),
    event("stitch", 5.4, -3.3),
    ...rectangle(-37.6, -20.2, 75.2, 40.4).slice(0, -1),
    event("end", -37.6, -20.2),
  ];
  const { dec } = check(events);
  assert.deepEqual([dec.pec.originFieldX, dec.pec.originFieldY], [430, 169]);
});
test("asymmetric F remains right-facing and upright in both PES stitch representations", () => {
  const e = [
    event("jump", -10, 15),
    event("stitch", -10, 15),
    event("stitch", -10, 10),
    event("stitch", -10, 5),
    event("stitch", -10, 0),
    event("stitch", -5, 0),
    event("stitch", 0, 0),
    event("jump", -10, 7),
    event("stitch", -10, 7),
    event("stitch", -5, 7),
    event("end", -5, 7),
  ];
  const { dec } = check(e),
    stitches = dec.pec.events.filter((e) => e.type === "stitch");
  assert(stitches.some((e) => e.x === 100 && e.y === -150));
});
test("negative short/long jumps and alternating color markers survive actual export", () => {
  const colors = ["#000000", "#ed0000", "#ffe600", "#228b22"];
  let e = [event("jump", 0, 0), event("stitch", 0, 0)];
  for (const [i, x] of [-6.4, 6.3, -6.5, 6.4].entries()) {
    if (i) e.push(event("color", 0, 0, colors[i]));
    e.push(
      event("jump", x, i, colors[i]),
      event("stitch", x, i, colors[i]),
      event("trim", x, i, colors[i]),
    );
  }
  e.push(event("end", 6.4, 3, colors.at(-1)));
  const { dec } = check(e);
  assert.deepEqual(
    dec.pec.events.filter((e) => e.type === "colorChange").map((e) => e.marker),
    [2, 1, 2],
  );
  assert.equal(dec.pec.colorIndices.length, 4);
  assert(dec.pec.events.some((e) => e.type === "trim"));
});
test("multicolor generated objects match the independent PEC decoder and CSewSeg points", () => {
  check(generate(demo()).events);
});

test("applique stops survive the existing PES codec with complete independently decoded sewing geometry", () => {
  const o = object(
    "Patch",
    [
      [
        { x: -10, y: -10 },
        { x: 10, y: -10 },
        { x: 10, y: 10 },
        { x: -10, y: 10 },
      ],
    ],
    { compensation: 0, underlay: false },
  );
  o.operations = applique(o);
  const plan = generate({
    version: 1,
    name: "Applique",
    machine: "se700",
    objects: [o],
  });
  assert.equal(plan.stats.stops, 2);
  const { result, dec } = check(plan.events);
  assert.equal(result.preview.filter((e) => e.cmd === "stop").length, 2);
  assert.equal(result.preview.filter((e) => e.cmd === "color").length, 0);
  assert.equal(
    dec.pec.events.filter((e) => e.type === "colorChange").length,
    2,
  );
  assert(dec.pec.colorIndices.every((c) => c === dec.pec.colorIndices[0]));
});
test("a missing explicit initial jump still produces a proper Brother origin prefix", () => {
  check(rectangle(-10, -5, 20, 10).slice(1));
});

test("standalone PEC export uses the same bounded origin and preserves needle coordinates", () => {
  const events = rectangle(-25, -15, 50, 30);
  const result = JSON.parse(
    call({ format: "pec", payload: { name: "PEC", events } }),
  );
  const bytes = Uint8Array.from(result.bytes),
    pec = decodePec(bytes, 8);
  assert.equal(Buffer.from(bytes.subarray(0, 8)).toString(), "#PEC0001");
  assert.deepEqual(declaredRect(pec), streamExtents(pec));
  assert.deepEqual(modelMachineSizeMm(pec), { widthMm: 50, heightMm: 30 });
  assert.deepEqual(
    result.preview.filter((e) => e.cmd === "stitch").map((e) => [e.x, e.y]),
    events.filter((e) => e.cmd === "stitch").map((e) => [e.x || 0, e.y || 0]),
  );
});

test("signed 12-bit origin limits are checked instead of silently wrapping", () => {
  const events = [
    event("jump", 0, 0),
    event("stitch", 0, 0),
    event("jump", -204.7, 0),
    event("stitch", -204.7, 0),
    event("end", -204.7, 0),
  ];
  const { dec } = check(events);
  assert.equal(dec.pec.originFieldX, 2047);
  events.slice(2).forEach((e) => (e.x = -204.8));
  const r = spawnSync(python, [adapter], {
    input: JSON.stringify({ payload: { events } }),
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr.toString(), /signed 12-bit range/);
});
test("reintroducing the centre prefix fails the machine-placement invariant", () => {
  const { result } = check(rectangle(-37.6, -20.2, 75.2, 40.4)),
    bytes = Uint8Array.from(result.bytes),
    pec = decodePes(bytes).pec,
    ext = streamExtents(pec),
    view = new DataView(bytes.buffer);
  view.setUint16(
    pec.originFieldOffset,
    0x9000 | (-Math.round((ext.left + ext.right) / 2) & 0xfff),
  );
  view.setUint16(
    pec.originFieldOffset + 2,
    0x9000 | (-Math.round((ext.top + ext.bottom) / 2) & 0xfff),
  );
  assert.notDeepEqual(declaredRect(decodePes(bytes).pec), ext);
  assert.deepEqual(modelMachineSizeMm(decodePes(bytes).pec), {
    widthMm: 37.6,
    heightMm: 20.2,
  });
});
test("repair rejects malformed lengths and missing origin prefixes", () => {
  const broken = fixture("HayDave.broken.pes"),
    dec = decodePes(broken);
  for (const bytes of [
    broken.slice(0, dec.pec.stitchBlockOffset + 18),
    Uint8Array.from(broken),
  ]) {
    if (bytes.length === broken.length) bytes[dec.pec.originFieldOffset] = 0;
    const r = spawnSync(python, [adapter], {
      input: JSON.stringify({ repair: true, bytes: [...bytes] }),
    });
    assert.notEqual(r.status, 0);
  }
});
