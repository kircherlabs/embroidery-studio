import Clipper from "../../vendor/clipper.js";
import { registerFill } from "./registry.js";
import { offsetRings } from "../operations.js";
import {
  inside,
  safeConnector,
  distance,
  fillPolygons,
  points,
} from "../geometry.js";
import { hash01 } from "./tatami.js";
import { quantizedPath, routeComponents } from "./paths.js";
const pointDistance = (p, a, b) => {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
function crossing(a, b, c, d) {
  const turn = (p, q, r) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return (
    turn(a, b, c) * turn(a, b, d) < -1e-10 &&
    turn(c, d, a) * turn(c, d, b) < -1e-10
  );
}
const separation = (a, b, c, d) =>
  crossing(a, b, c, d)
    ? 0
    : Math.min(
        pointDistance(a, c, d),
        pointDistance(b, c, d),
        pointDistance(c, a, b),
        pointDistance(d, a, b),
      );
function rounded(path, amount) {
  let p = path.slice(0, -1);
  for (let pass = 0; pass < 3; pass++) {
    const next = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length];
      next.push(
        { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount },
        { x: b.x + (a.x - b.x) * amount, y: b.y + (a.y - b.y) * amount },
      );
    }
    p = next;
  }
  return [...p, p[0]];
}
function skeleton(ctx, pitch, rings) {
  const { cfg, budget, box } = ctx,
    organic = ["organic", "looping"].includes(cfg.style),
    nodes = [],
    bins = new Map(),
    bin = pitch / Math.SQRT2;
  const key = (x, y) => `${x},${y}`,
    slot = (p) => [Math.floor(p.x / bin), Math.floor(p.y / bin)];
  const near = (p, r = 2) => {
    const [x, y] = slot(p),
      list = [];
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++)
        list.push(...(bins.get(key(x + i, y + j)) || []));
    return list;
  };
  const add = (p) => {
    budget.step();
    if (
      !inside(p, rings, "nonzero") ||
      near(p).some((i) => distance(p, nodes[i]) < pitch)
    )
      return false;
    const id = nodes.length;
    nodes.push(p);
    const [x, y] = slot(p),
      k = key(x, y);
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(id);
    return true;
  };
  let randomIndex = 0;
  const random = () => hash01(cfg.seed, randomIndex++);
  // Organic uses Poisson samples and annulus growth, rather than smoothed grid
  // corners. The deterministic scan seeds every disconnected or isolated area.
  for (let y = box.minY + pitch / 2; y < box.maxY; y += pitch * 0.7)
    for (let x = box.minX + pitch / 2; x < box.maxX; x += pitch * 0.7) {
      const start = nodes.length;
      if (
        !add(
          organic
            ? { x, y }
            : {
                x: x + (random() - 0.5) * pitch * cfg.variation,
                y: y + (random() - 0.5) * pitch * cfg.variation,
              },
        )
      )
        continue;
      if (organic) {
        const active = [start];
        while (active.length) {
          budget.step();
          const at = Math.floor(random() * active.length),
            p = nodes[active[at]];
          let found = false;
          for (let k = 0; k < 18; k++) {
            const a = random() * Math.PI * 2,
              r = pitch * (1 + random());
            if (add({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r })) {
              active.push(nodes.length - 1);
              found = true;
              break;
            }
          }
          if (!found) active.splice(at, 1);
        }
      }
    }
  const candidates = [];
  nodes.forEach((p, i) => {
    for (const j of near(p, 4))
      if (j > i) {
        const d = distance(p, nodes[j]);
        budget.step();
        if (
          d <= pitch * 2.1 &&
          safeConnector(p, nodes[j], rings, 0, [], "nonzero")
        )
          candidates.push({
            a: i,
            b: j,
            d: d * (1 + cfg.variation * hash01(cfg.seed, i * 65537 + j)),
          });
      }
  });
  candidates.sort((a, b) => a.d - b.d || a.a - b.a || a.b - b.b);
  const parent = nodes.map((_, i) => i),
    root = (i) => {
      while (i !== parent[i]) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    },
    edges = [];
  for (const e of candidates) {
    const a = root(e.a),
      b = root(e.b);
    if (a === b) continue;
    budget.step(edges.length);
    if (
      edges.some(
        (f) =>
          ![f.a, f.b].includes(e.a) &&
          ![f.a, f.b].includes(e.b) &&
          separation(nodes[e.a], nodes[e.b], nodes[f.a], nodes[f.b]) <
            pitch * 0.5,
      )
    )
      continue;
    parent[a] = b;
    edges.push(e);
  }
  return {
    nodes,
    edges,
    components: new Set(nodes.map((_, i) => root(i))).size,
  };
}
function looped(path, ctx, pitch) {
  const bins = new Map(),
    segments = path.slice(1).map((b, j) => ({ a: path[j], b, j }));
  for (const [id, { a, b }] of segments.entries())
    for (
      let x = Math.floor(Math.min(a.x, b.x) / pitch);
      x <= Math.floor(Math.max(a.x, b.x) / pitch);
      x++
    )
      for (
        let y = Math.floor(Math.min(a.y, b.y) / pitch);
        y <= Math.floor(Math.max(a.y, b.y) / pitch);
        y++
      ) {
        const key = `${x},${y}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(id);
      }
  const nearby = (c, r) => {
    const ids = new Set();
    for (
      let x = Math.floor((c.x - r) / pitch);
      x <= Math.floor((c.x + r) / pitch);
      x++
    )
      for (
        let y = Math.floor((c.y - r) / pitch);
        y <= Math.floor((c.y + r) / pitch);
        y++
      )
        for (const id of bins.get(`${x},${y}`) || []) ids.add(id);
    return [...ids].map((id) => segments[id]);
  };
  const r = Math.max(0.5, pitch * 0.18),
    out = [],
    centers = [];
  let run = 0,
    added = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (i) run += distance(path[i - 1], p);
    out.push(p);
    if (i === 0 || i === path.length - 1 || run < pitch * 4) continue;
    const a = path[i - 1],
      b = path[i + 1],
      d = distance(a, b);
    if (d < 0.2) continue;
    const tangent = { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
    let accepted = null;
    for (const hand of [1, -1]) {
      const center = {
        x: p.x - tangent.y * r * hand,
        y: p.y + tangent.x * r * hand,
      };
      if (centers.some((c) => distance(center, c) < 2 * r + 0.3)) continue;
      const start = Math.atan2(p.y - center.y, p.x - center.x),
        n = Math.max(20, Math.ceil((2 * Math.PI * r) / 0.25)),
        circle = Array.from({ length: n + 1 }, (_, k) => ({
          x: center.x + r * Math.cos(start + (hand * 2 * Math.PI * k) / n),
          y: center.y + r * Math.sin(start + (hand * 2 * Math.PI * k) / n),
        }));
      circle[0] = p;
      circle[n] = p;
      for (let k = 0; k < circle.length; k++)
        circle[k] = ctx.local(quantizedPath([ctx.world(circle[k])])[0]);
      circle[0] = p;
      circle[n] = p;
      const near = nearby(center, r + 0.2);
      ctx.budget.step(near.length * n);
      if (circle.slice(1).some((q, k) => !ctx.safe(circle[k], q))) continue;
      // A loop may intentionally touch its insertion station, but cannot cross or
      // crowd another part of the base path. Local neighboring legs are checked
      // for actual crossings as well, rather than blindly ignored.
      if (
        circle
          .slice(1)
          .some((q, k) =>
            near.some(
              ({ a, b, j }) =>
                crossing(circle[k], q, a, b) ||
                (Math.abs(j - i) > 3 && pointDistance(q, a, b) < 0.2),
            ),
          )
      )
        continue;
      accepted = { circle, center };
      break;
    }
    if (accepted) {
      out.push(...accepted.circle.slice(1));
      centers.push(accepted.center);
      run = 0;
      added++;
    }
  }
  return { path: out, added };
}
function verifyCrossings(paths, ctx, pitch) {
  const bins = new Map(),
    segments = [];
  paths.forEach((path, pathId) =>
    path.slice(1).forEach((b, i) => {
      const a = path[i],
        seen = new Set();
      for (
        let x = Math.floor(Math.min(a.x, b.x) / pitch);
        x <= Math.floor(Math.max(a.x, b.x) / pitch);
        x++
      )
        for (
          let y = Math.floor(Math.min(a.y, b.y) / pitch);
          y <= Math.floor(Math.max(a.y, b.y) / pitch);
          y++
        ) {
          const key = `${x},${y}`,
            list = bins.get(key) || [];
          for (const id of list) {
            if (seen.has(id)) continue;
            seen.add(id);
            ctx.budget.step();
            const other = segments[id];
            if (other.pathId === pathId && Math.abs(other.i - i) <= 1) continue;
            if (crossing(a, b, other.a, other.b))
              throw Error(
                "Rounded meander paths intersect at machine resolution. Try another seed, increase line spacing, or reduce curviness.",
              );
          }
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key).push(segments.length);
        }
      segments.push({ a, b, i, pathId });
    }),
  );
}
export function meanderFill(ctx, from) {
  const { cfg, o, budget } = ctx,
    pitch = cfg.pitch,
    radius = cfg.lineSpacing / 2;
  if (cfg.lineSpacing >= pitch * 0.8)
    throw Error(
      "Meander line spacing must be less than 80% of pattern scale to keep neighboring branches separate. Reduce line spacing or increase scale.",
    );
  const inset = offsetRings(
    { ...o, rings: ctx.localRings, fillRule: "nonzero" },
    -radius - 0.12,
  );
  if (!inset.length)
    throw Error(
      "Meander spacing is too large for this region. Reduce pattern scale or enlarge the artwork.",
    );
  const tree = skeleton(ctx, pitch, inset);
  if (!tree.nodes.length)
    throw Error(
      "No meander path fits at this scale. Reduce pattern scale or adjust the origin.",
    );
  const offset = new Clipper.ClipperOffset(2, 20),
    result = [],
    used = new Set();
  for (const e of tree.edges) {
    used.add(e.a);
    used.add(e.b);
    offset.AddPath(
      [tree.nodes[e.a], tree.nodes[e.b]].map((p) => ({
        X: Math.round(p.x * 1000),
        Y: Math.round(p.y * 1000),
      })),
      Clipper.JoinType.jtRound,
      Clipper.EndType.etOpenRound,
    );
  }
  offset.Execute(result, radius * 1000);
  const rings = result.map((r) =>
      r.map((p) => ({ x: p.X / 1000, y: p.Y / 1000 })),
    ),
    polys = fillPolygons(rings, "nonzero");
  if (!polys || polys.some((p) => p.length > 1))
    throw Error(
      "Meander branches crowd into an enclosed pocket. Increase scale, reduce variation, or try another seed.",
    );
  const components = [],
    issues = [];
  let loops = 0;
  for (const poly of polys)
    for (const ring of poly) {
      const smoothed = rounded(points(ring), 0.08 + cfg.curviness * 0.2),
        world = ctx.helpers.resample(smoothed.map(ctx.world), o.length, true);
      let local = quantizedPath(world).map(ctx.local);
      if (cfg.style === "looping") {
        const extra = looped(local, ctx, pitch);
        local = extra.path;
        loops += extra.added;
      }
      if (local.slice(1).some((p, i) => !ctx.safe(local[i], p)))
        throw Error(
          "A rounded meander cannot safely fit near this boundary at machine resolution. Increase inset or scale, or simplify tight details.",
        );
      budget.add(local.length);
      components.push(local);
    }
  const isolated = tree.nodes.length - used.size;
  if (!components.length)
    throw Error(
      "Only isolated meander stations fit. Reduce scale or use a running outline for these narrow details.",
    );
  if (cfg.style === "looping" && !loops)
    throw Error(
      "No safely spaced decorative loops fit. Increase the region size, reduce scale, or choose Organic Meander.",
    );
  verifyCrossings(components, ctx, pitch);
  issues.push({
    severity: "info",
    code: "meander-open-coverage",
    message: `Open running-stitch coverage: ${components.length} curved paths${loops ? `, ${loops} controlled loops` : ""}. Tips narrower than the pattern scale may remain empty${isolated ? `; ${isolated} isolated stations were not sewn` : ""}.`,
    action:
      "Inspect spacing, narrow details and travel. Adjust scale/curviness or use Tatami for solid coverage. No dense-fill underlay is applied.",
  });
  return {
    paths: routeComponents(components, ctx, { from }).map((p) => ({
      ...p,
      travel: "jump",
    })),
    issues,
    stats: {
      method: "meander",
      style: cfg.style,
      scale: pitch,
      lineSpacing: cfg.lineSpacing,
      stations: tree.nodes.length,
      components: components.length,
      loops,
      isolated,
      points: budget.count,
    },
  };
}
registerFill("meander", meanderFill);
