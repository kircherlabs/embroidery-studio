import test from "node:test";
import assert from "node:assert/strict";
import {
  manualRing,
  autoLetter,
  project,
  qualityFixtures,
} from "./helpers/quality-fixtures.mjs";
import { preparePlan } from "../src/planning.js";
import { generate } from "../src/engine.js";
import { manualSatin } from "../src/manual-satin.js";
import { strokeSatin } from "../src/stroke-satin.js";
import { safeConnector, distance } from "../src/geometry.js";
const unit = (o) => preparePlan(project([o])).units[0];
const top = (paths, phase) =>
  paths.filter((p) => p.phase === phase).map((p) => p.p);
test("narrow curved manual underlay avoids sparse chords and retains top satin", () => {
  const o = unit(manualRing(2, 1.6)),
    old = manualSatin(o);
  assert.equal(
    old.paths.filter((p) => p.phase === "underlay").length,
    6,
    "reproduce six broken underlay components",
  );
  const next = manualSatin({ ...o, qualitySafeguards: true });
  assert.equal(
    next.paths.filter((p) => p.phase === "underlay").length,
    1,
    "underlay chords leave the narrow curved band",
  );
  assert.deepEqual(
    top(next.paths, "satin-rails"),
    top(old.paths, "satin-rails"),
  );
  const oldPlan = generate(project([manualRing(2, 1.6)]));
  const newPlan = generate(project([manualRing(2, 1.6)], true));
  assert.equal(
    oldPlan.events.filter((e) => e.cmd === "stitch" && e.phase === "underlay")
      .length,
    0,
  );
  assert(
    newPlan.events.filter((e) => e.cmd === "stitch" && e.phase === "underlay")
      .length > 0,
  );
  assert.equal(newPlan.stats.jumps, 1);
});
test("automatic branch travel is not sewn over completed satin", () => {
  const o = unit(autoLetter()),
    old = strokeSatin(o);
  const travel = old.paths.filter((p) => p.phase === "travel");
  assert(
    travel.reduce(
      (s, p) =>
        s + p.p.slice(1).reduce((n, q, i) => n + distance(q, p.p[i]), 0),
      0,
    ) > 20,
  );
  const next = strokeSatin({ ...o, qualitySafeguards: true });
  assert.equal(
    next.paths.filter((p) => p.phase === "travel").length,
    0,
    "whole-region routes cross already completed branches",
  );
  assert.deepEqual(
    top(next.paths, "satin-stroke"),
    top(old.paths, "satin-stroke"),
  );
});
test("manual underlay correction is contained and keeps rails, widths and top needles", () => {
  for (const [radius, width] of [
    [3, 0.2],
    [2, 0.4],
    [1, 0.4],
    [3, 0.4],
    [7, 4],
  ])
    for (const kind of ["center", "edge", "both"]) {
      const art = manualRing(radius, radius - width);
      art.operations[0].railUnderlay = kind;
      const o = unit(art),
        old = manualSatin(o),
        next = manualSatin({ ...o, qualitySafeguards: true });
      assert.deepEqual(next.sections, old.sections);
      assert.deepEqual(
        top(next.paths, "satin-rails"),
        top(old.paths, "satin-rails"),
      );
      assert(
        next.paths.length <= old.paths.length,
        `${radius}/${width}/${kind}`,
      );
      for (const p of next.paths.filter((p) => p.phase === "underlay"))
        for (let i = 1; i < p.p.length; i++) {
          assert(
            safeConnector(
              p.p[i - 1],
              p.p[i],
              o.rings,
              0.01,
              o.rings.slice(1),
              "evenodd",
            ),
          );
          assert(distance(p.p[i - 1], p.p[i]) <= 2.65);
        }
    }
});
test("automatic lettering keeps branch coverage and user corner settings", () => {
  for (const letter of ["T", "H", "L", "I"])
    for (const corners of [false, true]) {
      const art = autoLetter(letter);
      art.operations[0].cornerControl = corners;
      const o = unit(art),
        old = strokeSatin(o),
        next = strokeSatin({ ...o, qualitySafeguards: true });
      assert(!old.reason && !next.reason);
      assert.deepEqual(
        top(next.paths, "satin-stroke"),
        top(old.paths, "satin-stroke"),
      );
      assert.deepEqual(next.strokes, old.strokes);
      assert.equal(
        next.paths.filter((p) => p.travel === "jump").length,
        next.strokes.length - 1,
      );
    }
});
test("centerline and border construction retain their existing corner, angle and width behavior", () => {
  for (const name of ["satinCurve", "satinCorner", "satinBorder"]) {
    const p = qualityFixtures()[name],
      old = generate(p).events;
    p.planning.qualitySafeguards = true;
    assert.deepEqual(generate(p).events, old);
  }
});
