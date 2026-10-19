import { addReference } from "./references.js";
import {
  selectionBounds,
  transformSelection,
  isLocked,
  ancestors,
} from "./hierarchy.js";
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const dataURL = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error("Could not read image."));
    reader.readAsDataURL(blob);
  });
export async function rasterImport(file, api, trace) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime =
    bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
      ? "image/png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
          ? "image/webp"
          : null;
  if (!mime) throw Error("Choose a PNG, JPEG or WebP raster image.");
  const blob = new Blob([file], { type: mime }),
    bitmap = await createImageBitmap(blob);
  if (bitmap.width * bitmap.height > 50000000) {
    bitmap.close();
    throw Error("Image exceeds 50 megapixels.");
  }
  const preview = URL.createObjectURL(blob);
  try {
    const pending = api.ask(
      "Import image",
      `<img src="${preview}" alt="Image to import" style="display:block;max-width:100%;max-height:180px;margin:auto"><p>${esc(file.name)} · ${bitmap.width} × ${bitmap.height} pixels · ${(file.size / 1048576).toFixed(2)} MB</p><label>How would you like to use this image?<select id="image-import-mode"><option value="reference">Use as Reference · draw over the image</option><option value="trace">Automatically Trace · create vector embroidery</option></select></label><p id="image-import-description">A locked background layer for manual digitizing. No automatic tracing, stitches or machine export.</p><details id="reference-storage"><summary>Reference image storage</summary><label>Image data in the saved project<select id="reference-storage-mode"><option value="original">Keep original image bytes · full quality</option><option value="optimized">Optimize to at most 2048 pixels · smaller project</option></select></label><p>Original bytes are embedded once and shared by duplicates. Optimize resizes large images and re-encodes JPEG at 90% quality (PNG/WebP as PNG); the original file is not embedded after optimization. ${file.size > 2000000 ? "This image is large; optimization can substantially reduce project size." : ""}</p></details>`,
      "Continue",
    );
    document.getElementById("image-import-mode").onchange = (e) => {
      document.getElementById("image-import-description").textContent =
        e.target.value === "reference"
          ? "A locked background layer for manual digitizing. No automatic tracing, stitches or machine export."
          : "Open the existing tracing workspace to reduce colors, adjust regions and generate editable vector embroidery.";
      document.getElementById("reference-storage").hidden =
        e.target.value !== "reference";
    };
    const ok = await pending;
    if (!ok) return;
    // ask resolves with its fields still available, as in the existing trace workflow.
    const mode = document.getElementById("image-import-mode").value;
    if (mode === "trace") return trace(file, api.ask);
    const optimize =
      document.getElementById("reference-storage-mode").value === "optimized";
    if (!optimize && Math.max(bitmap.width, bitmap.height) > 12000)
      throw Error(
        "For reference images larger than 12,000 pixels per edge, choose Optimize in Reference image storage or resize the original. Automatic tracing keeps its existing 50-megapixel limit.",
      );
    let data,
      width = bitmap.width,
      height = bitmap.height;
    if (optimize) {
      const scale = Math.min(1, 2048 / Math.max(width, height)),
        canvas = document.createElement("canvas");
      canvas.width = width = Math.max(1, Math.round(width * scale));
      canvas.height = height = Math.max(1, Math.round(height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
      data = canvas.toDataURL(mime === "image/jpeg" ? mime : "image/png", 0.9);
    } else data = await dataURL(blob);
    let ref;
    const added = api.mutate(() => {
      ref = addReference(api.state.project, {
        data,
        width,
        height,
        name: file.name.slice(0, 200),
        optimized: optimize,
        originalWidth: bitmap.width,
        originalHeight: bitmap.height,
        originalBytes: file.size,
      });
      api.state.selectionIds = [ref.id];
      api.state.selection = ref.id;
    });
    if (!added) return null;
    api.selectTool?.();
    api.toast(
      "Reference added behind artwork and locked. Select it in Objects, then Edit reference to position it." +
        (data.length > 3500000
          ? " Use Save project for a backup; large images may exceed browser autosave storage."
          : ""),
    );
    return null;
  } finally {
    bitmap.close();
    URL.revokeObjectURL(preview);
  }
}

export function referenceInspector(api, all, one) {
  const { state, mutate, refresh, toast } = api,
    p = state.project,
    editable = all.filter((o) => !isLocked(p, o)),
    b = selectionBounds(all);
  const field = (label, id, v, min, max) =>
    `<label class="field">${label}<input id="${id}" type="number" min="${min}" max="${max}" step="0.1" value="${Number(v.toFixed(3))}" ${!editable.length ? "disabled" : ""}></label>`;
  document.getElementById("inspector-title").textContent = "Reference image";
  document.getElementById("properties").innerHTML =
    `<section class="inspector-section"><h3>Reference image · no stitches</h3><p class="property-note">Always behind embroidery artwork. References never sew, export, or affect hoop-fit checks. Select this layer in Objects to edit it; normal canvas clicks target artwork.</p>${one ? `<label class="field">Image name<input id="reference-name" maxlength="200" value="${esc(one.name)}"></label>` : ""}<button id="edit-reference">${editable.length === all.length ? "Finish editing & lock reference" : "Edit reference · unlock"}</button><label class="field">Opacity · %<input id="reference-opacity" type="range" min="0" max="100" value="${Math.round(all[0].reference.opacity * 100)}" ${!editable.length ? "disabled" : ""}></label><output id="reference-opacity-value">${all.every((o) => o.reference.opacity === all[0].reference.opacity) ? Math.round(all[0].reference.opacity * 100) + "%" : "Mixed"}</output><div class="two-col">${field("Center X · mm", "pos-x", (b.minX + b.maxX) / 2, -1000, 1000)}${field("Center Y · mm", "pos-y", (b.minY + b.maxY) / 2, -1000, 1000)}${field("Width · mm", "size-w", b.width, 0.1, 500)}${field("Height · mm", "size-h", b.height, 0.1, 500)}</div><label class="check"><input id="proportional" type="checkbox" ${state.proportional !== false ? "checked" : ""}>Keep proportions · Shift toggles while dragging</label>${field("Rotate selection by · °", "rotate", 0, -360, 360)}${one ? `<p class="property-note">${p.referenceAssets[one.reference.assetId].width} × ${p.referenceAssets[one.reference.assetId].height} stored pixels. ${p.referenceAssets[one.reference.assetId].optimized ? "Optimized copy embedded; original file is not stored." : "Original image bytes embedded without re-encoding."} Shared image assets are saved inside .embstudio projects.</p>` : ""}<p class="property-note">Use the tree eye and lock controls to show, hide or lock layers. Duplicate, Delete and Rename use the normal object commands. The Node tool edits embroidery paths, not image pixels.</p></section>`;
  const $ = (id) => document.getElementById(id);
  if (one)
    $("reference-name").onchange = (e) =>
      mutate(() => (one.name = e.target.value.trim() || one.name));
  const parentLocked = all.some((o) => ancestors(p, o).some((g) => g.locked));
  $("edit-reference").disabled = parentLocked;
  if (parentLocked)
    $("edit-reference").insertAdjacentHTML(
      "afterend",
      '<p class="property-note">Unlock the parent group in Objects before editing this reference.</p>',
    );
  $("edit-reference").onclick = () => {
    mutate(() => {
      for (const o of all) o.locked = editable.length === all.length;
    });
    api.selectTool?.();
    api.draw();
  };
  $("reference-opacity").onchange = (e) => {
    mutate(() =>
      editable.forEach(
        (o) => (o.reference.opacity = Number(e.target.value) / 100),
      ),
    );
    $("reference-opacity").focus({ preventScroll: true });
  };
  $("reference-opacity").oninput = (e) => {
    $("reference-opacity-value").textContent = e.target.value + "%";
  };
  $("proportional").onchange = (e) => (state.proportional = e.target.checked);
  for (const id of ["pos-x", "pos-y", "size-w", "size-h", "rotate"])
    $(id).onchange = (e) => {
      if (!e.target.checkValidity() || e.target.value === "") {
        toast("Enter a value within the displayed range.");
        refresh();
        return;
      }
      const v = Number(e.target.value),
        box = selectionBounds(editable),
        opts =
          id === "pos-x"
            ? { dx: v - (box.minX + box.maxX) / 2 }
            : id === "pos-y"
              ? { dy: v - (box.minY + box.maxY) / 2 }
              : id === "rotate"
                ? { angle: v }
                : id === "size-w"
                  ? {
                      sx: v / (box.width || 1),
                      sy:
                        state.proportional !== false ? v / (box.width || 1) : 1,
                    }
                  : {
                      sy: v / (box.height || 1),
                      sx:
                        state.proportional !== false
                          ? v / (box.height || 1)
                          : 1,
                    };
      mutate(() => transformSelection(editable, opts));
    };
  return true;
}
