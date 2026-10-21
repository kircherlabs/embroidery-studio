import {
  makeOperation,
  OPERATION_TYPES,
  isSewing,
  materialize,
  operationTargets,
  propertyApplies,
  supportsMethod,
  closedArtwork,
} from "./operations.js";

export const EMBROIDERY_STYLES = {
  run: "Outline · running stitch",
  border: "Outline · satin border",
  fill: "Filled · tatami",
  combined: "Fill + running outline",
  "fill-border": "Fill + satin border",
};

export function setEmbroideryStyle(o, style) {
  if (!(style in EMBROIDERY_STYLES)) throw Error("Choose an embroidery style.");
  if (
    !supportsMethod(
      o,
      ["combined", "fill-border"].includes(style) ? "fill" : style,
    )
  )
    throw Error(
      `${o.name}: this style needs a closed region. Close the artwork path first, or use a running outline.`,
    );
  const source = {
    ...o,
    ...o.operations?.find(isSewing),
    type: o.type,
    closed: closedArtwork(o),
  };
  // These explicit presets mean ordinary Tatami/outline construction. Copying a
  // decorative fill belongs to style transfer, not to an unrelated preset.
  delete source.fillSettings;
  delete o.fillSettings;
  o.operations = (
    style === "combined"
      ? ["fill", "run"]
      : style === "fill-border"
        ? ["fill", "border"]
        : [style]
  ).map((type) => ({
    ...makeOperation(type, source),
    ...(source.physicalThread
      ? { physicalThread: structuredClone(source.physicalThread) }
      : {}),
  }));
  if (style === "combined") o.operations[1].underlay = false;
}

export function embroideryStyle(o) {
  if (o.fillSettings || o.operations?.some((op) => op.fillSettings))
    return "custom";
  const ops = o.operations || [{ type: o.type }];
  if (ops.length === 2 && ops[0].type === "fill" && ops[1].type === "run")
    return "combined";
  if (ops.length === 2 && ops[0].type === "fill" && ops[1].type === "border")
    return "fill-border";
  return ops.length === 1 && ops[0].type in EMBROIDERY_STYLES
    ? ops[0].type
    : "custom";
}

export function editOperations(objects, state, single, key, value) {
  let changed = 0,
    skipped = 0;
  for (const o of objects) {
    if (o.type === "reference") {
      skipped++;
      continue;
    }
    if (o.type === "manual") {
      if (key === "color") {
        o.color = value;
        delete o.physicalThread;
        changed++;
      } else skipped++;
      continue;
    }
    if (key === "type" && !supportsMethod(o, value)) {
      skipped++;
      continue;
    }
    const selected = operationTargets(o, state, single);
    const eligible = selected.filter(
      (op) =>
        propertyApplies(op.type, key) &&
        (!["cornerControl", "minCornerStitch"].includes(key) ||
          op.type !== "column" ||
          op.columnMode === "stroke"),
    );
    skipped += selected.length - eligible.length;
    if (!eligible.length) {
      if (!selected.length) skipped++;
      continue;
    }
    const ops = materialize(o);
    for (const old of eligible) {
      const op =
        old.id === "base" ? ops[0] : ops.find((op) => op.id === old.id);
      if (key === "type") {
        // Set method defaults without changing source geometry or unrelated thread colors.
        const fresh = makeOperation(value, o);
        const previous = { ...op };
        if (o.constructionArtworkIds?.length && !previous.constructionStage)
          previous.constructionStage =
            previous.type === "border" ? "finish" : "prepare";
        Object.assign(op, fresh, previous, {
          type: value,
          id: previous.id,
          name:
            previous.name !== OPERATION_TYPES[previous.type]
              ? previous.name
              : fresh.name,
          color: previous.color ?? o.color,
        });
        for (const key of ["offset", "outerOnly", "startIndex", "reverse"])
          if (!propertyApplies(previous.type, key)) op[key] = fresh[key];
        if (
          [
            "run",
            "bean",
            "triple",
            "placement",
            "tackdown",
            "basting",
            "contour",
            "marker",
          ].includes(value) &&
          ["fill", "column", "satin", "border"].includes(previous.type)
        )
          op.underlay = false;
        op.closed = closedArtwork(o);
        if (value !== "fill") delete op.fillSettings;
        if (single) state.activeOperationId = op.id;
      } else {
        if (key === "color") delete op.physicalThread;
        op[key] = key === "fillSettings" ? structuredClone(value) : value;
      }
      changed++;
    }
  }
  return { changed, skipped };
}
