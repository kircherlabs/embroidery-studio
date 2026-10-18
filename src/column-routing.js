import { safeConnector, distance } from "./geometry.js";
// Verify on the machine grid, not just on the continuous SVG contours. Candidate
// endpoints stay within .21 mm of the source; prefer the nearest legal grid point.
// If a connector cannot stay in material, emit a real path break (machine jump).
export function quantizeColumnPaths(paths, o) {
  const holes = o.polygon ? o.rings.slice(1) : [],
    padding = (o.compensation || 0) + 0.08;
  const safe = (a, b) =>
      safeConnector(a, b, o.rings, padding, holes, o.fillRule),
    out = [];
  let previous = null,
    breaks = 0,
    unsewable = 0;
  for (const path of paths) {
    if (!path.continuous) previous = null;
    let points = [],
      continuous = path.continuous;
    const flush = () => {
      if (points.length) out.push({ ...path, p: points, continuous });
      points = [];
    };
    for (const p of path.p) {
      const q = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
      let chosen = safe(q, q) && (!previous || safe(previous, q)) ? q : null;
      if (!chosen) {
        const candidates = [];
        for (let x = -2; x <= 2; x++)
          for (let y = -2; y <= 2; y++) {
            const v = {
              x: Math.round((q.x + x * 0.1) * 10) / 10,
              y: Math.round((q.y + y * 0.1) * 10) / 10,
            };
            if (distance(v, p) <= 0.21 && safe(v, v)) candidates.push(v);
          }
        candidates.sort((a, b) => distance(a, p) - distance(b, p));
        chosen = candidates.find((v) => !previous || safe(previous, v));
        if (!chosen && candidates.length) {
          flush();
          continuous = false;
          previous = null;
          chosen = candidates[0];
          breaks++;
        }
        if (!chosen) {
          flush();
          continuous = false;
          previous = null;
          unsewable++;
          continue;
        }
      }
      if (!points.length || !previous || distance(previous, chosen) > 1e-8)
        points.push(chosen);
      previous = chosen;
    }
    flush();
  }
  o.columnGridWarnings = [];
  if (breaks)
    o.columnGridWarnings.push(
      `${o.name}: ${breaks} satin connectors require actual jumps after machine-grid validation to preserve counters.`,
    );
  if (unsewable)
    o.columnGridWarnings.push(
      `${o.name}: ${unsewable} column points have no legal needle position within 0.21 mm; enlarge or simplify this detail.`,
    );
  return out;
}
