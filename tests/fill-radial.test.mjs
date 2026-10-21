import test from "node:test";
import assert from "node:assert/strict";
import { object, translate, transform } from "../src/model.js";
import { generate, resample } from "../src/engine.js";
import { radialFill } from "../src/fills/radial.js";
import { fillContext, makeFillSettings } from "../src/fills/context.js";
import { stampFillFeatures } from "../src/fills/schema.js";
const rect = (x, y, w, h) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ],
  circle = (r) =>
    Array.from({ length: 120 }, (_, i) => ({
      x: r * Math.cos((i * Math.PI) / 60),
      y: r * Math.sin((i * Math.PI) / 60),
    }));
const shape = (rings) =>
  object("Radial", rings, {
    id: "radial",
    closed: true,
    fillRule: "evenodd",
    angle: 0,
    length: 2.8,
    underlay: false,
    compensation: 0,
    tieIn: false,
    tieOff: false,
  });
const plan = (o) =>
  generate(
    stampFillFeatures({
      version: 1,
      name: "Radial",
      machine: "se700",
      objects: [o],
    }),
  );
test("Ripple produces concentric loops while Spiral is one monotonic Archimedean path on a simple disk", () => {
  const o = shape([circle(20)]),
    streams = [];
  for (const method of ["ripple", "spiral"]) {
    o.fillSettings = makeFillSettings(method, o);
    const ctx = fillContext(o, { resample }),
      r = radialFill(ctx),
      p = plan(o);
    streams.push(p.events);
    assert(!p.issues.some((i) => i.severity === "error"));
    assert.deepEqual(p.events, plan(o).events);
    if (method === "ripple") {
      assert(r.paths.length > 20);
      for (const path of r.paths) {
        assert.deepEqual(path.p[0], path.p.at(-1));
        const radii = path.p.map((q) => Math.hypot(q.x, q.y));
        assert(Math.max(...radii) - Math.min(...radii) < 0.2);
      }
    } else {
      assert.equal(r.paths.length, 1);
      const path = r.paths[0].p;
      let previous = 0;
      for (const q of path) {
        const radius = Math.hypot(q.x, q.y);
        assert(radius >= previous - 0.15);
        previous = radius;
      }
      assert(Math.hypot(path.at(-1).x, path.at(-1).y) > 19);
    }
  }
  assert.notDeepEqual(...streams);
});
test("radial clipping preserves counters/islands and validates actual machine coordinates", () => {
  for (const method of ["ripple", "spiral"])
    for (const ratio of [1, 2]) {
      const o = shape([
        rect(-22, -15, 32, 30),
        rect(-10, -4, 6, 8),
        rect(16, -6, 8, 12),
      ]);
      o.fillSettings = makeFillSettings(method, o, { ratio });
      const p = plan(o);
      assert(
        !p.issues.some((i) => i.severity === "error"),
        JSON.stringify(p.issues),
      );
      assert(p.events.some((e) => e.cmd === "stitch" && e.x > 16));
      const ctx = fillContext(o);
      let at = null;
      for (const e of p.events) {
        if (e.cmd === "jump") at = e;
        else if (e.cmd === "stitch") {
          if (at) assert(ctx.safe(ctx.local(at), ctx.local(e)));
          at = e;
        }
      }
    }
});
test("radial parameters, transforms and unsuitable geometry have honest effects without changing source data", () => {
  const o = shape([circle(18)]);
  o.fillSettings = makeFillSettings("spiral", o);
  const a = plan(o).events;
  for (const changes of [
    { clockwise: true },
    { ratio: 2 },
    { centerX: 2 },
    { centerY: 2 },
  ]) {
    o.fillSettings = makeFillSettings("spiral", o, changes);
    assert.notDeepEqual(plan(o).events, a);
    assert(!plan(o).issues.some((i) => i.severity === "error"));
  }
  translate(o, 8, 5);
  transform(o, -1, 1, 30);
  assert(!plan(o).issues.some((i) => i.severity === "error"));
  const narrow = shape([rect(0, 0, 0.1, 10)]);
  narrow.fillSettings = makeFillSettings("spiral", narrow);
  assert.equal(plan(narrow).events.length, 0);
  assert(plan(narrow).issues.some((i) => i.code === "fill-generation"));
});
test("96 mm radial fills remain bounded and export real needles", () => {
  for (const method of ["ripple", "spiral"]) {
    const o = shape([rect(-48, -48, 96, 96)]);
    o.fillSettings = makeFillSettings(method, o);
    const t = performance.now(),
      p = plan(o);
    assert(
      !p.issues.some((i) => i.severity === "error"),
      JSON.stringify(p.issues),
    );
    assert(p.events.length > 5000 && p.events.length < 50000);
    assert(
      p.stats.trims < 25,
      "nearby clipped arcs are grouped instead of repeatedly trimming between corners",
    );
    console.log(
      `96mm ${method}: ${p.events.length} events, ${Math.round(performance.now() - t)}ms.`,
    );
  }
});
