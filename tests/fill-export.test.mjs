import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { object } from "../src/model.js";
import { generate } from "../src/engine.js";
import { makeFillSettings } from "../src/fills/context.js";
import { stampFillFeatures, FILL_METHODS } from "../src/fills/schema.js";
import { checkRoundTrip } from "../src/export-safety.js";
import {
  decodePes,
  declaredRect,
  streamExtents,
} from "./helpers/pes-decoder.mjs";
mkdirSync("test-results", { recursive: true });
test("all fill families round-trip real PES/PEC/DST/EXP/JEF/VP3 without changing writer safety", () => {
  for (const method of Object.keys(FILL_METHODS)) {
    const o = object(
      method,
      [
        [
          { x: -16, y: -12 },
          { x: 16, y: -12 },
          { x: 16, y: 12 },
          { x: -16, y: 12 },
        ],
        [
          { x: -3, y: -3 },
          { x: 3, y: -3 },
          { x: 3, y: 3 },
          { x: -3, y: 3 },
        ],
      ],
      {
        id: "export-fill",
        closed: true,
        fillRule: "evenodd",
        angle: 0,
        underlay: false,
        compensation: 0,
      },
    );
    o.fillSettings = makeFillSettings(method, o);
    const p = stampFillFeatures({
        version: 1,
        name: method,
        machine: "se700",
        objects: [o],
      }),
      plan = generate(p);
    assert(!plan.issues.some((i) => i.severity === "error"));
    for (const format of ["pes", "pec", "dst", "exp", "jef", "vp3"]) {
      const r = spawnSync(
        process.env.PYTHON || "python",
        ["tests/pes-codec-adapter.py"],
        {
          input: JSON.stringify({
            format,
            payload: { name: method, events: plan.events },
          }),
          encoding: "utf8",
          maxBuffer: 16000000,
        },
      );
      assert.equal(r.status, 0, r.stderr);
      const result = JSON.parse(r.stdout),
        integrity = checkRoundTrip(plan.events, result.preview, format);
      assert.deepEqual(
        integrity.errors,
        [],
        `${method}/${format}: ${integrity.errors}`,
      );
      if (format === "pes") {
        const d = decodePes(Uint8Array.from(result.bytes)),
          sewn = d.pec.events.filter((e) => e.type === "stitch"),
          expected = plan.events.filter((e) => e.cmd === "stitch");
        assert.equal(sewn.length, expected.length);
        assert.deepEqual(declaredRect(d.pec), streamExtents(d.pec));
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
  }
});
