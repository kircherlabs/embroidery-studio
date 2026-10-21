import { distance, inside, safeConnector } from "../geometry.js";
const point = (a, b, t) => ({
  x: Math.round((a.x + (b.x - a.x) * t) * 1e9) / 1e9,
  y: Math.round((a.y + (b.y - a.y) * t) * 1e9) / 1e9,
});
export const quantize = (p) => ({
  x: Math.round(p.x * 10) / 10,
  y: Math.round(p.y * 10) / 10,
});
// Every contour crossing partitions the segment; midpoint classification of each
// interval cannot skip a narrow hole as fixed-distance probes can.
export function clipPath(path, rings, budget, rule = "nonzero") {
  const out = [];
  let current = [];
  for (let n = 1; n < path.length; n++) {
    const a = path[n - 1],
      b = path[n],
      dx = b.x - a.x,
      dy = b.y - a.y,
      ts = [0, 1];
    for (const r of rings)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        budget?.step();
        const c = r[j],
          d = r[i],
          ex = d.x - c.x,
          ey = d.y - c.y,
          den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den,
          u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
        if (t > 1e-10 && t < 1 - 1e-10 && u >= 0 && u <= 1) ts.push(t);
      }
    ts.sort((x, y) => x - y);
    const cuts = ts.filter((v, i) => !i || v - ts[i - 1] > 1e-9);
    for (let i = 1; i < cuts.length; i++) {
      const p = point(a, b, cuts[i - 1]),
        q = point(a, b, cuts[i]);
      if (!inside(point(a, b, (cuts[i - 1] + cuts[i]) / 2), rings, rule)) {
        if (current.length > 1) out.push(current);
        current = [];
        continue;
      }
      if (current.length && distance(current.at(-1), p) > 1e-7) {
        if (current.length > 1) out.push(current);
        current = [];
      }
      if (!current.length) current.push(p);
      current.push(q);
    }
  }
  if (current.length > 1) out.push(current);
  return out;
}
export function quantizedPath(path) {
  return path
    .map(quantize)
    .filter((p, i, a) => !i || distance(p, a[i - 1]) > 1e-9);
}
// Pure component adapter; the engine still decides locks, jumps, trims and colors.
export function routeComponents(
  components,
  ctx,
  { phase = "top", from = null } = {},
) {
  const remaining = components
      .map((p, i) => ({ p: p.map(ctx.world), i }))
      .filter((c) => c.p.length > 1),
    out = [];
  let at = from;
  while (remaining.length) {
    ctx.budget.step(remaining.length);
    let best = 0,
      reverse = false;
    if (at) {
      let cost = Infinity;
      for (let i = 0; i < remaining.length; i++)
        for (const flip of [false, true]) {
          const d = distance(
            at,
            flip ? remaining[i].p.at(-1) : remaining[i].p[0],
          );
          if (d < cost - 1e-9) {
            cost = d;
            best = i;
            reverse = flip;
          }
        }
    }
    const { p } = remaining.splice(best, 1)[0];
    if (reverse) p.reverse();
    out.push({
      p,
      phase,
      connect: !!at && safeConnector(at, p[0], ctx.rings, 0, [], "nonzero"),
    });
    at = p.at(-1);
  }
  return out;
}
