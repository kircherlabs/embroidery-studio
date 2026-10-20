import { object } from "./model.js";
import { makeOperation, materialize } from "./operations.js";
import { makeRailSource } from "./manual-satin.js";
import { worldCurve } from "./path-editing.js";
import {
  railRings,
  regenerateRails,
  curveRings,
  roundedRing,
  identity,
  mapPoint,
} from "./smart-geometry.js";

export function railArtwork(a, b, settings = {}) {
  const satinRails = makeRailSource(a, b),
    o = object("Manual satin column", railRings(satinRails), {
      ...settings,
      type: "fill",
      closed: true,
      fillRule: "evenodd",
      satinRails,
    });
  o.operations = [
    {
      ...makeOperation("column", o),
      name: "Manual satin rails",
      columnMode: "rails",
      railScale: 1,
      railUnderlay: "center",
      compensation: 0.1,
    },
  ];
  return o;
}
export function railCandidates(objects) {
  if (
    objects.some(
      (o) =>
        ["manual", "reference"].includes(o.type) ||
        o.satinRails ||
        o.constructionArtworkIds?.length,
    )
  )
    return null;
  if (objects.length === 2 && objects.every((o) => o.rings.length === 1))
    return objects.map((o) => worldCurve(o));
  if (
    objects.length === 1 &&
    objects[0].rings.length === 2 &&
    (objects[0].closed || objects[0].type === "fill")
  )
    return [worldCurve(objects[0], 0), worldCurve(objects[0], 1)];
  return null;
}
export function installRailInspector(api, leaf, objects, targets) {
  const { state, mutate, toast } = api,
    $ = (id) => document.getElementById(id);
  if (!leaf?.satinRails) return;
  const r = leaf.satinRails,
    section = document.createElement("details");
  section.open = true;
  section.dataset.section = "manual-rail-geometry";
  section.innerHTML = `<summary>Manual satin rails · artwork</summary><p class="property-note">Two editable boundaries share this artwork. Solid blue with a circular seam = A; dashed plum with a diamond seam = B. Both have light halos. Their separation sets local width. Geometry edits update every sewing action.</p><button id="edit-manual-rails">Edit rails with Node</button>${r.a.closed ? `<div class="two-col">${["a", "b"].map((side) => `<label class="field">Rail ${side.toUpperCase()} seam node<input id="rail-seam-${side}" type="number" min="1" max="${r[side].nodes.length}" step="1" value="${r[side === "a" ? "seamA" : "seamB"] + 1}"></label>`).join("")}</div><p class="property-note">The marked seam nodes define the start/end pair around the opening. Select a rail anchor and use Set seam above the canvas for visual positioning.</p>` : ""}<label class="check"><input id="reverse-rail-b" type="checkbox" ${r.reverseB ? "checked" : ""}>Reverse rail B correspondence</label><p class="property-note">Use when the rails point in opposite directions. This differs from reversing the complete sewing sequence.</p><details><summary>Split or round rail geometry</summary><label class="field">Split position on rail A · %<input id="rail-split-position" type="number" min="2" max="98" step="1" value="50"></label><button id="split-manual-column">Split into two columns</button><p class="property-note">Creates independent open columns and copies sewing actions. Guides are kept only on their compatible piece. Other steps and stops repeat per piece; Undo restores the original.</p><label class="field">Active rail corner radius · mm<input id="rail-round-radius" type="number" min="0.1" max="10" step="0.1" value="1"></label><button id="round-manual-rail">Round active rail corners</button><p class="property-note">Converts this rail's corners into an editable rounded contour. Stitch spacing is rebuilt from rail distance. Undo restores the Bézier source.</p></details>`;
  $("artwork-settings").prepend(section);
  $("edit-manual-rails").onclick = () => api.editCurve?.();
  $("reverse-rail-b").onchange = (e) => {
    const value = e.target.checked;
    mutate(() => {
      r.reverseB = value;
      regenerateRails(leaf);
    });
  };
  for (const side of ["a", "b"])
    if ($("rail-seam-" + side))
      $("rail-seam-" + side).onchange = (e) => {
        if (!e.target.checkValidity()) {
          toast("Choose an existing rail node.");
          api.refresh();
          return;
        }
        const v = Number(e.target.value) - 1;
        mutate(() => {
          r[side === "a" ? "seamA" : "seamB"] = v;
          regenerateRails(leaf);
        });
      };
  $("split-manual-column").onclick = () => {
    if (!$("rail-split-position").checkValidity())
      return toast("Choose a split between 2% and 98%.");
    api.splitRails?.(leaf, Number($("rail-split-position").value) / 100);
  };
  $("round-manual-rail").onclick = () => {
    if (!$("rail-round-radius").checkValidity())
      return toast("Choose a radius from 0.1 to 10 mm.");
    const side = state.railSide || "a",
      radius = Number($("rail-round-radius").value),
      curve = r[side],
      ring = curveRings(curve)[0];
    const seamKey = side === "a" ? "seamA" : "seamB",
      oldSeam = mapPoint(curve.nodes[r[seamKey]], curve.frame);
    const applied = mutate(() => {
      r[side] = {
        nodes: roundedRing(ring, radius, curve.closed),
        closed: curve.closed,
        frame: identity(),
      };
      let best = Infinity;
      r[side].nodes.forEach((n, i) => {
        const d = Math.hypot(n.x - oldSeam.x, n.y - oldSeam.y);
        if (d < best) {
          best = d;
          r[seamKey] = i;
        }
      });
      regenerateRails(leaf);
    });
    if (!applied) return;
    toast(
      "Rounded the active rail and rebuilt satin spacing. Review the seam and narrow turns; Undo restores the source.",
    );
  };
  const column =
    targets.length === 1 &&
    targets[0].type === "column" &&
    targets[0].columnMode === "rails"
      ? targets[0]
      : null;
  if (!column) return;
  const controls = document.createElement("div");
  controls.id = "manual-satin-settings";
  controls.innerHTML = `<label class="field">Rail width adjustment · %<input id="rail-width-scale" type="number" min="20" max="300" step="1" value="${(column.railScale ?? 1) * 100}"></label><p class="property-note">Scales each local rail span around its midpoint. 100% follows the source boundaries; pull compensation adds millimeters afterward. Maximum satin span separately limits floats.</p><label class="field">Light underlay construction<select id="rail-underlay"><option value="center">Center walk</option><option value="edge">Inset rail walks</option><option value="both">Center + inset rails</option></select></label><label class="check"><input id="rail-sew-reverse" type="checkbox" ${column.reverse ? "checked" : ""}>Reverse complete sewing direction</label>`;
  $("column-mode").closest("details").append(controls);
  const edit = (key, value) =>
    mutate(() => {
      const ops = materialize(leaf),
        op =
          column.id === "base" ? ops[0] : ops.find((o) => o.id === column.id);
      op[key] = value;
    });
  $("rail-width-scale").onchange = (e) => {
    if (e.target.checkValidity())
      edit("railScale", Number(e.target.value) / 100);
    else toast("Choose width adjustment from 20% to 300%.");
  };
  $("rail-underlay").value = column.railUnderlay || "center";
  $("rail-underlay").onchange = (e) => edit("railUnderlay", e.target.value);
  $("rail-sew-reverse").onchange = (e) => edit("reverse", e.target.checked);
}
