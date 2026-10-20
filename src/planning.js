import { sewingThreadKey } from "./thread-records.js";
import { bounds, objectBounds } from "./model.js";
import { resolvedLinkedProject } from "./linked-artwork.js";
import { isVisible, ancestors } from "./hierarchy.js";
import { operationsOf, operationObject, isSewing } from "./operations.js";
import { isManualOrder, sewingIds } from "./sequencing.js";
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
    (n, u, i) =>
      n +
      (i === 0 || sewingThreadKey(u) !== sewingThreadKey(units[i - 1]) ? 1 : 0),
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
    sewingThreadKey(fill) !== sewingThreadKey(o)
  )
    return new Set();
  if (o.svgStrokeWidth !== undefined && o.svgStrokeWidth > 0.15)
    return new Set();
  return new Set(
    o.rings.filter((r) => fill.rings.some((f) => equalRing(r, f))),
  );
}
function prepareArtwork(project) {
  const options = planningOptions(project),
    units = [],
    diagnostics = {
      sourceObjects: project.objects.filter((o) => o.type !== "reference")
        .length,
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
    if (o.visible === false || o.type === "reference") continue;
    if (
      o.satinRails &&
      (!o.operationId || (o.satinColumn && o.columnMode === "rails"))
    ) {
      units.push({ ...o, index, bounds: objectBounds(o) });
      continue;
    }
    const duplicateRings = options.skipSvgOutlines
      ? matchingOutline(o, project.artworkReferences || project.objects)
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
    let candidates = [...ready].filter(
      (i) => sewingThreadKey(groups[i]) === color,
    );
    if (!candidates.length) {
      const first = [...ready].sort(
        (a, b) => groups[a].index - groups[b].index,
      )[0];
      color = sewingThreadKey(groups[first]);
      candidates = [...ready].filter(
        (i) => sewingThreadKey(groups[i]) === color,
      );
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

function prepareBasicPlan(project) {
  if (isManualOrder(project)) {
    const byId = new Map(project.objects.map((o) => [o.id, o]));
    project = {
      ...project,
      artworkReferences: project.objects.filter(
        (o) => o.type !== "reference" && isVisible(project, o),
      ),
      objects: sewingIds(project).map((id) => byId.get(id)),
      planning: { ...project.planning, optimizeColors: false },
    };
  }
  const objects = project.objects
    .filter((o) => o.type !== "reference" && isVisible(project, o))
    .map((o) => ({
      ...o,
      sequenceLocked:
        o.sequenceLocked || ancestors(project, o).some((g) => g.sequenceLocked),
    }));
  if (!objects.some((o) => o.operations)) {
    const prepared = prepareArtwork({ ...project, objects });
    prepared.diagnostics.sourceObjects = project.objects.filter(
      (o) => o.type !== "reference",
    ).length;
    return prepared;
  }
  // Plan WHOLE objects first. A multi-operation object's footprint is a source
  // stroke proxy, conservatively preserving any overlapping construction.
  // Expansion happens afterwards, so optimization cannot interleave its steps.
  const proxy = objects
    .filter(
      (o) => !o.operations || o.operations.some((op) => op.enabled !== false),
    )
    .map((o) =>
      o.operations
        ? {
            ...o,
            type: o.operations.some(
              (op) => op.enabled !== false && isSewing(op),
            )
              ? "run"
              : "command",
            closed: false,
            underlay: false,
            physicalThread: operationsOf(o).find(
              (op) => op.enabled !== false && isSewing(op),
            )?.physicalThread,
            color:
              operationsOf(o).find((op) => op.enabled !== false && isSewing(op))
                ?.color || o.color,
          }
        : o,
    );
  const references = objects.map((o) => {
    if (!o.operations) return o;
    const fill = o.operations.find(
      (op) => op.enabled !== false && ["fill", "column"].includes(op.type),
    );
    return {
      ...o,
      type: fill ? "fill" : "run",
      color: fill?.color || o.color,
      physicalThread: fill?.physicalThread || o.physicalThread,
    };
  });
  const prepared = prepareArtwork({
      ...project,
      objects: proxy,
      artworkReferences: references,
    }),
    units = [],
    seen = new Set();
  const source = new Map(objects.map((o) => [o.id, o]));
  for (const u of prepared.units) {
    const o = source.get(u.id);
    if (!o.operations) {
      units.push(u);
      continue;
    }
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    for (const op of operationsOf(o).filter((op) => op.enabled !== false)) {
      if (!isSewing(op)) {
        units.push({
          ...o,
          type: "command",
          command: op.type,
          operationId: op.id,
          operationName: op.name,
          bounds: objectBounds(o),
        });
        continue;
      }
      let view;
      try {
        view = operationObject(o, op);
      } catch (e) {
        (prepared.diagnostics.operationIssues ||= []).push({
          code: "invalid-operation",
          severity: "error",
          objectId: o.id,
          objectName: o.name,
          operationId: op.id,
          operationName: op.name,
          message: e.message,
          action:
            "Repair or close the source geometry, choose a compatible method, or disable this step.",
        });
        continue;
      }
      const part = prepareArtwork({
        ...project,
        objects: [view],
        planning: {
          ...project.planning,
          optimizeColors: false,
          skipSvgOutlines: false,
        },
      });
      for (const key of [
        "skippedDetails",
        "skippedOutlines",
        "topologyFallbacks",
        "skippedUnderlay",
        "skippedOutlineContours",
      ])
        prepared.diagnostics[key] =
          (prepared.diagnostics[key] || 0) + (part.diagnostics[key] || 0);
      prepared.diagnostics.detailExamples = [
        ...prepared.diagnostics.detailExamples,
        ...part.diagnostics.detailExamples,
      ].slice(0, 30);
      if (view.operationWarning)
        (prepared.diagnostics.operationWarnings ||= []).push(
          view.operationWarning,
        );
      units.push(...part.units);
    }
  }
  // First colors alone do not predict transitions across multicolor stacks.
  // Compare complete expanded blocks and retain safe source object order if
  // batching would introduce more operator thread changes.
  const grouped = new Map();
  for (const u of units) {
    if (!grouped.has(u.id)) grouped.set(u.id, []);
    grouped.get(u.id).push(u);
  }
  const baseline = objects.flatMap((o) => grouped.get(o.id) || []),
    sewing = (list) => list.filter((o) => o.type !== "command");
  prepared.units =
    blocks(sewing(units)) > blocks(sewing(baseline)) ? baseline : units;
  prepared.diagnostics.operationColorFallback = prepared.units === baseline;
  prepared.diagnostics.sourceColorBlocks = blocks(sewing(baseline));
  prepared.diagnostics.plannedRegions = units.filter(
    (o) => o.type !== "command",
  ).length;
  prepared.diagnostics.sourceObjects = project.objects.filter(
    (o) => o.type !== "reference",
  ).length;
  return prepared;
}

// Explicit construction dependencies intentionally span one shared boundary.
// Ordinary artwork still completes object by object; only the boundary has a
// preparation and finishing phase, surrounding its linked decorative objects.
export function preparePlan(project) {
  project = resolvedLinkedProject(project);
  const result = prepareBasicPlan(project);
  result.project = project;
  const boundaries = project.objects.filter(
    (o) => o.constructionArtworkIds?.length && isVisible(project, o),
  );
  if (!boundaries.length) return result;
  let units = result.units;
  const claimed = new Set();
  for (const boundary of boundaries) {
    const ids = new Set(
      boundary.constructionArtworkIds.filter((id) =>
        project.objects.some((o) => o.id === id),
      ),
    );
    if ([boundary.id, ...ids].some((id) => claimed.has(id)))
      throw Error(
        "Overlapping construction links: an artwork object may belong to only one fabric boundary.",
      );
    [boundary.id, ...ids].forEach((id) => claimed.add(id));
    const boundaryUnits = units.filter((u) => u.id === boundary.id);
    if (!boundaryUnits.length) continue;
    const stages = new Map(
      operationsOf(boundary).map((op) => [
        op.id,
        op.constructionStage || (op.type === "border" ? "finish" : "prepare"),
      ]),
    );
    const inner = prepareBasicPlan({
      ...project,
      objects: project.objects.filter((o) => ids.has(o.id)),
    });
    const sequence = [
      ...boundaryUnits.filter((u) => stages.get(u.operationId) !== "finish"),
      ...inner.units,
      ...boundaryUnits.filter((u) => stages.get(u.operationId) === "finish"),
    ];
    const at = units.findIndex((u) => u.id === boundary.id || ids.has(u.id));
    const before = units
      .slice(0, at)
      .filter((u) => u.id !== boundary.id && !ids.has(u.id));
    const after = units
      .slice(at)
      .filter((u) => u.id !== boundary.id && !ids.has(u.id));
    const next = [...before, ...sequence, ...after];
    for (const pin of project.objects.filter(
      (o) =>
        !ids.has(o.id) &&
        o.id !== boundary.id &&
        (o.sequenceLocked ||
          ancestors(project, o).some((g) => g.sequenceLocked)),
    )) {
      const oldAt = units.findIndex((u) => u.id === pin.id),
        newAt = next.findIndex((u) => u.id === pin.id);
      if (oldAt < 0 || newAt < 0) continue;
      const oldBefore = new Set(units.slice(0, oldAt).map((u) => u.id)),
        newBefore = new Set(next.slice(0, newAt).map((u) => u.id));
      if (
        oldBefore.size !== newBefore.size ||
        [...oldBefore].some((id) => !newBefore.has(id))
      )
        throw Error(
          `Patch dependencies conflict with pinned sewing object “${pin.name}”. Review manual order or unpin deliberately.`,
        );
    }
    units = next;
  }
  result.units = units;
  result.diagnostics.constructionBoundaries = boundaries.length;
  return result;
}
