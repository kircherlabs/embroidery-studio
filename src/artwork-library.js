import { uid, bounds, pointsOf, translate, validateProject } from "./model.js";
import {
  copySelection,
  nodes,
  isVisible,
  isLocked,
  ancestors,
} from "./hierarchy.js";
import { sewingIds, isManualOrder } from "./sequencing.js";
import { syncLinkedArtwork } from "./linked-artwork.js";
import { compose } from "./smart-geometry.js";
export const ARTWORK_VERSION = 1;
export const MAX_ARTWORK_BYTES = 32 * 1024 * 1024;
export function portableJSON(value, limit = MAX_ARTWORK_BYTES) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    throw Error("Artwork must contain portable, non-cyclic project data.");
  }
  if (!text || new TextEncoder().encode(text).length > limit)
    throw Error(
      `Artwork exceeds the ${Math.round(limit / 1024 / 1024)} MB limit. Save fewer elements or optimize large reference images.`,
    );
  const out = JSON.parse(text),
    stack = [[out, 0]];
  while (stack.length) {
    const [v, depth] = stack.pop();
    if (depth > 80) throw Error("Artwork data is nested too deeply.");
    if (v && typeof v === "object")
      for (const key of Object.keys(v)) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw Error("Unsafe artwork data key.");
        stack.push([v[key], depth + 1]);
      }
  }
  return out;
}
const payloadProject = (a) => ({
  version: 1,
  name: "Reusable artwork",
  machine: "se700",
  objects: a.objects,
  groups: a.groups,
  ...(a.referenceAssets ? { referenceAssets: a.referenceAssets } : {}),
});
function checkLinks(a, source = null) {
  const all = [...a.groups, ...a.objects],
    ids = new Set(all.map((n) => n.id)),
    leaves = new Set(a.objects.map((n) => n.id));
  for (const n of all) {
    const refs = [
      n.svgFillId,
      n.linkedGeometry?.sourceId,
      ...(n.constructionArtworkIds || []),
    ].filter(Boolean);
    for (const id of refs)
      if (!leaves.has(id))
        throw Error(
          `Also select related artwork “${source?.objects.find((o) => o.id === id)?.name || id}” to save “${n.name}”. Select the complete linked or construction group.`,
        );
    if (n.parentId && !ids.has(n.parentId))
      throw Error("Artwork has an external parent.");
  }
}
export function validateArtwork(raw) {
  const a = portableJSON(raw);
  if (
    !a ||
    !Array.isArray(a.objects) ||
    !a.objects.length ||
    !Array.isArray(a.groups) ||
    !Array.isArray(a.roots)
  )
    throw Error(
      "Reusable artwork needs source objects, groups and selection roots.",
    );
  checkLinks(a);
  validateProject(payloadProject(a));
  const expected = [...a.groups, ...a.objects]
    .filter((n) => !n.parentId)
    .map((n) => n.id);
  if (
    a.roots.length !== expected.length ||
    new Set(a.roots).size !== a.roots.length ||
    a.roots.some((id) => !expected.includes(id))
  )
    throw Error("Invalid artwork selection roots.");
  if (!a.objects.some((o) => pointsOf(o).length))
    throw Error("No source geometry to save.");
  if (
    a.order &&
    (!Array.isArray(a.order) ||
      a.order.length !==
        a.objects.filter((o) => o.type !== "reference").length ||
      new Set(a.order).size !== a.order.length ||
      a.order.some(
        (id) => !a.objects.some((o) => o.id === id && o.type !== "reference"),
      ))
  )
    throw Error("Invalid saved sewing order.");
  return a;
}
export function extractArtwork(project, ids) {
  const p = structuredClone(project);
  validateProject(p);
  syncLinkedArtwork(p);
  const a = copySelection(p, ids);
  for (const n of [...a.groups, ...a.objects].filter((n) =>
    a.roots.includes(n.id),
  )) {
    const original = nodes(p).find((x) => x.id === n.id);
    n.parentId = null;
    if (!isVisible(p, original)) n.visible = false;
    if (isLocked(p, original)) n.locked = true;
    if (ancestors(p, original).some((g) => g.sequenceLocked))
      n.sequenceLocked = true;
  }
  if (isManualOrder(p))
    a.order = sewingIds(p).filter((id) => a.objects.some((o) => o.id === id));
  checkLinks(a, p);
  return validateArtwork(a);
}
export function artworkBounds(a) {
  return bounds(a.objects.flatMap(pointsOf));
}
export function insertArtwork(project, raw, center = { x: 0, y: 0 }) {
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y))
    throw Error("Invalid insertion position.");
  const a = validateArtwork(raw),
    draft = structuredClone(project),
    used = new Set(
      nodes(draft).flatMap((n) => [
        n.id,
        ...(n.operations || []).map((op) => op.id),
      ]),
    );
  for (const id of Object.keys(draft.referenceAssets || {})) used.add(id);
  const fresh = () => {
    let id;
    do {
      id = uid();
    } while (used.has(id));
    used.add(id);
    return id;
  };
  const map = new Map([...a.groups, ...a.objects].map((n) => [n.id, fresh()])),
    assetMap = new Map();
  for (const [id, asset] of Object.entries(a.referenceAssets || {})) {
    const assets = (draft.referenceAssets ||= {}),
      existing = Object.keys(assets).find(
        (key) => assets[key].data === asset.data,
      ),
      next = existing || fresh();
    assets[next] = structuredClone(asset);
    assetMap.set(id, next);
  }
  const b = artworkBounds(a),
    dx = center.x - (b.minX + b.maxX) / 2,
    dy = center.y - (b.minY + b.maxY) / 2;
  for (const n of [...a.groups, ...a.objects]) {
    n.id = map.get(n.id);
    n.parentId = map.get(n.parentId) || null;
    if (n.svgFillId) n.svgFillId = map.get(n.svgFillId);
    if (n.constructionArtworkIds)
      n.constructionArtworkIds = n.constructionArtworkIds.map((id) =>
        map.get(id),
      );
    if (n.linkedGeometry)
      n.linkedGeometry.sourceId = map.get(n.linkedGeometry.sourceId);
    if (n.reference) n.reference.assetId = assetMap.get(n.reference.assetId);
    for (const op of n.operations || []) op.id = fresh();
  }
  for (const o of a.objects) {
    translate(o, dx, dy);
    // Both source and instance move. Conjugate its relative transform, avoiding a double translation.
    if (o.linkedGeometry)
      o.linkedGeometry.frame = compose(o.linkedGeometry.frame, [
        1,
        0,
        0,
        1,
        -dx,
        -dy,
      ]);
  }
  const order = sewingIds(draft);
  draft.objects.push(...a.objects);
  (draft.groups ||= []).push(...a.groups);
  const insertedOrder = a.order
    ? a.order.map((id) => map.get(id))
    : a.objects.filter((o) => o.type !== "reference").map((o) => o.id);
  if (a.order || isManualOrder(draft))
    draft.sequencing = {
      mode: "manual",
      origin: "sequence",
      order: [...order, ...insertedOrder],
    };
  syncLinkedArtwork(draft);
  validateProject(draft);
  Object.assign(project, draft);
  return {
    roots: a.roots.map((id) => map.get(id)),
    objects: a.objects.map((o) => o.id),
    map,
  };
}
