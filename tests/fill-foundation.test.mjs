import test from "node:test";
import assert from "node:assert/strict";
import { object, validateProject, translate, transform } from "../src/model.js";
import { makeOperation, operationObject } from "../src/operations.js";
import { generate } from "../src/engine.js";
import {
  makeFillSettings,
  fillCoordinates,
  fillContext,
  fillBudget,
} from "../src/fills/context.js";
import {
  validateFillSettings,
  stampFillFeatures,
  hasAdvancedFills,
} from "../src/fills/schema.js";
import { clipPath, quantizedPath } from "../src/fills/paths.js";
import { extractArtwork, insertArtwork } from "../src/artwork-library.js";
import {
  createArtworkRecord,
  artworkBackup,
  parseArtworkBackup,
  validateArtworkRecord,
} from "../src/artwork-records.js";
import { captureStyle, transferStyle } from "../src/style-transfer.js";
const ring = (r) => [
  { x: -r, y: -r },
  { x: r, y: -r },
  { x: r, y: r },
  { x: -r, y: r },
];
const shape = () =>
  object("Region", [ring(12), ring(4)], {
    id: "region",
    closed: true,
    underlay: false,
    fillRule: "evenodd",
    angle: 30,
  });
const project = (o) => ({
  version: 1,
  name: "Fill foundations",
  machine: "se700",
  objects: o ? [o] : [],
});
test("fill schemas guard project and library versions, preserve legacy files and reject malformed feature data", () => {
  const o = shape(),
    p = project(o),
    before = JSON.stringify(p);
  stampFillFeatures(p);
  validateProject(p);
  assert.equal(JSON.stringify(p), before);
  o.fillSettings = makeFillSettings("tatami", o);
  assert.throws(() => validateProject(p), /version 2/);
  stampFillFeatures(p);
  validateProject(p);
  assert.equal(p.version, 2);
  assert.equal(hasAdvancedFills(p), true);
  for (const changes of [
    { version: 3 },
    { requires: ["other"] },
    { version: 1, requires: undefined },
  ])
    assert.throws(() => validateProject({ ...p, ...changes }));
  for (const change of [
    { seed: NaN },
    { seed: 1.5 },
    { frame: [0, 0, 0, 0, 0, 0] },
    { texture: "custom", sequence: [1] },
    { texture: "bogus" },
    { alien: 1 },
    { period: 1000 },
    { sequence: Array(33).fill(0) },
    { method: "constructor" },
  ])
    assert.throws(() => validateFillSettings({ ...o.fillSettings, ...change }));
  const a = extractArtwork(p, [o.id]),
    record = createArtworkRecord("Editable fill", a),
    backup = artworkBackup([record]);
  assert.equal(a.version, 2);
  assert.equal(record.version, 2);
  assert.equal(backup.version, 2);
  assert.deepEqual(parseArtworkBackup(backup).records, [record]);
  assert.throws(
    () => validateArtworkRecord({ ...record, version: 1, requires: undefined }),
    /version 2/,
  );
  const d = project();
  insertArtwork(d, a);
  assert.equal(d.version, 2);
  assert.deepEqual(d.objects[0].fillSettings.method, "tatami");
  validateProject(d);
  delete o.fillSettings;
  stampFillFeatures(p);
  assert.equal(p.version, 1);
  assert.equal(p.requires, undefined);
});
test("object-attached fill frames follow translation, rotation, reflection and resize with physical density units", () => {
  const o = shape();
  o.fillSettings = makeFillSettings("tatami", o);
  const initial = fillCoordinates(o.fillSettings),
    p = { x: 2, y: 3 },
    start = initial.world(p);
  translate(o, 7, -5);
  let coords = fillCoordinates(o.fillSettings);
  assert.ok(Math.abs(coords.world(p).x - start.x - 7) < 1e-8);
  assert.ok(Math.abs(coords.world(p).y - start.y + 5) < 1e-8);
  transform(o, 1, 1, 90);
  coords = fillCoordinates(o.fillSettings);
  const a = coords.world({ x: 0, y: 0 }),
    b = coords.world({ x: 1, y: 0 });
  assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - 1) < 1e-8);
  transform(o, 2, 0.5);
  coords = fillCoordinates(o.fillSettings);
  const q = coords.world(p);
  assert.ok(Math.abs(coords.local(q).x - p.x) < 1e-8);
  assert.ok(Math.abs(coords.local(q).y - p.y) < 1e-8);
  transform(o, -1, 1);
  coords = fillCoordinates(o.fillSettings);
  assert.ok(coords.u.x * coords.v.y - coords.u.y * coords.v.x < 0);
  const world = shape();
  world.fillSettings = makeFillSettings("tatami", world, { anchor: "global" });
  const frame = structuredClone(world.fillSettings);
  translate(world, 10, 20);
  transform(world, 2, 2, 45);
  assert.deepEqual(world.fillSettings, frame);
});
test("fill action settings remain independent, do not enter satin fallbacks and transfer without copying pattern position", () => {
  const o = shape();
  o.fillSettings = makeFillSettings("tatami", o);
  o.operations = [makeOperation("fill", o), makeOperation("column", o)];
  assert.equal(o.operations[1].fillSettings, undefined);
  assert.equal(operationObject(o, o.operations[1]).fillSettings, undefined);
  o.operations[0].fillSettings.seed = 9;
  assert.equal(o.fillSettings.seed, 1);
  const target = shape();
  target.id = "target";
  translate(target, 50, 0);
  const style = captureStyle(o, o.operations[0].id);
  // Until a generator is registered, validation never silently falls back to Tatami.
  style.action.fillSettings.method = "invalid";
  assert.throws(() => validateFillSettings(style.action.fillSettings));
  style.action.fillSettings.method = "tatami";
  transferStyle([target], style, "action", {});
  assert.equal(target.operations[0].fillSettings.frame[4], 50);
  assert.equal(target.operations[0].fillSettings.seed, 9);
  const invalid = shape();
  invalid.fillSettings = { ...o.fillSettings, method: "missing" };
  const plan = generate(stampFillFeatures(project(invalid)));
  assert.equal(plan.events.length, 0);
  assert.ok(
    plan.issues.some(
      (i) => i.severity === "error" && i.code === "fill-generation",
    ),
  );
});
test("shared clipping partitions entire segments at narrow counters and budgets fail explicitly", () => {
  const o = shape(),
    ctx = fillContext({
      ...o,
      fillSettings: makeFillSettings("contour", o, { angle: 0 }),
    });
  const runs = clipPath(
    [
      { x: -11, y: 0 },
      { x: 11, y: 0 },
    ],
    ctx.localRings,
  );
  assert.equal(runs.length, 2);
  assert.ok(runs.every((r) => ctx.safe(r[0], r.at(-1))));
  assert.equal(
    quantizedPath([
      { x: 0.01, y: 0 },
      { x: 0.02, y: 0 },
      { x: 0.12, y: 0 },
    ]).length,
    2,
  );
  const budget = fillBudget({ steps: 1, points: 1 });
  budget.step();
  assert.throws(() => budget.step(), /budget/);
  budget.add();
  assert.throws(() => budget.add(), /budget/);
});
test("optional fill fields normalize consistently before editing or switching methods", () => {
  const o = shape();
  o.fillSettings = { version: 1, method: "tatami" };
  const ctx = fillContext(o);
  assert.deepEqual(ctx.cfg.frame, [1, 0, 0, 1, 0, 0]);
  assert.equal(ctx.cfg.angle, 0);
  assert.equal(ctx.cfg.texture, "quarter");
  const s = makeFillSettings("contour", o, {
    frame: undefined,
    angle: undefined,
    anchor: undefined,
    seed: undefined,
  });
  validateFillSettings(s);
  assert(s.frame.every(Number.isFinite));
  assert.equal(s.anchor, "object");
  const custom = makeFillSettings("tatami", o, { texture: "custom" });
  assert.deepEqual(custom.sequence, [0, 0.4, 0.1, 0.65]);
  custom.sequence[0] = 0.9;
  assert.equal(
    makeFillSettings("tatami", o, { texture: "custom" }).sequence[0],
    0,
  );
});
