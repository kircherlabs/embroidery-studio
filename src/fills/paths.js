import { distance, safeConnector } from "../geometry.js";
const point = (a, b, t) => ({
  x: Math.round((a.x + (b.x - a.x) * t) * 1e9) / 1e9,
  y: Math.round((a.y + (b.y - a.y) * t) * 1e9) / 1e9,
});
const indexes = new WeakMap();
function clipIndex(rings, budget) {
  if (indexes.has(rings)) return indexes.get(rings);
  const edges = [],
    grid = new Map(),
    ys = new Map(),
    long = [],
    tall = [],
    cell = 2;
  const add = (map, key, id) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(id);
  };
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j],
        b = r[i],
        id = edges.length,
        minX = Math.floor(Math.min(a.x, b.x) / cell),
        maxX = Math.floor(Math.max(a.x, b.x) / cell),
        minY = Math.floor(Math.min(a.y, b.y) / cell),
        maxY = Math.floor(Math.max(a.y, b.y) / cell);
      edges.push({ a, b });
      budget?.step();
      if ((maxX - minX + 1) * (maxY - minY + 1) > 64) long.push(id);
      else
        for (let x = minX; x <= maxX; x++)
          for (let y = minY; y <= maxY; y++) {
            budget?.step();
            add(grid, `${x},${y}`, id);
          }
      if (maxY - minY > 128) tall.push(id);
      else for (let y = minY; y <= maxY; y++) add(ys, y, id);
    }
  const index = {
    query(a, b) {
      const ids = new Set(long),
        minX = Math.floor(Math.min(a.x, b.x) / cell),
        maxX = Math.floor(Math.max(a.x, b.x) / cell),
        minY = Math.floor(Math.min(a.y, b.y) / cell),
        maxY = Math.floor(Math.max(a.y, b.y) / cell);
      if ((maxX - minX + 1) * (maxY - minY + 1) > 64) return edges;
      for (let x = minX; x <= maxX; x++)
        for (let y = minY; y <= maxY; y++)
          for (const id of grid.get(`${x},${y}`) || []) ids.add(id);
      return [...ids].map((id) => edges[id]);
    },
    inside(p, rule, budget) {
      let winding = 0;
      const list = [...(ys.get(Math.floor(p.y / cell)) || []), ...tall];
      budget?.step(list.length);
      for (const id of list) {
        const { a, b } = edges[id];
        if ((a.y <= p.y && b.y > p.y) || (b.y <= p.y && a.y > p.y)) {
          const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
          if (x > p.x) winding += rule === "nonzero" ? (b.y > a.y ? 1 : -1) : 1;
        }
      }
      return rule === "nonzero" ? winding !== 0 : winding % 2 === 1;
    },
  };
  indexes.set(rings, index);
  return index;
}
export const quantize = (p) => ({
  x: Math.round(p.x * 10) / 10 || 0,
  y: Math.round(p.y * 10) / 10 || 0,
});
// Every contour crossing partitions the segment; midpoint classification of each
// interval cannot skip a narrow hole as fixed-distance probes can.
export function clipPath(path, rings, budget, rule = "nonzero") {
  const index = clipIndex(rings, budget);
  const out = [];
  let current = [];
  for (let n = 1; n < path.length; n++) {
    const a = path[n - 1],
      b = path[n],
      dx = b.x - a.x,
      dy = b.y - a.y,
      ts = [0, 1];
    for (const { a: c, b: d } of index.query(a, b)) {
      budget?.step();
      const ex = d.x - c.x,
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
      if (
        !index.inside(point(a, b, (cuts[i - 1] + cuts[i]) / 2), rule, budget)
      ) {
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
