import { distance, safeConnector, inside } from "./geometry.js";
import { skeletonizeRegion, strokeChains } from "./stroke-skeleton.js";
import { strokeTravel } from "./stroke-travel.js";
import { quantizeColumnPaths } from "./column-routing.js";
const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
function lineCuts(p, n, rings) {
  const cuts = [];
  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j],
        b = ring[i],
        ex = b.x - a.x,
        ey = b.y - a.y,
        den = n.x * ey - n.y * ex;
      if (Math.abs(den) < 1e-10) continue;
      const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den,
        u = ((a.x - p.x) * n.y - (a.y - p.y) * n.x) / den;
      if (u >= -1e-9 && u <= 1 + 1e-9) cuts.push({ t, ring: ri });
    }
  }
  return cuts.sort((a, b) => a.t - b.t);
}
function measure(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths.at(-1) + distance(points[i - 1], points[i]));
  return {
    length: lengths.at(-1),
    at: (s) => {
      let i = 1;
      while (i < lengths.length - 1 && lengths[i] < s) i++;
      return lerp(
        points[i - 1],
        points[i],
        Math.max(
          0,
          Math.min(
            1,
            (s - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1),
          ),
        ),
      );
    },
  };
}
function projectOnStroke(points, p) {
  let offset = 0,
    best = { s: 0, d: Infinity };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = distance(a, b),
      t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) /
            (length * length || 1),
        ),
      ),
      d = distance(p, lerp(a, b, t));
    if (d < best.d) best = { s: offset + t * length, d };
    offset += length;
  }
  return best;
}
const safe = (a, b, o, padding = 0) =>
  safeConnector(a, b, o.rings, padding, o.rings.slice(1), "nonzero");
function extend(points, first, rings, limit = Infinity) {
  const ps = first ? points : [...points].reverse(),
    a = ps[0];
  let i = 1;
  while (i < ps.length - 1 && distance(a, ps[i]) < 0.6) i++;
  const b = ps[i],
    d = distance(a, b) || 1,
    n = { x: (a.x - b.x) / d, y: (a.y - b.y) / d },
    cut = lineCuts(a, n, rings).find((c) => c.t > 0.01);
  if (!cut) return points;
  const tip = {
    x: a.x + n.x * Math.min(limit, Math.max(0, cut.t - 0.03)),
    y: a.y + n.y * Math.min(limit, Math.max(0, cut.t - 0.03)),
  };
  return first ? [tip, ...points] : [...points, tip];
}
// Partition branches by distance to their center rails. Internal seams are bounded
// by the analysis grid; outside rails still use exact source contour intersections.
function partition(graph, chains) {
  const segments = chains.flatMap((c) =>
      c.points.slice(1).map((b, i) => ({ a: c.points[i], b, id: c.id })),
    ),
    labels = new Int32Array(graph.mask.length);
  if (graph.mask.reduce((n, v) => n + v, 0) * segments.length > 80000000)
    return null;
  labels.fill(-1);
  for (let index = 0; index < labels.length; index++)
    if (graph.mask[index]) {
      const p = graph.point(index);
      let best = Infinity;
      for (const e of segments) {
        const dx = e.b.x - e.a.x,
          dy = e.b.y - e.a.y,
          t = Math.max(
            0,
            Math.min(
              1,
              ((p.x - e.a.x) * dx + (p.y - e.a.y) * dy) /
                (dx * dx + dy * dy || 1),
            ),
          ),
          d = (p.x - e.a.x - t * dx) ** 2 + (p.y - e.a.y - t * dy) ** 2;
        if (d < best) {
          best = d;
          labels[index] = e.id;
        }
      }
    }
  return (p) => {
    const x = Math.round((p.x - graph.x0) / graph.step),
      y = Math.round((p.y - graph.y0) / graph.step);
    return x >= 0 && x < graph.w && y >= 0 && y < graph.h
      ? labels[y * graph.w + x]
      : -1;
  };
}
function splitTurns(chains, rAt) {
  const out = [];
  for (const c of chains) {
    const m = measure(c.points),
      cuts = [];
    const candidates = [];
    for (let s = 0.3; s < m.length - 0.3; s += 0.1) {
      const p = m.at(s),
        window = Math.max(0.6, rAt(p) * 2),
        a = m.at(Math.max(0, s - window)),
        b = m.at(Math.min(m.length, s + window)),
        u = { x: p.x - a.x, y: p.y - a.y },
        v = { x: b.x - p.x, y: b.y - p.y },
        dot =
          (u.x * v.x + u.y * v.y) /
          (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1);
      if (dot < 0.65) candidates.push({ s, dot, window });
    }
    candidates.sort((a, b) => a.dot - b.dot);
    for (const q of candidates)
      if (!cuts.some((s) => Math.abs(s - q.s) < q.window * 1.5)) cuts.push(q.s);
    cuts.sort((a, b) => a - b);
    if (!cuts.length) {
      out.push({ ...c, id: out.length });
      continue;
    }
    let start = 0;
    for (const end of [...cuts, m.length]) {
      const points = [m.at(start)];
      for (let s = start + 0.1; s < end; s += 0.1) points.push(m.at(s));
      points.push(m.at(end));
      out.push({
        ...c,
        id: out.length,
        points,
        closed: false,
        startJunction: start > 0 || c.startJunction,
        endJunction: end < m.length || c.endJunction,
      });
      start = end;
    }
  }
  return out;
}
// Pairing is geometric; paths and manufacturing remain attached to one operation.
export function strokeSatin(o, from = { x: 0, y: 0 }) {
  if (!o.polygon)
    return {
      reason:
        "Overlapping or ambiguous contours could not be normalized into a reliable stroke region. Repair or divide the artwork.",
    };
  const graph = skeletonizeRegion(o.rings);
  if (!graph)
    return {
      reason:
        "This region is too large or degenerate for bounded stroke analysis.",
    };
  const strokes = [],
    warnings = [];
  const rAt = (p) => {
    const x = Math.max(
        0,
        Math.min(graph.w - 1, Math.round((p.x - graph.x0) / graph.step)),
      ),
      y = Math.max(
        0,
        Math.min(graph.h - 1, Math.round((p.y - graph.y0) / graph.step)),
      );
    return graph.radius[y * graph.w + x] * graph.step;
  };
  const chains = splitTurns(strokeChains(graph, o.rings), rAt),
    owner = partition(graph, chains);
  if (!owner)
    return {
      reason:
        "This outline exceeds bounded stroke partitioning complexity. Simplify or split it into smaller regions.",
    };
  const guides = (o.satinGuides || []).map((g, index) => ({
      ...g,
      index,
      mid: lerp(g.a, g.b, 0.5),
    })),
    assignments = new Map();
  for (const g of guides) {
    if (!inside(g.mid, o.rings, "nonzero")) continue;
    let best = null;
    for (let ci = 0; ci < chains.length; ci++) {
      const projection = projectOnStroke(chains[ci].points, g.mid);
      if (!best || projection.d < best.d) best = { ci, ...projection };
    }
    if (best && best.d < Math.max(0.7, rAt(g.mid) * 1.5)) {
      if (!assignments.has(best.ci)) assignments.set(best.ci, []);
      assignments.get(best.ci).push({ ...g, s: best.s });
    } else
      warnings.push(
        `Direction guide ${g.index + 1} cannot be associated with a stitchable stroke.`,
      );
  }
  for (const c of chains) {
    let points = c.points;
    if (!c.closed)
      points = extend(
        points,
        true,
        o.rings,
        c.startJunction ? Math.max(0.3, c.startRadius) : Infinity,
      );
    if (!c.closed)
      points = extend(
        points,
        false,
        o.rings,
        c.endJunction ? Math.max(0.3, c.endRadius) : Infinity,
      );
    const m = measure(points),
      start = 0,
      end = m.length;
    if (end - start < 0.15) continue;
    const localGuides = (assignments.get(c.id) || []).map((g) => ({
      ...g,
      s: projectOnStroke(points, g.mid).s,
    }));
    const count = Math.max(2, Math.ceil((end - start) / (o.spacing / 2))),
      sections = [];
    const n = c.closed && count % 2 ? count + 1 : count;
    for (let i = 0; i <= n - (c.closed ? 1 : 0); i++) {
      const s = start + ((end - start) * i) / n,
        p = m.at(s),
        a = m.at(Math.max(0, s - 0.35)),
        b = m.at(Math.min(m.length, s + 0.35)),
        d = distance(a, b) || 1;
      let angle = Math.atan2(b.x - a.x, -(b.y - a.y));
      for (const g of localGuides) {
        // Guides rotate local cross-sections, never globally rotate the scanlines.
        const projected = g.s;
        const separation = c.closed
          ? Math.min(
              Math.abs(s - projected),
              m.length - Math.abs(s - projected),
            )
          : Math.abs(s - projected);
        const influence = Math.exp(
          -((separation / Math.max(1, rAt(p) * 2)) ** 2),
        );
        let delta = Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) - angle;
        while (delta > Math.PI / 2) delta -= Math.PI;
        while (delta < -Math.PI / 2) delta += Math.PI;
        angle += delta * influence;
      }
      const normal = { x: Math.cos(angle), y: Math.sin(angle) },
        cuts = lineCuts(p, normal, o.rings),
        left = cuts.filter((c) => c.t < -1e-5).at(-1),
        right = cuts.find((c) => c.t > 1e-5);
      if (!left || !right || owner(p) !== c.id) continue;
      const owned = (t) => {
        const sign = Math.sign(t),
          step = graph.step / 2;
        let last = 0;
        for (let at = step; at < Math.abs(t); at += step) {
          const q = {
            x: p.x + normal.x * at * sign,
            y: p.y + normal.y * at * sign,
          };
          if (owner(q) !== c.id && inside(q, o.rings, "nonzero"))
            return Math.min(Math.abs(t), last + graph.step / 2);
          last = at;
        }
        return Math.abs(t);
      };
      const l = owned(left.t),
        r = owned(right.t),
        width = l + r;
      if (width < 0.18) continue;
      // Only outer contours receive outward compensation. Counters retain clearance.
      const comp = Math.min(o.compensation || 0, width * 0.15),
        lt = l + (!left.ring ? comp : -Math.min(0.06, l / 5)),
        rt = r + (!right.ring ? comp : -Math.min(0.06, r / 5));
      const railA = { x: p.x - normal.x * lt, y: p.y - normal.y * lt },
        railB = { x: p.x + normal.x * rt, y: p.y + normal.y * rt };
      if (!safe(railA, railB, o, comp + 0.02)) continue;
      sections.push({ a: railA, b: railB, center: p, width, s });
    }
    if (sections.length < 2) continue;
    // Pace needle stations by the moving rails, rather than just centerline arc
    // length. The outer rail of a curve needs more stations than its center.
    const railSections = c.closed ? [...sections, sections[0]] : sections,
      railLengths = [0];
    for (let i = 1; i < railSections.length; i++)
      railLengths.push(
        railLengths.at(-1) +
          Math.max(
            distance(railSections[i - 1].a, railSections[i].a),
            distance(railSections[i - 1].b, railSections[i].b),
          ),
      );
    let stationCount = Math.max(
      2,
      Math.ceil(railLengths.at(-1) / (o.spacing / 2)),
    );
    if (c.closed && stationCount % 2) stationCount++;
    if (stationCount > 20000)
      return {
        reason:
          "Rail direction changes too abruptly for bounded automatic turning. Adjust guides or split this corner.",
        warnings,
      };
    const paced = [];
    let railIndex = 1;
    for (let i = 0; i < stationCount + (c.closed ? 0 : 1); i++) {
      const at = (railLengths.at(-1) * i) / stationCount;
      while (railIndex < railSections.length - 1 && railLengths[railIndex] < at)
        railIndex++;
      const a = railSections[railIndex - 1],
        b = railSections[railIndex],
        t =
          (at - railLengths[railIndex - 1]) /
          (railLengths[railIndex] - railLengths[railIndex - 1] || 1);
      paced.push({
        a: lerp(a.a, b.a, t),
        b: lerp(a.b, b.b, t),
        center: lerp(a.center, b.center, t),
        width: a.width + (b.width - a.width) * t,
        s: a.s + (b.s - a.s) * t,
      });
    }
    sections.splice(0, sections.length, ...paced);
    // A small inward shortening on crowded rails avoids repeated inner penetrations.
    if (o.cornerControl !== false)
      for (let i = 2; i < sections.length; i++)
        for (const side of ["a", "b"]) {
          // Alternate short and full inner penetrations so the edge stays covered.
          if (Math.floor(i / 2) % 2 === 0) continue;
          const prev = sections[i - 2][side],
            cur = sections[i][side],
            d = distance(prev, cur),
            minimum = o.minCornerStitch || 0.3;
          if (d < minimum)
            sections[i][side] = lerp(
              cur,
              sections[i].center,
              Math.min(0.4, (1 - d / minimum) * 0.4),
            );
        }
    strokes.push({ ...c, points, sections });
  }
  if (!strokes.length)
    return {
      reason:
        "No reliable satin stroke rails could be extracted. Enlarge the lettering or define simpler regions.",
    };
  // Quantify missing geometry and concentrated double coverage, rather than hiding
  // incomplete automatic decomposition. Station bands are tested against source cells.
  const coverage = new Uint8Array(graph.mask.length);
  for (const stroke of strokes)
    for (let i = 1; i < stroke.sections.length + (stroke.closed ? 1 : 0); i++) {
      const a = stroke.sections[i - 1],
        b = stroke.sections[i % stroke.sections.length],
        quad = [a.a, a.b, b.b, b.a],
        xs = quad.map((p) => (p.x - graph.x0) / graph.step),
        ys = quad.map((p) => (p.y - graph.y0) / graph.step);
      const minX = Math.max(0, Math.floor(Math.min(...xs))),
        maxX = Math.min(graph.w - 1, Math.ceil(Math.max(...xs))),
        minY = Math.max(0, Math.floor(Math.min(...ys))),
        maxY = Math.min(graph.h - 1, Math.ceil(Math.max(...ys)));
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const index = y * graph.w + x;
          if (
            graph.mask[index] &&
            inside(
              { x: graph.x0 + x * graph.step, y: graph.y0 + y * graph.step },
              [quad],
              "evenodd",
            )
          )
            coverage[index] = Math.min(255, coverage[index] + 1);
        }
    }
  let total = 0,
    missing = 0,
    overlap = 0;
  for (let i = 0; i < coverage.length; i++)
    if (graph.mask[i]) {
      total++;
      if (!coverage[i]) missing++;
      if (coverage[i] > 1) overlap++;
    }
  const coverageRatio = 1 - missing / (total || 1),
    overlapRatio = overlap / (total || 1);
  if (coverageRatio < 0.9)
    return {
      reason: `Automatic stroke rails cover only ${(coverageRatio * 100).toFixed(1)}% of this region. Split broad junctions or simplify the outline.`,
      coverage: coverageRatio,
      overlap: overlapRatio,
      strokes,
      warnings,
    };
  if (overlapRatio > 0.15)
    return {
      reason: `Stroke junction overlap is ${(overlapRatio * 100).toFixed(1)}%; automatic satin would build up excessive thread. Split the junctions manually.`,
      coverage: coverageRatio,
      overlap: overlapRatio,
      strokes,
      warnings,
    };
  const paths = [],
    todo = new Set(strokes);
  let position = from,
    travel = 0,
    wide = 0;
  const append = (p, phase, continuous = false, strokeId = null) => {
    if (p.length > 1) paths.push({ p, phase, continuous, strokeId });
    position = p.at(-1) || position;
  };
  while (todo.size) {
    const choices = [...todo]
      .flatMap((stroke) => [
        { stroke, reverse: false, p: stroke.sections[0].center },
        { stroke, reverse: true, p: stroke.sections.at(-1).center },
      ])
      .sort((a, b) => distance(position, a.p) - distance(position, b.p));
    const { stroke, reverse } = choices[0];
    todo.delete(stroke);
    const sections = reverse ? [...stroke.sections].reverse() : stroke.sections,
      centers = sections.map((s) => s.center);
    // Existing graph travel principles: sew only within material, otherwise jump.
    // Route a hidden center walk between sections rather than a visible connector.
    if (paths.length) {
      const route = strokeTravel(graph, position, centers[0], o.rings);
      if (route) {
        append(route, "travel", true, stroke.id);
        travel++;
      }
    }
    if (o.underlay) {
      const walk = [centers[0]];
      for (let i = 0; i < centers.length - 1; ) {
        let best = i + 1;
        for (
          let j = i + 1;
          j < centers.length && distance(centers[i], centers[j]) <= 1.5;
          j++
        )
          if (safe(centers[i], centers[j], o)) best = j;
        walk.push(centers[best]);
        i = best;
      }
      append(
        [...walk, ...walk.slice(0, -1).reverse()],
        "underlay",
        paths.length > 0 && safe(position, walk[0], o),
        stroke.id,
      );
    }
    const needle = [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i],
        target = i % 2 ? section.b : section.a;
      if (needle.length) {
        const a = needle.at(-1),
          span = distance(a, target),
          max = o.maxSatin || 6;
        if (span > max) {
          wide++;
          const limit = Math.min(max, o.length || 2.8),
            first = Math.max(
              0.3,
              ((limit / 2 + ((i % 4) * limit) / 4 - 1e-9) % limit) + 1e-9,
            );
          // Split floats alternate their penetration phase instead of making a central trench.
          for (let at = first; at < span - 0.08; at += limit)
            needle.push(lerp(a, target, at / span));
        }
      }
      needle.push(target);
    }
    if (stroke.closed && needle.length) needle.push(needle[0]);
    append(
      needle,
      "satin-stroke",
      paths.length > 0 &&
        safe(position, needle[0], o, (o.compensation || 0) + 0.02),
      stroke.id,
    );
  }
  const quantized = quantizeColumnPaths(paths, o);
  return {
    paths: quantized,
    strokes,
    warnings,
    coverage: coverageRatio,
    overlap: overlapRatio,
    wide,
    travel,
    grid: graph.step,
  };
}
