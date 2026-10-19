import { updateLettering } from "./importers.js";
import {
  baselineCandidate,
  constructionBaseline,
  inverseFrame,
  regeneratePathText,
} from "./text-path.js";
import { compose } from "./smart-geometry.js";
import { worldCurve } from "./path-editing.js";
import { objectBounds, translate } from "./model.js";
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function installPathTextInspector(api, leaf) {
  if (!leaf?.textSource) return;
  const { mutate, state } = api,
    $ = (id) => document.getElementById(id),
    source = leaf.textSource,
    candidates = state.project.objects.filter(baselineCandidate),
    section = document.createElement("details");
  section.dataset.section = "text-path";
  section.open = !!source.path;
  section.innerHTML = `<summary>Text along a path</summary><p class="property-note">Letters follow the curve without stretching their outlines. The copied baseline belongs to this lettering; it creates no separate stitches. Use Node to reshape it. Use a separate lettering object for each text line.</p>${source.path ? "<details><summary>Replace baseline from artwork…</summary>" : ""}<label class="field">Copy baseline from<select id="text-path-source"><option value="">${candidates.length ? "Choose artwork…" : "Draw a curve or shape first"}</option>${candidates.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("")}</select></label><label class="check"><input type="checkbox" id="text-path-hide-source" checked>Hide original baseline artwork</label><button id="text-path-attach" disabled>Attach to copied baseline</button>${source.path ? "</details>" : ""}${source.path ? `<div class="two-col"><label class="field">Along path · mm<input type="number" id="text-path-offset" min="-2000" max="2000" step="0.1" value="${source.path.offset}"></label><label class="field">Across path · mm<input type="number" id="text-path-normal" min="-200" max="200" step="0.1" value="${source.path.normal}"></label></div><label class="check"><input type="checkbox" id="text-path-reverse" ${source.path.reverse ? "checked" : ""}>Reverse baseline direction</label><div class="two-col"><button id="text-path-edit">Edit lettering baseline</button><button id="text-path-detach">Make straight lettering</button></div><p class="property-note">One line per baseline. Alignment positions the run; Along path shifts it afterward. Tight bends can overlap letters: reduce height, adjust spacing or reshape the baseline. Source units follow the object's scale.</p>` : ""}`;
  $("live-text").closest("details").append(section);
  $("text-path-attach").onclick = () => {
    const target = state.project.objects.find(
      (o) => o.id === $("text-path-source").value,
    );
    if (!baselineCandidate(target))
      return api.toast(
        "Choose one single-contour path or shape for the baseline.",
      );
    const hide =
      $("text-path-hide-source").checked && !constructionBaseline(target);
    mutate(() => {
      const curve = worldCurve(target);
      curve.frame = compose(inverseFrame(source.frame), curve.frame);
      const path = { curve, offset: 0, normal: 0, reverse: false };
      if (source.path && source.glyphs) {
        source.path = path;
        regeneratePathText(leaf);
      } else updateLettering(leaf, { path });
      if (hide) target.visible = false;
    });
  };
  $("text-path-source").onchange = (e) => {
    const target = state.project.objects.find((o) => o.id === e.target.value),
      protectedSource = constructionBaseline(target);
    $("text-path-attach").disabled = !baselineCandidate(target);
    $("text-path-hide-source").disabled = protectedSource;
    $("text-path-hide-source").checked = !protectedSource;
    if (protectedSource)
      api.toast(
        "This baseline is a fabric-construction boundary. Its original sewing actions stay visible; the lettering owns only a curve copy.",
      );
  };
  if (!source.path) return;
  $("live-leading").disabled = true;
  $("live-leading").dataset.help =
    "Path lettering uses one line. Use another lettering object for a second baseline; line spacing applies to straight multiline lettering.";
  for (const key of ["offset", "normal", "reverse"]) {
    $("text-path-" + key).onchange = (e) => {
      if (!e.target.checkValidity())
        return api.toast("Choose a value within the displayed range.");
      const value =
        key === "reverse" ? e.target.checked : Number(e.target.value);
      mutate(() => {
        source.path[key] = value;
        regeneratePathText(leaf);
      });
    };
  }
  $("text-path-edit").onclick = () => api.editCurve?.();
  $("text-path-detach").onclick = () =>
    mutate(() => {
      const before = objectBounds(leaf);
      updateLettering(leaf, { path: null });
      const after = objectBounds(leaf);
      translate(
        leaf,
        (before.minX + before.maxX - after.minX - after.maxX) / 2,
        (before.minY + before.maxY - after.minY - after.maxY) / 2,
      );
    });
}
