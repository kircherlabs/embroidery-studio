// Editable source descriptions are additive: the embroidery engine still consumes rings.
export const identity = () => [1, 0, 0, 1, 0, 0];
export const mapPoint = (p, m) => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});
export function compose(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ].map((v) => (Object.is(v, -0) ? 0 : v));
}
export function sourceTransform(o, m) {
  for (const op of [o, ...(o.operations || [])])
    if (op.satinGuides)
      op.satinGuides = op.satinGuides.map((g) => ({
        a: mapPoint(g.a, m),
        b: mapPoint(g.b, m),
      }));
  for (const key of ["shape", "textSource", "curve", "reference"])
    if (o[key]) o[key].frame = compose(m, o[key].frame || identity());
  if (o.rounding)
    o.rounding.rings = o.rounding.rings.map((r) =>
      r.map((p) => mapPoint(p, m)),
    );
}
export function detachSource(o) {
  delete o.shape;
  delete o.textSource;
  delete o.rounding;
  delete o.curve;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function roundedRing(ring, radius, closed = true, vertices = null) {
  if (radius <= 0 || ring.length < 3) return structuredClone(ring);
  const r = structuredClone(ring);
  if (closed && dist(r[0], r.at(-1)) < 1e-8) r.pop();
  return r.flatMap((b, i) => {
    if (
      (!closed && (i === 0 || i === r.length - 1)) ||
      (vertices && !vertices.includes(i))
    )
      return [b];
    const a = r[(i + r.length - 1) % r.length],
      c = r[(i + 1) % r.length],
      la = dist(a, b),
      lc = dist(c, b);
    if (la < 1e-7 || lc < 1e-7) return [b];
    const u = { x: (a.x - b.x) / la, y: (a.y - b.y) / la },
      v = { x: (c.x - b.x) / lc, y: (c.y - b.y) / lc };
    const theta = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)));
    if (theta < 0.02 || Math.PI - theta < 0.02) return [b];
    const t = Math.min(radius / Math.tan(theta / 2), la * 0.45, lc * 0.45),
      rr = t * Math.tan(theta / 2),
      sin = Math.sin(theta / 2),
      len = Math.hypot(u.x + v.x, u.y + v.y);
    const center = {
      x: b.x + (((u.x + v.x) / len) * rr) / sin,
      y: b.y + (((u.y + v.y) / len) * rr) / sin,
    };
    const start = { x: b.x + u.x * t, y: b.y + u.y * t },
      end = { x: b.x + v.x * t, y: b.y + v.y * t };
    const angle = Math.atan2(start.y - center.y, start.x - center.x);
    let sweep = Math.atan2(end.y - center.y, end.x - center.x) - angle;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    const n = Math.max(2, Math.ceil(Math.abs(sweep) * Math.sqrt(rr / 0.04)));
    return Array.from({ length: n + 1 }, (_, j) => ({
      x: center.x + rr * Math.cos(angle + (sweep * j) / n),
      y: center.y + rr * Math.sin(angle + (sweep * j) / n),
    }));
  });
}
export function shapeRings(s) {
  const w = s.width,
    h = s.height,
    r = s.radius || 0;
  let rings;
  if (s.kind === "ellipse" || s.kind === "eyelet") {
    const ellipse = (rx, ry) =>
      Array.from({ length: 128 }, (_, i) => ({
        x: Math.cos((i * Math.PI) / 64) * rx,
        y: Math.sin((i * Math.PI) / 64) * ry,
      }));
    rings =
      s.kind === "eyelet"
        ? [
            ellipse(s.diameter / 2 + s.band, s.diameter / 2 + s.band),
            ellipse(s.diameter / 2, s.diameter / 2).reverse(),
          ]
        : [ellipse(w / 2, h / 2)];
  } else if (s.kind === "rect")
    rings = [
      roundedRing(
        [
          { x: -w / 2, y: -h / 2 },
          { x: w / 2, y: -h / 2 },
          { x: w / 2, y: h / 2 },
          { x: -w / 2, y: h / 2 },
        ],
        Math.min(r, w / 2, h / 2),
      ),
    ];
  else {
    const n = s.sides * (s.kind === "star" ? 2 : 1);
    rings = [
      Array.from({ length: n }, (_, i) => {
        const a = (i * Math.PI * 2) / n - Math.PI / 2,
          k = s.kind === "star" && i % 2 ? s.innerRatio : 1;
        return {
          x: ((Math.cos(a) * w) / 2) * k,
          y: ((Math.sin(a) * h) / 2) * k,
        };
      }),
    ];
    if (r) rings = rings.map((ring) => roundedRing(ring, r));
  }
  return rings.map((r) => r.map((p) => mapPoint(p, s.frame || identity())));
}
export function regenerateShape(o) {
  o.rings = shapeRings(o.shape);
  o.fillRule = "evenodd";
  delete o.rounding;
}
export function roundArtwork(o, radius, vertices = null) {
  if (
    !vertices &&
    o.shape &&
    ["rect", "regular", "star"].includes(o.shape.kind)
  ) {
    o.shape.radius = radius;
    regenerateShape(o);
    return;
  }
  if (!o.rounding) o.rounding = { rings: structuredClone(o.rings), radius: 0 };
  o.rounding.radius = radius;
  o.rings = o.rounding.rings.map((r, i) =>
    roundedRing(
      r,
      radius,
      o.type === "fill" || o.closed,
      vertices?.ring === i ? vertices.indices : vertices ? [] : null,
    ),
  );
  // Explicit rounding converts a parametric primitive to an editable rounded path.
  delete o.shape;
  if (vertices) delete o.textSource;
  delete o.curve;
}
// Cubic control points remain editable; adaptive flattening stays within .025 mm.
export function curveRings(c) {
  const out = [];
  const frame = c.frame || identity(),
    tolerance =
      0.025 /
      Math.max(
        1,
        Math.hypot(frame[0], frame[1]),
        Math.hypot(frame[2], frame[3]),
      );
  const nodes = c.nodes;
  if (!nodes.length) return [];
  const add = (a, b, p, q, depth = 0) => {
    const flat = (v) => {
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const length = dx * dx + dy * dy,
        t = length
          ? Math.max(
              0,
              Math.min(1, ((v.x - a.x) * dx + (v.y - a.y) * dy) / length),
            )
          : 0;
      return Math.hypot(v.x - a.x - dx * t, v.y - a.y - dy * t);
    };
    if (depth >= 12 || Math.max(flat(p), flat(q)) < tolerance) {
      out.push(b);
      return;
    }
    const mid = (u, v) => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 });
    const ap = mid(a, p),
      pq = mid(p, q),
      qb = mid(q, b),
      left = mid(ap, pq),
      right = mid(pq, qb),
      m = mid(left, right);
    add(a, m, ap, left, depth + 1);
    add(m, b, right, qb, depth + 1);
  };
  out.push({ x: nodes[0].x, y: nodes[0].y });
  for (let i = 1; i < nodes.length + (c.closed ? 1 : 0); i++) {
    const a = nodes[(i - 1) % nodes.length],
      b = nodes[i % nodes.length];
    add(a, b, a.out || a, b.in || b);
  }
  return [out.map((p) => mapPoint(p, c.frame || identity()))];
}
export function inversePoint(p, m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) throw Error("Cannot edit a collapsed transform.");
  return {
    x: (m[3] * (p.x - m[4]) - m[2] * (p.y - m[5])) / det,
    y: (-m[1] * (p.x - m[4]) + m[0] * (p.y - m[5])) / det,
  };
}

export function splitCurve(c, index, t = 0.5) {
  const a = c.nodes[index],
    b = c.nodes[(index + 1) % c.nodes.length],
    p = a.out || a,
    q = b.in || b;
  const lerp = (u, v) => ({
    x: u.x + (v.x - u.x) * t,
    y: u.y + (v.y - u.y) * t,
  });
  const ap = lerp(a, p),
    pq = lerp(p, q),
    qb = lerp(q, b),
    left = lerp(ap, pq),
    right = lerp(pq, qb),
    m = lerp(left, right);
  a.out = ap;
  b.in = qb;
  c.nodes.splice(index + 1, 0, { ...m, in: left, out: right });
}
