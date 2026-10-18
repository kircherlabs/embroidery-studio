import { bounds } from "./model.js";
import { distance, inside, safeConnector, simplifyPath } from "./geometry.js";
// Original bounded implementation of Zhang–Suen topology-preserving thinning.
// The grid finds topology only; satin rails are intersected with VECTOR contours.
export function skeletonizeRegion(rings) {
  const b = bounds(rings.flat()),
    step = Math.max(
      0.075,
      Math.max(b.width, b.height) / 480,
      Math.sqrt((b.width * b.height) / 160000),
    ),
    w = Math.ceil(b.width / step) + 5,
    h = Math.ceil(b.height / step) + 5,
    x0 = b.minX - step * 2,
    y0 = b.minY - step * 2;
  if (w * h > 220000 || !b.width || !b.height) return null;
  const mask = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    const yy = y0 + y * step,
      cuts = [];
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j],
          c = ring[i];
        if ((a.y <= yy && c.y > yy) || (c.y <= yy && a.y > yy))
          cuts.push(a.x + ((yy - a.y) * (c.x - a.x)) / (c.y - a.y));
      }
    cuts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k += 2)
      for (
        let x = Math.max(1, Math.ceil((cuts[k] - x0) / step));
        x < Math.min(w - 1, (cuts[k + 1] - x0) / step);
        x++
      )
        mask[y * w + x] = 1;
  }
  const skeleton = mask.slice(),
    offsets = [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1];
  for (let pass = 0; pass < Math.max(w, h); pass++) {
    let changed = 0;
    for (let phase = 0; phase < 2; phase++) {
      const remove = [];
      for (let i = w + 1; i < skeleton.length - w - 1; i++)
        if (skeleton[i]) {
          const n = offsets.map((d) => skeleton[i + d]),
            sum = n.reduce((a, b) => a + b, 0);
          if (sum < 2 || sum > 6) continue;
          let changes = 0;
          for (let j = 0; j < 8; j++) if (!n[j] && n[(j + 1) % 8]) changes++;
          if (changes !== 1) continue;
          if (
            phase === 0
              ? !(n[0] * n[2] * n[4]) && !(n[2] * n[4] * n[6])
              : !(n[0] * n[2] * n[6]) && !(n[0] * n[4] * n[6])
          )
            remove.push(i);
        }
      remove.forEach((i) => (skeleton[i] = 0));
      changed += remove.length;
    }
    if (!changed) break;
  }
  // Distance to the original boundary, used to avoid crossing through junctions.
  const radius = new Float32Array(w * h);
  radius.fill(Infinity);
  for (let i = 0; i < mask.length; i++) if (!mask[i]) radius[i] = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i])
        radius[i] = Math.min(
          radius[i],
          radius[i - 1] + 1,
          radius[i - w] + 1,
          radius[i - w - 1] + Math.SQRT2,
          radius[i - w + 1] + Math.SQRT2,
        );
    }
  for (let y = h - 2; y > 0; y--)
    for (let x = w - 2; x > 0; x--) {
      const i = y * w + x;
      if (mask[i])
        radius[i] = Math.min(
          radius[i],
          radius[i + 1] + 1,
          radius[i + w] + 1,
          radius[i + w + 1] + Math.SQRT2,
          radius[i + w - 1] + Math.SQRT2,
        );
    }
  const point = (i) => ({
    x: x0 + (i % w) * step,
    y: y0 + Math.floor(i / w) * step,
    r: radius[i] * step,
  });
  const adjacency = new Map();
  for (let i = 0; i < skeleton.length; i++)
    if (skeleton[i]) {
      const next = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const j = i + dy * w + dx;
          if (!skeleton[j]) continue;
          if (dx && dy && (skeleton[i + dx] || skeleton[i + dy * w])) continue;
          next.push(j);
        }
      adjacency.set(i, next);
    }
  const nodes = [],
    owner = new Map();
  // Collapse multi-pixel junctions; otherwise raster stairs invent tiny branches.
  for (const [i, next] of adjacency)
    if (next.length !== 2 && !owner.has(i)) {
      const members = [i],
        index = nodes.length;
      owner.set(i, index);
      if (next.length > 2)
        for (let at = 0; at < members.length; at++)
          for (const j of adjacency.get(members[at]))
            if (adjacency.get(j).length > 2 && !owner.has(j)) {
              owner.set(j, index);
              members.push(j);
            }
      const ps = members.map(point),
        p = ps.reduce(
          (p, q) => ({ x: p.x + q.x / ps.length, y: p.y + q.y / ps.length }),
          { x: 0, y: 0 },
        );
      if (!inside(p, rings, "evenodd"))
        Object.assign(p, ps.sort((a, b) => b.r - a.r)[0]);
      p.r = Math.max(...ps.map((q) => q.r));
      nodes.push({ p, members, ports: [] });
    }
  const edges = [],
    seen = new Set(),
    key = (a, b) => (a < b ? a + ":" + b : b + ":" + a);
  const trace = (n, start, next) => {
    const points = [nodes[n].p],
      pixels = [start];
    let prev = start,
      at = next;
    seen.add(key(prev, at));
    while (!owner.has(at)) {
      points.push(point(at));
      pixels.push(at);
      const to = adjacency.get(at).find((j) => j !== prev);
      if (to === undefined) break;
      prev = at;
      at = to;
      if (seen.has(key(prev, at))) break;
      seen.add(key(prev, at));
    }
    let end = owner.get(at);
    if (end === undefined) {
      end = nodes.length;
      nodes.push({ p: point(at), members: [at], ports: [] });
      owner.set(at, end);
    }
    points.push(nodes[end].p);
    if (points.length < 2) return;
    const id = edges.length;
    edges.push({ id, a: n, b: end, points, pixels });
    nodes[n].ports.push(id * 2);
    nodes[end].ports.push(id * 2 + 1);
  };
  for (let n = 0; n < nodes.length; n++)
    for (const i of nodes[n].members)
      for (const j of adjacency.get(i) || [])
        if (owner.get(j) !== n && !seen.has(key(i, j))) trace(n, i, j);
  // Components consisting entirely of degree-two pixels are counter loops.
  for (const [i, next] of adjacency)
    if (next.length && !seen.has(key(i, next[0]))) {
      const n = nodes.length;
      nodes.push({ p: point(i), members: [i], ports: [] });
      owner.set(i, n);
      trace(n, i, next[0]);
    }
  return { nodes, edges, adjacency, mask, radius, w, h, step, x0, y0, point };
}

export function strokeChains(graph, rings) {
  const { nodes, edges, step } = graph,
    paired = new Map();
  const portPoints = (p) =>
    p % 2 ? [...edges[p >> 1].points].reverse() : edges[p >> 1].points;
  const vector = (port) => {
    const pts = portPoints(port),
      a = pts[0];
    let i = 1;
    while (i < pts.length - 1 && distance(a, pts[i]) < Math.max(0.6, a.r || 0))
      i++;
    const b = pts[i],
      d = distance(a, b) || 1;
    return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
  };
  for (const node of nodes) {
    let best = null;
    for (let i = 0; i < node.ports.length; i++)
      for (let j = i + 1; j < node.ports.length; j++) {
        const a = node.ports[i],
          b = node.ports[j],
          u = vector(a),
          v = vector(b),
          dot = u.x * v.x + u.y * v.y;
        if (dot < -0.7 && (!best || dot < best.dot)) best = { a, b, dot };
      }
    if (best) {
      paired.set(best.a, best.b);
      paired.set(best.b, best.a);
    }
  }
  const used = new Set(),
    chains = [];
  const build = (start) => {
    let port = start,
      points = [],
      end = start,
      closed = false;
    const ids = [];
    while (!used.has(port >> 1)) {
      used.add(port >> 1);
      ids.push(port >> 1);
      const ps = portPoints(port);
      points.push(...(points.length ? ps.slice(1) : ps));
      end = port ^ 1;
      if (!paired.has(end)) break;
      port = paired.get(end);
      if (port === start) {
        closed = true;
        break;
      }
    }
    if (points.length < 2) return;
    const first = nodes[start % 2 ? edges[start >> 1].b : edges[start >> 1].a],
      last = nodes[end % 2 ? edges[end >> 1].b : edges[end >> 1].a];
    const length = points
      .slice(1)
      .reduce((n, p, i) => n + distance(p, points[i]), 0);
    if (length < step * 2) return;
    // Remove raster zigzag while validating every smoothing chord against counters.
    points = simplifyPath(points, step * 0.7);
    for (let pass = 0; pass < 2; pass++)
      points = points.map((p, i) => {
        if (!i || i === points.length - 1) return p;
        const a = points[i - 1],
          b = points[i + 1],
          q = { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 };
        return inside(q, rings, "evenodd") &&
          safeConnector(a, q, rings, 0, [], "evenodd") &&
          safeConnector(q, b, rings, 0, [], "evenodd")
          ? q
          : p;
      });
    chains.push({
      id: chains.length,
      points,
      closed,
      startJunction: first.ports.length > 2,
      endJunction: last.ports.length > 2,
      startRadius: first.p.r,
      endRadius: last.p.r,
      length,
      edges: ids,
    });
  };
  for (const node of nodes)
    for (const port of node.ports)
      if (!paired.has(port) && !used.has(port >> 1)) build(port);
  for (const e of edges) if (!used.has(e.id)) build(e.id * 2);
  return chains;
}
