import { selectedLeaves, isLocked } from "./hierarchy.js";
import { supportsMethod } from "./operations.js";
import { applyStyle } from "./construction-ui.js";

// The chooser sets a drawing default; changing existing artwork is explicit.
export function drawingStyleSelection(state, style) {
  const objects = [],
    reasons = new Map();
  for (const o of selectedLeaves(state)) {
    const reason = isLocked(state.project, o)
      ? "locked"
      : o.type === "reference"
        ? "reference images"
        : o.type === "manual"
          ? "manual stitch objects"
          : o.constructionArtworkIds?.length
            ? "linked patch boundaries"
            : !supportsMethod(o, style === "combined" ? "fill" : style)
              ? "open paths needing a closed region"
              : null;
    if (reason) reasons.set(reason, (reasons.get(reason) || 0) + 1);
    else objects.push(o);
  }
  return {
    objects,
    excluded: [...reasons].map(([reason, n]) => `${n} ${reason}`).join(", "),
  };
}

export function installDrawingStyle(api) {
  const root = document.querySelector(".drawing-style"),
    summary = root.querySelector("summary"),
    panel = root.querySelector(".drawing-style-panel"),
    select = document.getElementById("draw-style"),
    apply = document.getElementById("apply-draw-style"),
    status = document.getElementById("draw-style-selection");
  const key = "embroidery-studio-drawing-style";
  try {
    const saved = localStorage.getItem(key);
    if ([...select.options].some((o) => o.value === saved))
      select.value = saved;
  } catch {
    /* Browser storage is optional. */
  }
  const method = () => (select.value === "auto" ? "fill" : select.value);
  function position() {
    if (!root.open) return;
    const anchor = summary.getBoundingClientRect();
    const above = anchor.top - 16,
      below = innerHeight - anchor.bottom - 16;
    panel.style.maxHeight = `${Math.max(96, Math.max(above, below))}px`;
    const r = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - r.width - 8))}px`;
    panel.style.top = `${Math.max(
      8,
      Math.min(
        innerHeight - r.height - 8,
        above >= below ? anchor.top - r.height - 8 : anchor.bottom + 8,
      ),
    )}px`;
  }
  function refresh() {
    const { objects, excluded } = drawingStyleSelection(api.state, method());
    apply.disabled = !objects.length;
    apply.textContent = objects.length
      ? `Apply to ${objects.length} selected object${objects.length === 1 ? "" : "s"}`
      : "Apply to selected artwork";
    status.textContent = objects.length
      ? "Replaces their stitching style; artwork geometry stays editable."
      : "Select editable vector artwork in Objects or on the canvas to change existing stitches.";
    if (excluded) status.textContent += ` Excluded: ${excluded}.`;
    position();
  }
  function close(focus = false) {
    root.open = false;
    if (focus) summary.focus({ preventScroll: true });
  }
  select.onchange = () => {
    try {
      localStorage.setItem(key, select.value);
    } catch {
      /* Optional preference. */
    }
    refresh();
  };
  apply.onclick = async () => {
    const { objects, excluded } = drawingStyleSelection(api.state, method()),
      style = method();
    if (!objects.length) return;
    close(true);
    if (await applyStyle(api, objects, style))
      api.toast(
        `Updated ${objects.length} object${objects.length === 1 ? "" : "s"}.${excluded ? ` Excluded: ${excluded}.` : ""}`,
      );
  };
  root.addEventListener("toggle", refresh);
  document.addEventListener("pointerdown", (e) => {
    if (root.open && !root.contains(e.target)) close();
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (root.open && e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close(true);
      }
    },
    true,
  );
  root.addEventListener("focusout", () => {
    setTimeout(() => {
      if (root.open && !root.contains(document.activeElement)) close();
    }, 0);
  });
  window.addEventListener("resize", position);
  new ResizeObserver(position).observe(root.closest(".canvas-controls"));
  refresh();
  return { refresh };
}
