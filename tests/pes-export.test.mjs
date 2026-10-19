import { railArtwork } from "../src/rail-ui.js";
import { addReference } from "../src/references.js";
import { arrangeArtwork } from "../src/arrange.js";
import { createSurroundingPatch } from "../src/construction.js";
import { smartShape } from "../src/creative.js";
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
import { useTreeOrder } from "../src/sequencing.js";
import { object } from "../src/model.js";
import { applique, makeOperation } from "../src/operations.js";
mkdirSync(new URL("../test-results/", import.meta.url), { recursive: true });
const python = process.env.PYTHON || "python",
  adapter = fileURLToPath(new URL("./pes-codec-adapter.py", import.meta.url));

test("manual rail satin retains its complete needle sequence, action order, stops and corrected PES origin", () => {
  const rail = (y) => ({
      nodes: [
        { x: -20, y, out: { x: -10, y: y - 10 } },
        { x: 20, y, in: { x: 10, y: y - 10 } },
      ],
      closed: false,
      frame: [1, 0, 0, 1, 0, 0],
    }),
    o = railArtwork(rail(-2), rail(3), { color: "#000000" });
  o.operations.push(makeOperation("stop", o), {
    ...makeOperation("run", o),
    color: "#dd3344",
  });
  const plan = generate({
      version: 1,
      name: "Manual rail construction",
      machine: "se700",
      objects: [o],
      planning: { smallDetail: 0 },
    }),
    { result, dec } = check(plan.events);
  assert(!plan.issues.some((i) => i.severity === "error"));
  assert(plan.events.some((e) => e.phase === "satin-rails"));
  assert.equal(plan.stats.stops, 1);
  assert.equal(result.preview.filter((e) => e.cmd === "stop").length, 1);
  assert.equal(
    result.preview.filter((e) => e.cmd === "color").length,
    plan.stats.changes,
  );
  assert.equal(dec.pec.declaredWidth / 10, plan.stats.bounds.width);
  assert.equal(dec.pec.declaredHeight / 10, plan.stats.bounds.height);
  const ids = o.operations.map((op) => op.id);
  assert(
    plan.events.findIndex((e) => e.operationId === ids[1]) >
      plan.events.findLastIndex((e) => e.operationId === ids[0]),
  );
  assert(
    plan.events.findIndex((e) => e.operationId === ids[2]) >
      plan.events.findIndex((e) => e.operationId === ids[1]),
  );
});
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
  const plan = generate(demo()),
    { dec } = check(plan.events);
  assert.equal(dec.pec.colorIndices.length, 4);
  assert.equal(
    dec.pec.events.filter((e) => e.type === "colorChange").length,
    3,
  );
  const manual = demo();
  useTreeOrder(manual);
  const edited = check(generate(manual).events).dec;
  assert.equal(edited.pec.colorIndices.length, 9);
  assert.equal(
    edited.pec.events.filter((e) => e.type === "colorChange").length,
    8,
  );
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

test("surrounding patch preparation, decoration and finishing survive independent PES decoding at full dimensions", () => {
  const artwork = smartShape("rect", 30, 16, { radius: 0 });
  artwork.color = "#0099bb";
  const p = { version: 1, name: "Patch", machine: "se700", objects: [artwork] };
  const { boundary } = createSurroundingPatch(p, [artwork.id], {
    kind: "rectangle",
    width: 40,
    height: 26,
    border: 2.5,
    color: "#000000",
  });
  const plan = generate(p),
    { result, dec } = check(plan.events);
  assert.equal(plan.stats.stops, 2);
  assert.equal(result.preview.filter((e) => e.cmd === "stop").length, 2);
  assert.deepEqual(modelMachineSizeMm(dec.pec), { widthMm: 40, heightMm: 26 });
  const input = plan.events.filter((e) => e.cmd === "stitch"),
    finish = boundary.operations.at(-1).id;
  assert(input.findIndex((e) => e.objectId === artwork.id) > 0);
  assert(
    input.findLastIndex((e) => e.objectId === artwork.id) <
      input.findIndex((e) => e.operationId === finish),
  );
});

test("a stand-alone operator stop between decorative objects survives actual PES export", () => {
  const a = smartShape("rect", 8, 6, { frame: [1, 0, 0, 1, -12, 0] }),
    b = smartShape("rect", 8, 6, { frame: [1, 0, 0, 1, 12, 0] }),
    pause = smartShape("rect", 2, 2);
  pause.operations = [makeOperation("stop", pause)];
  const plan = generate({
    version: 1,
    name: "Pause",
    machine: "se700",
    objects: [a, pause, b],
  });
  const { result } = check(plan.events);
  assert.equal(plan.stats.stops, 1);
  assert.equal(result.preview.filter((e) => e.cmd === "stop").length, 1);
});

test("stroke columns preserve mixed-operation stops, colors, dimensions and every needle through PES encoding", () => {
  const a = smartShape("rect", 4, 18, { radius: 1 }),
    b = smartShape("ellipse", 12, 20);
  b.rings.push(...smartShape("ellipse", 8, 15).rings);
  b.fillRule = "evenodd";
  for (const ring of a.rings) for (const q of ring) q.x -= 15;
  for (const ring of b.rings) for (const q of ring) q.x += 12;
  a.color = "#000000";
  b.color = "#dd3344";
  a.operations = [
    makeOperation("column", a),
    makeOperation("stop", a),
    makeOperation("run", a),
  ];
  b.operations = [makeOperation("column", b)];
  const plan = generate({
      version: 1,
      name: "Satin construction",
      machine: "se700",
      objects: [a, b],
      planning: { smallDetail: 0 },
    }),
    { result, dec } = check(plan.events);
  assert(plan.diagnostics.satin.every((d) => !d.fallback));
  assert(plan.events.some((e) => e.phase === "satin-stroke"));
  assert.equal(plan.stats.stops, 1);
  assert.equal(result.preview.filter((e) => e.cmd === "stop").length, 1);
  assert.equal(
    result.preview.filter((e) => e.cmd === "color").length,
    plan.stats.changes,
  );
  assert.equal(dec.pec.declaredWidth / 10, plan.stats.bounds.width);
  assert.equal(dec.pec.declaredHeight / 10, plan.stats.bounds.height);
  const opIds = a.operations.map((op) => op.id),
    sewn = plan.events.filter((e) => e.objectId === a.id);
  assert(
    sewn.findIndex((e) => e.operationId === opIds[1]) >
      sewn.findLastIndex((e) => e.operationId === opIds[0]),
  );
  assert(
    sewn.findIndex((e) => e.operationId === opIds[2]) >
      sewn.findIndex((e) => e.operationId === opIds[1]),
  );
});

test("reference assets do not change PES bytes, dimensions, commands, or embedded graphics", () => {
  const o = smartShape("star", 25, 21),
    p = {
      version: 1,
      name: "Reference safety",
      machine: "se700",
      objects: [o],
    },
    before = generate(p),
    first = exportDesign(before.events);
  const reference = addReference(p, {
    name: "PRIVATE_REFERENCE_IMAGE.png",
    width: 400,
    height: 200,
    data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  });
  for (const q of reference.rings[0]) {
    q.x += 800;
    q.y += 300;
  }
  reference.reference.frame[4] += 800;
  reference.reference.frame[5] += 300;
  const after = generate(p),
    second = exportDesign(after.events);
  assert.deepEqual(after.events, before.events);
  assert.deepEqual(first.bytes, second.bytes);
  assert(
    !Buffer.from(second.bytes).includes(Buffer.from("PRIVATE_REFERENCE_IMAGE")),
  );
  assert(!Buffer.from(second.bytes).includes(Buffer.from("data:image")));
  assert(after.stats.fits);
  check(after.events);
});
test("horizontal and vertical flips preserve correctly reflected running needle coordinates in actual PES", () => {
  for (const action of ["flip-horizontal", "flip-vertical"]) {
    const o = object(
        "Asymmetric path",
        [
          [
            { x: -15, y: -8 },
            { x: 5, y: -8 },
            { x: 5, y: -4 },
            { x: -3, y: -4 },
            { x: -3, y: 9 },
          ],
        ],
        { type: "run", underlay: false, closed: false },
      ),
      p = { version: 1, name: "Mirrored path", machine: "se700", objects: [o] };
    o.operations = [
      {
        ...makeOperation("run", o),
        tieIn: false,
        tieOff: false,
        underlay: false,
      },
    ];
    const before = generate(p).events.filter((e) => e.cmd === "stitch");
    arrangeArtwork(p, [o.id], action);
    const plan = generate(p),
      after = plan.events.filter((e) => e.cmd === "stitch");
    assert.equal(after.length, before.length);
    after.forEach((e, i) => {
      assert(
        Math.abs(
          e.x -
            (action === "flip-horizontal" ? -10 - before[i].x : before[i].x),
        ) < 0.10001,
      );
      assert(
        Math.abs(
          e.y - (action === "flip-vertical" ? 1 - before[i].y : before[i].y),
        ) < 0.10001,
      );
    });
    check(plan.events);
  }
});
