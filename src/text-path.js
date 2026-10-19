import {
  curveRings,
  mapPoint,
  compose,
  identity,
  roundArtwork,
} from "./smart-geometry.js";
import { distance } from "./geometry.js";

// Glyphs remain rigid: place their advance midpoints on the baseline and rotate
// to its local tangent, rather than bending letter contours into distorted bands.
export function baselineMeasure(curve, reverse = false) {
  if (
    !curve?.nodes ||
    curve.nodes.length < 2 ||
    curve.nodes.length > 2000 ||
    (curve.closed && curve.nodes.length < 3)
  )
    throw Error(
      "Use a baseline with 2–2,000 editable anchors (at least 3 for a closed loop). Simplify complex artwork or draw a Pen/Pencil curve.",
    );
  let points = curveRings(curve)[0].filter(
    (p, i, a) => !i || distance(p, a[i - 1]) > 1e-9,
  );
  if (points.length < 2)
    throw Error("The lettering baseline needs a usable curve.");
  if (curve.closed && distance(points[0], points.at(-1)) < 1e-8) points.pop();
  if (reverse)
    points = curve.closed
      ? [points[0], ...points.slice(1).reverse()]
      : points.reverse();
  if (curve.closed) points.push(points[0]);
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths.at(-1) + distance(points[i - 1], points[i]));
  const length = lengths.at(-1);
  if (length < 0.1)
    throw Error("The lettering baseline must be at least 0.1 mm long.");
  const at = (s) => {
    s = curve.closed
      ? ((s % length) + length) % length
      : Math.max(0, Math.min(length, s));
    let lo = 1,
      hi = lengths.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const a = points[lo - 1],
      b = points[lo],
      t = (s - lengths[lo - 1]) / (lengths[lo] - lengths[lo - 1]);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  return { length, at };
}
export function layoutPathText(source) {
  const path = source.path;
  if (
    !path ||
    !Array.isArray(source.glyphs) ||
    source.glyphs.length !== [...source.content].length
  )
    throw Error(
      "This lettering needs its saved glyph outlines. Reapply the font to rebuild them.",
    );
  if (source.content.includes("\n"))
    throw Error(
      "Text on a path supports one line. Use a separate lettering object for each line.",
    );
  const measure = baselineMeasure(path.curve, path.reverse),
    total =
      source.glyphs.reduce((n, g) => n + g.advance, 0) +
      (source.glyphs.length - 1) * source.tracking,
    start =
      (source.align === "right"
        ? measure.length - total
        : source.align === "center"
          ? (measure.length - total) / 2
          : 0) + (path.offset || 0);
  if (
    total > measure.length + 1e-6 ||
    (!path.curve.closed &&
      (start < -1e-6 || start + total > measure.length + 1e-6))
  )
    throw Error(
      "Lettering extends beyond this baseline. Reduce letter height/spacing or offset, or lengthen the curve. No letters were discarded.",
    );
  let cursor = start;
  const rings = [],
    placements = [];
  for (const glyph of source.glyphs) {
    const mid = cursor + glyph.advance / 2,
      p = measure.at(mid),
      a = measure.at(mid - 0.05),
      b = measure.at(mid + 0.05),
      angle = Math.atan2(b.y - a.y, b.x - a.x),
      ca = Math.cos(angle),
      sa = Math.sin(angle),
      normal = path.normal || 0;
    for (const ring of glyph.rings)
      rings.push(
        ring.map((q) => {
          const x = q.x - glyph.advance / 2,
            y = q.y + normal;
          return { x: p.x + x * ca - y * sa, y: p.y + x * sa + y * ca };
        }),
      );
    placements.push({ center: p, angle, advance: glyph.advance });
    cursor += glyph.advance + source.tracking;
  }
  if (!rings.length) throw Error("No visible glyph outlines are available.");
  return { rings, placements, length: measure.length, total };
}
export function regeneratePathText(o) {
  const radius = o.rounding?.radius,
    result = layoutPathText(o.textSource),
    frame = o.textSource.frame || identity();
  o.rings = result.rings.map((r) => r.map((p) => mapPoint(p, frame)));
  delete o.rounding;
  if (radius) roundArtwork(o, radius);
  return result;
}
export function letteringCurve(o) {
  const curve = o.textSource?.path?.curve;
  return curve
    ? { ...curve, frame: compose(o.textSource.frame, curve.frame) }
    : null;
}
export function updateLetteringCurve(o, curve) {
  // Stage edits local nodes using this composite frame. Keep the independent
  // source frame so transforms are not applied twice on the next edit/reload.
  const next = {
    ...o.textSource.path,
    curve: {
      ...o.textSource.path.curve,
      nodes: structuredClone(curve.nodes),
      closed: curve.closed,
    },
  };
  layoutPathText({ ...o.textSource, path: next });
  o.textSource.path = next;
  regeneratePathText(o);
}
export const baselineCandidate = (o) =>
  !!o &&
  !["reference", "manual"].includes(o.type) &&
  !o.textSource &&
  !o.satinRails &&
  o.rings?.length === 1;
export const constructionBaseline = (o) =>
  !!o?.constructionArtworkIds?.length ||
  (o?.operations || []).some((op) =>
    ["placement", "tackdown", "basting", "stop"].includes(op.type),
  );
export function inverseFrame(m) {
  const d = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(d) < 1e-12)
    throw Error("The lettering transform has collapsed.");
  return [
    m[3] / d,
    -m[1] / d,
    -m[2] / d,
    m[0] / d,
    (m[2] * m[5] - m[3] * m[4]) / d,
    (m[1] * m[4] - m[0] * m[5]) / d,
  ];
}
