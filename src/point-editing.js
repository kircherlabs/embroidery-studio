import {
  curveRings,
  curveContours,
  splitCurve,
  identity,
  mapPoint,
} from "./smart-geometry.js";
import { cubic } from "./path-editing.js";
import { distance } from "./geometry.js";
import { validateClosedEdit } from "./closed-curve-editing.js";

export const pointEditable = (o) =>
  !!o &&
  !["manual", "reference"].includes(o.type) &&
  !o.satinRails &&
  !o.textSource &&
  !o.effects &&
  !o.linkedGeometry;
const clone = structuredClone;
const controls = (a, b) => [a, a.out || a, b.in || b, b];
const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const length = (ps) => {
  let v = 0,
    p = ps[0];
  for (let i = 1; i <= 32; i++) {
    const q = cubic(ps, i / 32);
    v += distance(p, q);
    p = q;
  }
  return v;
};
function refit(a, n, b, frame) {
  const left = controls(a, n),
    right = controls(n, b);
  // Recover a parent cubic exactly when removing a de Casteljau split point.
  const l = distance(n, n.in || n),
    r = distance(n, n.out || n),
    t = l / (l + r);
  if (t > 1e-6 && t < 1 - 1e-6) {
    const p = {
        x: a.x + ((a.out || a).x - a.x) / t,
        y: a.y + ((a.out || a).y - a.y) / t,
      },
      q = {
        x: b.x + ((b.in || b).x - b.x) / (1 - t),
        y: b.y + ((b.in || b).y - b.y) / (1 - t),
      },
      ps = [a, p, q, b];
    if (
      Array.from({ length: 33 }, (_, i) => i / 32).every(
        (u) =>
          distance(
            cubic(ps, u),
            u <= t ? cubic(left, u / t) : cubic(right, (u - t) / (1 - t)),
          ) < 1e-7,
      )
    )
      return [p, q];
  }
  const la = length(left),
    lb = length(right),
    split = la / (la + lb || 1);
  const samples = Array.from({ length: 65 }, (_, i) => {
    const t = i / 64;
    return {
      t,
      p:
        t <= split
          ? cubic(left, t / (split || 1))
          : cubic(right, (t - split) / (1 - split || 1)),
    };
  });
  const unit = (p, q) => {
      const d = distance(p, q) || 1;
      return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
    },
    u = unit(a, a.out || n),
    v = unit(b, b.in || n);
  let aa = 0,
    ab = 0,
    bb = 0,
    ar = 0,
    br = 0;
  for (const { t, p } of samples) {
    const k = 1 - t,
      s = 3 * k * k * t,
      z = 3 * k * t * t,
      base = {
        x: (k ** 3 + s) * a.x + (t ** 3 + z) * b.x,
        y: (k ** 3 + s) * a.y + (t ** 3 + z) * b.y,
      },
      x = s * u.x,
      y = s * u.y,
      w = z * v.x,
      h = z * v.y;
    aa += x * x + y * y;
    ab += x * w + y * h;
    bb += w * w + h * h;
    ar += x * (p.x - base.x) + y * (p.y - base.y);
    br += w * (p.x - base.x) + h * (p.y - base.y);
  }
  const det = aa * bb - ab * ab,
    max = 3 * Math.max(distance(a, b), 0.01),
    limit = (x) => Math.max(0, Math.min(max, x));
  const alpha = limit(
      Math.abs(det) > 1e-12 ? (ar * bb - br * ab) / det : distance(a, n),
    ),
    beta = limit(
      Math.abs(det) > 1e-12 ? (br * aa - ar * ab) / det : distance(n, b),
    );
  const p = { x: a.x + u.x * alpha, y: a.y + u.y * alpha },
    q = { x: b.x + v.x * beta, y: b.y + v.y * beta };
  const merged = Array.from({ length: 129 }, (_, i) =>
    mapPoint(cubic([a, p, q, b], i / 128), frame),
  );
  const segDistance = (p, a, b) => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      k = Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
    return distance(p, lerp(a, b, k));
  };
  const old = samples.map((s) => mapPoint(s.p, frame));
  const deviation = (one, two) =>
    Math.max(
      ...one.map((p) =>
        Math.min(...two.slice(1).map((b, i) => segDistance(p, two[i], b))),
      ),
    );
  if (Math.max(deviation(old, merged), deviation(merged, old)) > 0.25)
    throw Error(
      "Removing this curved anchor would change the contour by more than 0.25 mm. Adjust its handles first, or use ordinary node editing.",
    );
  return [p, q];
}

// A pure source edit: callers commit the returned independent object in one history step.
export function editArtworkPoint(original, hit) {
  if (!pointEditable(original))
    throw Error(
      "Use the dedicated rail, lettering or manual-stitch controls for this artwork.",
    );
  const o = clone(original),
    closed = !!o.closed || o.type === "fill" || !!o.curve?.closed,
    ring = hit.ring || 0;
  if (!Number.isInteger(hit.index) || hit.index < 0)
    throw Error("Choose an edge or anchor.");
  if (o.curve) {
    const part = ring ? o.curve.contours?.[ring - 1] : o.curve;
    if (!part) throw Error("Choose a valid contour.");
    const i = hit.index,
      count = part.nodes.length,
      frame = o.curve.frame || identity();
    if (!part.nodes[i]) throw Error("Choose a valid anchor.");
    delete part.exactRing;
    if (hit.kind === "anchor") {
      if (count <= (closed ? 3 : 2))
        throw Error(`Keep at least ${closed ? 3 : 2} anchors in this path.`);
      const a = part.nodes[(i + count - 1) % count],
        n = part.nodes[i],
        b = part.nodes[(i + 1) % count];
      if (closed || (i > 0 && i < count - 1)) {
        if (a.out || n.in || n.out || b.in)
          [a.out, b.in] = refit(a, n, b, frame);
        else {
          delete a.out;
          delete b.in;
        }
        // The opposite controls belong to other edges and must remain exact.
        for (const p of [a, b]) {
          delete p.cornerMemory;
          delete p.edgeMemory;
          p.mode = "corner";
        }
      }
      part.nodes.splice(i, 1);
      if (!closed && i === 0) delete part.nodes[0].in;
      if (!closed && i === count - 1) delete part.nodes.at(-1).out;
    } else {
      if (!Number.isFinite(hit.t) || hit.t <= 1e-5 || hit.t >= 1 - 1e-5)
        throw Error("Choose a point away from the existing anchors.");
      if (
        curveContours(o.curve).reduce((n, c) => n + c.nodes.length, 0) >= 2000
      )
        throw Error("The existing 2,000-anchor curve budget is reached.");
      const b = part.nodes[(i + 1) % count];
      if (!closed && i === count - 1) throw Error("Choose an existing edge.");
      delete part.nodes[i].edgeMemory;
      delete part.nodes[i].cornerMemory;
      delete b.cornerMemory;
      splitCurve(part, i, hit.t);
    }
    o.rings = curveRings(o.curve);
  } else {
    const points = o.rings[ring];
    if (!points) throw Error("Choose a valid contour.");
    if (
      closed &&
      points.length > 1 &&
      distance(points[0], points.at(-1)) < 1e-9
    )
      points.pop();
    if (hit.kind === "anchor") {
      if (!points[hit.index]) throw Error("Choose a valid anchor.");
      if (points.length <= (closed ? 3 : 2))
        throw Error(`Keep at least ${closed ? 3 : 2} anchors in this path.`);
      points.splice(hit.index, 1);
    } else {
      if (
        !hit.point ||
        !Number.isFinite(hit.point.x) ||
        !Number.isFinite(hit.point.y)
      )
        throw Error("Choose an existing edge.");
      const a = points[hit.index],
        b = points[(hit.index + 1) % points.length];
      if (
        !a ||
        !b ||
        (!closed && hit.index === points.length - 1) ||
        Math.min(distance(a, hit.point), distance(b, hit.point)) < 1e-6
      )
        throw Error("Choose a point away from the existing anchors.");
      points.splice(hit.index + 1, 0, clone(hit.point));
    }
  }
  delete o.shape;
  delete o.rounding;
  if (closed)
    validateClosedEdit(original.rings, o.rings, original.fillRule || "evenodd");
  return o;
}

export function pointHit(o, p, radius) {
  if (!pointEditable(o)) return null;
  const parts = o.curve
    ? curveContours(o.curve)
    : o.rings.map((nodes) => ({ nodes, frame: identity() }));
  let best = null;
  for (let ring = 0; ring < parts.length; ring++)
    for (let index = 0; index < parts[ring].nodes.length; index++) {
      const point = mapPoint(
          parts[ring].nodes[index],
          parts[ring].frame || identity(),
        ),
        d = distance(p, point);
      if (d < radius && (!best || d < best.distance))
        best = { kind: "anchor", ring, index, point, distance: d };
    }
  return best;
}
