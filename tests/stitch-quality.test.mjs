import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { generate, fillRows } from "../src/engine.js";
import { routeFill } from "../src/fill-routing.js";
import { preparePlan } from "../src/planning.js";
import { qualityFixtures, rect, project } from "./helpers/quality-fixtures.mjs";
import { validateProject, object } from "../src/model.js";
import { completedRetrace } from "./helpers/quality-metrics.mjs";
const baseline = JSON.parse(
  readFileSync(new URL("./fixtures/quality-legacy.json", import.meta.url)),
);
test("quality routing starts at a row-chain end instead of adding a restart to a simple fill", () => {
  for (const underlay of [false, true])
    for (const x of [-20, 0, 20]) {
      const o = object("Simple fill", [rect(x, -10, 20, 20)], {
        angle: 0,
        compensation: 0,
        underlay,
      });
      assert.equal(generate(project([o], true)).stats.jumps, 1);
    }
});
test("pre-audit legacy event snapshots remain exact with absent or disabled quality safeguards", () => {
  for (const [name, p] of Object.entries(qualityFixtures())) {
    for (const setting of [false, undefined]) {
      if (setting === undefined) delete p.planning.qualitySafeguards;
      const before = JSON.stringify(p),
        plan = generate(p);
      assert.equal(
        createHash("sha256").update(JSON.stringify(plan.events)).digest("hex"),
        baseline[name].hash,
        name,
      );
      assert.equal(JSON.stringify(p), before);
    }
  }
});
test("quality routing retains all top rows and hole geometry across angles", () => {
  for (const name of ["tatamiCounter", "narrowNeck"])
    for (const angle of [0, 35, 90]) {
      const p = qualityFixtures()[name];
      p.objects[0].angle = angle;
      const o = preparePlan(p).units[0];
      const rows = () =>
        fillRows(
          o.rings,
          o.spacing,
          o.angle,
          o.length,
          o.compensation,
          o.fillRule,
        );
      const paths = (flag) =>
        routeFill(
          rows(),
          { ...o, qualitySafeguards: flag },
          { x: 0, y: 0 },
          "top",
        );
      const signature = (paths) =>
        paths
          .filter((p) => p.phase === "top")
          .map((p) =>
            p.p
              .map((p) => `${p.x},${p.y}`)
              .sort()
              .join(";"),
          )
          .sort();
      assert.deepEqual(signature(paths(true)), signature(paths(false)));
      const source = JSON.stringify(p.objects);
      p.planning.qualitySafeguards = true;
      assert(generate(p).stats.maxLength <= 7);
      assert.equal(JSON.stringify(p.objects), source);
    }
});
test("quality preference validates, persists and leaves intentional running stitches alone", () => {
  const p = qualityFixtures().intentionalRun,
    old = generate(p).events;
  p.planning.qualitySafeguards = true;
  assert.deepEqual(
    generate(validateProject(JSON.parse(JSON.stringify(p)))).events,
    old,
  );
  p.planning.qualitySafeguards = "yes";
  assert.throws(() => validateProject(p), /digitizing/);
});
test("quality safeguards do not repair or rewrite imported manual needle commands", () => {
  const o = object("Imported commands", [], {
    id: "manual",
    type: "manual",
    commands: [
      { cmd: "jump", x: -5, y: 0 },
      { cmd: "stitch", x: -5, y: 0 },
      { cmd: "stitch", x: 0, y: 0 },
      { cmd: "stitch", x: -5, y: 0 },
      { cmd: "trim", x: -5, y: 0 },
      { cmd: "jump", x: 5, y: 0 },
      { cmd: "stitch", x: 5, y: 0 },
    ],
  });
  const p = project([o]),
    before = JSON.stringify(o),
    old = generate(p).events;
  p.planning.qualitySafeguards = true;
  assert.deepEqual(generate(p).events, old);
  assert.equal(JSON.stringify(o), before);
});
test("quality routing must not retrace completed top rows at a narrow neck", () => {
  const p = qualityFixtures().narrowNeck,
    o = preparePlan(p).units[0];
  const rows = () =>
    fillRows(o.rings, o.spacing, o.angle, o.length, o.compensation, o.fillRule);
  const old = routeFill(rows(), o, { x: 0, y: 0 }, "top");
  assert(
    completedRetrace(old) > 20,
    "reproduce the exposed completed-row retrace",
  );
  const next = routeFill(
    rows(),
    { ...o, qualitySafeguards: true },
    { x: 0, y: 0 },
    "top",
  );
  assert(
    completedRetrace(next) < 1e-7,
    "completed top stitching is revisited by a routing stitch",
  );
  const signature = (paths) =>
    paths
      .filter((p) => p.phase === "top")
      .map((p) =>
        p.p
          .map((p) => `${p.x},${p.y}`)
          .sort()
          .join(";"),
      )
      .sort();
  assert.deepEqual(
    signature(next),
    signature(old),
    "every original fill span remains sewn exactly once",
  );
});
