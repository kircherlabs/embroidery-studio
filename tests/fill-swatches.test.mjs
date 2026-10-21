import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateProject } from "../src/model.js";
import { generate } from "../src/engine.js";
import {
  decodePes,
  declaredRect,
  streamExtents,
} from "./helpers/pes-decoder.mjs";
test("editable reference swatches and committed PES match current needles and fit the 100 mm field", async () => {
  const dir = new URL("../examples/fill-swatches/", import.meta.url),
    manifest = JSON.parse(
      await readFile(new URL("manifest.json", dir), "utf8"),
    );
  assert.equal(manifest.designs.length, 10);
  for (const item of manifest.designs) {
    const p = JSON.parse(
      await readFile(new URL(item.name + ".embstudio", dir), "utf8"),
    );
    validateProject(p);
    const plan = generate(p);
    assert(!plan.issues.some((i) => i.severity === "error"));
    assert(plan.stats.bounds.width <= 100 && plan.stats.bounds.height <= 100);
    assert.equal(plan.stats.stitches, item.stitches);
    assert.equal(plan.stats.jumps, item.jumps);
    assert.equal(plan.stats.trims, item.trims);
    const d = decodePes(
        new Uint8Array(await readFile(new URL(item.name + ".pes", dir))),
      ),
      actual = d.pec.events.filter((e) => e.type === "stitch"),
      expected = plan.events.filter((e) => e.cmd === "stitch");
    assert.equal(actual.length, expected.length);
    assert.deepEqual(declaredRect(d.pec), streamExtents(d.pec));
    actual.forEach((e, i) => {
      assert.equal(e.x, Math.round((expected[i].x - expected[0].x) * 10) || 0);
      assert.equal(e.y, Math.round((expected[i].y - expected[0].y) * 10) || 0);
    });
  }
});
