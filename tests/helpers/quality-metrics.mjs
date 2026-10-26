import { distance } from "../../src/geometry.js";

// Independent overlap measurement: routing that retraces a completed top span
// cannot be concealed by that same span later. Junction points add no length.
export function completedRetrace(paths) {
  const sewn = [];
  let length = 0;
  for (const path of paths) {
    if (path.phase === "top") sewn.push([path.p[0], path.p.at(-1)]);
    if (path.phase !== "travel") continue;
    for (let i = 1; i < path.p.length; i++) {
      const a = path.p[i - 1],
        b = path.p[i],
        d = distance(a, b);
      if (d < 1e-8) continue;
      const ux = (b.x - a.x) / d,
        uy = (b.y - a.y) / d;
      for (const [c, e] of sewn) {
        if (
          Math.abs((c.x - a.x) * uy - (c.y - a.y) * ux) > 1e-7 ||
          Math.abs((e.x - a.x) * uy - (e.y - a.y) * ux) > 1e-7
        )
          continue;
        const x = (c.x - a.x) * ux + (c.y - a.y) * uy,
          y = (e.x - a.x) * ux + (e.y - a.y) * uy;
        length += Math.max(
          0,
          Math.min(d, Math.max(x, y)) - Math.max(0, Math.min(x, y)),
        );
      }
    }
  }
  return length;
}
export function qualityMetrics(events) {
  const lengths = [],
    visits = new Map(),
    counts = {},
    phases = {};
  let last = null,
    duplicate = 0,
    short = 0,
    travel = 0;
  for (const e of events) {
    counts[e.cmd] = (counts[e.cmd] || 0) + 1;
    if (e.cmd === "stitch") {
      phases[e.phase] = (phases[e.phase] || 0) + 1;
      if (last) {
        const d = distance(last, e);
        lengths.push(d);
        if (d < 1e-8) duplicate++;
        else if (d < 0.3 - 1e-8 && !["tie", "anchor"].includes(e.phase))
          short++;
        if (e.phase === "travel") travel += d;
      }
      if (!["tie", "anchor"].includes(e.phase)) {
        const key = `${Math.round(e.x * 10)},${Math.round(e.y * 10)}`;
        visits.set(key, (visits.get(key) || 0) + 1);
      }
    }
    if (e.cmd === "stitch" || e.cmd === "jump") last = e;
  }
  lengths.sort((a, b) => a - b);
  return {
    counts,
    phases,
    short,
    duplicate,
    maxVisits: Math.max(0, ...visits.values()),
    travel,
    length: {
      p10: lengths[Math.floor(lengths.length * 0.1)] || 0,
      median: lengths[Math.floor(lengths.length * 0.5)] || 0,
      p90: lengths[Math.floor(lengths.length * 0.9)] || 0,
      max: lengths.at(-1) || 0,
    },
  };
}
