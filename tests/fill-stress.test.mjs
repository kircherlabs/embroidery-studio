import test from "node:test";
import assert from "node:assert/strict";
import { object } from "../src/model.js";
import { generate } from "../src/engine.js";
import { makeFillSettings, fillBudget } from "../src/fills/context.js";
import { clipPath } from "../src/fills/paths.js";
import { stampFillFeatures } from "../src/fills/schema.js";
test("indexed exact clipping handles a realistic 147-vertex traced region/counter inside its work budget", () => {
  const rings = [
    Array.from({ length: 123 }, (_, i) => {
      const t = (i * 2 * Math.PI) / 123,
        r = 43 + 3 * Math.sin(9 * t);
      return { x: r * Math.cos(t), y: r * Math.sin(t) };
    }),
    Array.from({ length: 24 }, (_, i) => ({
      x: 4 * Math.cos((i * 2 * Math.PI) / 24),
      y: 4 * Math.sin((i * 2 * Math.PI) / 24),
    })),
  ];
  for (const method of ["ripple", "spiral"]) {
    const o = object("Trace", rings, {
      closed: true,
      fillRule: "evenodd",
      angle: 0,
      underlay: false,
      compensation: 0,
    });
    o.fillSettings = makeFillSettings(method, o);
    const p = generate(
      stampFillFeatures({
        version: 1,
        machine: "se700",
        name: "Trace",
        objects: [o],
      }),
    );
    assert(
      !p.issues.some((i) => i.severity === "error"),
      JSON.stringify(p.issues),
    );
    assert(p.stats.trims < 30);
    assert(p.events.length > 4000);
  }
  const line = [
      { x: -45, y: 0 },
      { x: 45, y: 0 },
    ],
    first = clipPath(line, rings, fillBudget(), "evenodd");
  assert(first.length >= 2);
  assert.throws(
    () => clipPath(line, rings, fillBudget({ steps: 1 }), "evenodd"),
    /budget/,
    "a reused spatial index must charge the current request, not its original budget",
  );
});
