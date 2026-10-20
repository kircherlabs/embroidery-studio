// Drawing feedback only. Source vertices, their order, and generated stitches
// are never changed by this analysis or renderer. All coordinates are in mm.
const EPS = 1e-8;
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= EPS;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

function contact(a, b, c, d) {
  const r = sub(b, a),
    s = sub(d, c),
    q = sub(c, a);
  const rr = r.x * r.x + r.y * r.y,
    ss = s.x * s.x + s.y * s.y;
  if (rr <= EPS * EPS || ss <= EPS * EPS) return null;
  const denominator = cross(r, s);
  if (Math.abs(denominator) > EPS * Math.sqrt(rr * ss)) {
    const t = cross(q, s) / denominator,
      u = cross(q, r) / denominator;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return { x: a.x + t * r.x, y: a.y + t * r.y, overlap: false };
  }
  if (Math.abs(cross(q, r)) > EPS * Math.sqrt(rr)) return null;
  const t0 = (q.x * r.x + q.y * r.y) / rr;
  const t1 = t0 + (s.x * r.x + s.y * r.y) / rr;
  const lo = Math.max(0, Math.min(t0, t1)),
    hi = Math.min(1, Math.max(t0, t1));
  if (hi < lo - EPS) return null;
  const t = (lo + hi) / 2;
  return {
    x: a.x + t * r.x,
    y: a.y + t * r.y,
    overlap: (hi - lo) * Math.sqrt(rr) > EPS,
  };
}

export function closedOutlinePreview(points) {
  const segments = [];
  for (let i = 1; i < points.length; i++)
    if (!near(points[i - 1], points[i]))
      segments.push({
        a: points[i - 1],
        b: points[i],
        closing: false,
        crossing: false,
      });
  if (points.length >= 3 && !near(points.at(-1), points[0]))
    segments.push({
      a: points.at(-1),
      b: points[0],
      closing: true,
      crossing: false,
    });
  const intersections = [];
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i],
        b = segments[j];
      // Bounding-box rejection keeps ordinary hand-drawn outlines inexpensive.
      if (
        Math.max(a.a.x, a.b.x) < Math.min(b.a.x, b.b.x) - EPS ||
        Math.max(b.a.x, b.b.x) < Math.min(a.a.x, a.b.x) - EPS ||
        Math.max(a.a.y, a.b.y) < Math.min(b.a.y, b.b.y) - EPS ||
        Math.max(b.a.y, b.b.y) < Math.min(a.a.y, a.b.y) - EPS
      )
        continue;
      const p = contact(a.a, a.b, b.a, b.b);
      if (!p) continue;
      const adjacent = j === i + 1 || (i === 0 && j === segments.length - 1);
      const sharedEnd = [a.a, a.b].some(
        (v) => near(v, p) && [b.a, b.b].some((w) => near(v, w)),
      );
      // Ordinary neighboring vertices are not crossings. Backtracking overlaps
      // and nonadjacent touches still need review, including the closing edge.
      if (adjacent && sharedEnd && !p.overlap) continue;
      a.crossing = b.crossing = true;
      if (!intersections.some((q) => near(q, p))) intersections.push(p);
    }
  return { segments, intersections };
}

export function drawClosedOutline(ctx, preview, scale) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const { a, b, closing, crossing } of preview.segments) {
    ctx.strokeStyle = crossing ? "#b13e32" : "#3d5b40";
    ctx.globalAlpha = closing && !crossing ? 0.55 : 1;
    ctx.lineWidth = (crossing ? 2 : 1.8) / scale;
    ctx.setLineDash(closing ? [4 / scale, 4 / scale] : []);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#b13e32";
  ctx.lineWidth = 1.8 / scale;
  ctx.setLineDash([]);
  const r = 4 / scale;
  for (const p of preview.intersections) {
    ctx.beginPath();
    ctx.moveTo(p.x - r, p.y - r);
    ctx.lineTo(p.x + r, p.y + r);
    ctx.moveTo(p.x - r, p.y + r);
    ctx.lineTo(p.x + r, p.y - r);
    ctx.stroke();
  }
  ctx.restore();
}
