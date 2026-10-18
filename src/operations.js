import { uid, objectBounds } from "./model.js";
import { fillPolygons } from "./geometry.js";
import Clipper from "../vendor/clipper.js";

export const OPERATION_TYPES = {
  fill: "Tatami fill",
  column: "Satin column",
  marker: "Location marker",
  run: "Running stitch",
  bean: "Bean stitch",
  triple: "Triple run",
  satin: "Satin centerline",
  border: "Satin border",
  placement: "Placement outline",
  tackdown: "Tackdown outline",
  basting: "Basting outline",
  contour: "Offset outline",
  stop: "Machine stop",
  trim: "Thread trim",
};
export const isSewing = (op) => !["stop", "trim"].includes(op.type);
export const requiresClosed = (type) =>
  [
    "fill",
    "column",
    "placement",
    "tackdown",
    "basting",
    "border",
    "contour",
  ].includes(type);
export const closedArtwork = (o) =>
  o.type !== "manual" && (o.type === "fill" || o.closed === true);
export const supportsMethod = (o, type) =>
  o.type !== "manual" && (!requiresClosed(type) || closedArtwork(o));
export const CORNER_TYPES = new Set([
  "column",
  "run",
  "bean",
  "triple",
  "satin",
  "border",
  "placement",
  "tackdown",
  "basting",
  "contour",
]);
// Use the same scope for display and edits. Explicit stop/trim selection is retained.
export function operationTargets(o, state, single = false) {
  const ops = operationsOf(o);
  if (single && state.activeOperationId) {
    const selected = ops.find((op) => op.id === state.activeOperationId);
    if (selected) return [selected];
  }
  return !single && state.bulkOperations === "all"
    ? ops.filter(isSewing)
    : [ops.find(isSewing)].filter(Boolean);
}
export function effectiveOperation(o, op) {
  return {
    closed: closedArtwork(o),
    reverse: false,
    offset: 0,
    startIndex: 0,
    outerOnly: false,
    tieIn: true,
    tieOff: true,
    pattern: "quarter",
    cornerControl: false,
    minCornerStitch: 0.3,
    maxSatin: 6,
    ...o,
    ...op,
  };
}
export function propertyApplies(type, key) {
  const fill = ["fill", "column"].includes(type),
    satin = ["satin", "border"].includes(type),
    path = !["fill", "column", "stop", "trim", "manual"].includes(type),
    outline = [
      "placement",
      "tackdown",
      "basting",
      "contour",
      "border",
    ].includes(type);
  if (key === "spacing" || key === "compensation") return fill || satin;
  if (key === "underlay") return isSewing({ type }) && type !== "manual";
  if (key === "angle" || key === "pattern") return fill;
  if (key === "width") return satin;
  if (key === "length") return fill || (path && !satin);
  if (key === "cornerControl" || key === "minCornerStitch")
    return CORNER_TYPES.has(type);
  if (["maxSatin", "columnMode", "columnFallback", "satinGuides"].includes(key))
    return type === "column";
  if (key === "reverse") return path;
  if (key === "startIndex") return path && type !== "marker";
  if (key === "offset" || key === "outerOnly") return outline;
  if (key === "closed") return path && !outline && type !== "marker";
  return key === "type" || isSewing({ type });
}
const settings = [
  "color",
  "type",
  "spacing",
  "length",
  "angle",
  "width",
  "underlay",
  "compensation",
  "closed",
  "reverse",
  "tieIn",
  "tieOff",
  "offset",
  "startIndex",
  "pattern",
  "cornerControl",
  "minCornerStitch",
  "maxSatin",
  "columnMode",
  "satinGuides",
  "columnFallback",
  "outerOnly",
];
export function defaultOperation(o) {
  return {
    id: "base",
    name: OPERATION_TYPES[o.type] || "Stitches",
    closed: closedArtwork(o),
    enabled: true,
    ...Object.fromEntries(
      settings.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]),
    ),
  };
}
export const operationsOf = (o) => o.operations || [defaultOperation(o)];
export function materialize(o) {
  if (!o.operations) o.operations = [{ ...defaultOperation(o), id: uid() }];
  return o.operations;
}
export function makeOperation(type, o) {
  const op = {
    ...defaultOperation(o),
    id: uid(),
    name: OPERATION_TYPES[type],
    type,
    enabled: true,
    offset: 0,
    reverse: false,
    startIndex: 0,
    outerOnly: false,
    closed: closedArtwork(o),
  };
  if (type === "column") {
    op.columnMode = "stroke";
    op.columnFallback = "tatami";
    op.cornerControl = true;
    op.maxSatin = 6;
    op.angle = 0;
    op.compensation = 0.1;
  }
  if (type !== "fill" && type !== "column" && type !== "satin")
    op.underlay = false;
  if (["placement", "tackdown", "basting", "border", "contour"].includes(type))
    op.closed = true;
  if (
    [
      "placement",
      "tackdown",
      "basting",
      "contour",
      "run",
      "bean",
      "triple",
    ].includes(type)
  )
    op.compensation = 0;
  if (type === "placement") op.length = 2.5;
  if (type === "tackdown") {
    op.length = 2;
    op.offset = -0.4;
  }
  if (type === "basting") {
    op.length = 5;
    op.offset = 2;
  }
  if (type === "border") {
    op.width = 2.5;
    op.spacing = 0.42;
    op.underlay = true;
  }
  return op;
}
export function applique(o) {
  return ["placement", "stop", "tackdown", "stop", "border"].map((type, i) => ({
    ...makeOperation(type, o),
    name: [
      "Placement outline",
      "Position fabric",
      "Tackdown outline",
      "Trim fabric",
      "Satin finishing border",
    ][i],
  }));
}
// Normalize winding before robust integer offsets. Outer contours are positive,
// holes negative; positive offsets expand material and shrink its counters.
export function offsetRings(o, delta) {
  const polygons = fillPolygons(o.rings, o.fillRule);
  if (polygons === null)
    throw Error(
      `${o.name}: resolve overlapping contours before applying offsets or a satin border.`,
    );
  const paths = [];
  for (const polygon of polygons)
    for (const [i, ring] of polygon.entries()) {
      const path = ring.slice(0, -1).map(([x, y]) => ({
        X: Math.round(x * 1000),
        Y: Math.round(y * 1000),
      }));
      if (Clipper.Clipper.Orientation(path) !== (i === 0)) path.reverse();
      if (path.length >= 3) paths.push(path);
    }
  const offset = new Clipper.ClipperOffset(2, 0.01 * 1000),
    result = [];
  offset.AddPaths(
    paths,
    Clipper.JoinType.jtRound,
    Clipper.EndType.etClosedPolygon,
  );
  offset.Execute(result, delta * 1000);
  return result.map((r) => r.map((p) => ({ x: p.X / 1000, y: p.Y / 1000 })));
}
export function operationObject(o, op) {
  if (!supportsMethod(o, op.type))
    throw Error(
      `${o.name}: ${OPERATION_TYPES[op.type]} requires closed artwork.`,
    );
  let rings = o.rings,
    type = op.type,
    closed = op.closed ?? o.closed,
    operationWarning = null;
  if (
    ["placement", "tackdown", "basting", "contour", "border"].includes(type)
  ) {
    if (!(o.type === "fill" || o.closed))
      throw Error(
        `${o.name}: ${OPERATION_TYPES[type]} requires closed artwork.`,
      );
    rings = offsetRings(
      o.shape?.kind === "eyelet" && type === "border"
        ? { ...o, rings: [o.rings[0]] }
        : o,
      op.offset || 0,
    );
    if (op.outerOnly && rings.length) {
      const polygons = fillPolygons(rings, "nonzero");
      if (polygons)
        rings = polygons.map((poly) =>
          poly[0].slice(0, -1).map(([x, y]) => ({ x, y })),
        );
    }
    closed = true;
    if (!rings.length)
      operationWarning = `${o.name} · ${op.name}: this offset collapses the region; no stitches are generated. Reduce the inset.`;
  }
  if (
    ["placement", "tackdown", "basting", "contour", "bean", "triple"].includes(
      type,
    )
  )
    type = "run";
  if (type === "border") type = "satin";
  if (type === "column") type = "fill";
  if (type === "marker") {
    const b = objectBounds(o),
      x = (b.minX + b.maxX) / 2,
      y = (b.minY + b.maxY) / 2,
      r = Math.min(0.8, o.shape?.diameter / 3 || 0.8);
    rings = [
      [
        { x: x - r, y },
        { x: x + r, y },
      ],
      [
        { x, y: y - r },
        { x, y: y + r },
      ],
    ];
    type = "run";
    closed = false;
  }
  if (op.reverse || op.startIndex)
    rings = rings.map((r) => {
      let copy = [...r];
      if (op.reverse) copy.reverse();
      if (closed && copy.length) {
        const at = Math.floor(op.startIndex || 0) % copy.length;
        copy = [...copy.slice(at), ...copy.slice(0, at)];
      }
      return copy;
    });
  return {
    ...o,
    ...op,
    id: o.id,
    name: o.name,
    rings,
    type,
    closed,
    satinColumn: op.type === "column",
    operationId: op.id,
    operationName: op.name,
    technique: op.type,
    runStyle:
      op.type === "bean" ? "bean" : op.type === "triple" ? "triple" : "single",
    operationWarning,
    bounds: objectBounds({ ...o, rings }),
  };
}
