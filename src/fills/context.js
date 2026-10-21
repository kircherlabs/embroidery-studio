import { bounds } from "../model.js";
import { localAxis } from "../transform-box.js";
import { fillPolygons, points, inside, safeConnector } from "../geometry.js";
import { validateFillSettings } from "./schema.js";
import { offsetRings } from "../operations.js";
export const FILL_DEFAULTS = {
  tatami: {
    texture: "quarter",
    period: 8,
    variation: 0.1,
    amplitude: 0.5,
    step: 0.17,
    edgeOptimize: false,
    edgeMinimum: 0.6,
  },
  contour: { direction: "outside-in" },
  meander: { style: "classic", pitch: 3, curviness: 0.7, variation: 0.12 },
  cross: { size: 2, pitch: 2 },
  emboss: {
    motif: "diamonds",
    scale: 4,
    repeat: 6,
    strength: 0.5,
    motifAngle: 0,
    phaseX: 0,
    phaseY: 0,
  },
  ripple: { ratio: 1, centerX: 0, centerY: 0, clockwise: false },
  spiral: { ratio: 1, centerX: 0, centerY: 0, clockwise: false },
};
export function makeFillSettings(method, o, changes = {}) {
  const b = bounds(o.rings.flat()),
    [x, y] = localAxis(o),
    axis = (Math.atan2(y, x) * 180) / Math.PI;
  const s = {
    version: 1,
    method,
    anchor: "object",
    frame: [x, y, -y, x, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
    angle: (o.angle || 0) - axis,
    seed: 1,
    inset: 0,
    ...FILL_DEFAULTS[method],
    ...changes,
  };
  if (s.anchor === "global") {
    if (!Object.hasOwn(changes, "frame")) s.frame = [1, 0, 0, 1, 0, 0];
    if (!Object.hasOwn(changes, "angle")) s.angle = o.angle || 0;
  }
  s.frame = s.frame.map((n) => (Object.is(n, -0) ? 0 : n));
  return validateFillSettings(s);
}
export function fillCoordinates(settings) {
  const m = settings.frame || [1, 0, 0, 1, 0, 0],
    l = Math.hypot(m[0], m[1]),
    hand = m[0] * m[3] - m[1] * m[2] < 0 ? -1 : 1;
  const x = m[0] / l,
    y = m[1] / l,
    a = ((settings.angle || 0) * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  // Orthonormalize: transforms carry placement/orientation, never scale mm density.
  const u = { x: x * c - hand * y * s, y: y * c + hand * x * s },
    v = { x: -x * s - hand * y * c, y: -y * s + hand * x * c };
  return {
    world: (p) => ({
      x: m[4] + u.x * p.x + v.x * p.y,
      y: m[5] + u.y * p.x + v.y * p.y,
    }),
    local: (p) => ({
      x: (p.x - m[4]) * u.x + (p.y - m[5]) * u.y,
      y: (p.x - m[4]) * v.x + (p.y - m[5]) * v.y,
    }),
    u,
    v,
  };
}
export function fillBudget({ steps = 5000000, points = 200000 } = {}) {
  let work = 0,
    count = 0;
  return {
    step(n = 1) {
      if ((work += n) > steps)
        throw Error(
          "Fill calculation budget exceeded. Increase pattern spacing or simplify the outline.",
        );
    },
    add(n = 1) {
      if ((count += n) > points)
        throw Error(
          "Fill exceeds its point budget. Increase spacing or pattern scale.",
        );
    },
    get count() {
      return count;
    },
  };
}
export function fillContext(o, helpers = {}, budget = fillBudget()) {
  const s = validateFillSettings(o.fillSettings),
    cfg = {
      ...FILL_DEFAULTS[s.method],
      angle: 0,
      seed: 1,
      inset: 0,
      anchor: "object",
      ...s,
    },
    coordinates = fillCoordinates(cfg),
    source =
      cfg.inset > 0
        ? { ...o, rings: offsetRings(o, -cfg.inset), fillRule: "nonzero" }
        : o,
    polygons = fillPolygons(source.rings, source.fillRule);
  if (polygons === null || !polygons.length)
    throw Error(
      "This fill needs a valid closed region. Resolve overlapping contours or close the artwork.",
    );
  const rings = polygons.flatMap((poly) => poly.map(points)),
    localRings = rings.map((r) => r.map(coordinates.local));
  return {
    o,
    cfg,
    polygons,
    rings,
    localRings,
    box: bounds(localRings.flat()),
    ...coordinates,
    budget,
    helpers,
    inside: (p) => inside(p, localRings, "nonzero"),
    safe: (a, b) => safeConnector(a, b, localRings, 0, [], "nonzero"),
  };
}
