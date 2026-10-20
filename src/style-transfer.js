import {
  operationsOf,
  effectiveOperation,
  materialize,
  makeOperation,
  operationTargets,
  supportsMethod,
  propertyApplies,
  operationObject,
  isSewing,
  OPERATION_TYPES,
} from "./operations.js";

const keys = [
  "color",
  "spacing",
  "length",
  "angle",
  "width",
  "underlay",
  "compensation",
  "tieIn",
  "tieOff",
  "pattern",
  "cornerControl",
  "minCornerStitch",
  "maxSatin",
  "columnMode",
  "columnFallback",
  "railScale",
  "railUnderlay",
  "offset",
  "outerOnly",
];
export function captureStyle(o, operationId) {
  if (["manual", "reference"].includes(o.type))
    throw Error("Choose vector embroidery artwork as the style source.");
  const ops = operationsOf(o),
    active = ops.find((op) => op.id === operationId) || ops.find(isSewing);
  if (!active || !isSewing(active))
    throw Error("Select a sewing action to copy its style.");
  const capture = (op) => {
    const effective = effectiveOperation(o, op);
    return {
      type: op.type,
      name: op.name,
      enabled: op.enabled !== false,
      ...Object.fromEntries(
        keys
          .filter(
            (k) => effective[k] !== undefined && propertyApplies(op.type, k),
          )
          .map((k) => [k, structuredClone(effective[k])]),
      ),
      ...(op.constructionStage
        ? { constructionStage: op.constructionStage }
        : {}),
    };
  };
  return { name: o.name, action: capture(active), actions: ops.map(capture) };
}
export function transferStyle(objects, style, mode, state = {}) {
  if (!style || !["color", "action", "stack"].includes(mode))
    throw Error("Copy a sewing style first.");
  if (!objects.length) throw Error("Select target artwork first.");
  const pending = [];
  for (const o of objects) {
    if (["manual", "reference"].includes(o.type))
      throw Error(
        `${o.name}: style transfer requires vector embroidery artwork.`,
      );
    const targets = operationTargets(o, state, objects.length === 1);
    if (
      mode !== "stack" &&
      (!targets.length || targets.some((op) => !isSewing(op)))
    )
      throw Error(`${o.name}: select a sewing action.`);
    const build = (s, old) => {
      if (!supportsMethod(o, s.type))
        throw Error(
          `${o.name}: ${s.type} requires a closed region; no styles were changed.`,
        );
      if (s.columnMode === "rails" && !o.satinRails)
        throw Error(
          `${o.name}: manual satin style requires two editable source rails.`,
        );
      const next = { ...makeOperation(s.type, o), ...structuredClone(s) };
      // Guides and entry positions belong to geometry, not transferable style.
      delete next.satinGuides;
      next.startIndex = 0;
      next.reverse = false;
      if (old) {
        next.id = old.id;
        next.name =
          old.name !== OPERATION_TYPES[old.type] ? old.name : next.name;
        next.enabled = old.enabled !== false;
        delete next.constructionStage;
        if (old.constructionStage || o.constructionArtworkIds?.length)
          next.constructionStage =
            old.constructionStage ||
            (old.type === "border" ? "finish" : "prepare");
      }
      if (mode !== "stack" && old?.type === next.type) {
        for (const k of ["satinGuides", "startIndex", "reverse"])
          if (old[k] !== undefined) next[k] = structuredClone(old[k]);
      }
      if (isSewing(next)) {
        const checked = operationObject(o, next);
        if (checked.operationWarning) throw Error(checked.operationWarning);
      }
      return next;
    };
    const existing = operationsOf(o),
      selected = new Set(targets.map((op) => op.id));
    const ops =
      mode === "stack"
        ? style.actions.map((s) => build(s))
        : existing.map((op) => {
            if (!selected.has(op.id)) return structuredClone(op);
            if (mode === "color")
              return { ...structuredClone(op), color: style.action.color };
            return build(style.action, op);
          });
    pending.push([o, ops]);
  }
  for (const [o, ops] of pending) {
    // Materialize legacy base identities; never transplant source operation IDs.
    const base = ops.some((op) => op.id === "base")
      ? materialize(o)[0].id
      : null;
    o.operations = ops.map((op) => ({
      ...op,
      id: op.id === "base" ? base : op.id,
    }));
  }
  return pending.length;
}
