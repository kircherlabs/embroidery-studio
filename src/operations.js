import { uid, objectBounds } from "./model.js";
import { fillPolygons } from "./geometry.js";
import Clipper from "../vendor/clipper.js";

export const OPERATION_TYPES = {
  fill: "Tatami fill",
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
  trim: "Manual trim",
};
export const isSewing = (op) => !["stop", "trim"].includes(op.type);
export function propertyApplies(type, key) {
  const fill = type === "fill",
    satin = ["satin", "border"].includes(type),
    path = !["fill", "stop", "trim", "manual"].includes(type),
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
  if (key === "reverse" || key === "startIndex") return path;
  if (key === "offset") return outline;
  if (key === "closed") return path && !outline;
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
];
export function defaultOperation(o) {
  return {
    id: "base",
    name: OPERATION_TYPES[o.type] || "Stitches",
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
  };
  if (type !== "fill" && type !== "satin") op.underlay = false;
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
    rings = offsetRings(o, op.offset || 0);
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
    rings,
    type,
    closed,
    operationId: op.id,
    operationName: op.name,
    technique: op.type,
    runStyle:
      op.type === "bean" ? "bean" : op.type === "triple" ? "triple" : "single",
    operationWarning,
    bounds: objectBounds({ ...o, rings }),
  };
}
