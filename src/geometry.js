import clipping from "../vendor/polygon-clipping.js";
import { bounds } from "./model.js";
export { clipping };
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function inside(p, rings, rule = "evenodd") {
  let winding = 0;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j],
        b = ring[i];
      if ((a.y <= p.y && b.y > p.y) || (b.y <= p.y && a.y > p.y)) {
        const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (x > p.x) winding += rule === "nonzero" ? (b.y > a.y ? 1 : -1) : 1;
      }
    }
  return rule === "nonzero" ? winding !== 0 : winding % 2 === 1;
}
export function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  return a / 2;
}
// Boolean operations use a 0.001 mm grid, 100× finer than machine coordinates.
// Shared vectorized edges otherwise differ by floating point roundoff and may
// produce sweep-line failures. Editable/source coordinates are never modified.
export const coordinates = (r) =>
  r.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]);
export const points = (r) => r.map(([x, y]) => ({ x, y }));
export const intersectsBounds = (a, b, pad = 0) =>
  a.minX < b.maxX + pad &&
  a.maxX > b.minX - pad &&
  a.minY < b.maxY + pad &&
  a.maxY > b.minY - pad;
const edgeIndexes = new WeakMap();
function edgeIndex(polygon) {
  if (edgeIndexes.has(polygon)) return edgeIndexes.get(polygon);
  const grid = new Map(),
    long = [];
  for (const ring of polygon.flat())
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i],
        edge = { a, b };
      if (
        (Math.abs(Math.floor(a[0]) - Math.floor(b[0])) + 1) *
          (Math.abs(Math.floor(a[1]) - Math.floor(b[1])) + 1) >
        4096
      ) {
        long.push(edge);
        continue;
      }
      for (
        let x = Math.floor(Math.min(a[0], b[0]));
        x <= Math.floor(Math.max(a[0], b[0]));
        x++
      )
        for (
          let y = Math.floor(Math.min(a[1], b[1]));
          y <= Math.floor(Math.max(a[1], b[1]));
          y++
        ) {
          const key = x + "," + y;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(edge);
        }
    }
  const index = { grid, long };
  edgeIndexes.set(polygon, index);
  return index;
}
// Compensation can overlap neighboring paints even when their nominal fill
// interiors are disjoint. Include those boundaries in construction precedence.
export function nearbyBoundaries(a, b, margin) {
  if (margin <= 0) return false;
  const { grid, long } = edgeIndex(b),
    radius = Math.ceil(margin);
  for (const ring of a.flat())
    for (const [x, y] of ring) {
      const cx = Math.floor(x),
        cy = Math.floor(y),
        seen = new Set();
      const candidates = [...long];
      for (let gx = cx - radius; gx <= cx + radius; gx++)
        for (let gy = cy - radius; gy <= cy + radius; gy++)
          candidates.push(...(grid.get(gx + "," + gy) || []));
      for (const edge of candidates) {
        if (seen.has(edge)) continue;
        seen.add(edge);
        const [ax, ay] = edge.a,
          [bx, by] = edge.b,
          dx = bx - ax,
          dy = by - ay,
          l = dx * dx + dy * dy,
          t = l
            ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l))
            : 0;
        if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= margin) return true;
      }
    }
  return false;
}
export function polygonArea(multi) {
  return multi.reduce(
    (sum, p) =>
      sum +
      p.reduce(
        (a, r, i) => a + (i ? -1 : 1) * Math.abs(signedArea(points(r))),
        0,
      ),
    0,
  );
}
function containsBox(a, b) {
  return (
    a.minX <= b.minX + 1e-8 &&
    a.minY <= b.minY + 1e-8 &&
    a.maxX >= b.maxX - 1e-8 &&
    a.maxY >= b.maxY - 1e-8
  );
}

// Convert winding/even-odd contours into explicit outer/hole polygons. Unsupported
// intersecting opposite-winding contours fall back to the original scanline fill.
export function fillPolygons(rings, rule = "evenodd") {
  const contours = rings
    .map((r) => ({ r, c: coordinates(r), area: signedArea(r), b: bounds(r) }))
    .filter((c) => c.r.length >= 3);
  if (contours.some((c) => Math.abs(c.area) < 1e-10)) return null;
  contours.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const polygons = [];
  for (let i = 0; i < contours.length; i++) {
    const c = contours[i];
    let parent = null;
    for (let j = 0; j < i; j++) {
      const candidate = contours[j];
      if (
        !containsBox(candidate.b, c.b) ||
        (parent && Math.abs(candidate.area) >= Math.abs(parent.area))
      )
        continue;
      if (
        !inside(c.r[0], [candidate.r]) &&
        !c.r.some((p) => inside(p, [candidate.r]))
      )
        continue;
      if (polygonArea(clipping.difference([c.c], [candidate.c])) < 1e-8)
        parent = candidate;
    }
    c.parent = parent;
    const before = parent?.winding || 0;
    c.winding = rule === "nonzero" ? before + Math.sign(c.area) : before + 1;
    const filled = (n) => (rule === "nonzero" ? n !== 0 : n % 2 === 1);
    if (!filled(before) && filled(c.winding)) {
      c.polygon = [c.c];
      polygons.push(c.polygon);
    } else if (filled(before) && !filled(c.winding)) {
      let outer = parent;
      while (outer && !outer.polygon) outer = outer.parent;
      if (!outer) return null;
      outer.polygon.push(c.c);
    }
  }
  if (!polygons.length) return [];
  if (rule === "nonzero") {
    const roots = contours.filter((c) => !c.parent);
    for (let i = 0; i < roots.length; i++)
      for (let j = i + 1; j < roots.length; j++)
        if (
          Math.sign(roots[i].area) !== Math.sign(roots[j].area) &&
          intersectsBounds(roots[i].b, roots[j].b)
        )
          return null;
  }
  return rule === "nonzero"
    ? clipping.union(...polygons)
    : clipping.xor(...polygons);
}
export function simplifyPath(path, tolerance = 0.04) {
  if (path.length < 3) return path;
  const keep = new Set([0, path.length - 1]),
    stack = [[0, path.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop(),
      a = path[start],
      b = path[end],
      dx = b.x - a.x,
      dy = b.y - a.y,
      l = dx * dx + dy * dy;
    let far = tolerance * tolerance,
      index = -1;
    for (let i = start + 1; i < end; i++) {
      const p = path[i],
        t = l
          ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l))
          : 0,
        d = (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
      if (d > far) {
        far = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep.add(index);
      stack.push([start, index], [index, end]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => path[i]);
}

// Split a travel connector at *all* contour intersections before containment
// checks. Fixed sampling alone can miss a narrow counter between its probes.
export function safeConnector(
  a,
  b,
  rings,
  padding = 0,
  holes = [],
  rule = "nonzero",
) {
  const ts = [0, 1],
    dx = b.x - a.x,
    dy = b.y - a.y;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const c = r[j],
        d = r[i],
        ex = d.x - c.x,
        ey = d.y - c.y,
        den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den,
        u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
  ts.sort((x, y) => x - y);
  function allowed(p) {
    if (holes.some((r) => inside(p, [r]))) return false;
    if (inside(p, rings, rule)) return true;
    if (!padding) return false;
    const r = rings[0];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const c = r[j],
        d = r[i],
        l = distance(c, d) ** 2,
        t = l
          ? Math.max(
              0,
              Math.min(
                1,
                ((p.x - c.x) * (d.x - c.x) + (p.y - c.y) * (d.y - c.y)) / l,
              ),
            )
          : 0;
      if (
        distance(p, { x: c.x + (d.x - c.x) * t, y: c.y + (d.y - c.y) * t }) <=
        padding
      )
        return true;
    }
    return false;
  }
  return ts.slice(1).every((t, i) => {
    const mid = (ts[i] + t) / 2;
    return allowed({ x: a.x + dx * mid, y: a.y + dy * mid });
  });
}
