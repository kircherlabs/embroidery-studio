import { lab, distance2 } from "./image-colors.js";
const colorLab = (hex) =>
  lab(
    hex
      .slice(1)
      .match(/../g)
      .map((n) => parseInt(n, 16)),
  );
// CIELAB D65 / Delta E 1976. This ranks digital approximations, not physical samples.
export function matchIndex(
  records,
  { brand = "", line = "", owned = null } = {},
) {
  const allowed = owned === null ? null : new Set(owned);
  const candidates = records
    .filter(
      (r) =>
        r.hex &&
        (!brand || r.brandId === brand) &&
        (!line || r.brandId + "|" + r.lineId === line) &&
        (!allowed || allowed.has(r.id)),
    )
    .map((thread) => ({ thread, lab: colorLab(thread.hex) }));
  return (hex, limit = 5) => {
    const p = colorLab(hex);
    return candidates
      .map((c) => ({
        thread: c.thread,
        deltaE: Math.sqrt(distance2(p, c.lab)),
      }))
      .sort(
        (a, b) => a.deltaE - b.deltaE || a.thread.id.localeCompare(b.thread.id),
      )
      .slice(0, limit);
  };
}
export function matchGroups(targets, current = false) {
  const groups = new Map();
  for (const target of targets) {
    const op = target.operation,
      color = (
        current
          ? op.color
          : op.physicalThread?.designColor || op.color || target.object.color
      ).toLowerCase();
    const key =
      color + (current ? "|" + (op.physicalThread?.thread.id || "") : "");
    if (!groups.has(key)) groups.set(key, { key, color, targets: [] });
    groups.get(key).targets.push(target);
  }
  return [...groups.values()];
}
