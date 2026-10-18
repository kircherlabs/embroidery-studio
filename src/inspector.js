import { curveRings } from "./smart-geometry.js";
import {
  EMBROIDERY_STYLES,
  embroideryStyle,
  editOperations,
} from "./styles.js";
import { chooseConstruction, applyStyle } from "./construction-ui.js";
import { creativeInspector } from "./creative-ui.js";
import {
  nodeById,
  selectionIds,
  selectedLeaves,
  selectionBounds,
  transformSelection,
  PROJECT,
  isVisible,
  ancestors,
  within,
} from "./hierarchy.js";
import {
  OPERATION_TYPES,
  operationsOf,
  materialize,
  makeOperation,
  operationTargets,
  effectiveOperation,
  supportsMethod,
  closedArtwork,
  isSewing,
  propertyApplies,
} from "./operations.js";

const $ = (id) => document.getElementById(id);
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const commonValue = (items, key) =>
  items.length && items.every((o) => o[key] === items[0][key])
    ? items[0][key]
    : undefined;

export function renderInspector(api) {
  const {
      state,
      mutate,
      toast,
      refresh,
      palette,
      manualEditor,
      bindManual,
      convertManual,
    } = api,
    p = state.project,
    ids = selectionIds(state);
  const all = selectedLeaves(state),
    objects = selectedLeaves(state, { editable: true }),
    vectors = objects.filter((o) => o.type !== "manual");
  if (!ids.length) return false;
  const one = ids.length === 1 ? nodeById(p, ids[0]) : null,
    leaf = one && !one.kind ? one : null;
  const targets = vectors.flatMap((o) => operationTargets(o, state, !!leaf));
  const active = leaf ? operationTargets(leaf, state, true)[0] : null;
  const control = vectors.flatMap((o) =>
    operationTargets(o, state, !!leaf).map((op) => effectiveOperation(o, op)),
  );
  // Keep disclosure state through regeneration; it is UI state, not project data.
  state.inspectorSections ||= {};
  document
    .querySelectorAll("#properties details[data-section]")
    .forEach((el) => (state.inspectorSections[el.dataset.section] = el.open));
  const common = (key) =>
      commonValue(
        key === "color"
          ? [
              ...control.filter((o) => o.type !== "manual"),
              ...objects.filter((o) => o.type === "manual"),
            ]
          : control.filter((o) => propertyApplies(o.type, key)),
        key,
      ),
    mixed = (key) => common(key) === undefined;
  const hasDirectional = control.some(
    (o) =>
      o.type === "fill" || (o.type === "column" && o.columnMode !== "stroke"),
  );
  const hasFill = control.some((o) => ["fill", "column"].includes(o.type)),
    hasSatin = control.some((o) => ["satin", "border"].includes(o.type)),
    hasPath = control.some(
      (o) => !["fill", "column", "stop", "trim", "manual"].includes(o.type),
    ),
    hasOutline = control.some((o) =>
      ["placement", "tackdown", "basting", "contour", "border"].includes(
        o.type,
      ),
    );
  const b = selectionBounds(objects),
    name = ids[0] === PROJECT ? p.name : one?.name;
  const field = (
    label,
    id,
    key,
    unit,
    min,
    max,
    step = 0.1,
    value = common(key),
  ) =>
    `<label class="field"><span class="field-title">${label}<small>${unit}</small></span><input id="${id}" type="number" value="${value === undefined ? "" : Number(value.toFixed(3))}" placeholder="Mixed" min="${min}" max="${max}" step="${step}"></label>`;
  const check = (label, id, key) =>
    `<label class="check"><input type="checkbox" id="${id}" ${common(key) ? "checked" : ""}>${label}${mixed(key) ? " · mixed" : ""}</label>`;
  $("inspector-title").textContent =
    ids[0] === PROJECT
      ? "Project selection"
      : one?.kind
        ? "SVG / group properties"
        : ids.length > 1
          ? "Selection properties"
          : "Object properties";
  $("properties").innerHTML =
    `<p class="selection-summary">${all.length} artwork object${all.length === 1 ? "" : "s"} selected${all.length !== objects.length ? ` · ${all.length - objects.length} locked, excluded from edits` : ""}${all.some((o) => !isVisible(p, o)) ? " · hidden artwork will not sew until shown" : ""}</p>
    <details class="inspector-section" data-section="artwork" open><summary>Artwork</summary><div id="artwork-settings" class="creative-settings">${name !== undefined ? `<label class="field">${one?.kind ? "Group / SVG name" : "Object name"}<input id="object-name" value="${escape(name)}" maxlength="200" ${one?.locked ? "disabled" : ""}></label>` : ""}
    </div></details>${
      !objects.length
        ? `<p class="property-note">${all.length ? "Unlock artwork in the tree to edit it." : "This selection contains no drawable geometry."}</p>`
        : `
    <section class="inspector-section" id="method-settings"><h3>Embroidery method</h3>
    ${
      vectors.length
        ? `<label class="field">Artwork stitching style<select id="embroidery-style"><option value="custom">Custom / construction steps</option>${Object.entries(
            EMBROIDERY_STYLES,
          )
            .map(
              ([key, label]) =>
                `<option value="${key}" ${vectors.every((o) => embroideryStyle(o) === key) ? "selected" : ""} ${vectors.every((o) => supportsMethod(o, key === "combined" ? "fill" : key)) ? "" : "disabled"}>${label}</option>`,
            )
            .join(
              "",
            )}</select></label><p class="property-note">A style configures this artwork's steps. Method settings below edit ${leaf ? "only the active step" : "the scope chosen below"}. Advanced stacks stay available in Construction steps.</p>${vectors.some((o) => !closedArtwork(o)) ? '<p class="property-note">Open paths support running and centerline stitches. Fills and fabric borders need a closed region.</p><button id="close-artwork">Close artwork paths</button>' : ""}`
        : ""
    }
    ${(vectors.length && ids.length > 1) || one?.kind || ids[0] === PROJECT ? '<label class="field">Apply embroidery settings to<select id="bulk-scope"><option value="primary">Primary operation of each region</option><option value="all">All sewing operations</option></select></label>' : ""}
    <p class="active-operation" role="status">${leaf && active ? `Editing step: <strong>${escape(active.name)}</strong>${active.enabled === false ? " · disabled; enable it to generate stitches" : ""}` : `${targets.length} operation${targets.length === 1 ? "" : "s"} in scope · incompatible settings are reported after edits`}</p>
    ${
      targets.length
        ? `<label class="field">${active && !isSewing(active) ? "Step command" : "Active step · stitch method"}<select id="stitch-type">${mixed("type") ? '<option value="" selected disabled>Mixed</option>' : ""}${Object.entries(
            OPERATION_TYPES,
          )
            .map(
              ([k, v]) =>
                `<option value="${k}" ${vectors.every((o) => supportsMethod(o, k)) ? "" : "disabled"} ${common("type") === k ? "selected" : ""}>${v}</option>`,
            )
            .join("")}</select></label>`
        : ""
    }
    ${active && !isSewing(active) ? `<p class="property-note">${active.type === "stop" ? "Pauses for operator action at this point. Name the step for positioning or trimming fabric." : "Requests a thread trim in the machine file. This does not pause to trim fabric; machine and file-format support varies."}</p>` : ""}
    <div class="section-label">THREAD COLOR ${mixed("color") ? "<span>MIXED</span>" : ""}</div><input id="thread-color" type="color" aria-label="Thread color" value="${common("color") || "#000000"}"><div class="swatch-palette">${palette.map((c) => `<button data-color="${c}" style="background:${c}" aria-label="Use thread ${c}"></button>`).join("")}</div>
    ${
      targets.some(isSewing)
        ? `<div class="section-label">STITCH SETTINGS${active ? " · SELECTED OPERATION" : ""}</div><div class="two-col">${hasFill || hasSatin ? field("Row spacing", "spacing", "spacing", "mm", 0.15, 5) : ""}${control.some((o) => propertyApplies(o.type, "length")) ? field(hasFill ? "Maximum segment length" : "Running stitch length", "length", "length", "mm", 0.3, 7) : ""}</div>${hasDirectional ? field("Stitch direction", "angle", "angle", "°", -360, 360, 1) : ""}${hasDirectional ? `<label class="field">Fill pattern<select id="fill-pattern">${mixed("pattern") ? '<option value="" disabled selected>Mixed</option>' : ""}<option value="quarter">Quarter stagger</option><option value="half">Half stagger</option><option value="aligned">Aligned penetrations</option></select></label>` : ""}<div class="two-col">${hasSatin ? field("Satin band width", "satin-width", "width", "mm", 0.3, 7) : ""}${hasFill || hasSatin ? field("Pull compensation", "compensation", "compensation", "mm", 0, 1) : ""}</div>
    ${control.some((o) => propertyApplies(o.type, "underlay")) ? check(hasFill || hasSatin ? "Light underlay" : "Preliminary outline pass", "underlay", "underlay") : ""}${control.some((o) => propertyApplies(o.type, "closed")) ? check("Sew closing segment", "closed-path", "closed") : ""}${hasPath ? check("Reverse sewing direction", "reverse-path", "reverse") : ""}
    <details class="advanced-settings" data-section="advanced"><summary>Advanced digitizing</summary>${hasOutline ? field("Contour offset", "op-offset", "offset", "mm", -5, 5) + check("Outer boundary only", "outer-only", "outerOnly") : ""}${hasPath && control.some((o) => o.closed || ["placement", "tackdown", "basting", "contour", "border"].includes(o.type)) ? field("Start at vertex index", "start-index", "startIndex", "", 0, 500000, 1) : ""}${check("Tie-in · secure thread at start", "tie-in", "tieIn")}${check("Tie-off · secure thread at end", "tie-off", "tieOff")}<p class="property-note">Offsets apply to closed outline operations. Start vertex and reversal affect contour paths; fill direction controls tatami. Satin width and spacing stay in millimeters when artwork is resized.</p></details>`
        : ""
    }
    </section><details id="transform-settings" data-section="transform" open><summary>Position, size & rotation</summary><div class="section-label">POSITION & SIZE · SELECTION</div><div class="two-col">${field("Center X", "pos-x", null, "mm", -1000, 1000, 0.1, (b.minX + b.maxX) / 2)}${field("Center Y", "pos-y", null, "mm", -1000, 1000, 0.1, (b.minY + b.maxY) / 2)}${field("Width", "size-w", null, "mm", 0.1, 500, 0.1, b.width)}${field("Height", "size-h", null, "mm", 0.1, 500, 0.1, b.height)}</div><label class="check"><input id="proportional" type="checkbox" ${state.proportional !== false ? "checked" : ""}>Keep proportions · Shift while dragging to toggle</label>${field("Rotate selection by", "rotate", null, "°", -360, 360, 1, 0)}
    </details>${check("Pin source sequence position", "sequence-locked", "sequenceLocked")}
    ${leaf?.type === "manual" ? manualEditor(leaf) : leaf ? `<button id="convert-manual" ${leaf.constructionArtworkIds?.length ? 'disabled aria-describedby="construction-manual-note"' : ""}>Make stitches editable</button>${leaf.constructionArtworkIds?.length ? '<p class="property-note" id="construction-manual-note">A linked patch boundary needs its operation phases to surround the artwork. Duplicate the boundary alone before converting it to one manual stitch block.</p>' : ""}` : ""}
    ${
      vectors.length
        ? `<details class="operations-panel inspector-section" data-section="construction" open><summary>Construction steps</summary><p class="property-note">${leaf ? "One artwork, shared geometry. Select a step to edit its method and independent settings above. Steps sew in listed order." : "Adds one step per selected vector region; settings scope above does not change this action. Existing steps retain their order."}</p>
    ${
      leaf
        ? `<div class="operation-stack">${operationsOf(leaf)
            .map(
              (op, i) =>
                `<div class="operation-row ${active?.id === op.id ? "active" : ""}"><input type="checkbox" data-op-enabled="${escape(op.id)}" aria-label="Enable ${escape(op.name)}" ${op.enabled !== false ? "checked" : ""}><button data-operation="${escape(op.id)}">${i + 1}. ${escape(op.name)}${leaf.constructionArtworkIds?.length ? `<small>${(op.constructionStage || (op.type === "border" ? "finish" : "prepare")) === "finish" ? "After artwork" : "Before artwork"}</small>` : ""}</button>${leaf.operations ? `<button data-op-action="up" ${i === 0 ? "disabled" : ""} data-op-id="${escape(op.id)}" aria-label="Move ${escape(op.name)} earlier">↑</button><button data-op-action="down" ${i === leaf.operations.length - 1 ? "disabled" : ""} data-op-id="${escape(op.id)}" aria-label="Move ${escape(op.name)} later">↓</button><button data-op-action="copy" ${leaf.operations.length >= 32 ? "disabled" : ""} data-op-id="${escape(op.id)}" aria-label="Duplicate ${escape(op.name)}">⧉</button><button data-op-action="delete" data-op-id="${escape(op.id)}" aria-label="Delete ${escape(op.name)}">×</button>` : ""}</div>`,
            )
            .join(
              "",
            )}</div>${active ? `<label class="field">Operation name<input id="operation-name" maxlength="100" value="${escape(active.name)}"></label>` : ""}`
        : ""
    }
    <div class="operation-add"><select id="add-operation" aria-label="Operation to add">${Object.entries(
      OPERATION_TYPES,
    )
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join(
        "",
      )}</select><button id="operation-add">Add step</button></div><button id="applique-recipe">Construction presets…</button><p class="property-note">Choose a fabric boundary or surround decorative artwork with one editable patch. Geometry is checked before replacing any steps.</p>${leaf?.constructionArtworkIds?.length ? `<p class="property-note construction-link">Linked patch: preparation → ${leaf.constructionArtworkIds.length} decorative artwork objects → finishing. These dependencies take priority over manual color batching.</p>${active ? `<label class="field">This step sews<select id="construction-stage"><option value="prepare">Before decorative artwork</option><option value="finish">After decorative artwork</option></select></label>` : ""}` : ""}</details>`
        : ""
    }
    `
    }`;
  const transformPanel = $("transform-settings");
  if (transformPanel) $("artwork-settings").append(transformPanel);
  if ($("embroidery-style"))
    $("embroidery-style").onchange = (e) => {
      if (e.target.value !== "custom") applyStyle(api, vectors, e.target.value);
    };
  if ($("close-artwork"))
    $("close-artwork").onclick = () =>
      mutate(() =>
        vectors.forEach((o) => {
          o.closed = true;
          if (o.curve) {
            o.curve.closed = true;
            o.rings = curveRings(o.curve);
          }
        }),
      );
  if ($("object-name"))
    $("object-name").onchange = (e) =>
      mutate(() => {
        if (ids[0] === PROJECT)
          p.name = e.target.value.trim() || "Untitled design";
        else one.name = e.target.value.trim() || "Untitled object";
      });
  if (!objects.length) return true;
  if (targets.length && targets.every((op) => !isSewing(op))) {
    const input = $("thread-color");
    input.previousElementSibling.remove();
    input.nextElementSibling.remove();
    input.remove();
  }
  if ($("bulk-scope")) {
    $("bulk-scope").value = state.bulkOperations || "primary";
    $("bulk-scope").onchange = (e) => {
      state.bulkOperations = e.target.value;
      refresh();
    };
  }
  const apply = (key, value) => {
    let result;
    mutate(() => {
      result = editOperations(objects, state, !!leaf, key, value);
    });
    if (result.skipped)
      toast(
        `${result.changed} operation${result.changed === 1 ? "" : "s"} updated; ${result.skipped} incompatible targets unchanged. Choose a compatible method or change the editing scope.`,
      );
  };
  if ($("stitch-type"))
    $("stitch-type").onchange = (e) => apply("type", e.target.value);
  if ($("fill-pattern")) {
    $("fill-pattern").value = common("pattern") || "";
    $("fill-pattern").onchange = (e) => apply("pattern", e.target.value);
  }
  if ($("thread-color"))
    $("thread-color").onchange = (e) => apply("color", e.target.value);
  document
    .querySelectorAll("[data-color]")
    .forEach((el) => (el.onclick = () => apply("color", el.dataset.color)));
  const bind = (id, fn, min, max) => {
    if ($(id))
      $(id).onchange = () => {
        const value = Number($(id).value);
        if (
          $(id).value === "" ||
          !Number.isFinite(value) ||
          value < min ||
          value > max
        ) {
          toast(`Enter a value between ${min} and ${max}.`);
          refresh();
          return;
        }
        fn(value);
      };
  };
  for (const [id, key, min, max] of [
    ["spacing", "spacing", 0.15, 5],
    ["length", "length", 0.3, 7],
    ["angle", "angle", -360, 360],
    ["satin-width", "width", 0.3, 7],
    ["compensation", "compensation", 0, 1],
    ["op-offset", "offset", -5, 5],
    ["start-index", "startIndex", 0, 500000],
  ])
    bind(id, (v) => apply(key, v), min, max);
  for (const [id, key] of [
    ["underlay", "underlay"],
    ["outer-only", "outerOnly"],
    ["closed-path", "closed"],
    ["reverse-path", "reverse"],
    ["tie-in", "tieIn"],
    ["tie-off", "tieOff"],
  ])
    if ($(id)) {
      $(id).indeterminate = mixed(key);
      if (
        ["tieIn", "tieOff"].includes(key) &&
        control.every((o) => o[key] === undefined)
      ) {
        $(id).indeterminate = false;
        $(id).checked = true;
      }
      $(id).onchange = (e) => apply(key, e.target.checked);
    }
  const sequence = all.map((o) => ({
    sequenceLocked:
      o.sequenceLocked ||
      ancestors(p, o).some((g) => g.sequenceLocked) ||
      o.type === "manual",
  }));
  $("sequence-locked").checked = sequence.every((o) => o.sequenceLocked);
  $("sequence-locked").indeterminate =
    commonValue(sequence, "sequenceLocked") === undefined;
  const externalPins = objects.filter((o) =>
    ancestors(p, o).some(
      (g) => g.sequenceLocked && !ids.some((id) => within(p, g, id)),
    ),
  );
  if (externalPins.length) {
    $("sequence-locked")
      .closest("label")
      .insertAdjacentHTML(
        "afterend",
        `<p class="property-note">${externalPins.length} objects are pinned by a parent group. Select that group to release its sequence pin.</p>`,
      );
    $("sequence-locked").disabled = externalPins.length === objects.length;
  }
  $("sequence-locked").onchange = (e) => {
    const value = e.target.checked;
    mutate(() => {
      objects.forEach((o) => (o.sequenceLocked = value));
      if (one?.kind) one.sequenceLocked = value;
      if (!value)
        for (const group of p.groups || [])
          if (ids.some((id) => within(p, group, id)))
            group.sequenceLocked = false;
    });
    if (!value && externalPins.length)
      toast(
        `${externalPins.length} objects remain pinned by their parent; select that group to change its pin.`,
      );
  };
  const tx = (opts) => mutate(() => transformSelection(objects, opts));
  bind("pos-x", (v) => tx({ dx: v - (b.minX + b.maxX) / 2 }), -1000, 1000);
  bind("pos-y", (v) => tx({ dy: v - (b.minY + b.maxY) / 2 }), -1000, 1000);
  bind(
    "size-w",
    (v) =>
      tx({
        sx: b.width ? v / b.width : 1,
        sy: state.proportional !== false && b.width ? v / b.width : 1,
      }),
    0.1,
    500,
  );
  bind(
    "size-h",
    (v) =>
      tx({
        sy: b.height ? v / b.height : 1,
        sx: state.proportional !== false && b.height ? v / b.height : 1,
      }),
    0.1,
    500,
  );
  bind("rotate", (v) => tx({ angle: v }), -360, 360);
  $("proportional").onchange = (e) => (state.proportional = e.target.checked);
  if (leaf?.type === "manual") bindManual(leaf);
  if ($("convert-manual"))
    $("convert-manual").onclick = () => convertManual(leaf);
  document.querySelectorAll("[data-operation]").forEach(
    (el) =>
      (el.onclick = () => {
        state.activeOperationId =
          el.dataset.operation === "base" ? null : el.dataset.operation;
        refresh();
        api.draw();
      }),
  );
  document.querySelectorAll("[data-op-enabled]").forEach(
    (el) =>
      (el.onchange = () => {
        const value = el.checked;
        mutate(() => {
          const ops = materialize(leaf),
            op =
              el.dataset.opEnabled === "base"
                ? ops[0]
                : ops.find((op) => op.id === el.dataset.opEnabled);
          op.enabled = value;
        });
      }),
  );
  if ($("operation-name"))
    $("operation-name").onchange = (e) =>
      mutate(() =>
        (() => {
          const ops = materialize(leaf),
            op =
              active.id === "base"
                ? ops[0]
                : ops.find((op) => op.id === active.id);
          op.name = e.target.value.trim() || OPERATION_TYPES[op.type];
          state.activeOperationId = op.id;
        })(),
      );
  document.querySelectorAll("[data-op-action]").forEach(
    (el) =>
      (el.onclick = () =>
        mutate(() => {
          const ops = leaf.operations,
            i = ops.findIndex((op) => op.id === el.dataset.opId),
            action = el.dataset.opAction;
          if (action === "delete") {
            ops.splice(i, 1);
            state.activeOperationId = null;
          } else if (action === "copy") {
            if (ops.length >= 32) {
              toast("Each artwork object supports up to 32 steps.");
              return;
            }
            const op = makeOperation(ops[i].type, leaf);
            Object.assign(op, structuredClone(ops[i]), {
              id: op.id,
              name: ops[i].name.slice(0, 95) + " copy",
            });
            ops.splice(i + 1, 0, op);
            state.activeOperationId = op.id;
          } else {
            const j = i + (action === "up" ? -1 : 1);
            if (j >= 0 && j < ops.length) [ops[i], ops[j]] = [ops[j], ops[i]];
          }
        })),
  );
  if ($("operation-add"))
    $("operation-add").onclick = () => {
      const type = $("add-operation").value;
      let skipped = 0;
      mutate(() =>
        vectors.forEach((o) => {
          if (!supportsMethod(o, type) || operationsOf(o).length >= 32) {
            skipped++;
            return;
          }
          const op = makeOperation(type, o);
          if (o.constructionArtworkIds?.length)
            op.constructionStage = type === "border" ? "finish" : "prepare";
          materialize(o).push(op);
          if (leaf) state.activeOperationId = op.id;
        }),
      );
      if (skipped)
        toast(
          `${skipped} regions skipped: closed artwork required or 32-operation limit reached.`,
        );
    };
  if ($("applique-recipe"))
    $("applique-recipe").onclick = () => chooseConstruction(api);
  if ($("construction-stage")) {
    $("construction-stage").value =
      active.constructionStage ||
      (active.type === "border" ? "finish" : "prepare");
    $("construction-stage").onchange = (e) => {
      const value = e.target.value;
      mutate(() => {
        const ops = materialize(leaf);
        (active.id === "base"
          ? ops[0]
          : ops.find((op) => op.id === active.id)
        ).constructionStage = value;
      });
    };
  }
  creativeInspector(api, leaf, objects, targets);
  document
    .querySelectorAll("#properties details[data-section]")
    .forEach((el) => {
      if (el.dataset.section in state.inspectorSections)
        el.open = state.inspectorSections[el.dataset.section];
    });
  return true;
}
