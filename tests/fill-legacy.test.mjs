import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { generate, fillRows } from "../src/engine.js";
import { object, validateProject } from "../src/model.js";
const data = JSON.parse(
  await readFile(
    new URL("./fixtures/tatami-legacy.json", import.meta.url),
    "utf8",
  ),
);
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
test("legacy Tatami: 120 measured full event/row streams remain byte-identical", () => {
  for (const c of data.cases) {
    const rings = data.geometries[c.geometry];
    const source = object(c.geometry, rings, {
      id: c.id,
      color: "#123456",
      angle: c.angle,
      spacing: c.spacing,
      length: 3,
      pattern: c.pattern,
      compensation: 0,
      underlay: false,
      closed: true,
      fillRule: "evenodd",
    });
    const p = {
      version: 1,
      name: "Fill audit",
      machine: "se700",
      objects: [source],
      planning: {
        smallDetail: 0,
        skipSvgOutlines: false,
        optimizeColors: false,
      },
    };
    validateProject(p);
    assert.equal(digest(generate(p).events), c.events, c.id + " commands");
    const rows = fillRows(
      rings,
      c.spacing,
      c.angle,
      3,
      0,
      "evenodd",
      c.pattern,
    );
    assert.equal(
      digest(
        rows.map((r) => ({
          points: [...r],
          anchors: r.anchors,
          scanline: r.scanline,
          interval: r.interval,
        })),
      ),
      c.rows,
      c.id + " scanlines",
    );
  }
});
test("legacy Tatami: compensation, underlay, stacks, winding and dense transformed imports stay exact", () => {
  for (const c of data.extra) {
    validateProject(c.project);
    const original = JSON.stringify(c.project);
    assert.equal(digest(generate(c.project).events), c.events, c.id);
    assert.equal(
      JSON.stringify(c.project),
      original,
      c.id + " source retained",
    );
  }
});
