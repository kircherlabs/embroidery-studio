import { distance } from "./geometry.js";
const mix = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

// Density is peak-to-peak distance on the faster moving rail, in millimeters.
// Never pace a bend by its centerline or by the number of source vertices.
export function paceRails(sections, spacing, closed = false) {
  if (sections.length < 2) return [];
  const loop = closed ? [...sections, sections[0]] : sections,
    lengths = [0];
  for (let i = 1; i < loop.length; i++)
    lengths.push(
      lengths.at(-1) +
        Math.max(
          distance(loop[i - 1].a, loop[i].a),
          distance(loop[i - 1].b, loop[i].b),
        ),
    );
  const total = lengths.at(-1);
  let count = Math.max(2, Math.ceil(total / (spacing / 2)));
  if (closed && count % 2) count++;
  if (count > 20000) return null;
  const out = [];
  let edge = 1;
  for (let i = 0; i < count + (closed ? 0 : 1); i++) {
    const at = (total * i) / count;
    while (edge < loop.length - 1 && lengths[edge] < at) edge++;
    const a = loop[edge - 1],
      b = loop[edge],
      t = (at - lengths[edge - 1]) / (lengths[edge] - lengths[edge - 1] || 1);
    out.push({
      ...a,
      a: mix(a.a, b.a, t),
      b: mix(a.b, b.b, t),
      center: mix(a.center, b.center, t),
      width: a.width + (b.width - a.width) * t,
    });
  }
  return out;
}

// Only the compressed inner rail gets alternating short stitches. Full outer
// penetrations and every other inner penetration remain at the original edge.
// Measure against unmodified rails: a prior short stitch must not trigger another.
export function shortInnerTurns(sections, minimum = 0.3, closed = false) {
  return sections.map((q, i) => {
    if (Math.floor(i / 2) % 2 === 0 || (!closed && i < 2)) return q;
    const prev = sections[(i + sections.length - 2) % sections.length],
      da = distance(q.a, prev.a),
      db = distance(q.b, prev.b),
      out = { ...q };
    for (const [side, d, other] of [
      ["a", da, db],
      ["b", db, da],
    ])
      if (d < minimum && d < other * 0.8)
        out[side] = mix(
          q[side],
          q.center,
          Math.min(0.4, (1 - d / minimum) * 0.4),
        );
    return out;
  });
}

// Build fine rail samples before pacing. Tangents are evaluated on the source
// polyline; a satin's width is independent of source flattening and stitch count.
export function centerlineRails(path, width, spacing, closed = false) {
  const ring = path.filter((p, i) => !i || distance(p, path[i - 1]) > 1e-9);
  if (ring.length < 2) return { sections: [], tight: false };
  if (closed && distance(ring[0], ring.at(-1)) > 1e-9) ring.push(ring[0]);
  const lengths = [0];
  for (let i = 1; i < ring.length; i++)
    lengths.push(lengths.at(-1) + distance(ring[i - 1], ring[i]));
  const total = lengths.at(-1),
    step = Math.min(0.1, spacing / 4),
    half = width / 2;
  if (!total) return { sections: [], tight: false };
  const at = (s) => {
    s = closed
      ? ((s % total) + total) % total
      : Math.max(0, Math.min(total, s));
    let lo = 1,
      hi = lengths.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    return mix(
      ring[lo - 1],
      ring[lo],
      (s - lengths[lo - 1]) / (lengths[lo] - lengths[lo - 1] || 1),
    );
  };
  const count = Math.max(2, Math.ceil(total / step)),
    sections = [];
  if (count > 100000)
    throw Error(
      "Satin path is too long for bounded corner reconstruction. Split the path.",
    );
  let tight = false;
  for (let i = 0; i < count + (closed ? 0 : 1); i++) {
    const window = Math.max(step, Math.min(0.35, Math.max(0.15, half / 4))),
      s = (total * i) / count,
      p = at(s),
      prev = at(s - window),
      next = at(s + window),
      d = distance(prev, next) || 1,
      normal = { x: -(next.y - prev.y) / d, y: (next.x - prev.x) / d },
      u = { x: p.x - prev.x, y: p.y - prev.y },
      v = { x: next.x - p.x, y: next.y - p.y },
      cross = u.x * v.y - u.y * v.x,
      radius =
        Math.abs(cross) > 1e-10
          ? (distance(prev, p) * distance(p, next) * d) / (2 * Math.abs(cross))
          : Infinity;
    // Offset rails fold when the turn radius is smaller than half the band.
    // Fan to the local turn center instead; never extend a reversed inner rail.
    const inner = Math.min(half, radius);
    if (radius < half * 0.95) tight = true;
    const aWidth = cross > 0 ? inner : half,
      bWidth = cross < 0 ? inner : half;
    sections.push({
      a: { x: p.x + normal.x * aWidth, y: p.y + normal.y * aWidth },
      b: { x: p.x - normal.x * bWidth, y: p.y - normal.y * bWidth },
      center: p,
      width: aWidth + bWidth,
    });
  }
  return { sections, tight };
}
