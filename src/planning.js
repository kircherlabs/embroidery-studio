import { bounds, objectBounds } from "./model.js";
import {
  clipping,
  fillPolygons,
  points,
  polygonArea,
  intersectsBounds,
  distance,
  nearbyBoundaries,
} from "./geometry.js";
export const PLANNING_DEFAULTS = {
  optimizeColors: true,
  smallDetail: 0.3,
  skipSvgOutlines: true,
};
export const planningOptions = (p) => ({ ...PLANNING_DEFAULTS, ...p.planning });
const blocks = (units) =>
  units.reduce(
    (n, u, i) => n + (i === 0 || u.color !== units[i - 1].color ? 1 : 0),
    0,
  );
const equalRing = (a, b) =>
  a.length === b.length &&
  a.every(
    (p, i) => Math.abs(p.x - b[i].x) < 1e-7 && Math.abs(p.y - b[i].y) < 1e-7,
  );
function matchingOutline(o, objects) {
  if (
    o.type !== "run" ||
    !o.closed ||
    !(o.svgSource || /^SVG outline /.test(o.name))
  )
    return new Set();
  const index = objects.indexOf(o),
    fill = objects.find((f) => f.id === o.svgFillId) || objects[index - 1];
  if (
    !fill ||
    fill.visible === false ||
    fill.type !== "fill" ||
    fill.color.toLowerCase() !== o.color.toLowerCase()
  )
    return new Set();
  if (o.svgStrokeWidth !== undefined && o.svgStrokeWidth > 0.15)
    return new Set();
  return new Set(
    o.rings.filter((r) => fill.rings.some((f) => equalRing(r, f))),
  );
}
export function preparePlan(project) {
  const options = planningOptions(project),
    units = [],
    diagnostics = {
      sourceObjects: project.objects.length,
      skippedDetails: 0,
      skippedOutlines: 0,
      topologyFallbacks: 0,
      overlapPairs: 0,
      skippedUnderlay: 0,
      detailExamples: [],
    };
  const detail = (o, b) => {
    diagnostics.skippedDetails++;
    if (diagnostics.detailExamples.length < 30)
      diagnostics.detailExamples.push({ objectId: o.id, bounds: b });
  };
  for (const [index, o] of project.objects.entries()) {
    if (o.visible === false) continue;
    const duplicateRings = options.skipSvgOutlines
      ? matchingOutline(o, project.objects)
      : new Set();
    if (duplicateRings.size) {
      diagnostics.skippedOutlines++;
      diagnostics.skippedOutlineContours =
        (diagnostics.skippedOutlineContours || 0) + duplicateRings.size;
    }
    if (o.type === "fill") {
      const boxes = o.rings.map(bounds);
      const rings = o.rings.filter((r, i) => {
        const b = boxes[i];
        if (
          options.smallDetail > 0 &&
          Math.hypot(b.width, b.height) < options.smallDetail &&
          !boxes.some(
            (other, j) => i !== j && intersectsBounds(b, other, 0.001),
          )
        ) {
          detail(o, b);
          return false;
        }
        return true;
      });
      if (!rings.length) continue;
      let polygons;
      try {
        polygons = fillPolygons(rings, o.fillRule);
      } catch {
        polygons = null;
      }
      if (polygons === null) {
        diagnostics.topologyFallbacks++;
        units.push({
          ...o,
          rings,
          index,
          bounds: bounds(rings.flat()),
          barrier: true,
        });
        continue;
      }
      for (const poly of polygons) {
        const b = bounds(poly[0].map(([x, y]) => ({ x, y }))),
          size = Math.hypot(b.width, b.height);
        // Only independent filled islands are filtered. Counters/holes remain in
        // their parent polygon regardless of size; source artwork is untouched.
        if (options.smallDetail > 0 && size < options.smallDetail) {
          detail(o, b);
          continue;
        }
        const area = polygonArea([poly]),
          underlay =
            o.underlay && Math.min(b.width, b.height) >= 1 && area >= 1.5;
        if (o.underlay && !underlay) diagnostics.skippedUnderlay++;
        units.push({
          ...o,
          index,
          rings: poly.map(points),
          fillRule: "nonzero",
          polygon: [poly],
          bounds: b,
          underlay,
        });
      }
    } else if (o.type === "run") {
      for (const r of o.rings) {
        if (duplicateRings.has(r)) continue;
        const b = bounds(r);
        if (
          o.closed &&
          options.smallDetail > 0 &&
          Math.hypot(b.width, b.height) < options.smallDetail
        ) {
          detail(o, b);
          continue;
        }
        units.push({ ...o, index, rings: [r], bounds: b });
      }
    } else if (o.type !== "manual" || o.commands.length)
      units.push({ ...o, index, bounds: objectBounds(o), barrier: true });
  }
  diagnostics.originalColorBlocks = blocks(units);
  diagnostics.sourceColorBlocks = blocks(
    project.objects.filter((o) => o.visible !== false),
  );
  diagnostics.plannedRegions = units.length;
  if (units.length > 2000) diagnostics.optimizationLimited = true;
  if (
    !options.optimizeColors ||
    units.length < 2 ||
    diagnostics.optimizationLimited
  )
    return { units, diagnostics, options };
  // Sequence whole source objects. A source may contain several disconnected
  // regions, but its regions must not be interleaved with unrelated objects.
  const byId = new Map();
  for (const u of units) {
    if (!byId.has(u.id)) byId.set(u.id, { ...u, units: [] });
    byId.get(u.id).units.push(u);
  }
  const groups = [...byId.values()],
    groupIndex = new Map(groups.map((g, i) => [g.id, i]));
  const outgoing = groups.map(() => new Set()),
    incoming = groups.map(() => 0);
  for (let i = 0; i < units.length; i++)
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i],
        b = units[j];
      if (a.id === b.id) continue;
      let dependent =
        a.barrier || b.barrier || a.sequenceLocked || b.sequenceLocked;
      // Include pull compensation and machine rounding in the painted footprint.
      // Touching differently colored edges still require their original layering.
      const margin =
        a.color !== b.color
          ? (a.compensation || 0) + (b.compensation || 0) + 0.1
          : 0;
      if (
        !dependent &&
        intersectsBounds(a.bounds, b.bounds, Math.max(0.05, margin))
      ) {
        if (a.polygon && b.polygon) {
          try {
            dependent =
              polygonArea(clipping.intersection(a.polygon, b.polygon)) > 1e-7 ||
              nearbyBoundaries(a.polygon, b.polygon, margin) ||
              nearbyBoundaries(b.polygon, a.polygon, margin);
          } catch {
            dependent = true;
          }
        } else dependent = true; // Preserve stroke/satin construction conservatively.
        if (dependent) diagnostics.overlapPairs++;
      }
      if (dependent) {
        const gi = groupIndex.get(a.id),
          gj = groupIndex.get(b.id);
        if (!outgoing[gi].has(gj)) {
          outgoing[gi].add(gj);
          incoming[gj]++;
        }
      }
    }
  const ready = new Set(incoming.flatMap((n, i) => (n ? [] : [i]))),
    order = [];
  let color = null,
    last = { x: 0, y: 0 };
  while (ready.size) {
    let candidates = [...ready].filter((i) => groups[i].color === color);
    if (!candidates.length) {
      const first = [...ready].sort(
        (a, b) => groups[a].index - groups[b].index,
      )[0];
      color = groups[first].color;
      candidates = [...ready].filter((i) => groups[i].color === color);
    }
    const entry = (u) => {
      const b = u.bounds;
      return {
        x: Math.max(b.minX, Math.min(last.x, b.maxX)),
        y: Math.max(b.minY, Math.min(last.y, b.maxY)),
      };
    };
    const nearest = (i) =>
      groups[i].units
        .map(entry)
        .sort((a, b) => distance(last, a) - distance(last, b))[0];
    candidates.sort(
      (a, b) =>
        distance(last, nearest(a)) - distance(last, nearest(b)) || a - b,
    );
    const i = candidates[0];
    ready.delete(i);
    const remaining = [...groups[i].units];
    while (remaining.length) {
      remaining.sort(
        (a, b) => distance(last, entry(a)) - distance(last, entry(b)),
      );
      const u = remaining.shift();
      order.push(u);
      last = entry(u);
    }
    for (const j of outgoing[i]) if (--incoming[j] === 0) ready.add(j);
  }
  // A heuristic may trade one future change for another. Never accept a result
  // with more color blocks than the stable source order.
  return {
    units: blocks(order) <= blocks(units) ? order : units,
    diagnostics,
    options,
  };
}
