import { isVisible } from "./hierarchy.js";

// Coincident source geometry is a warning, not an automatic deletion: repeated
// passes and overlapping construction can be intentional. Retain original IDs.
function contourKey(ring) {
  const points = ring.map(
    (p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`,
  );
  if (points.length > 1 && points[0] === points.at(-1)) points.pop();
  const canonical = (arr) => {
    let at = 0;
    for (let i = 1; i < arr.length; i++) if (arr[i] < arr[at]) at = i;
    return [...arr.slice(at), ...arr.slice(0, at)].join(";");
  };
  return [canonical(points), canonical([...points].reverse())].sort()[0];
}
export function duplicateArtwork(project) {
  const seen = new Map(),
    result = [];
  for (const o of project.objects) {
    if (["manual", "reference"].includes(o.type) || !isVisible(project, o))
      continue;
    const key = [
      o.type,
      o.color,
      o.closed,
      o.fillRule,
      ...o.rings.map(contourKey).sort(),
    ].join("|");
    if (seen.has(key))
      result.push({ objectId: o.id, originalId: seen.get(key) });
    else seen.set(key, o.id);
  }
  return result;
}
