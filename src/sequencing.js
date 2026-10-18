import { ancestors } from "./hierarchy.js";

// Artwork order remains the paint/layer order. Manual sewing order is an
// independent list of whole source objects; operation stacks are never split.
export const isManualOrder = (p) => p.sequencing?.mode === "manual";
export function sewingIds(p) {
  const known = new Set(p.objects.map((o) => o.id));
  return [
    ...new Set([
      ...(isManualOrder(p) ? p.sequencing.order : []).filter((id) =>
        known.has(id),
      ),
      ...p.objects.map((o) => o.id),
    ]),
  ];
}
export function normalizeSewingOrder(p) {
  if (isManualOrder(p))
    p.sequencing.order =
      p.sequencing.origin === "tree"
        ? p.objects.map((o) => o.id)
        : sewingIds(p);
}
export function useTreeOrder(p) {
  p.sequencing = {
    mode: "manual",
    origin: "tree",
    order: p.objects.map((o) => o.id),
  };
}
export function moveItems(order, ids, target, after = false) {
  const selected = new Set(ids);
  if (!ids.length || selected.has(target) || !order.includes(target))
    return order;
  const moving = order.filter((id) => selected.has(id)),
    rest = order.filter((id) => !selected.has(id)),
    index = rest.indexOf(target) + Number(after);
  return [...rest.slice(0, index), ...moving, ...rest.slice(index)];
}
export function moveSewingObjects(p, ids, target, after, currentOrder) {
  // Dragging a construction boundary moves its complete manufacturing block.
  // Individual decorative objects can still be ordered within that block.
  const moving = new Set(ids);
  for (const boundary of p.objects.filter(
    (o) => o.constructionArtworkIds?.length,
  ))
    if (moving.has(boundary.id))
      boundary.constructionArtworkIds.forEach((id) => moving.add(id));
  ids = [...moving];
  const order = isManualOrder(p)
      ? sewingIds(p)
      : [...new Set([...(currentOrder || []), ...p.objects.map((o) => o.id)])],
    next = moveItems(order, ids, target, after);
  if (next.every((id, i) => id === order[i])) return false;
  // Sequence pins are barriers in both automatic and manual sequencing.
  const pins = p.objects.filter(
    (o) => o.sequenceLocked || ancestors(p, o).some((g) => g.sequenceLocked),
  );
  for (const pin of pins) {
    const before = new Set(order.slice(0, order.indexOf(pin.id))),
      now = new Set(next.slice(0, next.indexOf(pin.id)));
    if (
      ids.includes(pin.id) ||
      before.size !== now.size ||
      [...before].some((id) => !now.has(id))
    )
      return false;
  }
  p.sequencing = { mode: "manual", origin: "sequence", order: next };
  return true;
}
