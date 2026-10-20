// Effects retain the complete editable source; the engine consumes only the result.
import { fillPolygons, distance, simplifyPath } from "./geometry.js";
import { offsetRings, closedArtwork } from "./operations.js";
import { identity, mapPoint, sourceTransform } from "./smart-geometry.js";

const sourceKeys = [
  "rings",
  "type",
  "closed",
  "fillRule",
  "shape",
  "curve",
  "textSource",
  "rounding",
];
function snapshot(o) {
  return structuredClone(
    Object.fromEntries(
      sourceKeys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]),
    ),
  );
}
function topology(o) {
  const p = fillPolygons(o.rings, o.fillRule);
  if (!p?.length)
    throw Error(
      "Resolve empty or intersecting contours before applying an effect.",
    );
  return [p.length, p.reduce((n, r) => n + r.length - 1, 0)].join(":");
}
// Iterative Douglas–Peucker; split closed rings at a far anchor to preserve closure.
export function simplifyContour(ring, tolerance, closed) {
  if (!tolerance || ring.length < 3) return structuredClone(ring);
  const r = structuredClone(ring);
  if (closed && distance(r[0], r.at(-1)) < 1e-8) r.pop();
  const line = (pts) => simplifyPath(pts, tolerance);
  if (!closed) return line(r);
  let at = 1;
  for (let i = 2; i < r.length; i++)
    if (distance(r[0], r[i]) > distance(r[0], r[at])) at = i;
  const out = [
    ...line(r.slice(0, at + 1)).slice(0, -1),
    ...line([...r.slice(at), r[0]]).slice(0, -1),
  ];
  if (out.length < 3)
    throw Error(
      "Simplification would collapse a contour. Reduce its tolerance.",
    );
  return out;
}
export function setArtworkEffects(o, { offset = 0, simplify = 0 } = {}) {
  if (o.linkedGeometry)
    throw Error(
      "Edit effects on the linked original, or unlink this copy first.",
    );
  if (["manual", "reference"].includes(o.type) || o.satinRails)
    throw Error(
      `${o.name}: use source/rail editing for this artwork; contour effects require ordinary vector paths.`,
    );
  if (
    !Number.isFinite(offset) ||
    Math.abs(offset) > 5 ||
    !Number.isFinite(simplify) ||
    simplify < 0 ||
    simplify > 1
  )
    throw Error(
      "Use an offset from −5 to 5 mm and simplification from 0 to 1 mm.",
    );
  if (!closedArtwork(o) && offset)
    throw Error(`${o.name}: contour offsets require a closed region.`);
  if (!offset && !simplify) {
    removeArtworkEffects(o);
    return;
  }
  const effect = o.effects || { source: snapshot(o), frame: identity() },
    source = effect.source;
  const result = structuredClone(source),
    before = closedArtwork(source) ? topology(source) : null;
  result.rings = source.rings.map((r) =>
    simplifyContour(r, simplify, closedArtwork(source)),
  );
  if (before && topology(result) !== before)
    throw Error(
      "Simplification changes islands or counters. Reduce its tolerance.",
    );
  if (offset) {
    result.rings = offsetRings(result, offset);
    result.fillRule = "nonzero";
  }
  if (before && topology(result) !== before)
    throw Error(
      "This effect collapses or merges islands or counters. Reduce the offset or tolerance.",
    );
  // Commit only after validation, so direct callers are atomic too.
  o.effects = { ...effect, offset, simplify };
  for (const key of ["shape", "curve", "textSource", "rounding"]) delete o[key];
  o.rings = result.rings.map((r) => r.map((p) => mapPoint(p, effect.frame)));
  o.fillRule = result.fillRule || "evenodd";
}
export function removeArtworkEffects(o) {
  if (!o.effects) return;
  const { source, frame } = o.effects,
    restored = snapshot(source);
  restored.rings = restored.rings.map((r) => r.map((p) => mapPoint(p, frame)));
  sourceTransform(restored, frame);
  delete o.effects;
  Object.assign(o, restored);
}
export function bakeArtworkEffects(o) {
  // Explicit conversion retains the result and operations. Undo retains the source.
  delete o.effects;
}
