import { distance, simplifyPath } from "./geometry.js";

// Physical error budget, independent of camera zoom and device pixels. Half is
// reserved for sampling the cosine deformation, half for compacting its polyline.
export const sculptTolerance = (reach) => Math.min(0.025, reach / 100);

const cross = (a, b, c) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const on = (a, b, p) =>
  Math.abs(cross(a, b, p)) < 1e-9 &&
  p.x >= Math.min(a.x, b.x) - 1e-9 &&
  p.x <= Math.max(a.x, b.x) + 1e-9 &&
  p.y >= Math.min(a.y, b.y) - 1e-9 &&
  p.y <= Math.max(a.y, b.y) + 1e-9;
const meets = (a, b, c, d) => {
  const x = cross(a, b, c),
    y = cross(a, b, d),
    u = cross(c, d, a),
    v = cross(c, d, b);
  return (
    (x * y < 0 && u * v < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
};

// Sweep bounding boxes rather than compare every pair in a dense import. Used
// both to protect simplification shortcuts and to reject crossing sculpt drags.
export function sculptIntersections(rings, closed = true) {
  const edges = [];
  rings.forEach((input, ring) => {
    input = input.filter((p, i) => !i || distance(p, input[i - 1]) > 1e-9);
    const r =
      closed && input.length > 2 && distance(input[0], input.at(-1)) < 1e-9
        ? input.slice(0, -1)
        : input;
    const count = r.length - (closed ? 0 : 1);
    for (let i = 0; i < count; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      if (distance(a, b) < 1e-10) continue;
      edges.push({
        a,
        b,
        ring,
        i,
        count,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y),
      });
    }
  });
  edges.sort((a, b) => a.minX - b.minX);
  let active = [];
  for (const e of edges) {
    active = active.filter((q) => q.maxX >= e.minX - 1e-9);
    for (const q of active) {
      if (q.maxY < e.minY - 1e-9 || e.maxY < q.minY - 1e-9) continue;
      if (
        q.ring === e.ring &&
        (Math.abs(q.i - e.i) === 1 ||
          (closed && Math.abs(q.i - e.i) === e.count - 1))
      ) {
        // Adjacent edges may meet, but must not double back over one another.
        if (
          Math.abs(cross(q.a, q.b, e.a)) < 1e-9 &&
          Math.abs(cross(q.a, q.b, e.b)) < 1e-9 &&
          (q.b.x - q.a.x) * (e.b.x - e.a.x) +
            (q.b.y - q.a.y) * (e.b.y - e.a.y) <
            -1e-12
        )
          return true;
        continue;
      }
      if (meets(q.a, q.b, e.a, e.b)) return true;
    }
    active.push(e);
  }
  return false;
}

export function sculptContour(
  input,
  hit,
  delta,
  reach,
  closed,
  otherRings = [],
) {
  if (
    !Number.isFinite(reach) ||
    reach <= 0 ||
    !Number.isFinite(delta.x) ||
    !Number.isFinite(delta.y)
  )
    throw Error("Choose a positive Sculpt reach and a finite movement.");
  const magnitude = Math.hypot(delta.x, delta.y);
  if (magnitude < 1e-10) return input;
  const duplicate = closed && distance(input[0], input.at(-1)) < 1e-9;
  const ring = duplicate ? input.slice(0, -1) : input;
  const cumulative = [0];
  for (let i = 1; i < ring.length; i++)
    cumulative.push(cumulative.at(-1) + distance(ring[i - 1], ring[i]));
  const total =
    cumulative.at(-1) + (closed ? distance(ring.at(-1), ring[0]) : 0);
  if (total < 1e-9) return input;
  const at = cumulative[hit.index] + distance(ring[hit.index], hit.point);
  const tolerance = sculptTolerance(reach);
  // |D''(s)| <= |delta| pi² / (2 reach²). Linear interpolation error
  // is <= |D''| h²/8. No samples are needed on the rest of a long edge.
  const step = reach * Math.sqrt((8 * tolerance) / (magnitude * Math.PI ** 2));
  const shifts = closed ? [-total, 0, total] : [0];
  const knots = shifts.flatMap((shift) => [
    at - reach + shift,
    at + shift,
    at + reach + shift,
    ...(closed && reach > total / 2 ? [at + total / 2 + shift] : []),
  ]);
  const samples = [],
    keep = new Set();
  const sharp = (i) => {
    if (!closed && (i === 0 || i === ring.length - 1)) return true;
    const a = ring[(i + ring.length - 1) % ring.length],
      b = ring[i],
      c = ring[(i + 1) % ring.length],
      la = distance(a, b),
      lb = distance(b, c);
    // Protect intentional turns/terminals, including tiny acute details. Smooth
    // trace samples and previously inserted cosine samples remain reducible.
    return (
      la > 1e-9 &&
      lb > 1e-9 &&
      ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (la * lb) <
        Math.cos(Math.PI / 9)
    );
  };
  const emit = (p, s, protect) => {
    const raw = Math.abs(s - at),
      d = closed ? Math.min(raw, total - raw) : raw;
    const w = d < reach ? (1 + Math.cos((Math.PI * d) / reach)) / 2 : 0;
    // A narrow cleanup collar also removes yesterday's now-redundant influence
    // endpoints. Keeping every old endpoint would still add two nodes per drag.
    // Original vertices beyond this collar remain byte-for-byte unchanged.
    if (protect || d >= reach * 1.5 - 1e-9) keep.add(samples.length);
    samples.push(w ? { x: p.x + delta.x * w, y: p.y + delta.y * w } : { ...p });
  };
  for (let i = 0; i < ring.length - (closed ? 0 : 1); i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      length = distance(a, b),
      start = cumulative[i];
    emit(a, start, sharp(i));
    if (length < 1e-10) continue;
    const stops = [
      start,
      ...knots.filter((s) => s > start + 1e-9 && s < start + length - 1e-9),
      start + length,
    ]
      .sort((a, b) => a - b)
      .filter((s, i, all) => !i || s - all[i - 1] > 1e-9);
    for (let k = 1; k < stops.length; k++) {
      const lo = stops[k - 1],
        hi = stops[k],
        mid = (lo + hi) / 2;
      const raw = Math.abs(mid - at),
        d = closed ? Math.min(raw, total - raw) : raw;
      const n = d < reach ? Math.max(1, Math.ceil((hi - lo) / step)) : 1;
      for (let j = k === 1 ? 1 : 0; j < n; j++) {
        const s = lo + ((hi - lo) * j) / n,
          t = (s - start) / length;
        emit(
          { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
          s,
          j === 0,
        );
      }
    }
  }
  emit(closed ? ring[0] : ring.at(-1), total, true);
  keep.add(0);
  const anchors = [...keep].sort((a, b) => a - b),
    result = [];
  for (let i = 1; i < anchors.length; i++)
    result.push(
      ...simplifyPath(
        samples.slice(anchors[i - 1], anchors[i] + 1),
        tolerance / 2,
      ).slice(0, -1),
    );
  result.push(samples.at(-1));
  const finish = (r) => (closed && !duplicate ? r.slice(0, -1) : r);
  const compact = finish(result);
  // A shortcut may cross a very narrow counter even within the error budget.
  // Retain the accurate samples there; final drag validation handles deformation.
  return sculptIntersections([compact, ...otherRings], closed)
    ? finish(samples)
    : compact;
}
