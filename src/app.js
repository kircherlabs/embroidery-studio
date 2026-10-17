import {
  demo,
  object,
  ellipse,
  PALETTE,
  MACHINES,
  uid,
  validateProject,
  objectBounds,
  translate,
  transform,
} from "./model.js";
import { analyze } from "./engine.js";
import { importSVG, rasterObjects, lettering } from "./importers.js";
import { Stage } from "./stage.js";
import { planningOptions } from "./planning.js";
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
const worker = new Worker(new URL("./digitize-worker.js", import.meta.url), {
  type: "module",
});
const stage = new Stage($("stage"), state, {
  select,
  mutate,
  changed: record,
  finish: finishPath,
  draft: updateDraft,
  shape: addShape,
  scrub,
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
  if (before === JSON.stringify(state.project)) return;
  history.push(before);
  while (
    history.length > 1 &&
    (history.length > 50 ||
      history.reduce((n, s) => n + s.length, 0) > 16000000)
  )
    history.shift();
  future = [];
  changed();
}
function mutate(fn) {
  const before = JSON.stringify(state.project);
  fn();
  record(before);
}
function changed() {
  pause();
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
  generationTimer = setTimeout(
    () => worker.postMessage({ id, project: state.project }),
    100,
  );
}
worker.onmessage = ({ data }) => {
  if (data.id !== generation) return;
  if (data.error) {
    state.plan = null;
    $("status").textContent = data.error;
    toast(data.error);
    renderStats();
    return;
  }
  state.plan = data;
  state.cursor = data.events.length;
  $("export").disabled = false;
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
function select(id) {
  state.selection = id;
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
  document.querySelector(".drawing-tools").style.display =
    mode === "design" ? "flex" : "none";
  renderProperties();
  stage.render();
}
function setTool(tool) {
  if (state.mode !== "design") setMode("design");
  stage.draft = [];
  stage.node = null;
  updateDraft();
  state.tool = tool;
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
  const hints = {
    select: "Drag objects to position them in the hoop",
    node: "Drag nodes · double-click an edge to add a node",
    polygon: "Click outline points · Enter to finish a fill",
    run: "Click path points · Enter to finish a running stitch",
    satin: "Click a centerline · Enter to finish satin",
    manual: "Click each needle point · Enter to finish stitches",
    rect: "Drag to draw a rectangle",
    ellipse: "Drag to draw an ellipse",
    pan: "Drag to pan · scroll to zoom",
  };
  $("stage-hint").textContent = hints[tool];
  stage.render();
}
function updateDraft() {
  $("draw-actions").hidden = stage.draft.length === 0;
  $("draw-message").textContent = `${stage.draft.length} points placed`;
  $("finish-draw").disabled =
    stage.draft.length < (state.tool === "polygon" ? 3 : 2);
}
function finishPath() {
  const type = state.tool,
    pts = stage.draft;
  if (pts.length < (type === "polygon" ? 3 : 2)) return;
  let o = object(
    type === "polygon"
      ? "Fill region"
      : type === "manual"
        ? "Manual stitches"
        : type === "satin"
          ? "Satin column"
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
  addObjects([o]);
  stage.draft = [];
  updateDraft();
  setTool("select");
}
function addShape({ start: a, end: b }) {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y),
    w = Math.abs(a.x - b.x),
    h = Math.abs(a.y - b.y),
    ring =
      state.tool === "ellipse"
        ? ellipse(x + w / 2, y + h / 2, w / 2, h / 2)
        : [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
          ];
  addObjects([
    object(state.tool === "ellipse" ? "Ellipse" : "Rectangle", [ring], {
      color: selected()?.color || PALETTE[0],
    }),
  ]);
  setTool("select");
}
function addObjects(objects) {
  mutate(() => {
    state.project.objects.push(...objects);
    state.selection = objects.at(-1)?.id || null;
  });
  toast(
    `Added ${objects.length === 1 ? objects[0].name : objects.length + " objects"}`,
  );
}
function renderPanels() {
  const planning = planningOptions(state.project);
  $("optimize-colors").checked = planning.optimizeColors;
  $("skip-outlines").checked = planning.skipSvgOutlines;
  $("small-detail").value = planning.smallDetail;
  if (document.activeElement !== $("project-name"))
    $("project-name").value = state.project.name;
  $("machine").value = state.project.machine;
  const m = MACHINES[state.project.machine];
  $("hoop-size").textContent = `${m.width} × ${m.height} mm`;
  $("object-count").textContent = state.project.objects.length;
  $("object-list").innerHTML = state.project.objects.length
    ? state.project.objects
        .map(
          (o, i) =>
            `<div class="object-row ${o.id === state.selection ? "selected" : ""} ${o.visible === false ? "hidden" : ""}"><span class="order">${String(i + 1).padStart(2, "0")}</span><button class="object-select" data-select="${esc(o.id)}"><span class="swatch" style="background:${o.color}"></span><span class="object-text"><span class="object-title">${esc(o.name)}</span><span class="object-type">${o.type === "fill" ? "Tatami fill" : o.type === "satin" ? "Satin column" : o.type === "manual" ? "Manual stitches" : "Running stitch"}</span></span></button><button class="visibility" data-visibility="${esc(o.id)}" aria-label="${o.visible === false ? "Show" : "Hide"} ${esc(o.name)}">${o.visible === false ? "○" : "◉"}</button></div>`,
        )
        .join("")
    : '<p class="empty-list">Your next design starts here.<br>Draw a shape, add lettering, or import artwork.</p>';
  $("undo").disabled = !history.length;
  $("redo").disabled = !future.length;
  for (const id of ["move-up", "move-down", "duplicate", "delete"])
    $(id).disabled = !selected();
  renderProperties();
  markSourceRows();
}
function markSourceRows() {
  if (!state.plan || machinePlan) return;
  const active = new Set(
    state.plan.events.filter((e) => e.cmd === "stitch").map((e) => e.objectId),
  );
  document.querySelectorAll(".object-row").forEach((row) => {
    const id = row.querySelector("[data-select]")?.dataset.select,
      sourceOnly = !active.has(id);
    row.classList.toggle("source-only", sourceOnly);
    row.title = sourceOnly
      ? "Source artwork retained. This object currently produces no sewing stitches; check digitizing settings or its geometry."
      : "";
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
  const o = selected();
  $("inspector-title").textContent = o
    ? "Object properties"
    : "Design overview";
  if (!o) {
    $("properties").innerHTML =
      `<p class="intro">From a first sketch to the final stitch.<br>Create something worth making.</p><div class="quick-actions"><button id="quick-import">↗ Import artwork or embroidery</button><button id="quick-lettering">T Add lettering / monogram</button><button id="quick-flower">✽ Load wildflower example</button></div><div class="section-label">A SIMPLE WORKFLOW</div><p class="property-note">01 &nbsp; Draw or import your artwork.<br><br>02 &nbsp; Set stitch type, spacing and direction.<br><br>03 &nbsp; Inspect the actual sequence in Stitch preview.<br><br>04 &nbsp; Export a machine file and test your sew-out.</p>`;
    $("quick-import").onclick = () => $("file-input").click();
    $("quick-lettering").onclick = textDialog;
    $("quick-flower").onclick = loadDemo;
    return;
  }
  const b = objectBounds(o);
  $("properties").innerHTML =
    `<label class="field">Object name<input id="object-name" value="${esc(o.name)}" maxlength="100"></label><label class="field">Stitch type<select id="stitch-type">${[
      ["fill", "Tatami fill"],
      ["run", "Running stitch"],
      ["satin", "Satin centerline"],
      ["manual", "Manual stitches"],
    ]
      .filter(([k]) =>
        k === "manual" ? o.type === "manual" : o.type !== "manual",
      )
      .map(
        ([k, v]) =>
          `<option value="${k}" ${k === o.type ? "selected" : ""}>${v}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="section-label">THREAD COLOR <span>40 WT</span></div><input id="thread-color" type="color" aria-label="Thread color" value="${o.color}"><div class="swatch-palette">${PALETTE.map((c) => `<button data-color="${c}" class="${c === o.color ? "active" : ""}" style="background:${c}" aria-label="Use thread ${c}"></button>`).join("")}</div>${o.type === "manual" ? "" : `<div class="section-label">STITCH SETTINGS</div><div class="two-col">${field("Row spacing", "spacing", o.spacing, "mm", 0.15, 5)}${field(o.type === "satin" ? "Column width" : "Stitch length", o.type === "satin" ? "satin-width" : "length", o.type === "satin" ? o.width : o.length, "mm", 0.3, 7)}</div>${o.type === "fill" ? field("Stitch direction", "angle", o.angle, "°", -360, 360, 1) : ""}${o.type !== "run" ? field("Pull compensation", "compensation", o.compensation, "mm", 0, 1) : ""}<label class="check"><input id="underlay" type="checkbox" ${o.underlay ? "checked" : ""}> Light underlay</label>${o.type !== "fill" ? `<label class="check"><input id="closed-path" type="checkbox" ${o.closed ? "checked" : ""}> Close path</label>` : ""}<p class="property-note">${o.type === "fill" ? "Smaller row spacing makes a denser fill. Underlay runs perpendicular at a wider spacing." : o.type === "satin" ? "The path is the centerline. Width controls the zigzag span; spacing controls the advance along the column." : "Running stitches follow the path. Row spacing applies when switching to fill or satin."}</p>`}<div class="section-label">POSITION & SIZE</div><div class="two-col">${field("Center X", "pos-x", (b.minX + b.maxX) / 2, "mm", -1000, 1000)}${field("Center Y", "pos-y", (b.minY + b.maxY) / 2, "mm", -1000, 1000)}${field("Width", "size-w", b.width, "mm", 0.1, 500)}${field("Height", "size-h", b.height, "mm", 0.1, 500)}</div>${field("Rotate by", "rotate", 0, "°", -360, 360, 1)}<p class="property-note">Origin is the hoop center. Width and height scale independently.</p>${o.type !== "manual" ? '<button id="convert-manual">Make stitches editable</button>' : manualEditor(o)}`;
  $("object-name").onchange = (e) =>
    mutate(() => (o.name = e.target.value.trim() || "Untitled object"));
  $("stitch-type").onchange = (e) => mutate(() => (o.type = e.target.value));
  $("thread-color").onchange = (e) => mutate(() => (o.color = e.target.value));
  document
    .querySelectorAll("[data-color]")
    .forEach(
      (el) => (el.onclick = () => mutate(() => (o.color = el.dataset.color))),
    );
  bindNumber("spacing", (v) => (o.spacing = v), 0.15, 5);
  bindNumber("length", (v) => (o.length = v), 0.3, 7);
  bindNumber("satin-width", (v) => (o.width = v), 0.3, 7);
  bindNumber("angle", (v) => (o.angle = v), -360, 360);
  bindNumber("compensation", (v) => (o.compensation = v), 0, 1);
  if ($("underlay"))
    $("underlay").onchange = (e) =>
      mutate(() => (o.underlay = e.target.checked));
  if ($("closed-path"))
    $("closed-path").onchange = (e) =>
      mutate(() => (o.closed = e.target.checked));
  bindNumber(
    "pos-x",
    (v) => translate(o, v - (b.minX + b.maxX) / 2, 0),
    -1000,
    1000,
  );
  bindNumber(
    "pos-y",
    (v) => translate(o, 0, v - (b.minY + b.maxY) / 2),
    -1000,
    1000,
  );
  bindNumber(
    "size-w",
    (v) => transform(o, b.width ? v / b.width : 1, 1),
    0.1,
    500,
  );
  bindNumber(
    "size-h",
    (v) => transform(o, 1, b.height ? v / b.height : 1),
    0.1,
    500,
  );
  bindNumber("rotate", (v) => transform(o, 1, 1, v), -360, 360);
  if ($("convert-manual"))
    $("convert-manual").onclick = () => {
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
        state.manualIndex = 0;
      });
      toast("Stitches are now editable. Undo returns to the vector object.");
    };
  if (o.type === "manual") bindManual(o);
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
  $("fit-status").textContent = stats
    ? stats.fits
      ? "✓ Design fits selected hoop"
      : "! Design exceeds hoop"
    : "Generate a design to check fit";
  $("fit-status").classList.toggle("bad", !!stats && !stats.fits);
  $("warnings").innerHTML = (state.plan?.warnings || [])
    .map((w) => `<p>${esc(w)}</p>`)
    .join("");
}
function renderTimeline() {
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
    ? `${stats.colors} color blocks · ${stats.manualChanges} manual changes · ${fmt(stats.jumps)} jumps${stats.sourceColorBlocks !== undefined ? ` · source order: ${stats.sourceColorBlocks} blocks` : ""}`
    : "";
  drawCommandTrack();
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
  for (const cmd of ["jump", "trim", "color"]) {
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
    ? `${e.cmd.toUpperCase()} · X ${num(e.x)}  Y ${num(e.y)}${e.phase === "underlay" ? " · UNDERLAY" : e.phase === "anchor" ? " · NEEDLE ANCHOR" : ""}`
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
  if (e?.objectId && e.objectId !== state.selection) {
    state.selection = e.objectId;
    renderPanels();
  }
  if (e?.sourceIndex !== undefined) {
    state.manualIndex = e.sourceIndex;
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
  $("dialog-title").textContent = title;
  $("dialog-content").innerHTML = html;
  $("dialog-submit").textContent = submit;
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
  if (file.size > 20 * 1024 * 1024) {
    toast("Choose a file smaller than 20 MB.");
    return;
  }
  const ext = file.name.split(".").at(-1).toLowerCase();
  busy = true;
  $("status").textContent = "Reading " + file.name + "…";
  try {
    if (["json", "embstudio"].includes(ext)) {
      const p = validateProject(JSON.parse(await file.text()));
      if (await confirmReplace("Open this project?")) {
        mutate(() => {
          state.project = p;
          state.selection = null;
        });
        stage.fit();
        toast("Project opened.");
      }
    } else if (ext === "svg") {
      const objects = importSVG(await file.text());
      addObjects(objects);
      if (objects.importWarnings) toast(objects.importWarnings);
    } else if (["png", "jpg", "jpeg"].includes(ext)) {
      const ok = await ask(
        "Digitize an image",
        '<p>Best for flat-color illustrations, logos and silhouettes. Photos are reduced to color regions. Small details under about 0.5 mm are removed.</p><label>Thread colors<input id="raster-colors" type="number" value="5" min="2" max="10" required></label><label>Artwork width (mm)<input id="raster-width" type="number" value="70" min="5" max="200" required></label><label class="inline"><input id="raster-bg" type="checkbox" checked> Remove the dominant border color</label>',
        "Digitize image",
      );
      if (ok) {
        await new Promise((r) => requestAnimationFrame(r));
        addObjects(
          await rasterObjects(
            file,
            Number($("raster-colors").value),
            $("raster-bg").checked,
            Number($("raster-width").value),
          ),
        );
      }
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
  }
}
function removeSelected() {
  const o = selected();
  if (!o) return;
  if (state.tool === "node" && stage.node !== null && o.type !== "manual") {
    const p = o.rings.flat()[stage.node],
      r = o.rings.find((r) => r.includes(p));
    if (r && r.length > (o.type === "fill" ? 3 : 2)) {
      mutate(() => r.splice(r.indexOf(p), 1));
      stage.node = null;
      return;
    }
  }
  mutate(() => {
    state.project.objects = state.project.objects.filter((x) => x.id !== o.id);
    state.selection = null;
  });
}
function undo() {
  if (!history.length) return;
  pause();
  future.push(JSON.stringify(state.project));
  state.project = JSON.parse(history.pop());
  state.selection = null;
  stage.draft = [];
  updateDraft();
  changed();
}
function redo() {
  if (!future.length) return;
  history.push(JSON.stringify(state.project));
  state.project = JSON.parse(future.pop());
  state.selection = null;
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
  const selectEl = e.target.closest("[data-select]"),
    visibility = e.target.closest("[data-visibility]");
  if (selectEl) {
    select(selectEl.dataset.select);
    if (innerWidth <= 680) $("layers-panel").classList.remove("open");
  }
  if (visibility)
    mutate(() => {
      const o = state.project.objects.find(
        (x) => x.id === visibility.dataset.visibility,
      );
      o.visible = o.visible === false;
    });
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
    });
    stage.fit();
  }
};
$("open-file").onclick = () => $("file-input").click();
$("file-input").onchange = (e) =>
  e.target.files[0] && importFile(e.target.files[0]);
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
    machinePlan = false;
    $("sequence-source").textContent = "Generated design";
    scheduleGenerate();
  }
};
$("preview-tab").onclick = () => setMode("preview");
document
  .querySelectorAll("[data-tool]")
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
$("text-tool").onclick = textDialog;
$("undo").onclick = undo;
$("redo").onclick = redo;
$("delete").onclick = removeSelected;
$("duplicate").onclick = () => {
  const o = selected();
  if (o) {
    const copy = structuredClone(o);
    copy.id = uid();
    copy.name += " copy";
    translate(copy, 3, 3);
    addObjects([copy]);
  }
};
for (const [id, dir] of [
  ["move-up", -1],
  ["move-down", 1],
])
  $(id).onclick = () => {
    const i = state.project.objects.findIndex((o) => o.id === state.selection),
      j = i + dir;
    if (i >= 0 && j >= 0 && j < state.project.objects.length)
      mutate(() => {
        [state.project.objects[i], state.project.objects[j]] = [
          state.project.objects[j],
          state.project.objects[i],
        ];
      });
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
$("toggle-layers").onclick = () => {
  $("layers-panel").classList.toggle("open");
  $("inspector-panel").classList.remove("open");
};
$("toggle-inspector").onclick = () => {
  $("inspector-panel").classList.toggle("open");
  $("layers-panel").classList.remove("open");
};
$("help").onclick = () =>
  ask(
    "Your embroidery workbench",
    '<p><strong>Draw:</strong> Use polygon for filled regions, running path for outlines, and satin for narrow columns. Click points, then press <kbd>Enter</kbd> or Finish path. Drag to create rectangles and ellipses.</p><p><strong>Edit:</strong> Select and drag objects. The node tool lets you move individual points; double-click an edge to insert a node. Use the properties panel for exact dimensions, angles and stitch settings. Objects sew from top to bottom.</p><p><strong>Simulate:</strong> Open Stitch preview. Play, step through, scrub, click a stitch, or click a color block. Command positions, underlay and jump paths are inspectable. Export replaces the preview with commands decoded from the saved file.</p><p><strong>Manual editing:</strong> Make a vector object’s stitches editable, then adjust needle points with the node tool or command index editor. Imported embroidery files are editable stitch blocks.</p><p><strong>Shortcuts:</strong> <kbd>V</kbd> select · <kbd>N</kbd> nodes · <kbd>P</kbd> fill · <kbd>R</kbd> run · <kbd>S</kbd> satin · <kbd>T</kbd> text · <kbd>E</kbd> ellipse · <kbd>H</kbd> pan · <kbd>Space</kbd> temporary pan / preview playback · <kbd>Ctrl Z</kbd> undo · <kbd>Ctrl Shift Z</kbd> redo · <kbd>Delete</kbd> selected object / vector node.</p><p>SVG import supports paths, basic shapes, transforms, holes and inline solid paints. Convert text to paths and expand clipping or effects first. Image digitizing is intended for flat artwork. Core editing works locally; machine conversion loads a pinned Python/WASM runtime from jsDelivr on first use. Thread colors are visual approximations.</p><p><a href="https://github.com/kircherlabs/embroidery-studio#readme" target="_blank" rel="noreferrer">Documentation & known limitations ↗</a></p>',
    "Got it",
  );
document.addEventListener("keydown", (e) => {
  if ($("dialog").open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))
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
    stage.cancelDrag();
    stage.draft = [];
    updateDraft();
    select(null);
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
document.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer.files[0]) importFile(e.dataTransfer.files[0]);
});
renderPanels();
renderStats();
scheduleGenerate();
if (restored) $("status").textContent = "Restored project from this device";
// Read-only diagnostic surface for reproducible browser integration checks.
window.studio = {
  getProject: () => structuredClone(state.project),
  getPlan: () => structuredClone(state.plan),
  getMode: () => state.mode,
};
