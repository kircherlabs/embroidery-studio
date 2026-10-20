import { pruneReferenceAssets } from "./references.js";
import { sourceTransform } from "./smart-geometry.js";
import { uid, bounds, pointsOf, translate } from "./model.js";

// Artwork stays in the existing leaf array. Groups reference it by parentId;
// neither a group nor a UI selection is duplicated into the stitch engine.
export const PROJECT = "@project";
export const nodes = (p) => [...(p.groups || []), ...p.objects];
export const nodeById = (p, id) => nodes(p).find((n) => n.id === id);
export function ancestors(
  p,
  node,
  map = new Map((p.groups || []).map((g) => [g.id, g])),
) {
  const result = [];
  let at = node?.parentId;
  while (at && map.has(at) && result.length < 64) {
    const g = map.get(at);
    result.push(g);
    at = g.parentId;
  }
  return result;
}
export const within = (p, n, id) =>
  id === PROJECT || n.id === id || ancestors(p, n).some((g) => g.id === id);
export const isVisible = (p, n) =>
  n.visible !== false && ancestors(p, n).every((g) => g.visible !== false);
export const isLocked = (p, n) =>
  !!n.locked || ancestors(p, n).some((g) => g.locked);
export function leaves(p, ids, { editable = false, visible = false } = {}) {
  const selected = new Set(ids || []),
    map = new Map((p.groups || []).map((g) => [g.id, g]));
  return p.objects.filter((o) => {
    const parents = ancestors(p, o, map);
    return (
      (selected.has(PROJECT) ||
        selected.has(o.id) ||
        parents.some((g) => selected.has(g.id))) &&
      (!editable || (!o.locked && !parents.some((g) => g.locked))) &&
      (!visible ||
        (o.visible !== false && parents.every((g) => g.visible !== false)))
    );
  });
}
export const selectionIds = (s) =>
  s.selectionIds || (s.selection ? [s.selection] : []);
export const selectedLeaves = (s, options) =>
  leaves(s.project, selectionIds(s), options);
export const selectionBounds = (objects) => bounds(objects.flatMap(pointsOf));
export function roots(p, ids) {
  const set = new Set(ids);
  if (set.has(PROJECT)) return [PROJECT];
  return nodes(p)
    .filter((n) => set.has(n.id) && !ancestors(p, n).some((g) => set.has(g.id)))
    .map((n) => n.id);
}
export function children(p, parentId = null) {
  const index = new Map(p.objects.map((o, i) => [o.id, i]));
  const map = new Map((p.groups || []).map((g) => [g.id, g]));
  for (const [i, o] of p.objects.entries())
    for (const g of ancestors(p, o, map))
      index.set(g.id, Math.min(index.get(g.id) ?? Infinity, i));
  return nodes(p)
    .filter((n) => (n.parentId || null) === parentId)
    .sort(
      (a, b) => (index.get(a.id) ?? Infinity) - (index.get(b.id) ?? Infinity),
    );
}
export function treeRows(p, collapsed = new Set()) {
  const result = [];
  const walk = (parent, depth) => {
    for (const node of children(p, parent)) {
      result.push({ node, depth });
      if (node.kind && !collapsed.has(node.id)) walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}
export function reorder(p, ids, direction) {
  const selected = roots(p, ids).filter((id) => id !== PROJECT),
    map = new Map(nodes(p).map((n) => [n.id, n]));
  const parents = new Set(selected.map((id) => map.get(id)?.parentId || null));
  if (parents.size !== 1) return false;
  const parent = [...parents][0],
    siblings = children(p, parent),
    set = new Set(selected);
  const positions = siblings.map((_, i) => i);
  if (direction > 0) positions.reverse();
  for (const i of positions) {
    const j = i + direction;
    if (set.has(siblings[i]?.id) && siblings[j] && !set.has(siblings[j].id))
      [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  }
  const ordered = [];
  const walk = (parentId) => {
    for (const n of parentId === parent ? siblings : children(p, parentId)) {
      if (n.kind) walk(n.id);
      else ordered.push(n);
    }
  };
  walk(null);
  if (leaves(p, selected).some((o) => isLocked(p, o))) return false;
  for (const pin of p.objects.filter(
    (o) => o.sequenceLocked || ancestors(p, o).some((g) => g.sequenceLocked),
  )) {
    const before = p.objects.slice(0, p.objects.indexOf(pin)).map((o) => o.id),
      now = new Set(ordered.slice(0, ordered.indexOf(pin)).map((o) => o.id));
    if (before.length !== now.size || before.some((id) => !now.has(id)))
      return false;
  }
  if (p.objects.every((o, i) => o === ordered[i])) return false;
  p.objects = ordered;
  return true;
}
export function moveInTree(p, ids, target, after = false) {
  const selected = roots(p, ids).filter((id) => id !== PROJECT),
    at = nodeById(p, target),
    set = new Set(selected);
  if (!at || set.has(target) || !selected.length) return false;
  const parent = at.parentId || null;
  if (
    selected.some((id) => {
      const n = nodeById(p, id);
      return (
        !n ||
        (n.parentId || null) !== parent ||
        leaves(p, [id]).some((o) => isLocked(p, o))
      );
    })
  )
    return false;
  const siblings = children(p, parent),
    moving = siblings.filter((n) => set.has(n.id)),
    rest = siblings.filter((n) => !set.has(n.id)),
    index = rest.findIndex((n) => n.id === target) + Number(after);
  const next = [...rest.slice(0, index), ...moving, ...rest.slice(index)];
  if (next.every((n, i) => n.id === siblings[i].id)) return false;
  const ordered = [];
  const walk = (id) => {
    for (const n of id === parent ? next : children(p, id)) {
      if (n.kind) walk(n.id);
      else ordered.push(n);
    }
  };
  walk(null);
  for (const pin of p.objects.filter(
    (o) => o.sequenceLocked || ancestors(p, o).some((g) => g.sequenceLocked),
  )) {
    const before = p.objects.slice(0, p.objects.indexOf(pin)).map((o) => o.id),
      now = new Set(ordered.slice(0, ordered.indexOf(pin)).map((o) => o.id));
    if (
      leaves(p, selected).includes(pin) ||
      before.length !== now.size ||
      before.some((id) => !now.has(id))
    )
      return false;
  }
  p.objects = ordered;
  return true;
}
export function groupSelection(p, ids, name = "Group") {
  let chosen = roots(p, ids);
  if (chosen.includes(PROJECT)) chosen = children(p).map((n) => n.id);
  chosen = chosen.filter((id) => leaves(p, [id]).every((o) => !isLocked(p, o)));
  if (!chosen.length) return null;
  const selected = chosen.map((id) => nodeById(p, id)),
    parentId = selected.every((n) => n.parentId === selected[0].parentId)
      ? selected[0].parentId
      : null;
  const group = {
    id: uid(),
    name,
    kind: "group",
    parentId: parentId || null,
    visible: true,
    locked: false,
  };
  (p.groups ||= []).push(group);
  for (const n of selected) n.parentId = group.id;
  // Make the tree's visual order the actual source layer order.
  p.objects = treeRows(p)
    .filter((r) => !r.node.kind)
    .map((r) => r.node);
  return group.id;
}
export function ungroupSelection(p, ids) {
  const result = [];
  for (const id of roots(p, ids)) {
    const g = (p.groups || []).find((g) => g.id === id);
    if (!g || leaves(p, [id]).some((o) => isLocked(p, o))) continue;
    for (const n of children(p, id)) {
      n.parentId = g.parentId || null;
      result.push(n.id);
    }
    p.groups = p.groups.filter((n) => n.id !== id);
  }
  return result;
}
export function deleteSelection(p, ids) {
  const eligible = roots(p, ids).filter((id) =>
    leaves(p, [id]).every((o) => !isLocked(p, o)),
  );
  const remove = new Set(
    nodes(p)
      .filter((n) => eligible.some((id) => within(p, n, id)))
      .map((n) => n.id),
  );
  p.objects = p.objects.filter((o) => !remove.has(o.id));
  p.groups = (p.groups || []).filter((g) => !remove.has(g.id));
  pruneReferenceAssets(p);
}
export function copySelection(p, ids) {
  const selected = roots(p, ids),
    all = nodes(p).filter((n) => selected.some((id) => within(p, n, id)));
  return {
    objects: structuredClone(all.filter((n) => !n.kind)),
    groups: structuredClone(all.filter((n) => n.kind)),
    ...(all.some((n) => n.type === "reference")
      ? {
          referenceAssets: Object.fromEntries(
            all
              .filter((n) => n.type === "reference")
              .map((n) => [
                n.reference.assetId,
                structuredClone(p.referenceAssets[n.reference.assetId]),
              ]),
          ),
        }
      : {}),
    roots: all
      .filter(
        (n) =>
          selected.includes(n.id) ||
          (selected.includes(PROJECT) && !n.parentId),
      )
      .map((n) => n.id),
  };
}
export function pasteSelection(p, clipboard, offset = 3, remap = null) {
  const copy = structuredClone(clipboard),
    all = [...copy.groups, ...copy.objects],
    ids = new Map(all.map((n) => [n.id, uid()]));
  if (remap) for (const [old, next] of ids) remap.set(old, next);
  const assetIds = new Map();
  for (const [id, asset] of Object.entries(copy.referenceAssets || {})) {
    const assets = (p.referenceAssets ||= {}),
      existing = Object.keys(assets).find(
        (key) => assets[key].data === asset.data,
      ),
      next = existing || (!Object.hasOwn(assets, id) ? id : uid());
    assets[next] ||= asset;
    assetIds.set(id, next);
  }
  for (const n of all) {
    if (n.type === "reference")
      n.reference.assetId =
        assetIds.get(n.reference.assetId) || n.reference.assetId;
    const wasRoot = copy.roots.includes(n.id);
    n.id = ids.get(n.id);
    n.parentId =
      ids.get(n.parentId) ||
      (nodeById(p, n.parentId)?.kind ? n.parentId : null);
    if (wasRoot) n.name = n.name.slice(0, 195) + " copy";
    if (n.svgFillId) n.svgFillId = ids.get(n.svgFillId) || null;
    if (n.linkedGeometry) {
      n.linkedGeometry.sourceId =
        ids.get(n.linkedGeometry.sourceId) || n.linkedGeometry.sourceId;
      if (
        ![...ids.values()].includes(n.linkedGeometry.sourceId) &&
        !p.objects.some((o) => o.id === n.linkedGeometry.sourceId)
      )
        delete n.linkedGeometry;
    }
    if (n.operations) n.operations.forEach((op) => (op.id = uid()));
    if (n.constructionArtworkIds)
      n.constructionArtworkIds = n.constructionArtworkIds
        .map((id) => ids.get(id))
        .filter(Boolean);
    if (n.constructionArtworkIds?.length === 0) delete n.constructionArtworkIds;
  }
  copy.objects.forEach((o) => translate(o, offset, offset));
  p.objects.push(...copy.objects);
  (p.groups ||= []).push(...copy.groups);
  p.objects = treeRows(p)
    .filter((r) => !r.node.kind)
    .map((r) => r.node);
  return copy.roots.map((id) => ids.get(id));
}
export function transformSelection(
  objects,
  { sx = 1, sy = 1, angle = 0, dx = 0, dy = 0, pivot, axes = 0 } = {},
) {
  const b = selectionBounds(objects),
    c = pivot || { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
    a = (angle * Math.PI) / 180;
  const phi = (axes * Math.PI) / 180,
    u = Math.cos(phi),
    v = Math.sin(phi),
    xx = sx * u * u + sy * v * v,
    xy = (sx - sy) * u * v,
    yy = sx * v * v + sy * u * u,
    ca = Math.cos(a),
    sa = Math.sin(a),
    m = [
      ca * xx - sa * xy,
      sa * xx + ca * xy,
      ca * xy - sa * yy,
      sa * xy + ca * yy,
      0,
      0,
    ];
  m[4] = c.x - m[0] * c.x - m[2] * c.y + dx;
  m[5] = c.y - m[1] * c.x - m[3] * c.y + dy;
  for (const o of objects) {
    // Manual control commands also carry a position. Translate them with the
    // needle points, without counting them toward the selection bounds.
    const points = o.type === "manual" ? o.commands : o.rings.flat();
    for (const p of points) {
      if (axes) {
        const x = p.x,
          y = p.y;
        p.x = m[0] * x + m[2] * y + m[4];
        p.y = m[1] * x + m[3] * y + m[5];
        continue;
      }
      const x = (p.x - c.x) * sx,
        y = (p.y - c.y) * sy;
      p.x = c.x + x * Math.cos(a) - y * Math.sin(a) + dx;
      p.y = c.y + x * Math.sin(a) + y * Math.cos(a) + dy;
    }
    sourceTransform(o, m);
    // Reflect stitch directions with the source without changing physical density.
    if (angle || sx * sy < 0) {
      const direction = (v) => {
        if (v === undefined) return v;
        let d = v;
        if (sx * sy < 0 && axes) {
          const t = ((v - axes) * Math.PI) / 180;
          d =
            (Math.atan2(
              Math.sign(sy) * Math.sin(t),
              Math.sign(sx) * Math.cos(t),
            ) *
              180) /
              Math.PI +
            axes;
        } else if (sx * sy < 0)
          d =
            (Math.atan2(
              Math.sign(sy) * Math.sin((v * Math.PI) / 180),
              Math.sign(sx) * Math.cos((v * Math.PI) / 180),
            ) *
              180) /
            Math.PI;
        return ((d + angle + 540) % 360) - 180;
      };
      if (o.angle !== undefined) o.angle = direction(o.angle);
      for (const op of o.operations || [])
        if (op.angle !== undefined) op.angle = direction(op.angle);
    }
  }
}
export function alignSelection(objects, mode) {
  const b = selectionBounds(objects);
  if (mode.startsWith("distribute")) {
    if (objects.length < 3) return;
    const axis = mode.endsWith("x") ? "x" : "y",
      lo = axis === "x" ? "minX" : "minY",
      hi = axis === "x" ? "maxX" : "maxY",
      size = axis === "x" ? "width" : "height";
    const sorted = [...objects].sort(
      (a, b) => selectionBounds([a])[lo] - selectionBounds([b])[lo],
    );
    const boxes = sorted.map((o) => selectionBounds([o])),
      total = boxes.reduce((n, v) => n + v[size], 0),
      gap = (b[hi] - b[lo] - total) / (objects.length - 1);
    let at = b[lo];
    sorted.forEach((o, i) => {
      translate(
        o,
        axis === "x" ? at - boxes[i][lo] : 0,
        axis === "y" ? at - boxes[i][lo] : 0,
      );
      at += boxes[i][size] + gap;
    });
  } else
    for (const o of objects) {
      const q = selectionBounds([o]);
      let dx = 0,
        dy = 0;
      if (mode === "left") dx = b.minX - q.minX;
      if (mode === "right") dx = b.maxX - q.maxX;
      if (mode === "center-x") dx = (b.minX + b.maxX - q.minX - q.maxX) / 2;
      if (mode === "top") dy = b.minY - q.minY;
      if (mode === "bottom") dy = b.maxY - q.maxY;
      if (mode === "center-y") dy = (b.minY + b.maxY - q.minY - q.maxY) / 2;
      translate(o, dx, dy);
    }
}
