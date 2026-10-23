import test from "node:test";
import assert from "node:assert/strict";
import { object } from "../src/model.js";
import { newLayout, suggestHoops } from "../src/multi-hoop-layout.js";
import { generateMultiHoop } from "../src/multi-hoop-split.js";
import {
  splitEligibility,
  seamInspections,
} from "../src/multi-hoop-inspection.js";
import { movementSegments } from "../src/preview.js";
import { generateFill } from "../src/fills/registry.js";
import { makeFillSettings } from "../src/fills/context.js";
import { FILL_METHODS } from "../src/fills/schema.js";
import { OPERATION_TYPES } from "../src/operations.js";
const ring = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
test("Tatami two/three hoop joins retain actual top coverage at varied angles and seams", () => {
  for (const w of [150, 240])
    for (const angle of [0, 37, 90])
      for (const shift of [-4, 0, 4]) {
        const o = object("Continuous rectangle", [ring(-w / 2, -20, w, 40)], {
          angle,
          spacing: 0.6,
          compensation: 0,
          underlay: true,
        });
        const p = {
          version: 1,
          name: "Density",
          machine: "se700",
          objects: [o],
          multiHoop: newLayout(),
        };
        p.multiHoop.hoops = suggestHoops(p);
        p.multiHoop.hoops[0].seamX = shift;
        const before = JSON.stringify(p),
          b = generateMultiHoop(p);
        assert.deepEqual(b.problems, []);
        let length = 0;
        for (const s of b.sections) {
          assert(
            s.plan.events.some(
              (e) => e.phase === "underlay" && e.cmd === "stitch",
            ),
          );
          let local = 0;
          for (const { from, event: e } of movementSegments(s.plan.events))
            if (e.cmd === "stitch" && e.phase === "top")
              local += Math.hypot(from.x - e.x, from.y - e.y);
          const source = s.project.objects[0].rings[0];
          assert(
            local > 100,
            "Each section has real top stitching, not merely underlay",
          );
          length += local;
        }
        assert(
          Math.abs(length * 0.6 - w * 40) < w * 40 * 0.045,
          `${w}/${angle}/${shift}: sewn area ${length * 0.6}`,
        );
        assert.equal(
          b.assembled.events.length,
          b.sections.reduce((n, s) => n + s.plan.events.length, 0),
        );
        assert(seamInspections(b).length >= b.sections.length - 1);
        assert.equal(JSON.stringify(p), before);
      }
});
test("temporary fill seam limits follow the coordinate system of each row generator", () => {
  const o = object("Rotated frame", [ring(-20, -10, 40, 20)], {
    underlay: true,
    spacing: 0.5,
  });
  o.fillSettings = makeFillSettings("tatami", o, { angle: 37 });
  o.multiHoopDomain = [ring(-25, -15, 50, 30)];
  const calls = [];
  generateFill(
    o,
    {
      fillRows: (...a) => {
        calls.push(a);
        return [];
      },
      routeFill: () => [],
    },
    { x: 0, y: 0 },
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls[1][10],
    o.multiHoopDomain,
    "underlay domain must stay in world coordinates",
  );
  assert.notDeepEqual(
    calls[0][10],
    o.multiHoopDomain,
    "top rows receive the rotated fill-local domain",
  );
});
test("every embroidery method has deliberate interior-cut eligibility, independent of artwork label", () => {
  const o = object("Lettering label", [ring(-75, -10, 150, 20)]);
  for (const type of Object.keys(OPERATION_TYPES)) {
    o.operations = [{ id: "op", type }];
    assert.equal(
      splitEligibility(o).kind,
      ["run", "bean", "triple"].includes(type)
        ? "path"
        : type === "fill"
          ? "fill"
          : "unsupported",
      type,
    );
  }
  for (const method of Object.keys(FILL_METHODS)) {
    o.operations = [
      { id: "op", type: "fill", fillSettings: makeFillSettings(method, o) },
    ];
    assert.equal(
      splitEligibility(o).kind,
      ["tatami", "emboss"].includes(method) ? "fill" : "unsupported",
      method,
    );
  }
  o.operations = [
    { type: "fill", fillSettings: makeFillSettings("tatami", o, { inset: 1 }) },
  ];
  assert.equal(splitEligibility(o).kind, "unsupported");
  o.operations = [{ type: "fill" }, { type: "border" }];
  assert.equal(splitEligibility(o).kind, "unsupported");
});
