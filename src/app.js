import { rasterImport } from "./reference-ui.js";
import { installDrawingStyle } from "./drawing-style-ui.js";
import { satinSummary } from "./creative-ui.js";
import { EMBROIDERY_STYLES, setEmbroideryStyle } from "./styles.js";
import { traceDialog } from "./tracing-ui.js";
import {
  smartShape,
  productTemplate,
  alignReference,
  distributeArtwork,
} from "./creative.js";
import { detachSource, curveRings, identity } from "./smart-geometry.js";
import {
  demo,
  object,
  ellipse,
  PALETTE,
  MACHINES,
  validateProject,
} from "./model.js";
import { analyze } from "./engine.js";
import { importSVG, lettering } from "./importers.js";
import { Stage } from "./stage.js";
import { planningOptions } from "./planning.js";
import {
  PROJECT,
  nodeById,
  within,
  nodes,
  children,
  treeRows,
  isVisible,
  isLocked,
  leaves,
  roots,
  selectionIds,
  selectedLeaves,
  selectionBounds,
  transformSelection,
  groupSelection,
  ungroupSelection,
  deleteSelection,
  copySelection,
  pasteSelection,
  reorder,
  moveInTree,
  alignSelection,
} from "./hierarchy.js";
import { renderInspector } from "./inspector.js";
import {
  isManualOrder,
  sewingIds,
  normalizeSewingOrder,
  useTreeOrder,
  moveSewingObjects,
} from "./sequencing.js";
import { installReordering } from "./reorder-ui.js";
import { installHelp } from "./help.js";
import { installWorkspace } from "./workspace-layout.js";
import { arrangeArtwork, installArrangeMenu } from "./arrange.js";
const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${{ eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', hidden: '<path d="m3 3 18 18M9.5 5.3A12 12 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.7M6 6.4A20 20 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.4-1.3M10 10a3 3 0 0 0 4 4"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>', grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3"/>' }[name]}</svg>`;
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const fmt = (n) => Math.round(n).toLocaleString(),
  num = (v, d = 1) => Number(v).toFixed(d);
const state = {
  project: demo(),
  selection: null,
  selectionIds: [],
  collapsed: new Set(),
  isolation: null,
  proportional: true,
  snapGrid: false,
  snapObjects: true,
  activeOperationId: null,
  mode: "design",
  tool: "select",
  plan: null,
  cursor: 0,
  showStitches: true,
  showJumps: false,
  showUnderlay: true,
  showEvents: false,
  space: false,
  manualIndex: 0,
};
let restored = false;
try {
  const saved = localStorage.getItem("embroidery-studio-v1");
  if (saved) {
    state.project = validateProject(JSON.parse(saved));
    restored = true;
  }
} catch {}
let history = [],
  future = [],
  generation = 0,
  generationTimer,
  saveTimer,
  toastTimer,
  playing = false,
  lastTime = 0,
  playFraction = 0,
  formatWorker,
  requestId = 0,
  busy = false,
  machinePlan = false;
const pendingFormats = new Map();
let clipboard = null;
let workspaceLayout, arrangeMenu;
const worker = new Worker(new URL("./digitize-worker.js", import.meta.url), {
  type: "module",
});
const stage = new Stage($("stage"), state, {
  refresh: renderPanels,
  select,
  mutate,
  changed: record,
  finish: finishPath,
  draft: updateDraft,
  shape: addShape,
  scrub,
  contextMenu: ({ x, y }) => arrangeMenu?.open(x, y),
});
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 5000);
}
function selected() {
  return state.project.objects.find((o) => o.id === state.selection);
}
function record(before) {
  normalizeSewingOrder(state.project);
  if (before === JSON.stringify(state.project)) {
    renderPanels();
    stage.render();
    return true;
  }
  try {
    validateProject(state.project);
  } catch (e) {
    state.project = JSON.parse(before);
    select(null);
    toast("Could not apply edit: " + e.message);
    return false;
  }
  history.push(before);
  while (
    history.length > 1 &&
    (history.length > 50 ||
      history.reduce((n, s) => n + s.length, 0) > 16000000)
  )
    history.shift();
  future = [];
  changed();
  return true;
}
function mutate(fn) {
  const before = JSON.stringify(state.project);
  try {
    fn();
    return record(before);
  } catch (e) {
    state.project = JSON.parse(before);
    renderPanels();
    stage.render();
    toast("Could not apply edit: " + e.message);
    return false;
  }
}
function changed() {
  pause();
  $("preview-selection").disabled = false;
  state.selectionIds = selectionIds(state).filter(
    (id) => id === PROJECT || nodeById(state.project, id),
  );
  state.selection = state.selectionIds[0] || null;
  if (
    state.activeOperationId &&
    !state.project.objects
      .find((o) => o.id === state.selection)
      ?.operations?.some((op) => op.id === state.activeOperationId)
  )
    state.activeOperationId = null;
  if (state.isolation && !nodeById(state.project, state.isolation))
    state.isolation = null;
  machinePlan = false;
  $("sequence-source").textContent = "Generated design";
  renderPanels();
  scheduleGenerate();
  clearTimeout(saveTimer);
  $("save-status").textContent = "Saving…";
  saveTimer = setTimeout(autosave, 400);
}
function autosave() {
  try {
    localStorage.setItem("embroidery-studio-v1", JSON.stringify(state.project));
    $("save-status").textContent = "Saved on this device";
  } catch {
    $("save-status").textContent = "Save project to keep a copy";
  }
}
function scheduleGenerate() {
  const id = ++generation;
  state.plan = null;
  $("status").textContent = "Generating stitch sequence…";
  $("export").disabled = true;
  clearTimeout(generationTimer);
  generationTimer = setTimeout(() => {
    const project = {
      ...state.project,
      objects: state.project.objects.filter((o) => o.type !== "reference"),
    };
    delete project.referenceAssets;
    worker.postMessage({ id, project });
  }, 100);
}
worker.onmessage = ({ data }) => {
  if (data.id !== generation) return;
  if (data.error) {
    state.plan = null;
    state.generationError = data.error;
    $("status").textContent = data.error;
    toast(data.error);
    renderStats();
    return;
  }
  state.generationError = null;
  state.plan = data;
  const satinStatus = $("satin-analysis");
  if (satinStatus?.dataset.object)
    satinStatus.textContent = satinSummary(
      (data.diagnostics?.satin || []).filter(
        (d) =>
          d.objectId === satinStatus.dataset.object &&
          d.operationId === satinStatus.dataset.operation,
      ),
    );
  state.cursor = data.events.length;
  $("export").disabled =
    data.issues?.some((i) => i.severity === "error") || false;
  renderStats();
  renderTimeline();
  renderPlayback();
  markSourceRows();
  stage.render();
  $("status").textContent =
    `Ready · ${fmt(data.stats.stitches)} stitches · ${num(data.stats.bounds.width)} × ${num(data.stats.bounds.height)} mm`;
};
worker.onerror = (e) => {
  toast("Stitch engine error. Reload the page to restart.");
  $("status").textContent = e.message;
};
function select(id, options = {}) {
  let ids = Array.isArray(id) ? id : id ? [id] : [];
  if (options.toggle && ids.length) {
    const current = new Set(selectionIds(state));
    for (const item of ids)
      current.has(item) ? current.delete(item) : current.add(item);
    ids = [...current];
  }
  state.selectionIds = roots(state.project, ids);
  state.selection = state.selectionIds[0] || null;
  state.activeOperationId = null;
  stage.node = null;
  state.manualIndex = 0;
  renderPanels();
  stage.render();
}
function setMode(mode) {
  state.mode = mode;
  pause();
  stage.draft = [];
  updateDraft();
  $("design-tab").setAttribute("aria-selected", mode === "design");
  $("preview-tab").setAttribute("aria-selected", mode === "preview");
  $("stage-kicker").textContent =
    mode === "design" ? "DESIGN WORKSPACE" : "STITCH SIMULATION";
  $("stage-hint").textContent =
    mode === "design"
      ? "Select an object to refine its stitches"
      : "Scrub the timeline or click a stitch to inspect";
  document.querySelector(".tool-rail").hidden = mode !== "design";
  renderProperties();
  stage.render();
}
function setTool(tool) {
  if (state.mode !== "design") setMode("design");
  stage.draft = [];
  stage.node = null;
  updateDraft();
  state.tool = tool;
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === tool);
    b.setAttribute("aria-pressed", String(b.dataset.tool === tool));
  });
  document
    .querySelector(`[data-tool="${tool}"]`)
    ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  const hints = {
    select: "Drag objects to position them in the hoop",
    node: "Drag nodes · double-click an edge to add a node",
    polygon: "Click outline points · Enter to finish a fill",
    run: "Click path points · Enter to finish a running stitch",
    satin: "Click a centerline · Enter to finish satin",
    manual: "Click each needle point · Enter to finish stitches",
    rect: "Drag to draw a rectangle",
    ellipse: "Drag to draw an ellipse",
    pan: "Drag to pan the view · + / − to zoom",
    regular: "Drag a polygon · adjust sides and radius in Smart shape",
    star: "Drag a star · adjust points and inner radius in Smart shape",
    eyelet:
      "Place reinforcement · adjust hole diameter and satin band in Smart eyelet",
    pen: "Click-drag curve anchors · Enter finishes · edit handles with Node tool",
  };
  $("stage-hint").textContent = hints[tool];
  stage.render();
}
function updateDraft() {
  $("draw-actions").hidden = stage.draft.length === 0;
  $("pen-closed").closest("label").hidden = state.tool !== "pen";
  $("draw-message").textContent = `${stage.draft.length} points placed`;
  $("finish-draw").disabled =
    stage.draft.length < (state.tool === "polygon" ? 3 : 2);
}
function finishPath() {
  const type = state.tool,
    pts = stage.draft;
  if (type === "pen" && pts.length >= 2) {
    const closed = $("pen-closed").checked,
      curve = { nodes: structuredClone(pts), closed, frame: identity() };
    const made = object("Bézier path", curveRings(curve), {
      curve,
      type: closed ? "fill" : "run",
      closed,
      underlay: false,
    });
    if (closed) applyDrawingStyle(made);
    addObjects([made]);
    stage.draft = [];
    updateDraft();
    setTool("select");
    return;
  }
  if (pts.length < (type === "polygon" ? 3 : 2)) return;
  let o = object(
    type === "polygon"
      ? "Fill region"
      : type === "manual"
        ? "Manual stitches"
        : type === "satin"
          ? "Satin centerline"
          : "Running path",
    [structuredClone(pts)],
    {
      type: type === "polygon" ? "fill" : type === "manual" ? "manual" : type,
      color: selected()?.color || PALETTE[0],
      underlay: type === "satin",
    },
  );
  if (type === "manual") {
    o.commands = pts.map((p, i) => ({ ...p, cmd: i ? "stitch" : "jump" }));
    o.rings = [];
  }
  if (type === "polygon") applyDrawingStyle(o);
  addObjects([o]);
  stage.draft = [];
  updateDraft();
  setTool("select");
}
function applyDrawingStyle(o) {
  const style = $("draw-style").value;
  if (style !== "auto") setEmbroideryStyle(o, style);
}
function addShape({ start: a, end: b }) {
  const w = Math.abs(a.x - b.x),
    h = Math.abs(a.y - b.y),
    kind = state.tool;
  const o = smartShape(
    kind,
    kind === "eyelet" ? 6 : w,
    kind === "eyelet" ? 6 : h,
    {
      frame: [1, 0, 0, 1, (a.x + b.x) / 2, (a.y + b.y) / 2],
    },
  );
  o.color = selected()?.color || PALETTE[0];
  if (kind === "eyelet") for (const op of o.operations) op.color = o.color;
  else applyDrawingStyle(o);
  addObjects([o]);
  setTool("select");
}
async function templateDialog() {
  const ok = await ask(
    "Create an editable product",
    '<label>Product<select id="template-kind"><option value="keychain">Keychain / tag</option><option value="badge">Patch / badge</option><option value="applique">Appliqué</option></select></label><label>Width · mm<input id="template-width" type="number" min="15" max="90" value="65" required></label><label>Height · mm<input id="template-height" type="number" min="15" max="90" value="28" required></label><label>Corner radius · mm<input id="template-radius" type="number" min="0" max="20" value="4" required></label><label>Border width · mm<input id="template-border" type="number" min=".5" max="5" value="2.5" required step=".1"></label><p>Creates ordinary editable artwork with shared construction steps. Configure stops for your fabric and process. An eyelet is reinforcement for a manually punched hole.</p>',
    "Create product",
  );
  if (ok)
    addObjects(
      productTemplate(
        $("template-kind").value,
        Number($("template-width").value),
        Number($("template-height").value),
        Number($("template-radius").value),
        Number($("template-border").value),
      ),
    );
}
function addObjects(objects) {
  mutate(() => {
    state.project.objects.push(...objects);
    if (objects.groups) (state.project.groups ||= []).push(...objects.groups);
    state.selectionIds = objects.groups?.length
      ? [objects.groups[0].id]
      : objects.map((o) => o.id);
    state.selection = state.selectionIds[0] || null;
  });
  toast(
    `Added ${objects.length === 1 ? objects[0].name : objects.length + " objects"}`,
  );
}
function renderPanels() {
  drawingStyleUI.refresh();
  const focused = document.activeElement?.closest("#object-list button"),
    focusKey =
      focused &&
      ["select", "check", "visibility", "lock", "expand"].find(
        (key) => focused.dataset[key],
      );
  // Selecting another SVG (including import or timeline selection) leaves the
  // previous focus scope, so newly selected artwork cannot remain invisible.
  if (
    state.isolation &&
    selectionIds(state).some((id) => {
      const n = nodeById(state.project, id);
      return (
        id === PROJECT || (n && !within(state.project, n, state.isolation))
      );
    })
  )
    state.isolation = null;
  const planning = planningOptions(state.project);
  $("optimize-colors").checked = planning.optimizeColors;
  $("skip-outlines").checked = planning.skipSvgOutlines;
  $("small-detail").value = planning.smallDetail;
  if (document.activeElement !== $("project-name"))
    $("project-name").value = state.project.name;
  $("machine").value = state.project.machine;
  const m = MACHINES[state.project.machine];
  $("machine-summary").textContent = m.name;
  $("hoop-size").textContent = `${m.width} × ${m.height} mm`;
  $("object-count").textContent = state.project.objects.length;
  const selectedIds = new Set(selectionIds(state)),
    affected = new Set(selectedLeaves(state).map((o) => o.id));
  const row = (
    o,
    depth,
  ) => `<div data-reorder-id="${esc(o.id)}" role="treeitem" aria-level="${depth + 2}" aria-selected="${selectedIds.has(o.id)}" ${o.kind ? `aria-expanded="${!state.collapsed.has(o.id)}"` : ""} class="object-row ${o.kind ? "group-row" : ""} ${selectedIds.has(o.id) ? "selected" : affected.has(o.id) ? "affected" : ""} ${!isVisible(state.project, o) ? "hidden" : ""} ${isLocked(state.project, o) ? "locked" : ""}" style="--depth:${Math.min(depth, 5)}">
    <button class="drag-grip" data-tree-grip aria-label="Reorder ${esc(o.name)}">${icon("grip")}</button>
    <button class="selection-check" data-check="${esc(o.id)}" aria-label="Select ${esc(o.name)}" aria-pressed="${selectedIds.has(o.id) ? "true" : affected.has(o.id) ? "mixed" : "false"}"><span>${selectedIds.has(o.id) ? "✓" : affected.has(o.id) ? "−" : ""}</span></button>
    ${o.kind ? `<button class="tree-toggle" data-expand="${esc(o.id)}" aria-label="${state.collapsed.has(o.id) ? "Expand" : "Collapse"} ${esc(o.name)}">${state.collapsed.has(o.id) ? "▸" : "▾"}</button>` : '<span class="tree-toggle"></span>'}
    <button class="object-select" data-select="${esc(o.id)}"><span class="swatch ${o.kind ? "group-icon" : ""}" style="background:${o.color || "transparent"}">${o.type === "reference" ? "▧" : o.kind ? (o.kind === "svg" ? "▧" : "▱") : ""}</span><span class="object-text"><span class="object-title">${esc(o.name)}</span><span class="object-type">${o.kind ? `${leaves(state.project, [o.id]).length} regions · ${o.kind === "svg" ? "Imported SVG" : "Group"}` : o.operations ? `${o.operations.length} operations` : o.type === "reference" ? "Reference image · no stitches" : o.svgLabel ? esc(o.svgLabel) : o.type === "fill" ? "Tatami fill" : o.type === "satin" ? "Satin centerline" : o.type === "manual" ? "Manual stitches" : "Running stitch"}</span></span></button>
    <button class="tree-lock" data-lock="${esc(o.id)}" aria-label="${o.locked ? "Unlock" : "Lock"} ${esc(o.name)}" aria-pressed="${isLocked(state.project, o)}">${icon(isLocked(state.project, o) ? "lock" : "unlock")}</button><button class="visibility" data-visibility="${esc(o.id)}" aria-label="${o.visible === false ? "Show" : "Hide"} ${esc(o.name)}" aria-pressed="${!isVisible(state.project, o)}">${icon(isVisible(state.project, o) ? "eye" : "hidden")}</button></div>`;
  $("object-list").setAttribute("role", "tree");
  $("object-list").setAttribute("aria-multiselectable", "true");
  $("object-list").innerHTML =
    `<button class="project-tree ${selectedIds.has(PROJECT) ? "selected" : ""}" data-select="${PROJECT}" role="treeitem" aria-selected="${selectedIds.has(PROJECT)}">◇ ${esc(state.project.name)} <small>Project</small></button>` +
    treeRows(state.project, state.collapsed)
      .map(({ node, depth }) => row(node, depth))
      .join("") +
    (state.project.objects.length
      ? ""
      : '<p class="empty-list">Draw, add lettering or import artwork.</p>');
  $("selection-count").textContent = affected.size
    ? `${affected.size} selected${state.isolation ? " · focus mode" : ""}`
    : "Select artwork";
  $("exit-isolation").hidden = !state.isolation;
  $("undo").disabled = !history.length;
  $("redo").disabled = !future.length;
  for (const id of ["move-up", "move-down", "duplicate", "delete"])
    $(id).disabled = !selectedLeaves(state, { editable: true }).length;
  renderProperties();
  markSourceRows();
  renderOrderMode();
  if (focusKey)
    [...$("object-list").querySelectorAll(`[data-${focusKey}]`)]
      .find((el) => el.dataset[focusKey] === focused.dataset[focusKey])
      ?.focus({ preventScroll: true });
}
function renderOrderMode() {
  const manual = isManualOrder(state.project);
  $("order-mode").value = manual ? "manual" : "auto";
  $("order-mode").disabled = machinePlan;
  $("order-badge").textContent = manual ? "Manual" : "Automatic";
  $("order-relationship").textContent = machinePlan
    ? "Decoded file · return to Design to reorder"
    : manual
      ? state.project.sequencing.origin === "tree"
        ? "Linked to tree layers"
        : "Independent of tree layers"
      : "Safe color & travel optimization";
  $("optimize-colors").disabled = manual;
}
function markSourceRows() {
  if (!state.plan || machinePlan) return;
  const active = new Set(
    state.plan.events.filter((e) => e.cmd === "stitch").map((e) => e.objectId),
  );
  document.querySelectorAll(".object-row").forEach((row) => {
    const id = row.querySelector("[data-select]")?.dataset.select,
      sourceOnly = !leaves(state.project, [id]).some((o) => active.has(o.id));
    row.classList.toggle("source-only", sourceOnly);
    if (sourceOnly)
      row.dataset.help =
        "Source artwork retained. This object currently produces no sewing stitches; check digitizing settings or its geometry.";
    else delete row.dataset.help;
  });
}
function field(label, id, value, unit = "", min = "", max = "", step = ".1") {
  return `<label class="field"><span class="field-title">${label}<small>${unit}</small></span><input id="${id}" type="number" value="${num(value, 2)}" min="${min}" max="${max}" step="${step}"></label>`;
}
function bindNumber(id, fn, min, max) {
  const el = $(id);
  if (el)
    el.onchange = () => {
      const n = Number(el.value);
      if (!Number.isFinite(n) || n < min || n > max) {
        toast(`Enter a value between ${min} and ${max}.`);
        renderProperties();
        return;
      }
      mutate(() => fn(n));
    };
}
function renderProperties() {
  if (
    renderInspector({
      state,
      mutate,
      toast,
      ask,
      refresh: renderProperties,
      palette: PALETTE,
      manualEditor,
      bindManual,
      convertManual,
      draw: () => stage.render(),
      selectTool: () => setTool("select"),
      node: () => stage.node,
      retrace: async (group) => {
        const response = await fetch(group.imageSource.data),
          file = await response.blob();
        const result = await traceDialog(file, ask, {
          ...group.imageSource,
          settings: group.traceSettings,
        });
        if (result)
          mutate(() => {
            const old = leaves(state.project, [group.id]),
              b = selectionBounds(old),
              q = selectionBounds(result);
            transformSelection(result, {
              sx: b.width / (q.width || 1),
              sy: b.height / (q.height || 1),
              dx: (b.minX + b.maxX) / 2,
              dy: (b.minY + b.maxY) / 2,
            });
            const parent = group.parentId,
              name = group.name,
              id = group.id;
            deleteSelection(state.project, [id]);
            result.groups[0].id = id;
            result.groups[0].name = name;
            result.groups[0].parentId = parent;
            result.forEach((o) => (o.parentId = id));
            state.project.objects.push(...result);
            (state.project.groups ||= []).push(...result.groups);
            state.selection = id;
            state.selectionIds = [id];
          });
      },
    })
  )
    return;
  const o = null;
  if (!o) {
    $("properties").innerHTML =
      `<p class="intro">From a first sketch to the final stitch.<br>Create something worth making.</p><div class="quick-actions"><button id="quick-import">↗ Import artwork or embroidery</button><button id="quick-lettering">T Add lettering / monogram</button><button id="quick-flower">✽ Load wildflower example</button></div><div class="section-label">A SIMPLE WORKFLOW</div><p class="property-note">01 &nbsp; Draw or import your artwork.<br><br>02 &nbsp; Set stitch type, spacing and direction.<br><br>03 &nbsp; Inspect the actual sequence in Stitch preview.<br><br>04 &nbsp; Export a machine file and test your sew-out.</p>`;
    $("quick-import").onclick = () => $("file-input").click();
    $("quick-lettering").onclick = textDialog;
    $("quick-flower").onclick = loadDemo;
    return;
  }
}
function convertManual(o) {
  if (!state.plan || machinePlan) {
    toast("Return to the generated design sequence first.");
    return;
  }
  const commands = state.plan.events
    .filter((e) => e.objectId === o.id && !["color", "end"].includes(e.cmd))
    .map(({ x, y, cmd }) => ({ x, y, cmd }));
  if (!commands.length) return;
  mutate(() => {
    o.commands = commands;
    o.type = "manual";
    o.rings = [];
    delete o.operations;
    state.manualIndex = 0;
  });
  toast("Stitches are now editable. Undo returns to the vector object.");
}
function manualEditor(o) {
  const i = Math.min(state.manualIndex, o.commands.length - 1),
    c = o.commands[i];
  state.manualIndex = Math.max(0, i);
  if (!c) return '<p class="property-note">This stitch block is empty.</p>';
  return `<div class="command-editor"><h3>Individual stitch editor</h3><label class="field">Command index<input id="manual-index" type="number" value="${i + 1}" min="1" max="${o.commands.length}" step="1"></label><label class="field">Command<select id="manual-cmd">${["stitch", "jump", "trim", "stop"].map((k) => `<option ${k === c.cmd ? "selected" : ""}>${k}</option>`).join("")}</select></label><div class="two-col">${field("Needle X", "manual-x", c.x, "mm", -1000, 1000)}${field("Needle Y", "manual-y", c.y, "mm", -1000, 1000)}</div><button id="manual-insert">Insert stitch after</button><button id="manual-delete">Delete command</button><p class="property-note">Select the node tool to drag needle points on the canvas.</p></div>`;
}
function bindManual(o) {
  $("manual-index")?.addEventListener("change", (e) => {
    state.manualIndex = Math.max(
      0,
      Math.min(
        o.commands.length - 1,
        Math.floor(Number(e.target.value) || 1) - 1,
      ),
    );
    renderProperties();
    highlightManual();
  });
  const c = o.commands[state.manualIndex];
  if (!c) return;
  $("manual-cmd").onchange = (e) => mutate(() => (c.cmd = e.target.value));
  bindNumber("manual-x", (v) => (c.x = v), -1000, 1000);
  bindNumber("manual-y", (v) => (c.y = v), -1000, 1000);
  $("manual-delete").onclick = () =>
    mutate(() => o.commands.splice(state.manualIndex, 1));
  $("manual-insert").onclick = () =>
    mutate(() => {
      o.commands.splice(state.manualIndex + 1, 0, {
        x: c.x + 1,
        y: c.y,
        cmd: "stitch",
      });
      state.manualIndex++;
    });
}
function highlightManual() {
  const i = state.plan?.events.findIndex(
    (e) =>
      e.objectId === state.selection && e.sourceIndex === state.manualIndex,
  );
  if (i >= 0) {
    state.cursor = i + 1;
    renderPlayback();
    stage.node = state.manualIndex;
    stage.render();
  }
}
function renderStats() {
  const stats = state.plan?.stats;
  $("stats").innerHTML = stats
    ? `<div><strong>${fmt(stats.stitches)}</strong><span>Sewing stitches</span></div><div><strong>${stats.colors}</strong><span>Color blocks · ${stats.uniqueColors} threads</span></div><div><strong>${stats.manualChanges}</strong><span>Manual thread changes</span></div><div><strong>${fmt(stats.jumps)}</strong><span>Jumps · ${fmt(stats.trims)} trims</span></div><div><strong>${num(stats.minutes, 0)} <small>min</small></strong><span>Estimated machine time</span></div><div><strong>${num(stats.thread)} <small>m</small></strong><span>Top thread path</span></div>`
    : '<p class="property-note">No stitch sequence</p>';
  if (stats) {
    if (stats.stops)
      $("stats").insertAdjacentHTML(
        "beforeend",
        `<div><strong>${stats.stops}</strong><span>Machine stops · operator action</span></div>`,
      );
    const b = stats.jumpBreakdown;
    const detail =
      machinePlan || b.unclassified
        ? `Decoded file: ${fmt(stats.jumps)} jump commands (${fmt(stats.jumpMoves)} moves), ${fmt(stats.trims)} encoded trim commands. Object origins are unavailable in machine files.`
        : `Jump commands: ${b.initial} initial · ${b.betweenObjects} between objects · ${b.betweenRegions} between regions · ${b.withinRegions} within regions. ${fmt(stats.travelStitches)} running travel stitches stay inside fills. ${fmt(stats.jumps - stats.jumpMoves)} jumps have no positional movement.`;
    $("stats").insertAdjacentHTML(
      "beforeend",
      `<p class="property-note travel-summary">${detail}</p>`,
    );
  }
  $("fit-status").textContent = stats
    ? stats.fits
      ? "✓ Design fits selected hoop"
      : "! Design exceeds hoop"
    : "Generate a design to check fit";
  $("fit-status").classList.toggle("bad", !!stats && !stats.fits);
  const issues = state.generationError
    ? [
        {
          severity: "error",
          message: state.generationError,
          action:
            "Repair the affected artwork or undo the last edit, then regenerate.",
        },
      ]
    : state.plan?.issues ||
      (state.plan?.warnings || []).map((message) => ({
        severity: "warning",
        message,
      }));
  const wasOpen = $("warnings").querySelector("details")?.open;
  const count = (severity) =>
    issues.filter((i) => i.severity === severity).length;
  $("warnings").innerHTML =
    `<details class="design-issues" ${wasOpen || count("error") ? "open" : ""}><summary>Design issues <span>${issues.length ? [count("error") ? count("error") + " errors" : "", count("warning") ? count("warning") + " warnings" : "", count("info") ? count("info") + " notices" : ""].filter(Boolean).join(" · ") : "No issues"}</span></summary>${issues.map((i, index) => `<article class="design-issue ${i.severity}"><strong>${esc(i.severity)}${i.objectName ? " · " + esc(i.objectName) : ""}${i.operationName ? " / " + esc(i.operationName) : ""}</strong><p>${esc(i.message)}</p><p class="issue-action">${esc(i.action || "")}</p>${i.objectId ? `<button data-issue="${index}">Locate artwork &amp; step</button>` : ""}</article>`).join("")}</details>`;
  $("warnings")
    .querySelectorAll("[data-issue]")
    .forEach(
      (el) =>
        (el.onclick = () => {
          const issue = issues[Number(el.dataset.issue)];
          state.selection = issue.objectId;
          state.selectionIds = [issue.objectId];
          state.activeOperationId =
            issue.operationId === "base" ? null : issue.operationId;
          setMode("design");
          renderPanels();
          stage.render();
        }),
    );
  if (state.plan?.diagnostics?.duplicates?.length) {
    $("warnings").insertAdjacentHTML(
      "beforeend",
      '<button id="review-duplicates">Review duplicate objects</button>',
    );
    $("review-duplicates").onclick = () => editCommand("duplicates");
  }
}
function renderTimeline() {
  const focusedObject =
    document.activeElement?.closest(".sewing-object")?.dataset.reorderId;
  const ev = state.plan?.events || [];
  let groups = [];
  ev.forEach((e, i) => {
    if (!groups.length || e.cmd === "color")
      groups.push({ color: e.color, start: i, count: 0 });
    groups.at(-1).count++;
  });
  $("color-timeline").innerHTML = groups
    .map(
      (g, i) =>
        `<button title="Color block ${i + 1}: ${g.count} commands" aria-label="Jump to color block ${i + 1}" style="background:${g.color};flex:${g.count}" data-start="${g.start}"></button>`,
    )
    .join("");
  document.querySelectorAll("[data-start]").forEach(
    (b) =>
      (b.onclick = () => {
        setMode("preview");
        scrub(Number(b.dataset.start) + 1);
      }),
  );
  $("timeline").max = ev.length;
  $("timeline").value = state.cursor;
  const stats = state.plan?.stats;
  $("sequence-metrics").textContent = stats
    ? `${stats.colors} color blocks · ${stats.manualChanges} manual changes · ${fmt(stats.jumps)} jumps${stats.stops ? ` · ${stats.stops} stops` : ""}${!isManualOrder(state.project) && stats.sourceColorBlocks !== undefined ? ` · layer order: ${stats.sourceColorBlocks} blocks` : ""}`
    : "";
  drawCommandTrack();
  const names = new Map(state.project.objects.map((o) => [o.id, o.name])),
    runs = [];
  ev.forEach((e, i) => {
    if (
      ["stitch", "stop", "trim"].includes(e.cmd) &&
      e.objectId &&
      (runs.at(-1)?.id !== e.objectId ||
        runs.at(-1)?.operationId !== e.operationId)
    )
      runs.push({
        id: e.objectId,
        operationId: e.operationId,
        name: e.operationName,
        start: i + 1,
        color: e.color,
      });
  });
  const objects = [];
  for (const r of runs) {
    if (objects.at(-1)?.id !== r.id) objects.push({ ...r, steps: [] });
    objects.at(-1).steps.push(r);
  }
  $("sewing-order").innerHTML = objects.length
    ? objects
        .map(
          (r, i) =>
            `<div class="sewing-object" data-reorder-id="${esc(r.id)}" style="--thread:${r.color}">${state.project.objects.find((o) => o.id === r.id)?.constructionArtworkIds?.length && objects.findIndex((o) => o.id === r.id) !== i ? '<span class="construction-phase" aria-label="Finishing depends on decorative artwork">↳</span>' : `<button class="drag-grip" data-sew-grip aria-label="Reorder ${esc(names.get(r.id) || "Object")}" ${state.project.objects.find((o) => o.id === r.id)?.constructionArtworkIds?.length ? 'data-help="Move this entire patch construction, including its linked artwork. Preparation stays before artwork and finishing stays after it."' : ""}>${icon("grip")}</button>`}<button data-object-step="${r.start}"><strong>${i + 1}. ${esc(names.get(r.id) || "Object")}</strong><small>${state.project.objects.find((o) => o.id === r.id)?.constructionArtworkIds?.length ? (objects.findIndex((o) => o.id === r.id) === i ? "Prepare fabric · " : "Finish patch · ") + r.steps.length + " steps" : r.steps.length > 1 ? `${r.steps.length} ordered steps` : r.name ? esc(r.name) : "Complete object"}</small></button><span class="object-color-key">${[...new Set(r.steps.map((s) => s.color))].map((c) => `<i style="background:${c}"></i>`).join("")}</span></div>`,
        )
        .join("")
    : '<span class="property-note">Machine files do not retain source object boundaries.</span>';
  $("operation-sequence").hidden = !objects.some((o) => o.steps.length > 1);
  $("operation-order").innerHTML = runs
    .filter((r) => r.operationId)
    .map(
      (r) =>
        `<button data-object-step="${r.start}" style="border-left:3px solid ${r.color}" data-help="Inspect this operation's first machine command. Reorder its complete object with the grip above; edit step order in object properties.">${esc(names.get(r.id))} · ${esc(r.name)}</button>`,
    )
    .join("");
  $("simulator")
    .querySelectorAll("[data-object-step]")
    .forEach((el) => (el.onclick = () => scrub(Number(el.dataset.objectStep))));
  renderOrderMode();
  if (focusedObject)
    [...$("sewing-order").querySelectorAll(".sewing-object")]
      .find((el) => el.dataset.reorderId === focusedObject)
      ?.querySelector("[data-sew-grip]")
      ?.focus({ preventScroll: true });
}
function drawCommandTrack() {
  const canvas = $("command-track"),
    width = canvas.clientWidth;
  if (!width) return;
  canvas.width = Math.round(width * (devicePixelRatio || 1));
  canvas.height = 12 * (devicePixelRatio || 1);
  const ctx = canvas.getContext("2d"),
    events = state.plan?.events || [];
  ctx.scale(devicePixelRatio || 1, devicePixelRatio || 1);
  for (const cmd of ["jump", "trim", "color", "stop"]) {
    ctx.fillStyle =
      cmd === "jump" ? "#82aacf" : cmd === "trim" ? "#e7b784" : "#eff2df";
    const h = cmd === "jump" ? 3 : cmd === "trim" ? 7 : 12;
    events.forEach((e, i) => {
      if (e.cmd === cmd)
        ctx.fillRect((i / (events.length || 1)) * width, 12 - h, 1, h);
    });
  }
}
new ResizeObserver(drawCommandTrack).observe($("command-track"));
function renderPlayback() {
  const ev = state.plan?.events || [];
  state.cursor = Math.max(0, Math.min(ev.length, Math.floor(state.cursor)));
  $("timeline").value = state.cursor;
  $("stitch-counter").textContent = `${fmt(state.cursor)} / ${fmt(ev.length)}`;
  const e = ev[state.cursor - 1];
  $("command-readout").textContent = e
    ? `${e.cmd.toUpperCase()} · X ${num(e.x)}  Y ${num(e.y)}${e.phase?.startsWith("underlay") ? " · UNDERLAY" : e.phase === "anchor" ? " · NEEDLE ANCHOR" : e.phase === "travel" ? " · FILL TRAVEL" : ""}`
    : "Sequence start";
  $("play").textContent = playing ? "Ⅱ" : "▶";
  $("play").setAttribute(
    "aria-label",
    playing ? "Pause stitch simulation" : "Play stitch simulation",
  );
}
function scrub(n) {
  pause();
  if (state.mode !== "preview") setMode("preview");
  state.cursor = n;
  const e = state.plan?.events[n - 1];
  if (e?.objectId && !selectedLeaves(state).some((o) => o.id === e.objectId)) {
    state.selection = e.objectId;
    state.selectionIds = [e.objectId];
    state.activeOperationId = e.operationId || null;
    renderPanels();
  }
  if (e?.sourceIndex !== undefined) {
    state.manualIndex = e.sourceIndex;
    renderProperties();
  }
  if (
    e?.operationId &&
    selectionIds(state).length === 1 &&
    state.selection === e.objectId &&
    state.activeOperationId !== e.operationId
  ) {
    state.activeOperationId = e.operationId;
    renderProperties();
  }
  renderPlayback();
  stage.render();
}
function pause() {
  playing = false;
  renderPlayback();
}
function animate(t) {
  if (!playing) return;
  const rate = Number($("speed").value),
    delta = Math.min(0.1, (t - lastTime) / 1000);
  lastTime = t;
  playFraction += delta * rate;
  const n = Math.floor(playFraction);
  playFraction -= n;
  state.cursor = Math.min(state.plan.events.length, state.cursor + n);
  if (state.cursor >= state.plan.events.length) playing = false;
  renderPlayback();
  stage.render();
  if (playing) requestAnimationFrame(animate);
}
function togglePlay() {
  if (!state.plan?.events.length) return;
  if (playing) {
    pause();
    return;
  }
  if (state.mode !== "preview") setMode("preview");
  if (state.cursor >= state.plan.events.length) state.cursor = 0;
  playing = true;
  playFraction = 0;
  lastTime = performance.now();
  requestAnimationFrame(animate);
  renderPlayback();
}
function download(data, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const filename = () =>
  state.project.name
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "design";
async function ask(title, html, submit = "Continue") {
  pause();
  $("dialog-submit").disabled = false;
  $("dialog-title").textContent = title;
  $("dialog-content").innerHTML = html;
  $("dialog-submit").textContent = submit;
  $("dialog").returnValue = "";
  $("dialog").showModal();
  return new Promise((resolve) =>
    $("dialog").addEventListener(
      "close",
      () => resolve($("dialog").returnValue === "confirm"),
      { once: true },
    ),
  );
}
async function textDialog() {
  const ok = await ask(
    "Lettering & monograms",
    '<p>Turn lettering into editable fill outlines. Keep small letters simple and test stitch density on your fabric.</p><label>Text<input id="text-value" value="Bloom" maxlength="32" required></label><label>Letter height (mm)<input id="text-height" type="number" value="14" min="3" max="80" step="1" required></label><label>Style<select id="text-font"><option value="serif">Classic serif</option><option value="sans-serif">Modern sans</option><option value="monospace">Geometric mono</option><option value="cursive">Script (device font)</option></select></label>',
    "Add lettering",
  );
  if (!ok) return;
  try {
    addObjects([
      lettering(
        $("text-value").value,
        Number($("text-height").value),
        selected()?.color || PALETTE[5],
        $("text-font").value,
      ),
    ]);
  } catch (e) {
    toast(e.message);
  }
}
async function loadDemo() {
  if (!(await confirmReplace("Load the wildflower example?"))) return;
  mutate(() => {
    state.project = demo();
    state.selection = null;
    state.selectionIds = [];
    state.activeOperationId = null;
  });
  stage.fit();
}
async function confirmReplace(title) {
  return ask(
    title,
    "<p>Your current design is saved in this browser. Replacing it will update that autosave. Save a project file first if you want a separate copy. You can also Undo after replacing.</p>",
    "Replace workspace",
  );
}
function getFormatWorker() {
  if (!formatWorker) {
    formatWorker = new Worker(new URL("./format-worker.js", import.meta.url));
    formatWorker.onmessage = ({ data }) => {
      if (data.status) {
        $("status").textContent = data.status;
        return;
      }
      const p = pendingFormats.get(data.id);
      if (!p) return;
      pendingFormats.delete(data.id);
      clearTimeout(p.timer);
      data.error ? p.reject(Error(data.error)) : p.resolve(data);
    };
    formatWorker.onerror = (e) => {
      for (const p of pendingFormats.values()) {
        clearTimeout(p.timer);
        p.reject(Error(e.message));
      }
      pendingFormats.clear();
      formatWorker.terminate();
      formatWorker = null;
    };
  }
  return formatWorker;
}
function formatRequest(data) {
  return new Promise((resolve, reject) => {
    const id = ++requestId,
      timer = setTimeout(() => {
        pendingFormats.delete(id);
        if (formatWorker) {
          formatWorker.terminate();
          formatWorker = null;
        }
        reject(
          Error(
            "Machine engine timed out. Check your connection and try again.",
          ),
        );
      }, 180000);
    pendingFormats.set(id, { resolve, reject, timer });
    getFormatWorker().postMessage({ id, ...data });
  });
}
async function exportDialog() {
  if (busy || !state.plan) return;
  const plan = state.plan;
  if (plan?.issues?.some((i) => i.severity === "error")) {
    toast(
      "Resolve Design Issues errors, or explicitly disable invalid steps before exporting.",
    );
    return;
  }
  if (!plan.stats.stitches) {
    toast("Add some stitches before exporting.");
    return;
  }
  if (!plan.stats.fits) {
    toast(
      "The design extends beyond the selected hoop. Move or resize it before export.",
    );
    return;
  }
  const ok = await ask(
    "Ready for the machine",
    `<p><strong>${esc(state.project.name)}</strong><br>${fmt(plan.stats.stitches)} stitches · ${num(plan.stats.bounds.width)} × ${num(plan.stats.bounds.height)} mm · ${esc(MACHINES[state.project.machine].name)}</p><label>Machine format<select id="export-format"><option value="pes">PES v6 · Brother / Baby Lock</option><option value="pec">PEC · Brother</option><option value="dst">DST · Tajima (palette not stored)</option><option value="exp">EXP · Melco (palette not stored)</option><option value="jef">JEF · Janome</option><option value="vp3">VP3 · Husqvarna / Pfaff</option></select></label><p>The local conversion engine downloads on first use. Your design stays in your browser. After export, the simulator displays the stitch sequence decoded from the actual machine file.</p><p>Trims and color handling depend on the file format and machine. Inspect the preview and test on scrap fabric before your final sew-out.</p>`,
    "Export machine file",
  );
  if (!ok) return;
  busy = true;
  $("export").disabled = true;
  const ext = $("export-format").value;
  try {
    const result = await formatRequest({
      action: "export",
      format: ext,
      events: plan.events,
      name: state.project.name,
    });
    const stats = analyze(result.events, MACHINES[state.project.machine]);
    if (!stats.fits)
      throw Error(
        "Format conversion moved a command outside the selected hoop. Move the design slightly inward.",
      );
    download(result.bytes, filename() + "." + ext);
    state.plan = { events: result.events, stats, warnings: [] };
    state.cursor = result.events.length;
    machinePlan = true;
    state.previewSelection = false;
    state.activeOperationId = null;
    $("preview-selection").checked = false;
    $("preview-selection").disabled = true;
    $("sequence-source").textContent = ext.toUpperCase() + " file · decoded";
    setMode("preview");
    renderStats();
    renderTimeline();
    renderPlayback();
    stage.render();
    $("status").textContent =
      `Exported ${ext.toUpperCase()} · simulator now shows the decoded machine file`;
    toast("Machine file downloaded. Preview updated from exported bytes.");
  } catch (e) {
    toast("Export failed: " + e.message);
    $("status").textContent = "Export failed · " + e.message;
  } finally {
    busy = false;
    $("export").disabled = false;
  }
}
async function importFile(file) {
  if (busy) return;
  const ext = file.name.split(".").at(-1).toLowerCase();
  const limit = ["json", "embstudio"].includes(ext) ? 96 : 20;
  if (file.size > limit * 1024 * 1024) {
    toast(`Choose a file smaller than ${limit} MB.`);
    return;
  }
  busy = true;
  $("status").textContent = "Reading " + file.name + "…";
  try {
    if (["json", "embstudio"].includes(ext)) {
      const p = validateProject(JSON.parse(await file.text()));
      if (await confirmReplace("Open this project?")) {
        mutate(() => {
          state.project = p;
          state.selection = null;
          state.selectionIds = [];
          state.activeOperationId = null;
        });
        stage.fit();
        toast("Project opened.");
      }
    } else if (ext === "svg") {
      const objects = importSVG(await file.text(), file.name);
      addObjects(objects);
      if (objects.importWarnings) toast(objects.importWarnings);
    } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      const objects = await rasterImport(
        file,
        { state, ask, mutate, toast, selectTool: () => setTool("select") },
        traceDialog,
      );
      if (objects) addObjects(objects);
    } else if (
      ["pes", "pec", "dst", "exp", "jef", "vp3", "xxx"].includes(ext)
    ) {
      const { events } = await formatRequest({
        action: "import",
        name: file.name,
        bytes: await file.arrayBuffer(),
      });
      const objects = [];
      let block = [];
      let color = events.find((e) => e.cmd === "stitch")?.color || PALETTE[5];
      const flush = () => {
        if (block.length) {
          objects.push(
            object(`${file.name} · ${objects.length + 1}`, [], {
              type: "manual",
              commands: block,
              color,
            }),
          );
          block = [];
        }
      };
      for (const e of events) {
        if (e.cmd === "color") {
          flush();
          color = e.color;
        } else if (e.cmd !== "end") block.push({ x: e.x, y: e.y, cmd: e.cmd });
      }
      flush();
      if (!objects.length)
        throw Error("This embroidery file contains no stitch blocks.");
      addObjects(objects);
      toast(
        "Imported machine stitches. Original vector artwork cannot be recovered from machine files.",
      );
    } else throw Error("Unsupported file type.");
  } catch (e) {
    toast("Import failed: " + e.message);
    $("status").textContent = "Import failed · " + e.message;
  } finally {
    busy = false;
    $("file-input").value = "";
    if ($("status").textContent.startsWith("Reading "))
      $("status").textContent = "Ready";
  }
}
function removeSelected() {
  const o = selected();
  if (
    state.tool === "node" &&
    stage.node !== null &&
    o &&
    !isLocked(state.project, o) &&
    !["manual", "reference"].includes(o.type)
  ) {
    if (o.curve) {
      if (o.curve.nodes.length > (o.curve.closed ? 3 : 2))
        mutate(() => {
          o.curve.nodes.splice(stage.node, 1);
          o.rings = curveRings(o.curve);
        });
      stage.node = null;
      return;
    }
    const p = o.rings.flat()[stage.node],
      r = o.rings.find((r) => r.includes(p));
    if (r && r.length > (o.type === "fill" ? 3 : 2)) {
      mutate(() => {
        detachSource(o);
        r.splice(r.indexOf(p), 1);
      });
      stage.node = null;
      return;
    }
  }
  mutate(() => {
    deleteSelection(state.project, selectionIds(state));
    state.selection = null;
    state.selectionIds = [];
    state.activeOperationId = null;
    state.selectionIds = [];
  });
}
function undo() {
  if (!history.length) return;
  pause();
  future.push(JSON.stringify(state.project));
  state.project = JSON.parse(history.pop());
  state.selection = null;
  state.selectionIds = [];
  state.activeOperationId = null;
  stage.draft = [];
  updateDraft();
  changed();
}
function redo() {
  if (!future.length) return;
  history.push(JSON.stringify(state.project));
  state.project = JSON.parse(future.pop());
  state.selection = null;
  state.selectionIds = [];
  state.activeOperationId = null;
  changed();
}
$("machine").innerHTML = Object.entries(MACHINES)
  .map(([k, v]) => `<option value="${k}">${v.name}</option>`)
  .join("");
$("project-name").onchange = (e) =>
  mutate(
    () => (state.project.name = e.target.value.trim() || "Untitled design"),
  );
$("machine").onchange = (e) => {
  mutate(() => (state.project.machine = e.target.value));
  stage.fit();
};
$("object-list").onclick = (e) => {
  const check = e.target.closest("[data-check]"),
    row = e.target.closest(".object-row"),
    selectEl = e.target.closest("[data-select]"),
    visibility = e.target.closest("[data-visibility]"),
    expand = e.target.closest("[data-expand]"),
    lock = e.target.closest("[data-lock]");
  if (e.target.closest(".tree-rename")) return;
  if (e.detail === 2 && selectEl) {
    beginRename(selectEl.dataset.select);
    return;
  }
  if (expand) {
    const id = expand.dataset.expand;
    state.collapsed.has(id)
      ? state.collapsed.delete(id)
      : state.collapsed.add(id);
    renderPanels();
    return;
  }
  if (lock) {
    const o = nodeById(state.project, lock.dataset.lock);
    mutate(() => (o.locked = !o.locked));
    return;
  }
  if (visibility) {
    mutate(() => {
      const o = nodeById(state.project, visibility.dataset.visibility);
      o.visible = o.visible === false;
    });
    return;
  }
  if (e.target.closest("[data-tree-grip]")) return;
  if (selectEl || row || check) {
    select(
      check?.dataset.check || selectEl?.dataset.select || row.dataset.reorderId,
      {
        toggle: Boolean(check) || e.shiftKey || e.ctrlKey || e.metaKey,
      },
    );
    if (innerWidth < 1100 && !check && !e.shiftKey && !e.ctrlKey && !e.metaKey)
      workspaceLayout?.close("left");
  }
};
function beginRename(id) {
  const n = id === PROJECT ? state.project : nodeById(state.project, id);
  if (!n || (id !== PROJECT && isLocked(state.project, n))) return;
  const el = [...$("object-list").querySelectorAll("[data-select]")].find(
    (b) => b.dataset.select === id,
  );
  if (!el) return;
  const input = document.createElement("input");
  input.className = "tree-rename";
  input.value = n.name;
  input.maxLength = 200;
  input.setAttribute("aria-label", "Rename " + n.name);
  el.replaceWith(input);
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    if (save && value) mutate(() => (n.name = value));
    else renderPanels();
    [...$("object-list").querySelectorAll("[data-select]")]
      .find((b) => b.dataset.select === id)
      ?.focus();
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  input.onblur = () => finish(true);
  input.focus();
  input.select();
}
$("object-list").addEventListener("dblclick", (e) => {
  const el = e.target.closest("[data-select]");
  if (el) beginRename(el.dataset.select);
});
$("object-list").onkeydown = (e) => {
  if (e.key === "F2") {
    e.preventDefault();
    beginRename(
      e.target.closest("[data-select]")?.dataset.select || state.selection,
    );
    return;
  }

  const button = e.target.closest("[data-select]");
  if (
    !button ||
    !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
  )
    return;
  e.preventDefault();
  e.stopPropagation();
  const id = button.dataset.select,
    node = nodeById(state.project, id);
  const buttons = [...$("object-list").querySelectorAll("[data-select]")],
    index = buttons.indexOf(button);
  let next;
  if (e.key === "ArrowDown") next = buttons[index + 1]?.dataset.select;
  if (e.key === "ArrowUp") next = buttons[index - 1]?.dataset.select;
  if (e.key === "ArrowRight" && node?.kind) {
    if (state.collapsed.has(id)) {
      state.collapsed.delete(id);
      renderPanels();
    } else next = children(state.project, id)[0]?.id;
  }
  if (e.key === "ArrowLeft") {
    if (node?.kind && !state.collapsed.has(id)) {
      state.collapsed.add(id);
      renderPanels();
    } else next = node?.parentId || PROJECT;
  }
  if (next) select(next);
  const target = [...$("object-list").querySelectorAll("[data-select]")].find(
    (b) => b.dataset.select === (next || id),
  );
  target?.focus();
};
$("new-project").onclick = async () => {
  if (await confirmReplace("Start a new design?")) {
    mutate(() => {
      state.project = {
        version: 1,
        name: "Untitled design",
        machine: state.project.machine,
        objects: [],
      };
      state.selection = null;
      state.selectionIds = [];
      state.activeOperationId = null;
    });
    stage.fit();
  }
};
$("open-file").onclick = () => $("file-input").click();
$("file-input").onchange = async (e) => {
  const files = [...e.target.files];
  for (const file of files) await importFile(file);
};
$("save-project").onclick = () => {
  download(
    JSON.stringify(state.project, null, 2),
    filename() + ".embstudio",
    "application/json",
  );
  autosave();
  toast("Editable project saved.");
};
$("export").onclick = exportDialog;
$("design-tab").onclick = () => {
  setMode("design");
  if (machinePlan) {
    $("preview-selection").disabled = false;
    machinePlan = false;
    $("sequence-source").textContent = "Generated design";
    scheduleGenerate();
  }
};
$("preview-tab").onclick = () => {
  setMode("preview");
  workspaceLayout?.show("bottom");
};
document
  .querySelectorAll("[data-tool]")
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
$("text-tool").onclick = textDialog;
$("undo").onclick = undo;
$("redo").onclick = redo;
$("delete").onclick = removeSelected;
$("duplicate").onclick = () => {
  const copy = copySelection(state.project, selectionIds(state));
  if (copy.objects.length)
    mutate(() => {
      state.selectionIds = pasteSelection(state.project, copy);
      state.selection = state.selectionIds[0];
    });
};
for (const [id, dir] of [
  ["move-up", -1],
  ["move-down", 1],
])
  $(id).onclick = () => {
    mutate(() => {
      if (!reorder(state.project, selectionIds(state), dir))
        toast("Select siblings to reorder them together.");
      else useTreeOrder(state.project);
    });
  };
const actualObjectOrder = () => [
  ...new Set(
    (state.plan?.events || []).filter((e) => e.objectId).map((e) => e.objectId),
  ),
];
function commitTreeOrder(ids, target, after) {
  let applied = false;
  mutate(() => {
    if (moveInTree(state.project, ids, target, after)) {
      useTreeOrder(state.project);
      applied = true;
    }
  });
  toast(
    applied
      ? "Layers reordered · manual sewing order follows the tree."
      : "Move siblings within the same group. Locked artwork and sequence pins stay in place.",
  );
  return applied;
}
function commitSewingOrder(ids, target, after) {
  if (machinePlan || !state.plan) return false;
  let applied = false;
  mutate(() => {
    applied = moveSewingObjects(
      state.project,
      ids,
      target,
      after,
      actualObjectOrder(),
    );
  });
  toast(
    applied
      ? "Manual sewing order updated · artwork layers unchanged."
      : "No move made. Sequence pins cannot be moved or crossed.",
  );
  return applied;
}
installReordering($("object-list"), {
  item: ".object-row",
  handle: "[data-tree-grip]",
  start: (id) => {
    const ids = roots(state.project, selectionIds(state));
    return ids.includes(id) ? ids : [id];
  },
  commit: commitTreeOrder,
  announce: toast,
});
installReordering($("sewing-order"), {
  item: ".sewing-object",
  handle: "[data-sew-grip]",
  horizontal: true,
  start: (id) => (machinePlan || !state.plan ? [] : [id]),
  commit: commitSewingOrder,
  announce: toast,
});
$("order-mode").onchange = (e) =>
  mutate(() => {
    if (e.target.value === "auto") delete state.project.sequencing;
    else
      state.project.sequencing = {
        mode: "manual",
        origin: "sequence",
        order: [
          ...new Set([...actualObjectOrder(), ...sewingIds(state.project)]),
        ],
      };
  });
installHelp();
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".display-options"))
    document.querySelector(".display-options").open = false;
});
const compactSequence = matchMedia("(max-height: 740px)");
const collapseCompactSequence = () => {
  if (compactSequence.matches)
    document.querySelector(".object-sequence").open = false;
};
collapseCompactSequence();
compactSequence.addEventListener("change", collapseCompactSequence);
async function editCommand(command) {
  if (command === "rename") {
    beginRename(state.selection);
    return;
  }
  if (command === "template") {
    templateDialog();
    return;
  }
  if (command === "duplicates") {
    const ids =
      state.plan?.diagnostics?.duplicates?.map((d) => d.objectId) || [];
    if (ids.length) {
      setMode("design");
      select(ids);
    } else toast("No coincident same-color source objects found.");
    return;
  }
  const ids = selectionIds(state),
    selected = selectedLeaves(state, { editable: true });
  if (["flip-horizontal", "flip-vertical"].includes(command)) {
    if (!selected.length) return;
    if (
      selected.some((o) => o.textSource) &&
      !(await ask(
        "Mirror editable lettering?",
        "<p>This mirrors the lettering itself, so letters may read backwards or upside down. Text and font settings remain editable; future font changes keep the mirror. Undo restores the original orientation.</p>",
        "Mirror selection",
      ))
    )
      return;
    mutate(() => arrangeArtwork(state.project, ids, command));
    return;
  }
  if (
    [
      "center",
      "hoop-x",
      "hoop-y",
      "match-width",
      "match-height",
      "center-design",
    ].includes(command)
  ) {
    mutate(() =>
      arrangeArtwork(
        state.project,
        command === "center-design"
          ? state.project.objects
              .filter(
                (o) => o.type !== "reference" && isVisible(state.project, o),
              )
              .map((o) => o.id)
          : ids,
        command === "center-design" ? "center" : command,
      ),
    );
    return;
  }
  if (command === "duplicate") {
    $("duplicate").click();
    return;
  }
  if (command === "all") {
    select(state.isolation || PROJECT);
    return;
  }
  if (command === "children") {
    select(
      ids.flatMap((id) =>
        id === PROJECT
          ? children(state.project).map((n) => n.id)
          : children(state.project, id).map((n) => n.id),
      ),
    );
    return;
  }
  if (command === "similar") {
    const o = selected[0];
    if (o)
      select(
        state.project.objects
          .filter(
            (n) =>
              n.color === o.color &&
              n.type === o.type &&
              isVisible(state.project, n) &&
              !isLocked(state.project, n),
          )
          .map((n) => n.id),
      );
    return;
  }
  if (command === "copy") {
    clipboard = copySelection(state.project, ids);
    toast(`Copied ${clipboard.objects.length} artwork objects.`);
    return;
  }
  if (command === "paste") {
    if (clipboard?.objects.length)
      mutate(() => {
        state.selectionIds = pasteSelection(state.project, clipboard);
        state.selection = state.selectionIds[0];
      });
    return;
  }
  if (command === "group") {
    mutate(() => {
      const id = groupSelection(state.project, ids);
      if (id) {
        state.selectionIds = [id];
        state.selection = id;
      }
    });
    return;
  }
  if (command === "ungroup") {
    mutate(() => {
      state.selectionIds = ungroupSelection(state.project, ids);
      state.selection = state.selectionIds[0] || null;
    });
    return;
  }
  if (command === "isolate") {
    state.isolation = ids.length === 1 ? ids[0] : null;
    stage.render();
    renderPanels();
    return;
  }
  if (command === "fit") {
    stage.fitSelection();
    return;
  }
  if (command === "lock" || command === "unlock" || command === "hide") {
    mutate(() =>
      nodes(state.project)
        .filter(
          (n) =>
            roots(state.project, ids).includes(n.id) || ids.includes(PROJECT),
        )
        .forEach((n) => {
          if (command === "hide") n.visible = false;
          else n.locked = command === "lock";
        }),
    );
    return;
  }
  if (command === "basting" || command === "registration") {
    const artwork = selected.filter((o) => o.type !== "reference");
    if (!artwork.length)
      return toast(
        "Select embroidery artwork for construction marks. Reference images do not generate stitches.",
      );
    const b = selectionBounds(artwork),
      margin = 2,
      color = artwork[0].color;
    if (command === "basting") {
      const ring = [
        { x: b.minX - margin, y: b.minY - margin },
        { x: b.maxX + margin, y: b.minY - margin },
        { x: b.maxX + margin, y: b.maxY + margin },
        { x: b.minX - margin, y: b.maxY + margin },
      ];
      const o = object("Selection basting box", [ring], {
        type: "run",
        length: 5,
        closed: true,
        underlay: false,
        color,
        sequenceLocked: true,
      });
      mutate(() => {
        state.project.objects.unshift(o);
        state.selectionIds = [o.id];
        state.selection = o.id;
      });
    } else {
      const objects = [];
      for (const x of [b.minX - 3, b.maxX + 3]) {
        const y = (b.minY + b.maxY) / 2;
        objects.push(
          object(
            "Registration cross",
            [
              [
                { x: x - 2, y },
                { x: x + 2, y },
              ],
              [
                { x, y: y - 2 },
                { x, y: y + 2 },
              ],
            ],
            { type: "run", underlay: false, color, sequenceLocked: true },
          ),
        );
      }
      addObjects(objects);
      mutate(() => {
        const id = groupSelection(
          state.project,
          objects.map((o) => o.id),
          "Registration marks",
        );
        state.selectionIds = [id];
        state.selection = id;
      });
    }
    return;
  }
  if (command.startsWith("align-") || command.startsWith("distribute-")) {
    if (command.startsWith("align-"))
      mutate(() =>
        alignReference(state.project, ids, "selection", command.slice(6)),
      );
    else mutate(() => distributeArtwork(state.project, ids, command));
  }
}
$("edit-command").onchange = (e) => {
  const value = e.target.value;
  e.target.value = "";
  editCommand(value);
};
$("select-all").onclick = () => editCommand("all");
$("group-selection").onclick = () => editCommand("group");
$("ungroup-selection").onclick = () => editCommand("ungroup");
$("exit-isolation").onclick = () => {
  state.isolation = null;
  renderPanels();
  stage.render();
};
$("snap-grid").onchange = (e) => (state.snapGrid = e.target.checked);
$("snap-objects").onchange = (e) => (state.snapObjects = e.target.checked);
$("preview-selection").onchange = (e) => {
  state.previewSelection = e.target.checked;
  stage.render();
};
$("finish-draw").onclick = finishPath;
$("cancel-draw").onclick = () => {
  stage.draft = [];
  updateDraft();
  stage.render();
};
$("zoom-fit").onclick = () => stage.fit();
$("zoom-in").onclick = () => stage.zoomAt(1.25);
$("zoom-out").onclick = () => stage.zoomAt(0.8);
$("fit-design").onclick = () => stage.fitDesign();
$("view-command").onchange = (e) => {
  ({
    selection: () => stage.fitSelection(),
    design: () => stage.fitDesign(),
    hoop: () => stage.fit(),
    center: () => stage.centerView(),
    reset: () => stage.fit(),
  })[e.target.value]?.();
  e.target.value = "";
};
try {
  $("navigation-mode").value =
    localStorage.getItem("embroidery-navigation") || "auto";
} catch {}
stage.navigationMode = $("navigation-mode").value || "auto";
$("navigation-mode").onchange = (e) => {
  stage.navigationMode = e.target.value;
  try {
    localStorage.setItem("embroidery-navigation", e.target.value);
  } catch {}
};
for (const [id, key] of [
  ["show-stitches", "showStitches"],
  ["show-jumps", "showJumps"],
  ["show-underlay", "showUnderlay"],
  ["show-events", "showEvents"],
])
  $(id).onchange = (e) => {
    state[key] = e.target.checked;
    stage.render();
  };
for (const [id, key] of [
  ["optimize-colors", "optimizeColors"],
  ["skip-outlines", "skipSvgOutlines"],
])
  $(id).onchange = (e) =>
    mutate(() => {
      state.project.planning = {
        ...planningOptions(state.project),
        [key]: e.target.checked,
      };
    });
$("small-detail").onchange = (e) => {
  const n = Number(e.target.value);
  if (!Number.isFinite(n) || n < 0 || n > 2) {
    toast("Choose an island threshold between 0 and 2 mm.");
    renderPanels();
    return;
  }
  mutate(() => {
    state.project.planning = {
      ...planningOptions(state.project),
      smallDetail: n,
    };
  });
};
$("timeline").oninput = (e) => scrub(Number(e.target.value));
$("play").onclick = togglePlay;
$("rewind").onclick = () => scrub(0);
$("step-back").onclick = () => scrub(state.cursor - 1);
$("step-next").onclick = () => scrub(state.cursor + 1);
$("end").onclick = () => scrub(state.plan?.events.length || 0);
workspaceLayout = installWorkspace({ fit: () => stage.fit() });
arrangeMenu = installArrangeMenu({
  state,
  command: editCommand,
  fitDesign: () => stage.fitDesign(),
  fitHoop: () => stage.fit(),
});
$("arrange-selection").onclick = () => {
  const r = $("arrange-selection").getBoundingClientRect();
  arrangeMenu.open(r.left, r.top, $("arrange-selection"));
};
const rail = document.querySelector(".drawing-tools");
function toolOverflow() {
  const horizontal = getComputedStyle(rail).flexDirection === "row",
    position = horizontal ? rail.scrollLeft : rail.scrollTop,
    maximum = horizontal
      ? rail.scrollWidth - rail.clientWidth
      : rail.scrollHeight - rail.clientHeight;
  $("tools-prev").disabled = position < 1;
  $("tools-next").disabled = position >= maximum - 1;
}
$("tools-prev").onclick = () => {
  rail.scrollBy(
    getComputedStyle(rail).flexDirection === "row"
      ? { left: -150, behavior: "smooth" }
      : { top: -150, behavior: "smooth" },
  );
};
$("tools-next").onclick = () => {
  rail.scrollBy(
    getComputedStyle(rail).flexDirection === "row"
      ? { left: 150, behavior: "smooth" }
      : { top: 150, behavior: "smooth" },
  );
};
rail.addEventListener("scroll", toolOverflow);
new ResizeObserver(toolOverflow).observe(rail);
$("help").onclick = () =>
  ask(
    "Your embroidery workbench",
    '<p><strong>Workspace:</strong> Drag panel boundaries to resize. Objects, Properties and Sequence toggle each panel. Canvas temporarily maximizes the workspace; Restore or Escape brings back the previous layout. Drawing tools scroll within their rail. Arrange opens positioning actions, also available with right-click or Shift F10.</p><p><strong>Navigation:</strong> Choose Auto, Mouse or Trackpad beside the canvas. Trackpad scrolling pans; pinch or Ctrl/Command-scroll zooms. H or Space-drag pans, +/− zooms, F fits selected artwork, and Home fits the hoop. View offers Fit Design, Fit Selection, Center and Reset. Guides snap dragging to artwork edges/centers and hoop center; Alt bypasses snapping.</p><p><strong>Artwork tree:</strong> Imported SVGs contain their original regions and nested groups. Select a parent to edit the whole SVG; expand it to edit a child. Shift/Ctrl-click or drag a box to multiselect. Drag corner/edge handles to resize, or the round handle to rotate. Ctrl A selects all, Ctrl G groups, Ctrl Shift G ungroups, Ctrl D duplicates, and F fits selection. Locked artwork still sews; focus mode changes only the view.</p><p><strong>Operations:</strong> Add independent steps in the inspector. The appliqué recipe creates placement, stop, tackdown, stop and satin finishing steps on closed regions. Stops require operator action; test pauses and clearance on your machine.</p><p><strong>Draw:</strong> Use polygon for filled regions, running path for outlines, and satin for narrow columns. Click points, then press <kbd>Enter</kbd> or Finish path. Drag to create rectangles and ellipses.</p><p><strong>Edit:</strong> Select and drag objects. The node tool lets you move individual points; double-click an edge to insert a node. Use the properties panel for exact dimensions, angles and stitch settings. Automatic sequencing completes each object and batches compatible colors while preserving construction order. Drag grips in the artwork tree to change layers and set manual sewing order. Drag grips in Object sewing order to change sewing order only. Switch back to Automatic to resume optimization; Keep sequence position pins an object. Alt+arrow keys on a grip are the keyboard equivalent.</p><p><strong>Simulate:</strong> Open Stitch preview. Play, step through, scrub, click a stitch, or click a color block. Command positions, underlay and jump paths are inspectable. Export replaces the preview with commands decoded from the saved file.</p><p><strong>Manual editing:</strong> Make a vector object’s stitches editable, then adjust needle points with the node tool or command index editor. Imported embroidery files are editable stitch blocks.</p><p><strong>Shortcuts:</strong> <kbd>V</kbd> select · <kbd>N</kbd> nodes · <kbd>P</kbd> fill · <kbd>R</kbd> run · <kbd>S</kbd> satin · <kbd>T</kbd> text · <kbd>E</kbd> ellipse · <kbd>H</kbd> pan · <kbd>Space</kbd> temporary pan / preview playback · <kbd>Ctrl Z</kbd> undo · <kbd>Ctrl Shift Z</kbd> redo · <kbd>Delete</kbd> selected object / vector node.</p><p>SVG import supports paths, basic shapes, transforms, holes and inline solid paints. Convert text to paths and expand clipping or effects first. Image digitizing is intended for flat artwork. Core editing works locally; machine conversion loads a pinned Python/WASM runtime from jsDelivr on first use. Thread colors are visual approximations.</p><p><a href="https://github.com/kircherlabs/embroidery-studio#readme" target="_blank" rel="noreferrer">Documentation & known limitations ↗</a></p>',
    "Got it",
  );
document.addEventListener("keydown", (e) => {
  if ($("dialog").open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))
    return;
  if (
    (e.code === "Space" || e.key === "Enter") &&
    e.target.closest("button,summary,a")
  )
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    $("save-project").click();
    return;
  }
  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase(),
      command = {
        a: "all",
        c: "copy",
        v: "paste",
        g: e.shiftKey ? "ungroup" : "group",
      }[key];
    if (command) {
      e.preventDefault();
      editCommand(command);
      return;
    }
    if (key === "d") {
      e.preventDefault();
      $("duplicate").click();
      return;
    }
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    mutate(() =>
      transformSelection(selectedLeaves(state, { editable: true }), {
        dx: e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
        dy: e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
      }),
    );
    return;
  }
  if (e.key.toLowerCase() === "f") {
    stage.fitSelection();
    return;
  }
  if (e.code === "Space") {
    e.preventDefault();
    if (e.repeat) return;
    if (state.mode === "preview") togglePlay();
    else {
      state.space = true;
      stage.render();
    }
    return;
  }
  if (e.key === "Enter" && stage.draft.length) {
    e.preventDefault();
    finishPath();
  }
  if (e.key === "Escape") {
    if (state.satinGuideEdit) {
      state.satinGuideEdit = null;
      stage.cancelDrag();
      renderProperties();
      stage.render();
      return;
    }
    stage.cancelDrag();
    stage.draft = [];
    updateDraft();
    select(null);
    state.isolation = null;
    renderPanels();
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    removeSelected();
  }
  const tool = {
    v: "select",
    n: "node",
    p: "polygon",
    r: "run",
    s: "satin",
    e: "ellipse",
    h: "pan",
  }[e.key.toLowerCase()];
  if (tool) setTool(tool);
  if (e.key.toLowerCase() === "t") textDialog();
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    state.space = false;
    stage.render();
  }
});
window.addEventListener("blur", () => {
  state.space = false;
  pause();
});
document.addEventListener("dragover", (e) => {
  e.preventDefault();
});
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  for (const file of e.dataTransfer.files) await importFile(file);
});
const drawingStyleUI = installDrawingStyle({ state, ask, mutate, toast });
renderPanels();
renderStats();
scheduleGenerate();
if (restored) $("status").textContent = "Restored project from this device";
// Read-only diagnostic surface for reproducible browser integration checks.
window.studio = {
  getView: () => ({
    center: { ...stage.center },
    zoom: stage.zoom,
    scale: stage.scale,
    pan: { ...stage.pan },
    width: stage.w,
    height: stage.h,
    guides: structuredClone(stage.guides || []),
  }),
  getWorkspace: () => workspaceLayout.getState(),
  getProject: () => structuredClone(state.project),
  getPlan: () => structuredClone(state.plan),
  getMode: () => state.mode,
  getSelection: () => ({
    ids: [...selectionIds(state)],
    objects: selectedLeaves(state).map((o) => o.id),
    operationId: state.activeOperationId,
    isolation: state.isolation,
  }),
};
