import { objectBounds, MACHINES, uid } from "./model.js";
import {
  fillPolygons,
  clipping,
  polygonArea,
  intersectsBounds,
} from "./geometry.js";
import {
  closedArtwork,
  makeOperation,
  offsetRings,
  operationsOf,
} from "./operations.js";
import { smartShape } from "./creative.js";
import {
  selectionBounds,
  roots,
  nodeById,
  PROJECT,
  leaves,
  isLocked,
  ancestors,
} from "./hierarchy.js";

export function preflightConstruction(
  objects,
  machine = MACHINES.se700,
  border = 2.5,
  options = {},
) {
  const issues = [],
    polygonsById = new Map();
  for (const o of objects) {
    const add = (severity, code, message, action) =>
      issues.push({
        severity,
        code,
        objectId: o.id,
        objectName: o.name,
        message,
        action,
      });
    if (!closedArtwork(o)) {
      add(
        "error",
        "open",
        "Fabric construction requires a closed vector boundary.",
        "Use a closed shape, explicitly close the artwork path, or create a surrounding patch.",
      );
      continue;
    }
    const polygons = fillPolygons(o.rings, o.fillRule);
    if (!polygons?.length) {
      add(
        "error",
        "topology",
        "The contours do not define an unambiguous fabric region.",
        "Repair overlapping contours or use a separate surrounding boundary.",
      );
      continue;
    }
    polygonsById.set(o.id, polygons);
    if (polygons.length > 1)
      add(
        "warning",
        "islands",
        `${polygons.length} disconnected fabric pieces share this object.`,
        "Choose individual boundaries deliberately, or create one surrounding patch.",
      );
    if (polygons.some((p) => p.length > 1))
      add(
        "info",
        "holes",
        "This boundary contains holes or counters.",
        "Review whether the fabric should have openings; enable Outer boundary only to leave counters unfinished.",
      );
    const b = objectBounds(o);
    if (b.width < border || b.height < border)
      add(
        "warning",
        "narrow",
        "The finishing band is wider than this region's narrow dimension.",
        "Reduce border width or use a larger fabric boundary.",
      );
    try {
      if (!offsetRings(o, -border / 2).length)
        add(
          "error",
          "border-collapse",
          "The inset finishing band collapses this boundary.",
          "Reduce border width, enlarge the boundary, or construct a narrower outline manually.",
        );
      const inset = options.tackdown === false ? o.rings : offsetRings(o, -0.4);
      if (!inset.length)
        add(
          "error",
          "inset",
          "The 0.4 mm tackdown inset collapses this boundary.",
          "Enlarge the boundary or add a tackdown manually with a smaller inset.",
        );
      else if (
        options.tackdown !== false &&
        (fillPolygons(inset, "nonzero")?.length || 0) > polygons.length
      )
        add(
          "warning",
          "inset-split",
          "The tackdown inset divides a narrow neck into separate pieces.",
          "Reduce the inset or use a surrounding boundary.",
        );
    } catch {
      add(
        "error",
        "offset",
        "A reliable tackdown offset could not be generated.",
        "Repair the contours or choose a simple surrounding boundary.",
      );
    }
    if (
      b.minX < -machine.width / 2 ||
      b.maxX > machine.width / 2 ||
      b.minY < -machine.height / 2 ||
      b.maxY > machine.height / 2
    )
      add(
        "warning",
        "hoop",
        "The boundary and finishing band exceed the selected hoop.",
        "Reduce size or reposition the artwork before exporting.",
      );
  }
  let overlaps = 0;
  const candidates = objects.slice(0, 200);
  pairs: for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i],
        b = candidates[j],
        ap = polygonsById.get(a.id),
        bp = polygonsById.get(b.id);
      if (!ap || !bp || !intersectsBounds(objectBounds(a), objectBounds(b)))
        continue;
      try {
        if (polygonArea(clipping.intersection(ap, bp)) > 1e-6) overlaps++;
      } catch {
        overlaps++;
      }
      if (overlaps >= 100) break pairs;
    }
  if (overlaps)
    issues.push({
      severity: "warning",
      code: "overlapping-pieces",
      message: `${overlaps >= 100 ? "At least " : ""}${overlaps} overlapping fabric-piece pairs were found${objects.length > 200 ? " in the first 200 objects" : ""}.`,
      action:
        "Review fabric layering and shared edges deliberately. A surrounding patch preserves overlapping decorative artwork without treating it as separate fabric pieces.",
    });
  if (objects.length > 1)
    issues.push({
      severity: "warning",
      code: "many-pieces",
      message: `Direct construction will create ${objects.length} separate fabric pieces, not one shared patch.`,
      action:
        "Use a surrounding patch for decorative illustrations. Review overlaps and fabric layering before proceeding.",
    });
  return {
    issues,
    valid: !issues.some((i) => i.severity === "error"),
    complex:
      objects.length !== 1 ||
      issues.some((i) => ["islands", "topology"].includes(i.code)),
  };
}

export function constructionOperations(o, options = {}) {
  const ops = [],
    add = (type, name, stage = "prepare") => {
      const op = { ...makeOperation(type, o), name, constructionStage: stage };
      ops.push(op);
      return op;
    };
  if (options.placement !== false) add("placement", "Placement outline");
  if (options.positionStop !== false) add("stop", "Position fabric");
  if (options.tackdown !== false) add("tackdown", "Tackdown outline");
  if (options.trimStop !== false) add("stop", "Trim fabric");
  const border = add("border", "Finishing border", "finish");
  border.width = options.border ?? 2.5;
  // Place the satin band INSIDE the explicit material boundary.
  border.offset = -border.width / 2;
  border.compensation = 0;
  return ops;
}

export function patchBoundary(objects, options = {}) {
  objects = objects.filter((o) => o.type !== "reference");
  if (!objects.length) throw Error("Select artwork to surround first.");
  const b = selectionBounds(objects),
    margin = Number(options.margin ?? 3),
    kind = options.kind || "rounded",
    w = Number(options.width ?? b.width + margin * 2),
    h = Number(options.height ?? b.height + margin * 2),
    border = Number(options.border ?? 2.5);
  if (
    !["rectangle", "rounded", "circle", "oval"].includes(kind) ||
    ![w, h, margin, border, Number(options.radius ?? 4)].every(
      Number.isFinite,
    ) ||
    w < 2 ||
    h < 2 ||
    w > 500 ||
    h > 500 ||
    margin < 0 ||
    margin > 50 ||
    border < 0.5 ||
    border > 5
  )
    throw Error("Enter valid patch dimensions, margin and border width.");
  // An ellipse that only fits the bounding rectangle clips its corners. Auto-size
  // against the circumscribed rectangle, without guessing an artwork silhouette.
  const auto = options.width === undefined && options.height === undefined;
  const ew =
    kind === "circle"
      ? auto
        ? Math.hypot(w, h)
        : w
      : auto && kind === "oval"
        ? w * Math.SQRT2
        : w;
  const eh =
    kind === "circle" ? ew : auto && kind === "oval" ? h * Math.SQRT2 : h;
  const o = smartShape(
    ["circle", "oval"].includes(kind) ? "ellipse" : "rect",
    ew,
    eh,
    {
      radius: kind === "rectangle" ? 0 : Number(options.radius ?? 4),
      frame: [1, 0, 0, 1, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
    },
  );
  o.name = "Patch boundary";
  o.patchMargin = margin;
  o.color = options.color || objects[0].color;
  o.operations = constructionOperations(o, { ...options, border });
  return o;
}

export function createSurroundingPatch(project, ids, options) {
  const artwork = leaves(project, ids).filter((o) => o.type !== "reference");
  if (!artwork.length || artwork.some((o) => isLocked(project, o)))
    throw Error(
      "Select editable artwork; unlock its descendants before grouping a patch.",
    );
  if (
    artwork.some((o) => o.constructionArtworkIds?.length) ||
    project.objects.some((o) =>
      o.constructionArtworkIds?.some((id) => artwork.some((a) => a.id === id)),
    )
  )
    throw Error(
      "This artwork already belongs to a construction. Edit its existing boundary instead of nesting recipes.",
    );
  const selected = new Set(artwork.map((o) => o.id)),
    positions = artwork.map((o) => project.objects.indexOf(o));
  if (
    project.objects
      .slice(Math.min(...positions), Math.max(...positions) + 1)
      .some(
        (o) =>
          !selected.has(o.id) &&
          (o.sequenceLocked ||
            ancestors(project, o).some((g) => g.sequenceLocked)),
      )
  )
    throw Error(
      "A pinned sewing object lies between these artwork objects. Choose one contiguous fabric construction or review sequence pins before grouping it.",
    );
  const boundary = patchBoundary(artwork, options),
    groupId = uid(),
    selectedRoots = roots(project, ids);
  const check = preflightConstruction(
    [boundary],
    MACHINES[project.machine],
    options.border ?? 2.5,
    options,
  );
  if (!check.valid)
    throw Error(
      check.issues
        .filter((i) => i.severity === "error")
        .map((i) => i.message)
        .join(" "),
    );
  const rootNodes = selectedRoots.includes(PROJECT)
    ? [...(project.groups || []), ...project.objects].filter((n) => !n.parentId)
    : selectedRoots.map((id) => nodeById(project, id));
  const parents = new Set(rootNodes.map((n) => n.parentId || null));
  const group = {
    id: groupId,
    kind: "group",
    name: "Patch · artwork & boundary",
    visible: true,
    ...(parents.size === 1 && [...parents][0]
      ? { parentId: [...parents][0] }
      : {}),
  };
  rootNodes.forEach((n) => (n.parentId = groupId));
  boundary.parentId = groupId;
  boundary.constructionArtworkIds = artwork.map((o) => o.id);
  (project.groups ||= []).push(group);
  const at = Math.min(...artwork.map((o) => project.objects.indexOf(o)));
  project.objects.splice(at, 0, boundary);
  return { group, boundary };
}

export const constructionStops = (o) =>
  operationsOf(o).filter((op) => op.type === "stop" && op.enabled !== false)
    .length;

// Explicit refit follows current decorative geometry, keeping all operation IDs,
// independent settings and shared source identity. It resets orientation to hoop axes.
export function refitPatch(project, boundary, margin) {
  const artwork = project.objects.filter(
    (o) =>
      o.type !== "reference" && boundary.constructionArtworkIds?.includes(o.id),
  );
  if (!artwork.length)
    throw Error("This boundary has no remaining linked artwork to refit.");
  const shape = boundary.shape;
  if (!shape)
    throw Error(
      "This is a custom boundary. Refit a Smart shape boundary or edit its nodes directly.",
    );
  const kind =
    shape.kind === "rect"
      ? shape.radius
        ? "rounded"
        : "rectangle"
      : Math.abs(shape.width - shape.height) < 1e-6
        ? "circle"
        : "oval";
  const border =
    boundary.operations?.find((op) => op.type === "border")?.width || 2.5;
  const made = patchBoundary(artwork, {
    kind,
    margin,
    border,
    radius: shape.radius,
    color: boundary.color,
  });
  const check = preflightConstruction(
    [made],
    MACHINES[project.machine],
    border,
    {
      tackdown: boundary.operations?.some(
        (op) => op.type === "tackdown" && op.enabled !== false,
      ),
    },
  );
  if (!check.valid)
    throw Error(
      check.issues
        .filter((i) => i.severity === "error")
        .map((i) => i.message)
        .join(" "),
    );
  boundary.rings = made.rings;
  boundary.shape = made.shape;
  boundary.patchMargin = margin;
  boundary.closed = true;
  delete boundary.rounding;
}
