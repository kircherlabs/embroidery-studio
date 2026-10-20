import { getMachine } from "./equipment.js";
import { object, uid, objectBounds } from "./model.js";
import { clipping, fillPolygons } from "./geometry.js";
import { shapeRings, detachSource, roundArtwork } from "./smart-geometry.js";
import { makeOperation, applique, offsetRings } from "./operations.js";
import { alignmentUnits } from "./arrange.js";
import {
  leaves,
  selectionBounds,
  transformSelection,
  isLocked,
  alignSelection,
} from "./hierarchy.js";
export function smartShape(kind, width = 30, height = 20, options = {}) {
  const shape = {
    kind,
    width,
    height,
    radius: kind === "rect" ? 2 : 0,
    sides: 5,
    innerRatio: 0.45,
    diameter: 3,
    band: 1.5,
    frame: [1, 0, 0, 1, 0, 0],
    ...options,
  };
  const o = object(
    kind === "eyelet"
      ? "Eyelet reinforcement"
      : kind === "star"
        ? "Star"
        : kind === "regular"
          ? "Regular polygon"
          : kind === "ellipse"
            ? "Ellipse"
            : "Rounded rectangle",
    shapeRings(shape),
    { shape, fillRule: "evenodd", closed: true },
  );
  if (kind === "eyelet")
    o.operations = [
      {
        ...makeOperation("border", o),
        width: shape.band,
        offset: -shape.band / 2,
        compensation: 0,
        outerOnly: true,
      },
    ];
  return o;
}
export function combineArtwork(p, objects, method) {
  if (objects.some((o) => o.satinRails))
    throw Error(
      "Use rail editing for manual satin columns. Boolean merging would discard their paired boundaries.",
    );
  if (objects.length < 2 || objects.some((o) => o.type !== "fill" && !o.closed))
    throw Error("Select at least two closed vector regions.");
  const polys = objects.map((o) => fillPolygons(o.rings, o.fillRule));
  if (polys.some((r) => !r?.length))
    throw Error("Resolve invalid or empty contours before combining.");
  const result = clipping[method](...polys);
  if (!result.length)
    throw Error("The operation produces an empty region. Nothing was changed.");
  const first = objects[0];
  first.rings = result.flatMap((poly) =>
    poly.map((r) => r.slice(0, -1).map(([x, y]) => ({ x, y }))),
  );
  first.type = "fill";
  first.closed = true;
  first.fillRule = "evenodd";
  detachSource(first);
  first.name =
    {
      union: "Union",
      difference: "Subtract",
      intersection: "Intersection",
      xor: "Difference",
    }[method] +
    " · " +
    first.name.slice(0, 160);
  const remove = new Set(objects.slice(1).map((o) => o.id));
  p.objects = p.objects.filter((o) => !remove.has(o.id));
  return first.id;
}
export function cutEyelet(p, eyelet, targets) {
  if (targets.some((o) => o.satinRails))
    throw Error(
      "Manual satin defines its opening through two rails. Edit those rails instead of subtracting an unrelated hole.",
    );
  if (eyelet.shape?.kind !== "eyelet")
    throw Error("Select an eyelet reinforcement first.");
  const hole = object("Hole", [eyelet.rings[1]], { fillRule: "evenodd" });
  let count = 0;
  for (const o of targets)
    if (o !== eyelet && !isLocked(p, o) && (o.type === "fill" || o.closed)) {
      const a = fillPolygons(o.rings, o.fillRule),
        b = fillPolygons(hole.rings, "evenodd");
      if (!a || !b) throw Error("Resolve overlapping contours before cutting.");
      const result = clipping.difference(a, b);
      if (!result.length)
        throw Error(
          "The hole would remove an entire object. Reduce its diameter.",
        );
      o.rings = result.flatMap((poly) =>
        poly.map((r) => r.slice(0, -1).map(([x, y]) => ({ x, y }))),
      );
      o.fillRule = "evenodd";
      detachSource(o);
      count++;
    }
  if (!count) throw Error("Choose a closed target for the geometric opening.");
}
export function applyRecipe(o, recipe) {
  if (o.type !== "fill" && !o.closed)
    throw Error("Construction recipes require closed artwork.");
  o.operations =
    recipe === "applique"
      ? applique(o)
      : ["tackdown", ...(recipe === "keychain" ? ["stop"] : []), "border"].map(
          (type) => makeOperation(type, o),
        );
  for (const op of o.operations)
    if (["placement", "tackdown", "border"].includes(op.type))
      op.outerOnly = true;
}
export function productTemplate(kind, width, height, radius, border) {
  const body = smartShape(
    kind === "badge" ? "ellipse" : "rect",
    width,
    height,
    { radius },
  );
  body.name =
    kind === "keychain"
      ? "Keychain body"
      : kind === "badge"
        ? "Patch body"
        : "Appliqué body";
  applyRecipe(
    body,
    kind === "applique"
      ? "applique"
      : kind === "keychain"
        ? "keychain"
        : "patch",
  );
  for (const op of body.operations) if (op.type === "border") op.width = border;
  const id = uid(),
    items = [body];
  body.parentId = id;
  if (kind === "keychain") {
    const eye = smartShape("eyelet", 6, 6, {
      frame: [1, 0, 0, 1, -width / 2 + 7, 0],
    });
    eye.parentId = id;
    items.push(eye);
  }
  items.groups = [
    {
      id,
      name:
        kind === "keychain"
          ? "Keychain template"
          : kind === "badge"
            ? "Patch template"
            : "Appliqué template",
      kind: "group",
      visible: true,
      parentId: null,
    },
  ];
  return items;
}
export function alignReference(p, ids, reference, action) {
  const units = alignmentUnits(p, ids),
    all = units.flat();
  if (!all.length) return;
  const ref =
    reference === "selection"
      ? selectionBounds(all)
      : reference === "hoop"
        ? { minX: -50, maxX: 50, minY: -50, maxY: 50, width: 100, height: 100 }
        : selectionBounds(leaves(p, [reference]));
  if (reference === "hoop") {
    // Machine dimensions are supplied by callers through p's profile below.
    const { width: w, height: h } = getMachine(p);
    Object.assign(ref, {
      minX: -w / 2,
      maxX: w / 2,
      minY: -h / 2,
      maxY: h / 2,
      width: w,
      height: h,
    });
  }
  const anchored =
    reference !== "selection" && reference !== "hoop"
      ? new Set(leaves(p, [reference]).map((o) => o.id))
      : new Set();
  const moving = (reference === "hoop" ? [all] : units).filter(
    (items) => !items.some((o) => anchored.has(o.id)),
  );
  for (const items of moving) {
    const b = selectionBounds(items);
    let dx = 0,
      dy = 0;
    if (action === "left") dx = ref.minX - b.minX;
    if (action === "right") dx = ref.maxX - b.maxX;
    if (action === "top") dy = ref.minY - b.minY;
    if (action === "bottom") dy = ref.maxY - b.maxY;
    if (action === "center-x" || action === "center")
      dx = (ref.minX + ref.maxX - b.minX - b.maxX) / 2;
    if (action === "center-y" || action === "center")
      dy = (ref.minY + ref.maxY - b.minY - b.maxY) / 2;
    const size =
      action === "match-width"
        ? "width"
        : action === "match-height"
          ? "height"
          : null;
    transformSelection(items, {
      dx,
      dy,
      sx: size === "width" && b.width ? ref.width / b.width : 1,
      sy: size === "height" && b.height ? ref.height / b.height : 1,
    });
  }
}
export function contourArtwork(o, delta) {
  if (o.satinRails)
    throw Error(
      "Adjust the rail width in Embroidery, or move the individual rails with Node.",
    );
  const rings = offsetRings(o, delta);
  if (!rings.length) throw Error("This inset collapses the region.");
  o.rings = rings;
  o.fillRule = "nonzero";
  detachSource(o);
}

export function distributeArtwork(p, ids, action) {
  const units = alignmentUnits(p, ids),
    before = units.map((items) => selectionBounds(items));
  const proxies = before.map((b) => ({
    type: "run",
    rings: [
      [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.maxY },
      ],
    ],
  }));
  alignSelection(proxies, action);
  proxies.forEach((o, i) => {
    const b = objectBounds(o);
    transformSelection(units[i], {
      dx: b.minX - before[i].minX,
      dy: b.minY - before[i].minY,
    });
  });
}

export function roundChecked(o, radius, vertices = null) {
  const topology = (rings) => {
    const polygons = fillPolygons(rings, o.fillRule);
    if (!polygons) throw Error("Resolve overlapping contours before rounding.");
    return [polygons.length, polygons.reduce((n, p) => n + p.length - 1, 0)];
  };
  const before = o.type === "fill" || o.closed ? topology(o.rings) : null;
  roundArtwork(o, radius, vertices);
  if (before) {
    const after = topology(o.rings);
    if (before[0] !== after[0] || before[1] !== after[1])
      throw Error(
        "This radius changes islands or counters. Reduce the radius or round individual vertices.",
      );
  }
}
