import {
  nodeById,
  selectionIds,
  selectedLeaves,
  selectionBounds,
  transformSelection,
  PROJECT,
} from "./hierarchy.js";
import {
  OPERATION_TYPES,
  operationsOf,
  materialize,
  makeOperation,
  applique,
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
  const targets = vectors.flatMap((o) => {
    if (!o.operations) return [o];
    if (leaf && state.activeOperationId)
      return o.operations.filter((op) => op.id === state.activeOperationId);
    return !leaf && state.bulkOperations === "all"
      ? o.operations.filter(isSewing)
      : [o.operations.find(isSewing)].filter(Boolean);
  });
  const active = leaf?.operations?.find(
      (op) => op.id === state.activeOperationId,
    ),
    control = (targets.length ? targets : objects).map((target) => {
      const owner = vectors.find(
        (o) => o === target || o.operations?.includes(target),
      );
      return {
        closed: false,
        reverse: false,
        offset: 0,
        startIndex: 0,
        tieIn: true,
        tieOff: true,
        pattern: "quarter",
        ...owner,
        ...target,
      };
    });
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
  const hasFill = control.some((o) => o.type === "fill"),
    hasSatin = control.some((o) => ["satin", "border"].includes(o.type)),
    hasPath = control.some(
      (o) => !["fill", "stop", "trim", "manual"].includes(o.type),
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
    `<p class="selection-summary">${all.length} artwork object${all.length === 1 ? "" : "s"} selected${all.length !== objects.length ? ` · ${all.length - objects.length} locked, excluded from edits` : ""}</p>
    ${name !== undefined ? `<label class="field">${one?.kind ? "Group / SVG name" : "Object name"}<input id="object-name" value="${escape(name)}" maxlength="100" ${one?.locked ? "disabled" : ""}></label>` : ""}
    ${
      !objects.length
        ? `<p class="property-note">${all.length ? "Unlock artwork in the tree to edit it." : "This selection contains no drawable geometry."}</p>`
        : `
    ${(vectors.length && ids.length > 1) || one?.kind || ids[0] === PROJECT ? '<label class="field">Apply embroidery settings to<select id="bulk-scope"><option value="primary">Primary operation of each region</option><option value="all">All sewing operations</option></select></label>' : ""}
    ${
      targets.length
        ? `<label class="field">Stitch type / operation<select id="stitch-type">${mixed("type") ? '<option value="" selected disabled>Mixed</option>' : ""}${Object.entries(
            OPERATION_TYPES,
          )
            .map(
              ([k, v]) =>
                `<option value="${k}" ${common("type") === k ? "selected" : ""}>${v}</option>`,
            )
            .join("")}</select></label>`
        : ""
    }
    <div class="section-label">THREAD COLOR ${mixed("color") ? "<span>MIXED</span>" : ""}</div><input id="thread-color" type="color" aria-label="Thread color" value="${common("color") || "#000000"}"><div class="swatch-palette">${palette.map((c) => `<button data-color="${c}" style="background:${c}" aria-label="Use thread ${c}"></button>`).join("")}</div>
    ${
      targets.some(isSewing)
        ? `<div class="section-label">STITCH SETTINGS${active ? " · SELECTED OPERATION" : ""}</div><div class="two-col">${hasFill || hasSatin ? field("Row spacing", "spacing", "spacing", "mm", 0.15, 5) : ""}${control.some((o) => !["satin", "border"].includes(o.type)) ? field("Stitch length", "length", "length", "mm", 0.3, 7) : ""}</div>${hasFill ? field("Stitch direction", "angle", "angle", "°", -360, 360, 1) : ""}${hasFill ? `<label class="field">Fill pattern<select id="fill-pattern">${mixed("pattern") ? '<option value="" disabled selected>Mixed</option>' : ""}<option value="quarter">Quarter stagger</option><option value="half">Half stagger</option><option value="aligned">Aligned penetrations</option></select></label>` : ""}<div class="two-col">${hasSatin ? field("Satin width", "satin-width", "width", "mm", 0.3, 7) : ""}${hasFill || hasSatin ? field("Pull compensation", "compensation", "compensation", "mm", 0, 1) : ""}</div>
    ${check(hasFill || hasSatin ? "Light underlay" : "Preliminary outline pass", "underlay", "underlay")}${hasPath && !hasOutline ? check("Close path", "closed-path", "closed") : ""}${hasPath ? check("Reverse path direction", "reverse-path", "reverse") : ""}
    <details class="advanced-settings"><summary>Path & construction</summary>${hasOutline ? field("Contour offset", "op-offset", "offset", "mm", -5, 5) : ""}${hasPath && control.some((o) => o.closed || ["placement", "tackdown", "basting", "contour", "border"].includes(o.type)) ? field("First contour vertex", "start-index", "startIndex", "", 0, 500000, 1) : ""}${check("Tie in", "tie-in", "tieIn")}${check("Tie off", "tie-off", "tieOff")}<p class="property-note">Offsets apply to closed outline operations. Start vertex and reversal affect contour paths; fill direction controls tatami. Satin width and spacing stay in millimeters when artwork is resized.</p></details>`
        : ""
    }
    <div class="section-label">POSITION & SIZE · SELECTION</div><div class="two-col">${field("Center X", "pos-x", null, "mm", -1000, 1000, 0.1, (b.minX + b.maxX) / 2)}${field("Center Y", "pos-y", null, "mm", -1000, 1000, 0.1, (b.minY + b.maxY) / 2)}${field("Width", "size-w", null, "mm", 0.1, 500, 0.1, b.width)}${field("Height", "size-h", null, "mm", 0.1, 500, 0.1, b.height)}</div><label class="check"><input id="proportional" type="checkbox" ${state.proportional !== false ? "checked" : ""}>Keep proportions · Shift while dragging to toggle</label>${field("Rotate selection by", "rotate", null, "°", -360, 360, 1, 0)}
    ${check("Keep sequence position", "sequence-locked", "sequenceLocked")}
    ${leaf?.type === "manual" ? manualEditor(leaf) : leaf ? '<button id="convert-manual">Make stitches editable</button>' : ""}
    ${
      vectors.length
        ? `<section class="operations-panel"><div class="section-label">EMBROIDERY OPERATIONS</div><p class="property-note">${leaf ? "Select a step to edit its independent settings. All steps share this artwork." : "Add a step to each selected vector region. Existing steps retain their order."}</p>
    ${
      leaf
        ? `<div class="operation-stack">${operationsOf(leaf)
            .map(
              (op, i) =>
                `<div class="operation-row ${active?.id === op.id ? "active" : ""}"><input type="checkbox" data-op-enabled="${escape(op.id)}" aria-label="Enable ${escape(op.name)}" ${op.enabled !== false ? "checked" : ""}><button data-operation="${escape(op.id)}">${i + 1}. ${escape(op.name)}</button>${leaf.operations ? `<button data-op-action="up" data-op-id="${escape(op.id)}" aria-label="Move ${escape(op.name)} earlier">↑</button><button data-op-action="down" data-op-id="${escape(op.id)}" aria-label="Move ${escape(op.name)} later">↓</button><button data-op-action="copy" data-op-id="${escape(op.id)}" aria-label="Duplicate ${escape(op.name)}">⧉</button><button data-op-action="delete" data-op-id="${escape(op.id)}" aria-label="Delete ${escape(op.name)}">×</button>` : ""}</div>`,
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
      )}</select><button id="operation-add">Add</button></div><button id="applique-recipe">Use appliqué recipe</button><p class="property-note">Recipe replaces the operation stack with placement → stop → tackdown → stop → satin border. Undo restores it. Closed artwork required.</p></section>`
        : ""
    }
    `
    }`;
  const operationsPanel = $("properties").querySelector(".operations-panel");
  if (operationsPanel && leaf)
    $("properties").insertBefore(
      operationsPanel,
      $("properties").querySelector("label:has(#stitch-type)"),
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
  const apply = (key, value) =>
    mutate(() => {
      if (!targets.length && key === "color")
        objects.forEach((o) => (o.color = value));
      let incompatible = 0;
      for (const o of vectors) {
        if (
          key === "type" &&
          ["placement", "tackdown", "basting", "border", "contour"].includes(
            value,
          ) &&
          !(o.type === "fill" || o.closed)
        ) {
          incompatible++;
          continue;
        }
        let settings = o.operations
          ? leaf && state.activeOperationId
            ? o.operations.filter((op) => op.id === state.activeOperationId)
            : !leaf && state.bulkOperations === "all"
              ? o.operations.filter(isSewing)
              : [o.operations.find(isSewing)].filter(Boolean)
          : [o];
        settings = settings.filter((s) => propertyApplies(s.type, key));
        if (!settings.length) continue;
        if (
          !o.operations &&
          ((key === "type" && !["fill", "run", "satin"].includes(value)) ||
            ["reverse", "offset", "startIndex"].includes(key))
        )
          settings = materialize(o);
        settings.forEach((s) => {
          s[key] = value;
        });
      }
      if (incompatible)
        toast(
          `${incompatible} open paths skipped; this operation requires closed artwork.`,
        );
      if (key === "color")
        objects
          .filter((o) => o.type === "manual")
          .forEach((o) => (o.color = value));
    });
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
    sequenceLocked: o.sequenceLocked || o.type === "manual",
  }));
  $("sequence-locked").checked = sequence.every((o) => o.sequenceLocked);
  $("sequence-locked").indeterminate =
    commonValue(sequence, "sequenceLocked") === undefined;
  $("sequence-locked").onchange = (e) => {
    const value = e.target.checked;
    mutate(() => {
      objects.forEach((o) => (o.sequenceLocked = value));
      if (one?.kind) one.sequenceLocked = value;
    });
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
      mutate(
        () =>
          (active.name = e.target.value.trim() || OPERATION_TYPES[active.type]),
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
          } else if (action === "copy" && ops.length < 32) {
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
          if (
            (["placement", "tackdown", "basting", "border", "contour"].includes(
              type,
            ) &&
              !(o.type === "fill" || o.closed)) ||
            operationsOf(o).length >= 32
          ) {
            skipped++;
            return;
          }
          const op = makeOperation(type, o);
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
    $("applique-recipe").onclick = () => {
      let skipped = 0;
      mutate(() =>
        vectors.forEach((o) => {
          if (!(o.type === "fill" || o.closed)) {
            skipped++;
            return;
          }
          o.operations = applique(o);
          state.activeOperationId = null;
        }),
      );
      if (skipped)
        toast(
          `${skipped} open paths skipped; appliqué requires closed artwork.`,
        );
    };
  return true;
}
