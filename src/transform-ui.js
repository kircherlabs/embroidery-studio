export const TRANSFORM_PREFERENCE = "embroidery-transform-orientation-v1";
export function orientationControl(state, box) {
  return `<label class="field">Transform orientation<select id="transform-orientation"><option value="object" ${state.transformOrientation !== "canvas" ? "selected" : ""}>Object</option><option value="canvas" ${state.transformOrientation === "canvas" ? "selected" : ""}>Canvas</option></select></label><p class="property-note">${box.local ? `Object axes · rotation ${Number(box.angle.toFixed(2))}°` : `Canvas axes${box.mixed ? " · mixed object orientations" : ""}`}</p>${box.local ? `<button ${Math.abs(box.angle) < 1e-8 ? "disabled" : ""} id="reset-object-rotation" data-help="Rotate the selection back to its horizontal local axis around its center. Geometry and stitches update; Undo restores the rotation.">Reset rotation</button>` : ""}`;
}
export function bindOrientation(api) {
  document.getElementById("transform-orientation").onchange = (e) => {
    api.state.transformOrientation = e.target.value;
    try {
      localStorage.setItem(TRANSFORM_PREFERENCE, e.target.value);
    } catch {}
    api.refresh();
    api.draw();
    document
      .getElementById("transform-orientation")
      ?.focus({ preventScroll: true });
  };
}
