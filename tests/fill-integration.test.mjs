import test from "node:test";
import assert from "node:assert/strict";
import { object, validateProject } from "../src/model.js";
import { generate } from "../src/engine.js";
import { makeOperation } from "../src/operations.js";
import { makeFillSettings } from "../src/fills/context.js";
import { FILL_METHODS, stampFillFeatures } from "../src/fills/schema.js";
import { captureStyle, transferStyle } from "../src/style-transfer.js";
import { extractArtwork, insertArtwork } from "../src/artwork-library.js";
import {
  createArtworkRecord,
  artworkBackup,
  parseArtworkBackup,
} from "../src/artwork-records.js";
import { assignThread, threadTargets } from "../src/thread-assignment.js";
import { builtinThreads } from "../src/thread-records.js";
import { methodPreview } from "../src/fills/previews.js";
import { setEmbroideryStyle, embroideryStyle } from "../src/styles.js";
const rect = (r) => [
    { x: -r, y: -r },
    { x: r, y: -r },
    { x: r, y: r },
    { x: -r, y: r },
  ],
  project = (objects) =>
    stampFillFeatures({
      version: 1,
      name: "Integration",
      machine: "se700",
      objects,
    });
test("every fill preserves independent actions, physical threads, source geometry and frames through library/style/project workflows", () => {
  for (const method of Object.keys(FILL_METHODS)) {
    const o = object("Source", [rect(18), rect(4)], {
      id: "source",
      closed: true,
      fillRule: "evenodd",
      angle: 0,
      underlay: false,
    });
    o.operations = [makeOperation("fill", o), makeOperation("border", o)];
    o.operations[0].fillSettings = makeFillSettings(method, o);
    assignThread(
      threadTargets([o], { activeOperationId: o.operations[0].id }, true),
      builtinThreads()[0],
    );
    const p = project([o]),
      before = JSON.stringify(p),
      plan = generate(p);
    assert(
      !plan.issues.some((i) => i.severity === "error"),
      JSON.stringify(plan.issues),
    );
    const record = createArtworkRecord(method, extractArtwork(p, [o.id])),
      backup = artworkBackup([record]),
      restored = parseArtworkBackup(JSON.parse(JSON.stringify(backup)))
        .records[0];
    const dest = project([]);
    insertArtwork(dest, restored.artwork, { x: 12, y: 7 });
    validateProject(dest);
    const copy = dest.objects[0];
    assert.notEqual(copy.id, o.id);
    assert.notEqual(copy.operations[0].id, o.operations[0].id);
    assert.deepEqual(
      copy.operations[0].physicalThread,
      o.operations[0].physicalThread,
    );
    assert.equal(copy.operations[0].fillSettings.method, method);
    assert.equal(copy.operations[0].fillSettings.frame[4], 12);
    assert.equal(copy.operations[0].fillSettings.frame[5], 7);
    assert.deepEqual(copy.operations[1].color, o.operations[1].color);
    assert.equal(copy.operations.length, 2);
    assert(!generate(dest).issues.some((i) => i.severity === "error"));
    const roundtrip = JSON.parse(JSON.stringify(dest));
    validateProject(roundtrip);
    assert.deepEqual(generate(roundtrip).events, generate(dest).events);
    const target = object("Target", [rect(18)], { id: "target", closed: true });
    target.rings.flat().forEach((q) => (q.x += 45));
    const style = captureStyle(o, o.operations[0].id);
    transferStyle([target], style, "action", {});
    assert.equal(target.operations[0].fillSettings.frame[4], 45);
    assert.equal(target.operations[0].fillSettings.method, method);
    const config = structuredClone(target.operations[0].fillSettings);
    transferStyle([target], style, "color", {});
    assert.deepEqual(target.operations[0].fillSettings, config);
    copy.operations[0].fillSettings.seed = 91;
    copy.rings[0][0].x += 1;
    assert.equal(JSON.stringify(p), before);
    assert.equal(restored.artwork.objects[0].fillSettings, undefined);
  }
});
test("method picker samples are real nonempty, distinct cached generator results", () => {
  const svgs = new Set();
  for (const method of Object.keys(FILL_METHODS)) {
    const svg = methodPreview(method);
    assert(svg.includes('<path d="M'));
    assert(svg.length > 1000);
    assert.equal(svg, methodPreview(method));
    svgs.add(svg);
  }
  assert.equal(svgs.size, 7);
});
test("ordinary sewing presets replace decorative fills deliberately; style transfer and colors remain separate", () => {
  for (const sourceLevel of [true, false])
    for (const style of ["fill", "combined", "fill-border"]) {
      const o = object("Preset source", [rect(15)], {
          closed: true,
          angle: 0,
          color: "#6689a5",
          underlay: false,
        }),
        geometry = structuredClone(o.rings),
        cfg = makeFillSettings("contour", o);
      if (sourceLevel) o.fillSettings = cfg;
      else {
        o.operations = [makeOperation("fill", o)];
        o.operations[0].fillSettings = cfg;
      }
      assert.equal(embroideryStyle(o), "custom");
      setEmbroideryStyle(o, style);
      assert.equal(o.fillSettings, undefined);
      assert(o.operations.every((op) => !op.fillSettings));
      assert.equal(embroideryStyle(o), style);
      assert.equal(o.operations[0].color, "#6689a5");
      assert.deepEqual(o.rings, geometry);
      const p = project([o]);
      assert.equal(p.version, 1);
      assert(!generate(p).issues.some((i) => i.severity === "error"));
    }
});
test("style transfer distinguishes absent ordinary-fill settings from inherited source defaults", () => {
  const source = object("Ordinary", [rect(12)], { closed: true, angle: 0 }),
    style = captureStyle(source, "base");
  for (const mode of ["color", "action"]) {
    const target = object("Target", [rect(12)], { closed: true, angle: 0 });
    target.fillSettings = makeFillSettings("contour", target);
    target.operations = [
      makeOperation("fill", target),
      makeOperation("fill", target),
    ];
    delete target.operations[0].fillSettings;
    target.operations[1].fillSettings = makeFillSettings("tatami", target, {
      texture: "twill",
    });
    transferStyle([target], style, mode, {
      activeOperationId: target.operations[0].id,
    });
    assert.equal(target.fillSettings, undefined);
    assert.equal(target.operations[1].fillSettings.texture, "twill");
    assert.equal(
      target.operations[0].fillSettings?.method,
      mode === "color" ? "contour" : undefined,
    );
  }
});
