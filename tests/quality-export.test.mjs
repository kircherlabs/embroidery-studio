import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { generate } from "../src/engine.js";
import { exportPreflight, checkRoundTrip } from "../src/export-safety.js";
import { validateProject } from "../src/model.js";
import { extractArtwork, insertArtwork } from "../src/artwork-library.js";
import { stampFillFeatures } from "../src/fills/schema.js";
import {
  qualityFixtures,
  manualRing,
  autoLetter,
  project,
} from "./helpers/quality-fixtures.mjs";
import {
  decodePes,
  declaredRect,
  streamExtents,
} from "./helpers/pes-decoder.mjs";
mkdirSync("test-results", { recursive: true });
test("legacy and corrected quality references pass six-format decoding and Brother origin checks", () => {
  const cases = [
    qualityFixtures().narrowNeck,
    qualityFixtures().embossedCounter,
    project([manualRing(2, 1.6)]),
    project([autoLetter()]),
  ];
  for (const p of cases)
    for (const flag of [false, true]) {
      p.planning.qualitySafeguards = flag;
      stampFillFeatures(p);
      validateProject(p);
      const source = JSON.stringify(p),
        plan = generate(p),
        events = JSON.stringify(plan.events);
      assert(plan.stats.fits);
      assert(!plan.issues.some((i) => i.severity === "error"));
      for (const format of ["pes", "pec", "dst", "exp", "jef", "vp3"]) {
        assert.deepEqual(exportPreflight(p, plan.events, format).errors, []);
        const r = spawnSync(
          process.env.PYTHON || "python",
          ["tests/pes-codec-adapter.py"],
          {
            input: JSON.stringify({
              format,
              payload: { name: "Quality reference", events: plan.events },
            }),
            encoding: "utf8",
            maxBuffer: 16000000,
          },
        );
        assert.equal(r.status, 0, r.stderr);
        const decoded = JSON.parse(r.stdout);
        assert.deepEqual(
          checkRoundTrip(plan.events, decoded.preview, format).errors,
          [],
          format,
        );
        if (format === "pes") {
          const d = decodePes(new Uint8Array(decoded.bytes));
          assert.deepEqual(declaredRect(d.pec), streamExtents(d.pec));
          const sewn = d.pec.events.filter((e) => e.type === "stitch"),
            expected = plan.events.filter((e) => e.cmd === "stitch");
          assert.equal(sewn.length, expected.length);
          sewn.forEach((e, i) => {
            assert.equal(
              e.x,
              Math.round((expected[i].x - expected[0].x) * 10) || 0,
            );
            assert.equal(
              e.y,
              Math.round((expected[i].y - expected[0].y) * 10) || 0,
            );
          });
        }
      }
      assert.equal(JSON.stringify(p), source);
      assert.equal(JSON.stringify(plan.events), events);
    }
});
test("quality-mode artwork stays editable through My Artwork and saved project reload", () => {
  const source = project([manualRing(2, 1.6)]),
    before = JSON.stringify(source);
  const saved = extractArtwork(source, [source.objects[0].id]);
  const dest = project([], true);
  insertArtwork(dest, saved);
  assert.deepEqual(dest.objects[0].satinRails, source.objects[0].satinRails);
  assert.equal(dest.objects[0].operations[0].railUnderlay, "center");
  const reopened = validateProject(JSON.parse(JSON.stringify(dest))),
    plan = generate(reopened);
  assert(plan.stats.fits);
  assert.equal(plan.stats.jumps, 1);
  assert(reopened.planning.qualitySafeguards);
  assert.equal(JSON.stringify(source), before);
  assert.notEqual(dest.objects[0].id, source.objects[0].id);
});
