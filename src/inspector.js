import { selectionBox } from "./transform-box.js";
import { orientationControl, bindOrientation } from "./transform-ui.js";
import {
  methodPicker,
  categoryHelp,
  methodOptions,
  methodCategory,
  CONSTRUCTION_METHODS,
  METHOD_HELP,
} from "./method-ui.js";
import { referenceInspector } from "./reference-ui.js";
import { actionCards, closingRings, moveAction } from "./sewing-actions.js";
import { editOperations } from "./styles.js";
import { chooseConstruction, chooseSewingPreset } from "./construction-ui.js";
import { creativeInspector } from "./creative-ui.js";
import { fillControls, bindFillControls } from "./fills/ui.js";
import {
  nodeById,
  selectionIds,
  selectedLeaves,
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
    vectors = objects.filter((o) => !["manual", "reference"].includes(o.type));
  if (!ids.length) return false;
  const one = ids.length === 1 ? nodeById(p, ids[0]) : null,
    leaf = one && !one.kind ? one : null;
  if (all.length && all.every((o) => o.type === "reference"))
    return referenceInspector(api, all, leaf);
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
  const request = state.methodRequest,
    pendingMethod =
      request?.selection === ids.join("|") &&
      request?.action === (active?.id || null) &&
      request?.bulk === state.bulkOperations
        ? request.type
        : null,
    openVectors = vectors.filter((o) => !closedArtwork(o)),
    canClose = !pendingMethod || openVectors.every((o) => closingRings(o));
  const categoryRequest = state.satinMethodRequest,
    choosingSatin =
      categoryRequest?.selection === ids.join("|") &&
      categoryRequest?.action === (active?.id || null) &&
      categoryRequest?.bulk === state.bulkOperations,
    selectedType = common("type"),
    constructionType = selectedType in CONSTRUCTION_METHODS ? selectedType : "",
    defaultAddType = vectors.every(closedArtwork) ? "border" : "run";
  const b = selectionBox(objects, state.transformOrientation),
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
    `<p class="selection-summary">${all.length} artwork object${all.length === 1 ? "" : "s"} selected${all.length !== objects.length ? ` · ${all.length - objects.length} locked, excluded from edits` : ""}${all.some((o) => !isVisible(p, o)) ? " · hidden artwork will not sew until shown" : ""}${all.some((o) => o.type === "reference") ? " · reference images have no embroidery settings" : ""}</p>
    <details class="inspector-section" data-section="artwork" open><summary>Artwork</summary><div id="artwork-settings" class="creative-settings">${name !== undefined ? `<label class="field">${one?.kind ? "Group / SVG name" : "Object name"}<input id="object-name" value="${escape(name)}" maxlength="200" ${one?.locked ? "disabled" : ""}></label>` : ""}
    </div></details>${
      !objects.length
        ? `<p class="property-note">${all.length ? "Unlock artwork in the tree to edit it." : "This selection contains no drawable geometry."}</p>`
        : `
    <section id="method-settings" class="action-settings">
    ${
      targets.length
        ? methodPicker(
            control.map((o) => o.type),
            {
              pending: choosingSatin,
              open: openVectors.length > 0,
              closed: vectors.some(closedArtwork),
            },
          )
        : ""
    }
    ${pendingMethod ? `<div class="method-closure" role="status"><p>${escape(OPERATION_TYPES[pendingMethod])} needs a closed area. ${openVectors.length} selected path${openVectors.length === 1 ? " is" : "s are"} open.${!canClose ? " Add or adjust nodes to form a nonempty region first. Running stitch and Satin Centerline can sew open paths." : " Closing adds a segment between the last and first points; Undo restores the open path."}</p><button id="close-artwork" ${canClose ? "" : "disabled"}>Close paths &amp; use ${escape(OPERATION_TYPES[pendingMethod])}</button><button id="cancel-method-change">Keep path open</button></div>` : openVectors.length ? '<p class="property-note">Fill and border methods need closed artwork. Choose one to review closing this path.</p>' : ""}
    <div id="action-method-fields" ${choosingSatin ? "hidden" : ""}>
    ${constructionType ? `<p class="property-note">${METHOD_HELP[constructionType]}</p>` : ""}
    <div class="section-label">THREAD COLOR ${mixed("color") ? "<span>MIXED</span>" : ""}</div><input id="thread-color" type="color" aria-label="Thread color" value="${common("color") || "#000000"}"><div class="swatch-palette">${palette.map((c) => `<button data-color="${c}" style="background:${c}" aria-label="Use thread ${c}"></button>`).join("")}</div>
    ${targets.some(isSewing) ? `<div class="section-label">STITCH SETTINGS</div><div class="two-col">${hasFill || hasSatin ? field("Row spacing", "spacing", "spacing", "mm", 0.15, 5) : ""}${control.some((o) => propertyApplies(o.type, "length")) ? field(hasFill ? "Maximum segment length" : "Running stitch length", "length", "length", "mm", 0.3, 7) : ""}</div>${hasDirectional ? field("Stitch direction", "angle", "angle", "°", -360, 360, 1) : ""}${hasDirectional ? `<label class="field">Fill pattern<select id="fill-pattern">${mixed("pattern") ? '<option value="" disabled selected>Mixed</option>' : ""}<option value="quarter">Quarter stagger</option><option value="half">Half stagger</option><option value="aligned">Aligned penetrations</option></select></label>` : ""}${hasSatin ? field("Satin band width", "satin-width", "width", "mm", 0.3, 7) : ""}` : ""}
    ${targets.length ? `<details class="advanced-settings" data-section="advanced"><summary>Advanced</summary>${hasFill || hasSatin ? field("Pull compensation", "compensation", "compensation", "mm", 0, 1) : ""}${control.some((o) => propertyApplies(o.type, "underlay")) ? check(hasFill || hasSatin ? "Light underlay" : "Preliminary outline pass", "underlay", "underlay") : ""}${control.some((o) => propertyApplies(o.type, "closed")) ? check("Sew closing segment", "closed-path", "closed") : ""}${hasPath ? check("Reverse sewing direction", "reverse-path", "reverse") : ""}${hasOutline ? field("Contour offset", "op-offset", "offset", "mm", -5, 5) + check("Outer boundary only", "outer-only", "outerOnly") : ""}${hasPath && control.some((o) => o.closed || ["placement", "tackdown", "basting", "contour", "border"].includes(o.type)) ? field("Start at vertex index", "start-index", "startIndex", "", 0, 500000, 1) : ""}${targets.some(isSewing) ? check("Tie-in · secure thread at start", "tie-in", "tieIn") + check("Tie-off · secure thread at end", "tie-off", "tieOff") : ""}${leaf && active ? `<label class="field">Sewing action name<input id="operation-name" maxlength="100" value="${escape(active.name)}"></label>` : ""}${leaf?.constructionArtworkIds?.length && active ? `<label class="field">This action sews<select id="construction-stage"><option value="prepare">Before decorative artwork</option><option value="finish">After decorative artwork</option></select></label>` : ""}</details>` : ""}
    ${targets.length ? `<details class="construction-method-picker" data-section="construction-method" ${constructionType ? "open" : ""}><summary>Advanced Construction</summary><label class="field">This action's construction purpose<select id="construction-method">${methodOptions(CONSTRUCTION_METHODS, constructionType, control.length > 1 && control.every((o) => o.type in CONSTRUCTION_METHODS) ? "Mixed construction purposes" : "Choose construction action…")}</select></label><p class="property-note" id="construction-method-guidance">Changes this action into a fabric-construction step or machine command. To keep existing stitching, use Add another sewing action instead.</p></details>` : ""}
    </div></section><details id="transform-settings" data-section="transform" open><summary>Position, size & rotation</summary><div class="section-label">POSITION & SIZE · SELECTION</div>${orientationControl(state, b)}<div class="two-col">${field("Center X", "pos-x", null, "mm", -1000, 1000, 0.1, b.center.x)}${field("Center Y", "pos-y", null, "mm", -1000, 1000, 0.1, b.center.y)}${field(b.local ? "Local width" : "Width", "size-w", null, "mm", 0.1, 500, 0.1, b.width)}${field(b.local ? "Local height" : "Height", "size-h", null, "mm", 0.1, 500, 0.1, b.height)}</div><label class="check"><input id="proportional" type="checkbox" ${state.proportional !== false ? "checked" : ""}>Keep proportions · Shift while dragging to toggle</label>${field("Rotate selection by", "rotate", null, "°", -360, 360, 1, 0)}
    </details><details id="object-sewing-options" data-section="object-sewing"><summary>Object sewing options</summary>${check("Keep sewing order position", "sequence-locked", "sequenceLocked")}
    ${leaf?.type === "manual" ? `<div id="manual-action-editor">${manualEditor(leaf)}</div>` : leaf ? `<button id="convert-manual" ${leaf.constructionArtworkIds?.length ? 'disabled aria-describedby="construction-manual-note"' : ""}>Make stitches editable</button>${leaf.constructionArtworkIds?.length ? '<p class="property-note" id="construction-manual-note">A linked patch boundary needs its sewing phases to surround the artwork. Duplicate the boundary alone before converting it to manual stitches.</p>' : ""}` : ""}</details>
    <section class="inspector-section" id="embroidery-settings"><h3>Embroidery</h3>
    ${leaf && vectors.length ? `<div class="operation-stack">${actionCards(leaf, active, state.collapsedActionKey)}</div>` : vectors.length ? `<p class="property-note">Editing ${vectors.length} artwork objects together. Select an individual object to manage its ordered sewing actions.</p><label class="field">Apply changes to<select id="bulk-scope"><option value="primary">First sewing action of each object</option><option value="all">All sewing actions of each object</option></select></label><p class="bulk-action-status">${targets.length} actions in scope · colors, order and other actions remain independent.</p>${targets.length ? '<label class="check"><input type="checkbox" id="bulk-action-enabled">Include these actions when sewing</label>' : ""}` : '<p class="property-note">Manual needle commands · edit stitches directly.</p>'}
    <div id="embroidery-tools">
    ${
      vectors.length
        ? `<details class="add-action-picker"><summary>+ ${leaf ? (operationsOf(leaf).length ? "Add another sewing action" : "Add a sewing action") : "Add a sewing action to each object"}</summary><div class="operation-add-categories">${methodPicker([defaultAddType], { adding: true, open: openVectors.length > 0, closed: vectors.some(closedArtwork) })}<button id="operation-add">Add action</button><p class="property-note" id="add-action-guidance"></p><details data-section="add-construction"><summary>Advanced Construction</summary><label class="field">Construction action<select id="add-construction">${methodOptions(CONSTRUCTION_METHODS, "placement")}</select></label><p class="property-note" id="add-construction-purpose"></p><button id="construction-add">Add construction action</button><p class="property-note" id="add-construction-guidance"></p></details></div></details><div class="embroidery-presets"><button id="sewing-presets">Sewing presets…</button><button id="applique-recipe">Construction presets…</button></div>${leaf?.constructionArtworkIds?.length ? `<p class="property-note construction-link">Linked patch: preparation → ${leaf.constructionArtworkIds.length} artwork objects → finishing. These dependencies take priority over color batching.</p>` : ""}`
        : ""
    }
    </div></section>
    `
    }`;
  if (control.some((o) => o.type === "fill")) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = fillControls(control);
    $("fill-pattern")?.closest("label").replaceWith(wrapper);
    const family = $("fill-method-family");
    if (family)
      $("stitch-type")
        ?.closest("label")
        .insertAdjacentElement("afterend", family);
    if (control.some((o) => o.type === "fill" && o.fillSettings))
      $("angle")?.closest("label").setAttribute("hidden", "");
    if (
      control.every(
        (o) =>
          o.type === "fill" &&
          o.fillSettings &&
          !["tatami", "emboss"].includes(o.fillSettings.method),
      )
    ) {
      $("compensation")?.closest("label").setAttribute("hidden", "");
      $("underlay")?.closest("label").setAttribute("hidden", "");
      const title = $("spacing")
        ?.closest("label")
        .querySelector(".field-title");
      if (title)
        title.textContent = control.every((o) =>
          ["ripple", "spiral"].includes(o.fillSettings?.method),
        )
          ? "Minimum turn spacing"
          : "Contour spacing";
      if (
        control.every((o) =>
          ["cross", "meander"].includes(o.fillSettings?.method),
        )
      )
        $("spacing")?.closest("label").setAttribute("hidden", "");
    }
  }
  const transformPanel = $("transform-settings");
  if (transformPanel) $("artwork-settings").append(transformPanel);
  const methodPanel = $("method-settings"),
    embroidery = $("embroidery-settings");
  if (embroidery) {
    const body =
      leaf && vectors.length && active ? $("action-body-" + active.id) : null;
    if (body) body.append(methodPanel);
    else embroidery.insertBefore(methodPanel, $("embroidery-tools"));
    $("embroidery-tools").append($("object-sewing-options"));
    $("properties").insertBefore(
      embroidery,
      $("artwork-settings").parentElement,
    );
    if (vectors.length && !targets.length) methodPanel.hidden = true;
    if ($("manual-action-editor"))
      methodPanel.append($("manual-action-editor"));
  }
  if ($("sewing-presets"))
    $("sewing-presets").onclick = () => chooseSewingPreset(api, vectors);
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
      state.methodRequest = null;
      state.satinMethodRequest = null;
      refresh();
    };
  }
  const apply = (key, value) => {
    let result;
    mutate(() => {
      result = editOperations(objects, state, !!leaf, key, value);
    });
    if (result?.skipped)
      toast(
        `${result.changed} operation${result.changed === 1 ? "" : "s"} updated; ${result.skipped} incompatible targets unchanged. Choose a compatible method or change the editing scope.`,
      );
  };
  const changeMethod = async (type, close = false) => {
    if (vectors.some((o) => !supportsMethod(o, type)) && !close) {
      state.methodRequest = {
        type,
        selection: ids.join("|"),
        action: active?.id || null,
        bulk: state.bulkOperations,
      };
      refresh();
      return;
    }
    if (
      !leaf &&
      state.bulkOperations === "all" &&
      targets.length > vectors.length &&
      !(await api.ask(
        "Change all sewing actions?",
        `<p>This changes the stitch method of ${targets.length} sewing actions across ${vectors.length} objects. Action order and colors stay independent; existing techniques, including placement and finishing, will change. Undo restores them.</p>`,
        "Change methods",
      ))
    ) {
      refresh();
      return;
    }
    state.methodRequest = null;
    state.satinMethodRequest = null;
    let result;
    const changed = mutate(() => {
      if (close)
        for (const o of openVectors) {
          const rings = closingRings(o);
          if (!rings)
            throw Error(
              `${o.name}: add or adjust nodes to form a closed area first.`,
            );
          o.closed = true;
          if (o.curve) {
            o.curve.closed = true;
            o.rings = rings;
          }
        }
      result = editOperations(objects, state, !!leaf, "type", type);
    });
    if (changed && result?.skipped)
      toast(
        `${result.changed} sewing actions updated; ${result.skipped} incompatible targets unchanged. Reference images and manual stitch objects keep their own editing controls.`,
      );
  };
  if ($("stitch-type"))
    $("stitch-type").onchange = (e) => {
      if (e.target.value === "satin") {
        if (control.every((o) => methodCategory(o.type) === "satin")) return;
        state.methodRequest = null;
        state.satinMethodRequest = {
          selection: ids.join("|"),
          action: active?.id || null,
          bulk: state.bulkOperations,
        };
        refresh();
        $("satin-construction")?.focus();
      } else {
        state.satinMethodRequest = null;
        changeMethod(e.target.value);
      }
    };
  for (const id of [
    "reinforcement",
    "satin-construction",
    "construction-method",
  ])
    if ($(id))
      $(id).onchange = (e) => {
        state.satinMethodRequest = null;
        changeMethod(e.target.value);
      };
  if ($("cancel-satin-choice"))
    $("cancel-satin-choice").onclick = () => {
      state.satinMethodRequest = null;
      refresh();
    };
  if ($("cancel-method-change"))
    $("cancel-method-change").onclick = () => {
      state.methodRequest = null;
      state.satinMethodRequest = null;
      refresh();
    };
  if ($("close-artwork"))
    $("close-artwork").onclick = () => changeMethod(pendingMethod, true);

  if ($("fill-pattern") && !document.querySelector(".fill-controls")) {
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
      objects
        .filter((o) => o.type !== "reference")
        .forEach((o) => (o.sequenceLocked = value));
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
  const tx = (opts) =>
    mutate(() => transformSelection(objects, { pivot: b.center, ...opts }));
  bindOrientation(api);
  if ($("reset-object-rotation"))
    $("reset-object-rotation").onclick = () => tx({ angle: -b.angle });
  bind("pos-x", (v) => tx({ dx: v - b.center.x }), -1000, 1000);
  bind("pos-y", (v) => tx({ dy: v - b.center.y }), -1000, 1000);
  bind(
    "size-w",
    (v) =>
      tx({
        sx: b.width ? v / b.width : 1,
        axes: b.angle,
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
        axes: b.angle,
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
        const id = el.dataset.operation,
          key = `${leaf.id}:${id}`;
        state.collapsedActionKey =
          active?.id === id && state.collapsedActionKey !== key ? key : null;
        state.activeOperationId = id === "base" ? null : id;
        state.methodRequest = null;
        state.satinMethodRequest = null;
        state.satinGuideEdit = null;
        refresh();
        api.draw();
        document
          .getElementById("action-heading-" + id)
          ?.focus({ preventScroll: true });
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
          state.activeOperationId = op.id;
          state.collapsedActionKey = null;
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
          state.collapsedActionKey = null;
          const ops = materialize(leaf),
            i =
              el.dataset.opId === "base"
                ? 0
                : ops.findIndex((op) => op.id === el.dataset.opId),
            action = el.dataset.opAction;
          if (action === "delete") {
            ops.splice(i, 1);
            state.activeOperationId = null;
          } else if (action === "copy") {
            if (ops.length >= 32) {
              toast("Each artwork object supports up to 32 sewing actions.");
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
            moveAction(leaf, ops[i].id, action === "up" ? -1 : 1);
          }
        })),
  );
  if ($("bulk-action-enabled")) {
    const input = $("bulk-action-enabled");
    input.checked = targets.every((op) => op.enabled !== false);
    input.indeterminate =
      targets.some((op) => op.enabled === false) &&
      targets.some((op) => op.enabled !== false);
    input.onchange = () => {
      const enabled = input.checked;
      mutate(() =>
        vectors.forEach((o) => {
          const selected = operationTargets(o, state, false),
            ops = materialize(o);
          for (const old of selected)
            (old.id === "base"
              ? ops[0]
              : ops.find((op) => op.id === old.id)
            ).enabled = enabled;
        }),
      );
    };
  }
  const additionType = () => {
    const category = $("add-operation").value;
    return category === "satin"
      ? $("add-satin-construction").value
      : category === "run"
        ? $("add-reinforcement").value
        : "fill";
  };
  const updateAddition = (type, buttonId, noteId) => {
    const eligible = vectors.filter(
      (o) => supportsMethod(o, type) && operationsOf(o).length < 32,
    ).length;
    $(buttonId).disabled = !eligible;
    $(buttonId).textContent = leaf
      ? buttonId === "construction-add"
        ? "Add construction action"
        : "Add action"
      : `Add to ${eligible} objects`;
    $(noteId).textContent =
      eligible === vectors.length
        ? `${leaf ? "Adds one action sharing this artwork's geometry." : `Adds one action to each of ${eligible} objects.`} Existing actions retain their colors, settings and order.`
        : `${eligible} of ${vectors.length} objects support this addition. Other objects need a closed region or have reached 32 actions. Close open artwork with its method selector first, or choose an open-path method.`;
  };
  const updateAdd = () => {
    const type = additionType(),
      category = $("add-operation").value;
    $("add-operation").dataset.help =
      categoryHelp(category) +
      " Adding creates one independent action; existing actions stay unchanged.";
    $("add-reinforcement-field").hidden = category !== "run";
    $("add-satin-field").hidden = category !== "satin";
    $("add-satin-guidance").textContent =
      METHOD_HELP[type] +
      (openVectors.length ? " Border and Column need closed artwork." : "");
    $("add-reinforcement").dataset.help = METHOD_HELP[type] || METHOD_HELP.run;
    updateAddition(type, "operation-add", "add-action-guidance");
  };
  const updateConstructionAdd = () => {
    const type = $("add-construction").value;
    $("add-construction-purpose").textContent = METHOD_HELP[type];
    updateAddition(type, "construction-add", "add-construction-guidance");
  };
  if ($("add-operation")) {
    for (const id of [
      "add-operation",
      "add-reinforcement",
      "add-satin-construction",
    ])
      $(id).onchange = updateAdd;
    $("add-construction").onchange = updateConstructionAdd;
    // Hidden contextual selectors retain usable defaults when changing categories.
    if (!$("add-reinforcement").value) $("add-reinforcement").value = "run";
    if (!$("add-satin-construction").value)
      $("add-satin-construction").value =
        openVectors.length && !vectors.some(closedArtwork) ? "satin" : "border";
    updateAdd();
    updateConstructionAdd();
  }
  const addAction = (type) => {
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
        if (leaf) {
          state.activeOperationId = op.id;
          state.collapsedActionKey = null;
        }
      }),
    );
    if (skipped)
      toast(
        `${skipped} regions skipped: closed artwork required or 32-operation limit reached.`,
      );
  };
  if ($("operation-add"))
    $("operation-add").onclick = () => addAction(additionType());
  if ($("construction-add"))
    $("construction-add").onclick = () =>
      addAction($("add-construction").value);
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
  api.threads?.inspector(objects, !!leaf, state);
  creativeInspector(api, leaf, objects, targets);
  bindFillControls(api, vectors, !!leaf);
  document
    .querySelectorAll("#properties details[data-section]")
    .forEach((el) => {
      if (el.dataset.section in state.inspectorSections)
        el.open = state.inspectorSections[el.dataset.section];
    });
  return true;
}
