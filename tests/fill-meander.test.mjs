import test from "node:test";
import assert from "node:assert/strict";
import { object, translate } from "../src/model.js";
import { generate, resample } from "../src/engine.js";
import { meanderFill } from "../src/fills/meander.js";
import { fillContext, makeFillSettings } from "../src/fills/context.js";
import { stampFillFeatures } from "../src/fills/schema.js";
const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const shape = (rings) =>
  object("Meander", rings, {
    id: "meander",
    closed: true,
    fillRule: "evenodd",
    angle: 0,
    length: 2,
    underlay: false,
    compensation: 0,
  });
const crossing = (a, b, c, d) => {
  const t = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return t(a, b, c) * t(a, b, d) < -1e-9 && t(c, d, a) * t(c, d, b) < -1e-9;
};
const plan = (o) =>
  generate(
    stampFillFeatures({
      version: 1,
      name: "Meander",
      machine: "se700",
      objects: [o],
    }),
  );
test("all meander presets fit the deterministic work budget on a 96 mm field", () => {
  for (const style of ["classic", "fine", "open", "organic", "looping"]) {
    const o = shape([rect(-48, -48, 96, 96)]);
    o.fillSettings = makeFillSettings("meander", o, { style });
    const start = performance.now(),
      p = plan(o);
    assert(
      !p.issues.some((i) => i.severity === "error"),
      `${style}: ${JSON.stringify(p.issues)}`,
    );
    assert(p.events.length < 20000);
    console.log(
      `96mm ${style}: ${p.events.length} events, ${Math.round(performance.now() - start)}ms (measurement, not a hardware guarantee).`,
    );
  }
});
test("five meander presets create distinct real curved paths, deterministic seeds and contained needle geometry", () => {
  const streams = new Set(),
    counts = {};
  for (const style of ["classic", "fine", "open", "organic", "looping"]) {
    const o = shape([rect(-20, -15, 40, 30)]);
    o.fillSettings = makeFillSettings("meander", o, { style });
    const ctx = fillContext(o, { resample }),
      a = meanderFill(ctx),
      before = JSON.stringify(o),
      p = plan(o);
    assert.equal(JSON.stringify(o), before);
    assert(!p.issues.some((i) => i.severity === "error"));
    assert.deepEqual(p.events, plan(o).events);
    counts[style] = p.events.length;
    streams.add(JSON.stringify(p.events));
    for (const path of a.paths) {
      for (let i = 1; i < path.p.length; i++) {
        assert(ctx.safe(ctx.local(path.p[i - 1]), ctx.local(path.p[i])));
        for (let j = i + 2; j < path.p.length; j++)
          assert(
            !crossing(path.p[i - 1], path.p[i], path.p[j - 1], path.p[j]),
            `${style} unwanted crossing at ${i}/${j}`,
          );
      }
    }
    if (style === "looping") assert(a.stats.loops > 5);
    else assert.equal(a.stats.loops, 0);
  }
  assert.equal(streams.size, 5);
  assert(counts.fine > counts.classic && counts.classic > counts.open);
});
test("meander retains holes and every disconnected component; narrow details are diagnosed, not silently solid-filled", () => {
  for (const style of ["classic", "organic", "looping"]) {
    const o = shape([
      rect(-25, -15, 35, 30),
      rect(-8, -4, 6, 8),
      rect(17, -8, 10, 16),
    ]);
    o.fillSettings = makeFillSettings("meander", o, { style });
    const p = plan(o);
    assert(
      !p.issues.some((i) => i.severity === "error"),
      JSON.stringify(p.issues),
    );
    assert(p.events.some((e) => e.cmd === "stitch" && e.x > 17));
    assert(p.events.some((e) => e.cmd === "stitch" && e.x < 10));
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
  const o = shape([rect(-20, -15, 40, 30)]);
  o.fillSettings = makeFillSettings("meander", o, { style: "organic" });
  const a = plan(o);
  o.fillSettings.seed = 83;
  assert.notDeepEqual(plan(o).events, a.events);
  translate(o, 7, 5);
  assert(!plan(o).issues.some((i) => i.severity === "error"));
  o.fillSettings.lineSpacing = 10;
  assert(plan(o).issues.some((i) => i.code === "fill-generation"));
  const thin = shape([rect(0, 0, 0.4, 12)]);
  thin.fillSettings = makeFillSettings("meander", thin);
  assert.equal(plan(thin).events.length, 0);
});
