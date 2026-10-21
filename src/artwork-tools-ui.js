import { getMachine } from "./equipment.js";
import {
  setArtworkEffects,
  removeArtworkEffects,
  bakeArtworkEffects,
} from "./artwork-effects.js";
import { captureStyle, transferStyle } from "./style-transfer.js";
import { repeatArtwork } from "./repeats.js";
import { unlinkArtwork } from "./linked-artwork.js";
import {
  selectedLeaves,
  selectionIds,
  leaves,
  selectionBounds,
  isVisible,
} from "./hierarchy.js";
import {
  operationsOf,
  isSewing,
  OPERATION_TYPES,
  operationLabel,
} from "./operations.js";
import { validateProject } from "./model.js";

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const $ = (id) => document.getElementById(id);
const number = (id, label, value, min, max, step = 0.1) =>
  `<label class="field">${label}<input id="${id}" type="number" required min="${min}" max="${max}" step="${step}" value="${value}"></label>`;

export function installEffectInspector(api, objects) {
  const linked = objects.filter((o) => o.linkedGeometry);
  if (linked.length) {
    const d = document.createElement("details");
    d.open = true;
    d.dataset.section = "Linked artwork";
    d.innerHTML = `<summary>Linked artwork · ${linked.length}</summary><p class="property-note">Geometry follows the original, including its transformations. This copy’s placement and sewing actions remain independent. Edit the original to reshape all copies, or unlink to retain an independently editable source.</p>${linked.length === 1 ? `<button id="linked-select-source">Select original · ${esc(api.state.project.objects.find((o) => o.id === linked[0].linkedGeometry.sourceId)?.name || "Artwork")}</button>` : ""}<button id="linked-unlink">Unlink selected copies</button>`;
    $("artwork-settings").append(d);
    if ($("linked-select-source"))
      $("linked-select-source").onclick = () =>
        api.select(linked[0].linkedGeometry.sourceId);
    $("linked-unlink").onclick = () =>
      api.mutate(() =>
        linked.forEach((o) => unlinkArtwork(api.state.project, o)),
      );
  }
  const eligible = objects.filter(
    (o) =>
      !["manual", "reference"].includes(o.type) &&
      !o.satinRails &&
      !o.linkedGeometry,
  );
  if (!eligible.length) return;
  const d = document.createElement("details"),
    common = (k) =>
      eligible.every(
        (o) => (o.effects?.[k] || 0) === (eligible[0].effects?.[k] || 0),
      )
        ? eligible[0].effects?.[k] || 0
        : "";
  d.dataset.section = "Artwork effects";
  d.innerHTML = `<summary>Artwork effects${eligible.some((o) => o.effects) ? " · active" : ""}</summary><p class="property-note">Simplify, then expand or contract contours. The original shape, text or curve is retained. Values use source millimeters before later resizing. All sewing actions rebuild from the result.</p>${number("effect-simplify", "Simplify tolerance · mm", common("simplify"), 0, 1, 0.01)}${number("effect-offset", "Expand / contract · mm", common("offset"), -5, 5, 0.1)}<button id="effects-apply" data-help="Rebuild from the retained original, never from the previous result. Positive offsets expand material; negative offsets contract it. Holes are preserved. Incompatible geometry leaves the entire edit unchanged.">Apply / update effects</button><div class="creative-grid"><button id="effects-remove" data-help="Remove effects and restore the original editable shape, lettering or Bézier handles at its current transformation. Sewing actions stay unchanged.">Remove · edit original</button><button id="effects-bake" data-help="Explicitly convert the effect result to ordinary editable paths. Original parameters are discarded; Undo restores them.">Bake to paths</button></div><p class="property-note">Zero restores the original. Collapsing holes or merging islands is rejected. For corner rounding, use Round shape corners before these effects. ${eligible.length !== objects.length ? "Manual stitches, references and paired satin rails are excluded; edit those sources directly." : ""}</p>`;
  $("artwork-settings").append(d);
  $("effects-apply").onclick = () => {
    if (
      !$("effect-offset").checkValidity() ||
      !$("effect-simplify").checkValidity()
    )
      return api.toast(
        "Enter both effect values within their displayed ranges.",
      );
    const config = {
      offset: Number($("effect-offset").value),
      simplify: Number($("effect-simplify").value),
    };
    api.mutate(() => eligible.forEach((o) => setArtworkEffects(o, config)));
  };
  $("effects-remove").disabled = $("effects-bake").disabled = !eligible.some(
    (o) => o.effects,
  );
  $("effects-remove").onclick = () =>
    api.mutate(() => eligible.forEach(removeArtworkEffects));
  $("effects-bake").onclick = () =>
    api.mutate(() => eligible.forEach(bakeArtworkEffects));
}

export async function sewingStyleDialog(api, copied) {
  const targets = selectedLeaves(api.state, { editable: true }),
    sources = api.state.project.objects.filter(
      (o) =>
        !["reference", "manual"].includes(o.type) &&
        operationsOf(o).some(isSewing),
    );
  if (!targets.length || !sources.length)
    return api.toast("Select vector artwork to receive a sewing style.");
  let style = copied;
  const pending = api.ask(
    "Transfer sewing style",
    `<p>Apply a source style to ${targets.length} selected object(s). Geometry, hierarchy and sewing order stay unchanged.</p><label class="field">Source<select id="style-source">${copied ? `<option value="clipboard">Copied · ${esc(copied.name)}</option>` : ""}${sources.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("")}</select></label><label class="field">Source sewing action<select id="style-action"></select></label><label class="field">Transfer<select id="style-mode"><option value="color">Thread color only</option><option value="action">One sewing action’s method &amp; settings</option><option value="stack">Complete sewing-action setup</option></select></label><p id="style-scope" class="property-note"></p><p id="style-preview" class="property-note"></p><label class="check" id="style-replace-label" hidden><input type="checkbox" id="style-replace">Replace every target’s existing sewing actions, including stops</label><p class="property-note">Geometry-specific guides and start points are not copied. Manual satin requires paired rails. Incompatible targets leave the entire transfer unchanged. Undo restores the previous styles.</p>`,
    "Apply style",
  );
  const refresh = () => {
    if ($("style-source").value !== "clipboard")
      style = captureStyle(
        sources.find((o) => o.id === $("style-source").value),
        $("style-action").value,
      );
    const stack = $("style-mode").value === "stack";
    $("style-action").disabled = stack;
    $("style-replace-label").hidden = !stack;
    $("style-replace").required = stack;
    $("style-preview").textContent = stack
      ? style.actions
          .map(
            (op, i) =>
              `${i + 1}. ${operationLabel(op)}${op.color ? " · " + op.color : ""}`,
          )
          .join(" → ")
      : `${operationLabel(style.action)} · ${style.action.color}`;
    $("style-scope").textContent = stack
      ? `Replaces complete setups, including enabled states and stops. This assigns ${targets.length * style.actions.filter((op) => op.type === "stop" && op.enabled !== false).length} machine stops across the selection. External patch links are not copied.`
      : targets.length === 1
        ? "Changes the selected sewing action only. Other actions remain independent."
        : `Changes ${api.state.bulkOperations === "all" ? "all sewing actions" : "the first sewing action"} on each selected object, matching the inspector’s bulk-edit scope.`;
  };
  const sourceChanged = () => {
    const chosen = $("style-source").value;
    if (chosen === "clipboard") style = copied;
    const ops =
      chosen === "clipboard"
        ? [copied.action]
        : operationsOf(sources.find((o) => o.id === chosen)).filter(isSewing);
    $("style-action").innerHTML = ops
      .map(
        (op, i) =>
          `<option value="${esc(op.id || String(i))}">${esc(op.name || OPERATION_TYPES[op.type])}</option>`,
      )
      .join("");
    refresh();
  };
  $("style-source").onchange = sourceChanged;
  $("style-action").onchange = $("style-mode").onchange = refresh;
  sourceChanged();
  if (!(await pending)) return;
  const mode = $("style-mode").value;
  if (mode === "stack" && !$("style-replace").checked) return;
  if (api.mutate(() => transferStyle(targets, style, mode, api.state)))
    api.toast(`Style applied to ${targets.length} object(s).`);
}

export async function repeatDialog(api) {
  const ids = selectionIds(api.state),
    source = leaves(api.state.project, ids);
  if (!source.length) return api.toast("Select artwork to repeat.");
  const b = selectionBounds(source),
    stopCount = source
      .filter((o) => isVisible(api.state.project, o))
      .reduce(
        (n, o) =>
          n +
          operationsOf(o).filter(
            (op) => op.type === "stop" && op.enabled !== false,
          ).length,
        0,
      );
  const pending = api.ask(
    "Repeat artwork",
    `<label class="field">Pattern<select id="repeat-mode"><option value="linear">Linear / duplicate offset</option><option value="radial">Radial around a point</option><option value="mirror-x">Duplicate &amp; flip horizontally</option><option value="mirror-y">Duplicate &amp; flip vertically</option></select></label>${number("repeat-count", "Total instances · includes original", 3, 2, 64, 1)}<div id="repeat-linear" class="two-col">${number("repeat-dx", "Step X · mm", Number((b.width + 3).toFixed(1)), -500, 500)}${number("repeat-dy", "Step Y · mm", 0, -500, 500)}</div><div id="repeat-radial" hidden>${number("repeat-angle", "Angle per instance · degrees", 120, -360, 360)}<div class="two-col">${number("repeat-cx", "Center X · mm", 0, -500, 500)}${number("repeat-cy", "Center Y · mm", 0, -500, 500)}</div><label class="check"><input id="repeat-rotate" type="checkbox" checked>Rotate each copy with the pattern</label></div><label class="check"><input id="repeat-linked" type="checkbox" data-help="Copies follow geometry edits and transforms of the original; placement and sewing actions are independent. Edit or unlink through Artwork. Paired satin rails, references and manual stitches require independent copies.">Link copies to original geometry</label><p id="repeat-summary" class="property-note" aria-live="polite"></p><p class="property-note">Independent copies retain editable sources. Linked copies follow the original; deleting it retains their last contours. Manual sewing order places copy blocks after the source; automatic color/travel optimization remains available. Each copy retains its construction stops. Mirroring reverses editable lettering too. Undo removes the repeat.</p>`,
    "Create copies",
  );
  const config = () => ({
    mode: $("repeat-mode").value,
    count: Number($("repeat-count").value),
    dx: Number($("repeat-dx").value),
    dy: Number($("repeat-dy").value),
    angle: Number($("repeat-angle").value),
    cx: Number($("repeat-cx").value),
    cy: Number($("repeat-cy").value),
    rotate: $("repeat-rotate").checked,
    linked: $("repeat-linked").checked,
  });
  const refresh = () => {
    const c = config(),
      mirror = c.mode.startsWith("mirror");
    $("repeat-count").disabled = mirror;
    $("repeat-radial").hidden = c.mode !== "radial";
    $("repeat-linear").hidden = c.mode === "radial";
    // Expose actual resulting bounds and hoop clearance without generating stitches.
    try {
      const p = structuredClone(api.state.project),
        added = repeatArtwork(p, ids, c);
      validateProject(p);
      const artwork = leaves(p, [...ids, ...added]).filter(
          (o) => o.type !== "reference" && isVisible(p, o),
        ),
        r = artwork.length ? selectionBounds(artwork) : null,
        m = getMachine(p);
      $("repeat-summary").textContent =
        `${(mirror ? 2 : c.count) * source.length} objects total · ${stopCount * (mirror ? 2 : c.count)} construction stops. ${r ? `${r.width.toFixed(1)} × ${r.height.toFixed(1)} mm · ${r.minX >= -m.width / 2 && r.maxX <= m.width / 2 && r.minY >= -m.height / 2 && r.maxY <= m.height / 2 ? "Fits hoop" : "Extends outside hoop; reposition or reduce the pattern before exporting"}.` : "References only · no stitches."}`;
      $("dialog-submit").disabled = false;
    } catch (e) {
      $("repeat-summary").textContent = e.message;
      $("dialog-submit").disabled = true;
    }
  };
  $("dialog-content")
    .querySelectorAll("input,select")
    .forEach((el) => (el.oninput = refresh));
  refresh();
  if (!(await pending)) return;
  const c = config();
  api.mutate(() => {
    api.state.selectionIds = repeatArtwork(api.state.project, ids, c);
    api.state.selection = api.state.selectionIds[0];
  });
}
