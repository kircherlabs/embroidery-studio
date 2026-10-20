import { getMachine } from "./equipment.js";
import { operationObject, supportsMethod } from "./operations.js";
import {
  preflightConstruction,
  patchBoundary,
  createSurroundingPatch,
  constructionOperations,
} from "./construction.js";
import { selectedLeaves, selectionIds, selectionBounds } from "./hierarchy.js";
import { inside } from "./geometry.js";
import { setEmbroideryStyle, EMBROIDERY_STYLES } from "./styles.js";
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const $ = (id) => document.getElementById(id);
const issueList = (issues) =>
  issues
    .map(
      (i) =>
        `<li><strong>${esc(i.severity)}${i.objectName ? " · " + esc(i.objectName) : ""}</strong>: ${esc(i.message)} ${esc(i.action)}</li>`,
    )
    .join("");
export async function chooseConstruction(api) {
  const { state, ask, mutate, toast } = api,
    project = state.project,
    objects = selectedLeaves(state, { editable: true }).filter(
      (o) => o.type !== "reference",
    ),
    check = preflightConstruction(objects, getMachine(project));
  if (!objects.length) return toast("Select editable artwork first.");
  const ok = await ask(
    "Construction presets",
    `<p>Decorative artwork and fabric pieces are different. A surrounding patch keeps your illustration's stitches intact and adds one editable fabric boundary.</p>
    <label>Build from<select id="construction-mode"><option value="surround" ${check.complex || !check.valid ? "selected" : ""}>Surround artwork with a patch / badge</option><option value="direct" ${!check.complex && check.valid ? "selected" : ""} ${!check.valid ? "disabled" : ""}>${objects.length > 1 ? "Each selected fabric piece · advanced" : "This closed fabric-piece boundary"}</option></select></label>
    <p>Direct construction replaces the selected regions' operation stacks with placement → position fabric → tackdown → trim fabric → finishing border. ${objects.length * 2} machine stops if all pieces are used. Undo restores the previous steps.</p>
    ${check.issues.length ? `<details open><summary>Geometry preflight</summary><ul class="preflight-issues">${issueList(check.issues)}</ul></details>` : "<p>Closed boundary and 0.4 mm tackdown inset are suitable for direct construction.</p>"}`,
    "Configure construction",
  );
  if (!ok) return;
  if ($("construction-mode").value === "surround")
    return surroundingPatchDialog(api);
  if (!check.valid)
    return toast(
      "Direct construction is unavailable: repair the boundary or use a surrounding patch.",
    );
  if (
    !mutate(() => {
      for (const o of objects) o.operations = constructionOperations(o);
      state.activeOperationId = null;
    })
  )
    return;
  toast(
    `Applied construction to ${objects.length} fabric piece${objects.length === 1 ? "" : "s"}; ${objects.length * 2} operator stops.`,
  );
}
export async function surroundingPatchDialog(api) {
  const { state, ask, mutate, toast } = api,
    objects = selectedLeaves(state).filter((o) => o.type !== "reference"),
    ids = [...selectionIds(state)],
    p = state.project;
  const b = selectionBounds(objects);
  const pending = ask(
    "Surrounding patch / badge",
    `<p>Creates one editable boundary. Preparation → decorative artwork → finishing border. The illustration's existing geometry and operations are retained.</p>
    <div class="patch-layout"><div><label>Boundary<select id="patch-kind"><option value="rounded">Rounded rectangle</option><option value="rectangle">Rectangle</option><option value="circle">Circle</option><option value="oval">Oval</option></select></label>
    <label>Margin · mm<input id="patch-margin" type="number" min="0" max="50" step=".1" value="3" required></label>
    <label class="check"><input id="patch-auto" type="checkbox" checked>Size automatically around artwork</label>
    <div class="two-col"><label>Width / diameter · mm<input id="patch-width" type="number" min="2" max="500" step=".1" value="${b.width + 6}" required></label><label>Height · mm<input id="patch-height" type="number" min="2" max="500" step=".1" value="${b.height + 6}" required></label></div>
    <label>Corner radius · mm<input id="patch-radius" type="number" min="0" max="50" step=".1" value="4" required></label>
    <label>Finishing border width · mm<input id="patch-border" type="number" min=".5" max="5" step=".1" value="2.5" required></label>
    <label>Boundary thread<input id="patch-color" type="color" value="${objects[0]?.color || "#292c31"}"></label>
    <label class="check"><input id="patch-placement" type="checkbox" checked>Placement outline</label>
    <label class="check"><input id="patch-position-stop" type="checkbox" checked>Stop to position fabric</label>
    <label class="check"><input id="patch-tackdown" type="checkbox" checked>Tackdown outline · 0.4 mm inset</label>
    <label class="check"><input id="patch-trim-stop" type="checkbox" checked>Stop to trim fabric</label></div>
    <div><svg id="patch-preview" role="img" aria-label="Patch boundary and decorative artwork preview"></svg><p id="patch-status" role="status"></p><ul id="patch-issues" class="preflight-issues"></ul><p class="property-note">The finishing band sits inside the boundary. Fabric cutting, positioning and trimming are manual. After creation, edit Smart shape and individual construction steps.</p></div></div>`,
    "Create patch",
  );
  let boundary, options;
  const update = () => {
    try {
      const auto = $("patch-auto").checked,
        kind = $("patch-kind").value;
      options = {
        kind,
        margin: Number($("patch-margin").value),
        radius: Number($("patch-radius").value),
        border: Number($("patch-border").value),
        color: $("patch-color").value,
        placement: $("patch-placement").checked,
        positionStop: $("patch-position-stop").checked,
        tackdown: $("patch-tackdown").checked,
        trimStop: $("patch-trim-stop").checked,
        ...(!auto
          ? {
              width: Number($("patch-width").value),
              height: Number($("patch-height").value),
            }
          : {}),
      };
      boundary = patchBoundary(objects, options);
      if (auto) {
        $("patch-width").value = boundary.shape.width.toFixed(2);
        $("patch-height").value = boundary.shape.height.toFixed(2);
      }
      $("patch-width").disabled = auto;
      $("patch-height").disabled = auto || kind === "circle";
      $("patch-margin").disabled = !auto;
      $("patch-radius").disabled = kind !== "rounded";
      const issues = preflightConstruction(
        [boundary],
        getMachine(p),
        options.border,
        options,
      ).issues;
      if (
        objects.some((o) =>
          (o.rings?.flat() || o.commands || []).some(
            (point) => !inside(point, boundary.rings, "evenodd"),
          ),
        )
      )
        issues.push({
          severity: "warning",
          message: "Some artwork lies outside the patch boundary.",
          action:
            "Increase dimensions or margin. No artwork will be clipped or removed.",
        });
      const vb = selectionBounds([...objects, boundary]),
        pad = 5;
      $("patch-preview").setAttribute(
        "viewBox",
        `${vb.minX - pad} ${vb.minY - pad} ${vb.width + pad * 2} ${vb.height + pad * 2}`,
      );
      const d = (o) =>
        o.rings
          .map((r) => "M" + r.map((q) => `${q.x},${q.y}`).join("L") + "Z")
          .join(" ");
      $("patch-preview").innerHTML =
        `<path d="${d(boundary)}" fill="#eee2c9" stroke="${boundary.color}" stroke-width=".15" fill-rule="evenodd"/>` +
        objects
          .filter((o) => o.rings)
          .map(
            (o) =>
              `<path d="${d(o)}" fill="${o.type === "fill" ? o.color : "none"}" stroke="${o.color}" stroke-width=".2" fill-rule="${o.fillRule || "evenodd"}" opacity=".8"/>`,
          )
          .join("") +
        `<path d="${d(operationObject(boundary, boundary.operations.at(-1)))}" fill="none" stroke="${boundary.color}" stroke-width="${options.border}"/>`;
      $("patch-status").textContent =
        `${boundary.shape.width.toFixed(1)} × ${boundary.shape.height.toFixed(1)} mm · ${Number(options.positionStop) + Number(options.trimStop)} operator stops${issues.some((i) => i.code === "hoop") ? " · Exceeds hoop" : " · Fits selected hoop"}`;
      $("patch-issues").innerHTML = issueList(issues);
      $("dialog-submit").disabled = issues.some((i) => i.severity === "error");
    } catch (e) {
      boundary = null;
      $("patch-status").textContent = e.message;
      $("dialog-submit").disabled = true;
    }
  };
  $("dialog-content")
    .querySelectorAll("input,select")
    .forEach((el) => el.addEventListener("input", update));
  update();
  const ok = await pending;
  $("dialog-submit").disabled = false;
  if (!ok || !boundary) return;
  try {
    const changed = mutate(() => {
      const result = createSurroundingPatch(p, ids, options);
      state.selectionIds = [result.boundary.id];
      state.selection = result.boundary.id;
      state.activeOperationId = null;
    });
    if (changed)
      toast("Patch created: prepare fabric → artwork → finishing border.");
  } catch (e) {
    toast(e.message);
  }
}
export async function applyStyle(api, objects, style) {
  const replacing = objects.some((o) => o.operations?.length > 1);
  if (objects.some((o) => o.constructionArtworkIds?.length))
    return api.toast(
      "This boundary surrounds decorative artwork. Edit its construction steps individually to retain preparation and finishing dependencies.",
    );
  if (
    replacing &&
    !(await api.ask(
      "Replace sewing actions?",
      "<p>This preset replaces each selected object's sewing actions, including their independent colors and any construction stops. Artwork stays editable. Undo restores all previous actions.</p>",
      "Replace actions",
    ))
  )
    return;
  try {
    return api.mutate(() => {
      objects.forEach((o) => setEmbroideryStyle(o, style));
      api.state.activeOperationId = null;
    });
  } catch (e) {
    api.toast(e.message);
  }
}
export async function chooseSewingPreset(api, objects) {
  const ok = await api.ask(
    "Sewing presets",
    `<p>Configure ordinary stitching on ${objects.length} selected artwork object${objects.length === 1 ? "" : "s"}. Existing sewing actions will be replaced; Undo restores them.</p><label>Preset<select id="sewing-preset">${Object.entries(
      EMBROIDERY_STYLES,
    )
      .map(
        ([key, label]) =>
          `<option value="${key}" ${objects.every((o) => supportsMethod(o, ["combined", "fill-border"].includes(key) ? "fill" : key)) ? "" : "disabled"}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><p>For fabric placement, tackdown and operator stops, use Construction presets instead.</p>`,
    "Use preset",
  );
  if (ok) return applyStyle(api, objects, $("sewing-preset").value);
}
