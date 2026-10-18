import { FONTS, updateLettering } from "./importers.js";
import { regenerateShape, curveRings } from "./smart-geometry.js";
import {
  combineArtwork,
  cutEyelet,
  contourArtwork,
  applyRecipe,
  alignReference,
  roundChecked,
} from "./creative.js";
import { selectionIds, nodeById, isLocked } from "./hierarchy.js";
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
  `<label class="field">${label}<input type="number" id="${id}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
export function creativeInspector(api, leaf, objects, targets) {
  const { state, mutate, toast } = api,
    p = state.project,
    vectors = objects.filter((o) => o.type !== "manual");
  if (!vectors.length) return;
  const cornerTypes = new Set([
    "run",
    "bean",
    "triple",
    "satin",
    "border",
    "placement",
    "tackdown",
    "basting",
    "contour",
  ]);
  const cornerTargets = targets.filter((op) => cornerTypes.has(op.type));
  const box = document.createElement("section");
  box.className = "creative-settings";
  const shape = leaf?.shape,
    text = leaf?.textSource,
    group = nodeById(p, selectionIds(state)[0]);
  box.innerHTML = `${group?.imageSource ? `<details><summary>Image tracing reference</summary><img src="${esc(group.imageSource.data)}" alt="Preserved image reference" style="width:100%;max-height:120px;object-fit:contain"><button id="retrace-image" data-help="Repeat tracing from the preserved image with new settings. Replaces this group's edited regions and operations; Undo restores them. Current group size and position are retained.">Adjust tracing…</button></details>` : ""}${
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
 ${targets.some((o) => o.type === "column") ? `<details open><summary>Satin column construction</summary>${field("Maximum satin span · mm", "column-max", targets[0]?.maxSatin || 6, 1, 6.5)}<p class="property-note">Stitches span actual region edges along Stitch direction. Holes stay open. Wide spans use staggered splits. For curved letters and branches, divide regions and adjust directions; this is directional column digitizing, not automatic skeleton tracing.</p></details>` : ""}
 <details><summary>Corner &amp; curve control</summary>${field("Round geometry · radius mm", "round-radius", leaf?.rounding?.radius || 0, 0, 20)}<button id="round-geometry" data-help="Explicitly fillet all compatible selected paths. Original contours are retained while adjusting radius; zero restores them. Undo also restores text and smart shape editability.">Apply geometric rounding</button>${leaf ? `<button id="round-node" data-help="With the Node tool, select one vertex first. Fillet that vertex only. Undo restores the previous contour.">Round active vertex</button>` : ""}<p class="property-note">Rounds actual artwork, including counters. Radius is limited locally to prevent adjacent fillets crossing.</p><label class="check"><input id="corner-adaptive" type="checkbox" ${targets.length && targets.every((o) => o.cornerControl) ? "checked" : ""}>Adaptive needle spacing</label>${field("Minimum corner stitch · mm", "corner-min", targets[0]?.minCornerStitch || 0.3, 0.2, 1)}<p class="property-note">Stitch construction only: retain running-path corners while avoiding close neighboring penetrations; shorten crowded inner satin turns. Does not round artwork. Split very sharp satin corners into separate paths for full control.</p></details>
 <details><summary>Shape tools &amp; construction</summary>${
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
 }${field("Contour offset · mm", "geometry-offset", 1, -5, 5)}<button id="offset-geometry" data-help="Expand positive or inset negative closed artwork with round joins. Holes contract or expand accordingly. Undo restores source geometry.">Apply contour to artwork</button><label class="field">Create from selection<select id="construction-recipe"><option value="patch">Patch · tackdown + border</option><option value="keychain">Keychain · tackdown + stop + border</option><option value="applique">Appliqué · placement + stops + tackdown + border</option></select></label><button id="construction-apply" data-help="Replace operation stacks on selected closed regions with a construction recipe. Steps share each region's geometry; configure the independent operations afterwards. Undo restores prior stacks.">Apply shared-geometry recipe</button></details>
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
  if (leaf?.curve)
    box.insertAdjacentHTML(
      "beforeend",
      '<details><summary>Bézier node controls</summary><p class="property-note">Select an anchor with the Node tool. Drag tangent handles to reshape curves; double-click a curve to split it. Delete removes an anchor.</p><button id="node-smooth">Smooth active anchor</button><button id="node-corner">Make active anchor a corner</button></details>',
    );
  const panel = document.getElementById("properties");
  const anchor =
    panel.querySelector("label:has(#stitch-type)") || panel.firstChild;
  panel.insertBefore(box, anchor);
  const $ = (id) => box.querySelector("#" + id);
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
        (el.dataset.help = `${el.closest("label").firstChild.textContent.trim()}. Changes artwork geometry in Smart shape; embroidery settings affect generated needle movements. Valid range ${el.min}–${el.max}.`),
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
  $("round-geometry").onclick = () => {
    if (!valid($("round-radius"))) return;
    const radius = Number($("round-radius").value);
    safe(() => vectors.forEach((o) => roundChecked(o, radius)));
  };
  if ($("round-node"))
    $("round-node").onclick = () => {
      const index = api.node();
      if (index === null || leaf.curve) {
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
  for (const action of ["smooth", "corner"])
    if ($("node-" + action))
      $("node-" + action).onclick = () => {
        const i = api.node(),
          c = leaf.curve;
        if (i === null || !c.nodes[i]) {
          toast("Select an anchor with the Node tool first.");
          return;
        }
        safe(() => {
          const n = c.nodes[i];
          if (action === "corner") {
            delete n.in;
            delete n.out;
          } else {
            const a = c.nodes[Math.max(0, i - 1)],
              b = c.nodes[Math.min(c.nodes.length - 1, i + 1)];
            const dx = (b.x - a.x) / 6,
              dy = (b.y - a.y) / 6;
            n.in = { x: n.x - dx, y: n.y - dy };
            n.out = { x: n.x + dx, y: n.y + dy };
          }
          leaf.rings = curveRings(c);
        });
      };
  $("offset-geometry").onclick = () => {
    if (!valid($("geometry-offset"))) return;
    const delta = Number($("geometry-offset").value);
    safe(() => vectors.forEach((o) => contourArtwork(o, delta)));
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
  $("construction-apply").onclick = () => {
    const recipe = $("construction-recipe").value;
    safe(() => vectors.forEach((o) => applyRecipe(o, recipe)));
  };
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
  const applyCorner = (key, value) =>
    safe(() => {
      for (const o of vectors) {
        const ops = o.operations
          ? state.activeOperationId
            ? o.operations.filter((op) => op.id === state.activeOperationId)
            : state.bulkOperations === "all"
              ? o.operations
              : [
                  o.operations.find(
                    (op) => !["stop", "trim"].includes(op.type),
                  ),
                ].filter(Boolean)
          : [o];
        for (const op of ops)
          if (
            key === "maxSatin" ? op.type === "column" : cornerTypes.has(op.type)
          )
            op[key] = value;
      }
    });
  if ($("column-max"))
    $("column-max").onchange = (e) => {
      if (valid(e.target)) applyCorner("maxSatin", Number(e.target.value));
    };
  $("corner-adaptive").disabled = cornerTargets.length === 0;
  $("corner-min").disabled = cornerTargets.length === 0;
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
}
