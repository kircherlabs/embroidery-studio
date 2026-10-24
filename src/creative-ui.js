import { installRailInspector } from "./rail-ui.js";
import { installEffectInspector } from "./artwork-tools-ui.js";
import { installPathTextInspector } from "./text-path-ui.js";
import { letteringCurve, updateLetteringCurve } from "./text-path.js";
import { setNodeMode } from "./path-editing.js";
import { closedCurveEditable } from "./closed-curve-editing.js";
import { refitPatch } from "./construction.js";
import { FONTS, updateLettering } from "./importers.js";
import {
  regenerateShape,
  curveRings,
  regenerateRails,
} from "./smart-geometry.js";
import {
  combineArtwork,
  cutEyelet,
  alignReference,
  roundChecked,
} from "./creative.js";
import { selectionIds, nodeById, isLocked } from "./hierarchy.js";
import { editOperations } from "./styles.js";
import { CORNER_TYPES } from "./operations.js";
import { materialize, makeOperation } from "./operations.js";
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const field = (label, id, value, min, max, step = 0.1) =>
  `<label class="field">${label}<input type="number" required id="${id}" value="${value}" placeholder="Mixed" min="${min}" max="${max}" step="${step}"></label>`;
export function satinSummary(results) {
  if (!results.length) return "Analyzing stroke structure…";
  if (results.some((d) => d.manual))
    return `Manual rail construction · ${Math.min(...results.map((d) => d.minWidth || 0)).toFixed(2)}–${Math.max(...results.map((d) => d.maxWidth || 0)).toFixed(2)} mm span. ${results.some((d) => d.wide) ? "Wide spans use staggered split stitches. " : ""}Review seams, corners and coverage with a sew-out.`;
  return `${results.reduce((n, d) => n + d.strokes.length, 0)} stroke sections · ${results.some((d) => d.fallback) ? "Some regions use the selected fallback. Review Design Issues." : "Automatic rails generated."} ${results.some((d) => d.wide) ? "Wide spans have split penetrations. " : ""}Test small serifs, joins and material coverage with a sew-out.`;
}
export function creativeInspector(api, leaf, objects, targets) {
  const { state, mutate, toast } = api,
    p = state.project,
    vectors = objects.filter((o) => !["manual", "reference"].includes(o.type));
  if (!vectors.length && !nodeById(p, selectionIds(state)[0])?.imageSource)
    return;
  const cornerTypes = CORNER_TYPES;
  const cornerTargets = targets.filter(
    (op) =>
      cornerTypes.has(op.type) &&
      (op.type !== "column" || ["stroke", "rails"].includes(op.columnMode)),
  );
  const columns = targets.filter((o) => o.type === "column"),
    column = columns[0];
  const mode = columns.every(
    (o) =>
      (o.columnMode || "directional") === (column?.columnMode || "directional"),
  )
    ? column?.columnMode || "directional"
    : "";
  const guideTarget =
    leaf &&
    targets.length === 1 &&
    ["stroke", "rails"].includes(column?.columnMode)
      ? column
      : null;
  const satinInfo = (state.plan?.diagnostics?.satin || []).filter(
    (d) => d.objectId === leaf?.id && d.operationId === column?.id,
  );
  const box = document.createElement("section");
  box.className = "creative-settings";
  const shape = leaf?.shape,
    text = leaf?.textSource,
    group = nodeById(p, selectionIds(state)[0]);
  box.innerHTML = `${group?.imageSource ? `<details><summary>Image tracing reference</summary><img src="${esc(group.imageSource.data)}" alt="Preserved image reference" style="width:100%;max-height:120px;object-fit:contain"><button id="retrace-image" data-help="Reduce colors without changing edited geometry or sewing actions, or create a revised trace from the preserved source. Replacement is an explicit confirmed choice.">Colors & tracing…</button></details>` : ""}${
    text
      ? `<details open><summary>Editable lettering</summary><label class="field">Text<textarea id="live-text" maxlength="120" rows="2">${esc(text.content)}</textarea></label><label class="field">Font<select id="live-font">${Object.entries(
          FONTS,
        )
          .map(
            ([key, name]) =>
              `<option value="${key}" style="font-family:${key}" ${key === text.font ? "selected" : ""}>${name}</option>`,
          )
          .join(
            "",
          )}</select></label><p class="font-sample" id="font-sample" style="font-family:${text.font}">${esc(text.content)}</p><div class="two-col">${field("Letter height · mm", "live-height", text.height, 3, 80)}${field("Letter spacing · mm", "live-tracking", text.tracking, 0, 10)}</div><div class="two-col">${field("Line spacing · × height", "live-leading", text.lineSpacing, 1, 3)}<label class="field">Alignment<select id="live-align">${["left", "center", "right"].map((v) => `<option ${v === text.align ? "selected" : ""}>${v}</option>`).join("")}</select></label></div><p class="property-note">${text.height < 6 ? "Small lettering needs a careful test sew-out. " : ""}Font changes regenerate this object and all its operations. Saved outlines remain portable; device fonts may vary when edited on another device.</p></details>`
      : ""
  }
 ${
   shape
     ? `<details open><summary>Smart ${shape.kind === "eyelet" ? "eyelet" : shape.kind === "regular" ? "polygon" : shape.kind}</summary><div class="two-col">${shape.kind === "eyelet" ? field("Inner diameter · mm", "shape-diameter", shape.diameter, 1, 30) + field("Reinforcement · mm", "shape-band", shape.band, 0.5, 5) : field("Source width · mm", "shape-width", shape.width, 0.5, 300) + field("Source height · mm", "shape-height", shape.height, 0.5, 300)}</div>${["rect", "regular", "star"].includes(shape.kind) ? field("Corner radius · mm", "shape-radius", shape.radius, 0, 50) : ""}${["regular", "star"].includes(shape.kind) ? field(shape.kind === "star" ? "Star points" : "Polygon sides", "shape-sides", shape.sides, 3, 32, 1) : ""}${shape.kind === "star" ? field("Inner radius ratio", "shape-innerRatio", shape.innerRatio, 0.1, 0.9) : ""}${
         shape.kind === "eyelet"
           ? `<label class="check"><input id="eyelet-marker" type="checkbox" ${leaf.operations?.some((op) => op.type === "marker" && op.enabled !== false) ? "checked" : ""}>Stitch a punch reference cross</label><p class="property-note">Stitched reinforcement around a future hole. The machine does not cut or punch fabric.</p><label class="field">Geometric opening in<select id="hole-target"><option value="">Choose closed artwork…</option>${p.objects
               .filter(
                 (o) =>
                   o !== leaf &&
                   (o.type === "fill" || o.closed) &&
                   !isLocked(p, o),
               )
               .map(
                 (o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`,
               )
               .join(
                 "",
               )}</select></label><button id="cut-eyelet" data-help="Remove the inner disk from the chosen artwork geometry. Reinforcement remains separate. Undo restores the original shape; fabric still requires manual cutting or punching.">Subtract inner opening</button>`
           : ""
       }</details>`
     : ""
 }
 ${leaf?.constructionArtworkIds?.length && shape ? `<details><summary>Patch boundary sizing</summary>${field("Refit margin around artwork · mm", "patch-refit-margin", leaf.patchMargin ?? 3, 0, 50)}<button id="patch-refit" data-help="Resize and reposition this boundary around its linked artwork using the chosen margin. Resets boundary rotation to the hoop axes; decorative artwork and operation settings stay unchanged. Undo restores the previous boundary.">Refit boundary to artwork</button><p class="property-note">Uses the current linked artwork bounds. Keep margin at least as large as the finishing band to avoid covering decorative stitches. Manual size controls remain in Smart shape.</p></details>` : ""}
 ${columns.length ? `<details open><summary>Satin column construction</summary><label class="field">Column construction<select id="column-mode">${!mode ? '<option value="" disabled selected>Mixed</option>' : ""}<option value="stroke">Follow individual strokes</option><option value="directional">Directional spans · legacy / manual</option><option value="rails" ${objects.every((o) => o.satinRails) ? "" : "disabled"}>Manual · two editable rails</option></select></label>${field("Maximum satin span · mm", "column-max", columns.every((o) => o.maxSatin === column.maxSatin) ? (column.maxSatin ?? 6) : "", 1, 6.5)}${["stroke", "rails"].includes(mode) ? `<p class="property-note">${mode === "rails" ? "Your two source rails define one variable-width column. Guides pair positions across them; closed rings use explicit seam nodes." : "Branches become separate variable-width columns."} Stitches cross each stroke and turn with curves. Center-walk underlay follows those strokes. Wide floats use staggered splits.</p>${mode === "stroke" ? `<label class="field">When automatic rails are unsuitable<select id="column-fallback"><option value="tatami">Tatami fallback + Design Issue</option><option value="manual">Leave unsewn + Design Issue</option></select></label>` : ""}<label class="check"><input type="checkbox" id="satin-structure" ${state.satinStructure ? "checked" : ""}>Show stroke rails and directions</label>${guideTarget ? `<button id="satin-guide-edit" aria-pressed="${state.satinGuideEdit === column.id}" data-help="Drag across a stroke on the canvas to add a local needle-direction guide. Drag endpoint handles to edit. This changes satin construction without changing artwork. Escape exits guide editing.">${state.satinGuideEdit === column.id ? "Finish direction guides" : "Edit direction guides on canvas"}</button><p class="property-note">${(column.satinGuides || []).length} local guides · drag across a stroke, not along it. ${mode === "rails" ? "Each guide must cross both rails once. Move or shorten guides that cross other parts of a ring." : "Guides remain editable when switching fonts; review their positions afterward."}</p><div class="creative-grid">${(column.satinGuides || []).map((g, i) => `<button data-remove-satin-guide="${i}" aria-label="Remove direction guide ${i + 1}">Remove guide ${i + 1}</button>`).join("")}</div>` : '<p class="property-note">Select one artwork object and one column step to edit its direction guides.</p>'}<p id="satin-analysis" class="property-note" data-object="${esc(leaf?.id || "")}" data-operation="${esc(column.id)}">${leaf ? satinSummary(satinInfo) : "Select one artwork object to inspect its stroke analysis."}</p>` : '<p class="property-note">Legacy construction spans region edges along Stitch direction. Holes stay open. It does not automatically follow letter strokes. Fill pattern controls wide-span splits.</p>'}</details>` : ""}

 <details><summary>Round shape corners</summary>${shape && ["rect", "regular", "star"].includes(shape.kind) ? '<p class="property-note">Use Corner radius in Smart shape for whole-shape rounding and retained parameters. Below, Round active vertex converts a single polygon vertex to a rounded path; Undo restores the Smart shape.</p>' : ""}${field(shape && ["rect", "regular", "star"].includes(shape.kind) ? "Active vertex radius · mm" : "Artwork rounding radius · mm", "round-radius", leaf?.rounding?.radius || 0, 0, 20)}${shape && ["rect", "regular", "star"].includes(shape.kind) ? "" : `<button id="round-geometry" data-help="Explicitly fillet all compatible selected paths. Original contours are retained while adjusting radius; zero restores them. Smart shape parameters and editable lettering are preserved when supported. Bézier filleting converts to a polygon path; Undo restores curve handles.">Apply geometric rounding</button>`}${leaf ? `<button id="round-node" data-help="With the Node tool, select one vertex first. Fillet that vertex only. This converts editable lettering or a Smart shape to a fixed path; Undo restores its source.">Round active vertex</button>` : ""}<p class="property-note">Changes artwork and rebuilds all sewing actions. Satin spacing follows the outer rail; tatami keeps its row spacing. Radius is limited locally to protect counters and neighboring corners.</p></details><details data-section="corners"><summary>Optimize corner stitches</summary><label class="check"><input id="corner-adaptive" type="checkbox" ${targets.length && targets.every((o) => o.cornerControl) ? "checked" : ""}>Protect inner turns &amp; running corners</label>${field("Crowded-corner threshold · mm", "corner-min", cornerTargets.every((o) => (o.minCornerStitch ?? 0.3) === (cornerTargets[0]?.minCornerStitch ?? 0.3)) ? (cornerTargets[0]?.minCornerStitch ?? 0.3) : "", 0.2, 1)}<p id="corner-availability" class="property-note"></p><p class="property-note">Satin coverage is preserved automatically, including outer curves. This option alternates short and full inner stitches where a turn crowds the needle holes, and protects running-path corners. It does not round artwork or reduce outer coverage.</p></details>
 <details><summary>Geometry tools</summary>${
   vectors.length > 1
     ? `<div class="creative-grid">${[
         ["union", "Union"],
         ["difference", "Subtract"],
         ["intersection", "Intersect"],
         ["xor", "Difference"],
       ]
         .map(
           ([key, name]) =>
             `<button data-combine="${key}" data-help="Combine selected closed regions. Subtract uses the first source object as the base. The base retains its hierarchy and operations. Undo restores all source objects.">${name}</button>`,
         )
         .join("")}</div>`
     : ""
 }</details>
 <details><summary>Align to reference</summary><label class="field">Reference<select id="align-reference"><option value="hoop">Machine hoop</option><option value="selection">Combined selection</option>${[...(p.groups || []), ...p.objects].map((n) => `<option value="${esc(n.id)}">${n.kind ? "Group · " : ""}${esc(n.name)}</option>`).join("")}</select></label><div class="creative-grid">${[
   ["left", "Left"],
   ["center-x", "H center"],
   ["right", "Right"],
   ["top", "Top"],
   ["center-y", "V center"],
   ["bottom", "Bottom"],
   ["center", "Center both"],
   ["match-width", "Match width"],
   ["match-height", "Match height"],
 ]
   .map(
     ([key, label]) =>
       `<button data-reference-align="${key}" data-help="Align actual selected geometry to the chosen reference. A specific reference remains stationary. Groups move together; locked descendants stay unchanged.">${label}</button>`,
   )
   .join("")}</div></details>`;
  if (closedCurveEditable(leaf)) {
    box.insertAdjacentHTML(
      "beforeend",
      `<details data-section="closed-curve"><summary>Contour details</summary><label>Contour<select id="closed-contour">${leaf.rings.map((_, i) => `<option value="${i}">Contour ${i + 1}</option>`).join("")}</select></label><button id="node-symmetric" data-help="Align both tangent handles with equal lengths. Corner, Smooth and Break Handles are in the node-editing toolbar; Smooth preserves independent lengths.">Symmetric handles · equal lengths</button></details>`,
    );
  } else if (leaf?.curve || leaf?.satinRails || leaf?.textSource?.path) {
    box.insertAdjacentHTML(
      "beforeend",
      '<details><summary>Curve details</summary><button id="node-symmetric" data-help="Align the active node’s tangent handles with equal lengths. The node-editing toolbar provides Corner, Smooth and Break Handles.">Symmetric active anchor</button></details>',
    );
  }
  const panel = document.getElementById("properties");
  panel.prepend(box);
  const $ = (id) => document.getElementById(id);
  if ($("closed-contour")) {
    $("closed-contour").value = api.contour();
    $("closed-contour").onchange = (e) =>
      api.setContour(Number(e.target.value));
  }
  for (const id of ["closed-contour", "node-symmetric"])
    if ($(id))
      $(id).disabled = state.tool !== "node" || state.mode !== "design";
  if ($("patch-refit"))
    $("patch-refit").onclick = () => {
      const input = $("patch-refit-margin");
      if (input.checkValidity())
        mutate(() => refitPatch(p, leaf, Number(input.value)));
      else toast("Enter a margin from 0 to 50 mm.");
    };
  if ($("retrace-image")) $("retrace-image").onclick = () => api.retrace(group);
  const safe = (fn) => {
    try {
      mutate(fn);
    } catch (e) {
      toast(e.message);
    }
  };
  const valid = (el) => {
    if (el.checkValidity()) return true;
    toast("Enter a value within the displayed range.");
    api.refresh();
    return false;
  };
  box
    .querySelectorAll('input[type="number"]')
    .forEach(
      (el) =>
        (el.dataset.help = `${el.closest("label").firstChild.textContent.trim()}. Units and purpose are shown beside the field. Artwork controls regenerate shared geometry; method controls change needle placement only. Valid range ${el.min}–${el.max}.`),
    );
  if (text) {
    for (const [id, key] of [
      ["live-text", "content"],
      ["live-font", "font"],
      ["live-height", "height"],
      ["live-tracking", "tracking"],
      ["live-leading", "lineSpacing"],
      ["live-align", "align"],
    ])
      $(id).onchange = (e) => {
        if (!valid(e.target)) return;
        const value =
          e.target.type === "number" ? Number(e.target.value) : e.target.value;
        safe(() => updateLettering(leaf, { [key]: value }));
      };
  }
  if (shape) {
    for (const key of [
      "width",
      "height",
      "radius",
      "sides",
      "innerRatio",
      "diameter",
      "band",
    ])
      if ($("shape-" + key))
        $("shape-" + key).onchange = (e) => {
          if (!valid(e.target)) return;
          const value = Number(e.target.value);
          safe(() => {
            shape[key] = value;
            regenerateShape(leaf);
            if (shape.kind === "eyelet")
              for (const op of leaf.operations || [])
                if (op.type === "border") {
                  op.width = shape.band;
                  op.offset = -shape.band / 2;
                }
          });
        };
    if ($("eyelet-marker"))
      $("eyelet-marker").onchange = (e) => {
        const enabled = e.target.checked;
        safe(() => {
          const ops = materialize(leaf),
            marker = ops.find((op) => op.type === "marker");
          if (marker) marker.enabled = enabled;
          else if (enabled) ops.unshift(makeOperation("marker", leaf));
        });
      };
    if ($("cut-eyelet"))
      $("cut-eyelet").onclick = () => {
        const id = $("hole-target").value;
        safe(() => cutEyelet(p, leaf, [nodeById(p, id)].filter(Boolean)));
      };
  }
  if ($("round-geometry"))
    $("round-geometry").onclick = () => {
      if (!valid($("round-radius"))) return;
      const radius = Number($("round-radius").value);
      safe(() => vectors.forEach((o) => roundChecked(o, radius)));
    };
  if ($("round-node"))
    $("round-node").onclick = () => {
      const index = api.node();
      if (index === null || leaf.curve || leaf.textSource?.path) {
        toast(
          "Select a polygon vertex with the Node tool. Bézier anchors use their tangent handles.",
        );
        return;
      }
      if (!valid($("round-radius"))) return;
      const radius = Number($("round-radius").value);
      let at = index,
        ring = 0;
      while (leaf.rings[ring] && at >= leaf.rings[ring].length)
        at -= leaf.rings[ring++].length;
      safe(() => {
        delete leaf.rounding;
        roundChecked(leaf, radius, { ring, indices: [at] });
      });
    };
  for (const action of ["symmetric"])
    if ($("node-" + action))
      $("node-" + action).onclick = () => {
        if (closedCurveEditable(leaf)) {
          api.closedAction(action);
          return;
        }
        const i = api.node(),
          c =
            leaf.satinRails?.[state.railSide || "a"] ||
            letteringCurve(leaf) ||
            leaf.curve;
        if (i === null || !c.nodes[i]) {
          toast("Select an anchor with the Node tool first.");
          return;
        }
        safe(() => {
          setNodeMode(c, i, action);
          if (leaf.satinRails) regenerateRails(leaf);
          else if (leaf.textSource?.path) updateLetteringCurve(leaf, c);
          else leaf.rings = curveRings(c);
        });
      };
  box.querySelectorAll("[data-combine]").forEach(
    (el) =>
      (el.onclick = () =>
        safe(() => {
          const id = combineArtwork(p, vectors, el.dataset.combine);
          state.selection = id;
          state.selectionIds = [id];
        })),
  );
  box.querySelectorAll("[data-reference-align]").forEach(
    (el) =>
      (el.onclick = () => {
        const ref = $("align-reference").value;
        safe(() =>
          alignReference(
            p,
            selectionIds(state),
            ref,
            el.dataset.referenceAlign,
          ),
        );
      }),
  );
  $("align-reference").value = state.alignReference || "hoop";
  if (!$("align-reference").value) $("align-reference").value = "hoop";
  $("align-reference").onchange = (e) =>
    (state.alignReference = e.target.value);
  const applyCorner = (key, value) => {
    let result;
    safe(() => {
      result = editOperations(objects, state, !!leaf, key, value);
    });
    if (result?.skipped)
      toast(
        `${result.changed} compatible operations updated; ${result.skipped} incompatible operations unchanged.`,
      );
  };
  if ($("column-max"))
    $("column-max").onchange = (e) => {
      if (valid(e.target)) applyCorner("maxSatin", Number(e.target.value));
    };
  if ($("column-mode")) {
    $("column-mode").value = mode;
    $("column-mode").onchange = (e) => {
      state.satinGuideEdit = null;
      applyCorner("columnMode", e.target.value);
    };
  }
  if ($("column-fallback")) {
    $("column-fallback").value = column.columnFallback || "tatami";
    $("column-fallback").onchange = (e) =>
      applyCorner("columnFallback", e.target.value);
  }
  if ($("satin-structure")) {
    $("satin-structure").onchange = (e) => {
      state.satinStructure = e.target.checked;
      api.draw();
    };
  }
  if ($("satin-guide-edit"))
    $("satin-guide-edit").onclick = () => {
      state.satinGuideEdit =
        state.satinGuideEdit === column.id ? null : column.id;
      state.satinStructure = true;
      api.selectTool?.();
      api.refresh();
      api.draw();
    };
  box.querySelectorAll("[data-remove-satin-guide]").forEach(
    (el) =>
      (el.onclick = () =>
        applyCorner(
          "satinGuides",
          column.satinGuides.filter(
            (_, i) => i !== Number(el.dataset.removeSatinGuide),
          ),
        )),
  );
  if (guideTarget && column.satinGuides?.length) {
    const coords = document.createElement("details");
    coords.innerHTML = `<summary>Direction guide coordinates · mm</summary>${column.satinGuides.map((g, i) => `<fieldset><legend>Guide ${i + 1}</legend>${["a", "b"].map((side) => `<div class="two-col">${["x", "y"].map((axis) => `<label class="field">${side === "a" ? "Start" : "End"} ${axis.toUpperCase()}<input type="number" min="-500" max="500" step="0.1" data-guide-index="${i}" data-guide-side="${side}" data-guide-axis="${axis}" value="${Number(g[side][axis].toFixed(3))}"></label>`).join("")}</div>`).join("")}</fieldset>`).join("")}`;
    $("satin-guide-edit").closest("details").append(coords);
    coords.querySelectorAll("input").forEach(
      (el) =>
        (el.onchange = () => {
          if (!valid(el)) return;
          const guides = structuredClone(column.satinGuides),
            g = guides[Number(el.dataset.guideIndex)];
          g[el.dataset.guideSide][el.dataset.guideAxis] = Number(el.value);
          if (Math.hypot(g.a.x - g.b.x, g.a.y - g.b.y) < 0.1) {
            toast("Keep direction guide endpoints at least 0.1 mm apart.");
            api.refresh();
            return;
          }
          applyCorner("satinGuides", guides);
        }),
    );
  }
  $("corner-adaptive").disabled = cornerTargets.length === 0;
  $("corner-min").disabled = !cornerTargets.some((o) => o.cornerControl);
  $("corner-availability").textContent = cornerTargets.length
    ? cornerTargets.some((o) => o.cornerControl)
      ? "Threshold affects compressed inner satin rails and neighboring running stitches. Straight satin and the outer rail stay full width; spacing remains measured in millimeters."
      : "Enable corner optimization to adjust the threshold. Applies to running paths and satin rails, borders or centerlines."
    : "Unavailable for tatami and directional satin columns: those methods place stitches across region spans, not around a contour. Adjust row spacing, direction or split the geometry instead.";
  $("corner-adaptive").checked =
    cornerTargets.length > 0 && cornerTargets.every((op) => op.cornerControl);
  $("corner-adaptive").indeterminate =
    cornerTargets.some((o) => o.cornerControl) &&
    !cornerTargets.every((o) => o.cornerControl);
  $("corner-adaptive").onchange = (e) =>
    applyCorner("cornerControl", e.target.checked);
  $("corner-min").onchange = (e) => {
    if (valid(e.target)) applyCorner("minCornerStitch", Number(e.target.value));
  };
  const art = document.getElementById("artwork-settings"),
    method = document.getElementById("action-method-fields"),
    advanced = method.querySelector(".advanced-settings");
  for (const detail of [...box.children]) {
    const label = detail.querySelector("summary")?.textContent || "";
    detail.dataset.section ||= label;
    if (label === "Satin column construction")
      method.insertBefore(detail, advanced);
    else if (label === "Optimize corner stitches") {
      detail.hidden = cornerTargets.length === 0;
      (advanced || method).append(detail);
    } else art.append(detail);
  }
  box.remove();
  const geometry = [...art.querySelectorAll("details")].find(
    (d) => d.dataset.section === "Geometry tools",
  );
  if (geometry && !geometry.querySelector("button")) geometry.remove();
  installEffectInspector(api, objects);
  installRailInspector(api, leaf, objects, targets);
  installPathTextInspector(api, leaf);
}
