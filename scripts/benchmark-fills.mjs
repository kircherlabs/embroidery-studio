import { object } from "../src/model.js";
import { generate } from "../src/engine.js";
import { makeFillSettings } from "../src/fills/context.js";
import { stampFillFeatures, FILL_METHODS } from "../src/fills/schema.js";
import { writeFile, mkdir } from "node:fs/promises";
const rectangle = [
    [
      { x: -48, y: -48 },
      { x: 48, y: -48 },
      { x: 48, y: 48 },
      { x: -48, y: 48 },
    ],
  ],
  trace = [
    Array.from({ length: 123 }, (_, i) => {
      const t = (i * 2 * Math.PI) / 123,
        r = 43 + 3 * Math.sin(9 * t);
      return { x: r * Math.cos(t), y: r * Math.sin(t) };
    }),
    Array.from({ length: 24 }, (_, i) => ({
      x: 4 * Math.cos((i * 2 * Math.PI) / 24),
      y: 4 * Math.sin((i * 2 * Math.PI) / 24),
    })),
  ],
  results = [];
for (const [name, rings] of [
  ["96mm rectangle", rectangle],
  ["traced region with counter", trace],
])
  for (const method of Object.keys(FILL_METHODS)) {
    const o = object("Benchmark", rings, {
      id: "benchmark",
      closed: true,
      fillRule: "evenodd",
      angle: 0,
      underlay: false,
      compensation: 0,
    });
    o.fillSettings = makeFillSettings(method, o);
    const p = stampFillFeatures({
        version: 1,
        name,
        machine: "se700",
        objects: [o],
      }),
      times = [];
    let plan;
    for (let i = 0; i < 4; i++) {
      const start = performance.now();
      plan = generate(p);
      if (i) times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    results.push({
      shape: name,
      method,
      medianMs: Math.round(times[1] * 100) / 100,
      events: plan.events.length,
      jumps: plan.stats.jumps,
      trims: plan.stats.trims,
      errors: plan.issues
        .filter((i) => i.severity === "error")
        .map((i) => i.message),
    });
  }
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/fill-benchmarks.json",
  JSON.stringify({ runtime: process.version, results }, null, 2),
);
console.table(results.map((r) => ({ ...r, errors: r.errors.join("; ") })));
