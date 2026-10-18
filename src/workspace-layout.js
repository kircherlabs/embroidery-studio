const KEY = "embroidery-workspace-v1";
export const defaultLayout = () => ({
  left: 300,
  right: 280,
  bottom: 240,
  open: { left: true, right: true, bottom: true },
  compactOpen: { left: false, right: false, bottom: false },
});
export function readLayout(value) {
  const result = defaultLayout();
  if (!value || typeof value !== "object") return result;
  for (const key of ["left", "right", "bottom"]) {
    if (Number.isFinite(value[key]))
      result[key] = Math.max(
        key === "bottom" ? 120 : 240,
        Math.min(600, value[key]),
      );
    for (const mode of ["open", "compactOpen"])
      if (typeof value[mode]?.[key] === "boolean")
        result[mode][key] = value[mode][key];
  }
  return result;
}
export function panelLimits(side, width, height, other = 0, compact = false) {
  const max =
    side === "bottom"
      ? Math.max(120, height - 250)
      : Math.max(
          200,
          Math.min(600, compact ? width - 32 : width - other - 320),
        );
  return { min: Math.min(side === "bottom" ? 150 : 240, max), max };
}
export function installWorkspace({ fit }) {
  const $ = (id) => document.getElementById(id),
    root = document.querySelector(".workspace"),
    shell = document.querySelector(".stage-shell"),
    panels = {
      left: $("layers-panel"),
      right: $("inspector-panel"),
      bottom: $("simulator"),
    },
    toggles = {
      left: $("toggle-layers"),
      right: $("toggle-inspector"),
      bottom: $("toggle-sequence"),
    },
    compactMedia = matchMedia("(max-width: 1099px)");
  let state = defaultLayout(),
    maximized = false,
    drag = null;
  try {
    state = readLayout(JSON.parse(localStorage.getItem(KEY)));
  } catch {}
  const mode = () => (compactMedia.matches ? state.compactOpen : state.open);
  const visible = (key) => !maximized && mode()[key];
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  };
  const bounds = (key) =>
    panelLimits(
      key,
      root.clientWidth,
      shell.clientHeight,
      visible(key === "left" ? "right" : "left")
        ? state[key === "left" ? "right" : "left"]
        : 0,
      compactMedia.matches,
    );
  const size = (key) => {
    const b = bounds(key);
    return Math.max(b.min, Math.min(b.max, state[key]));
  };
  const grips = {};
  for (const key of Object.keys(panels)) {
    const el = document.createElement("div");
    el.id = `resize-${key}`;
    el.className = `panel-resizer resize-${key}`;
    el.tabIndex = 0;
    el.setAttribute("role", "separator");
    el.setAttribute(
      "aria-orientation",
      key === "bottom" ? "horizontal" : "vertical",
    );
    el.setAttribute(
      "aria-label",
      `Resize ${key === "left" ? "artwork" : key === "right" ? "properties" : "stitch sequence"} panel`,
    );
    el.setAttribute("aria-controls", panels[key].id);
    el.dataset.help =
      "Drag to resize this panel. Arrow keys adjust by 10 pixels (Shift: 40); Home/End set limits. Double-click restores its default size. Escape cancels a resize.";
    (key === "bottom" ? panels.bottom : root).append(el);
    grips[key] = el;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.focus();
      el.setPointerCapture(e.pointerId);
      drag = {
        key,
        pointer: e.pointerId,
        start: key === "bottom" ? e.clientY : e.clientX,
        size: size(key),
        original: state[key],
      };
      document.body.classList.add("resizing-panels");
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag || drag.pointer !== e.pointerId) return;
      const delta = (key === "bottom" ? e.clientY : e.clientX) - drag.start,
        b = bounds(key);
      state[key] = Math.max(
        b.min,
        Math.min(b.max, drag.size + delta * (key === "left" ? 1 : -1)),
      );
      apply();
    });
    const finish = (cancel = false) => {
      if (!drag) return;
      if (cancel) state[key] = drag.original;
      drag = null;
      document.body.classList.remove("resizing-panels");
      apply();
      save();
    };
    el.addEventListener("pointerup", () => finish());
    el.addEventListener("pointercancel", () => finish(true));
    el.addEventListener("lostpointercapture", () => finish(true));
    el.addEventListener("dblclick", () => {
      state[key] = defaultLayout()[key];
      apply();
      save();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drag) {
        e.preventDefault();
        e.stopPropagation();
        finish(true);
        return;
      }
      const keys =
          key === "bottom"
            ? ["ArrowDown", "ArrowUp"]
            : key === "right"
              ? ["ArrowRight", "ArrowLeft"]
              : ["ArrowLeft", "ArrowRight"],
        direction = keys.indexOf(e.key),
        b = bounds(key);
      if (direction < 0 && !["Home", "End"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      state[key] =
        e.key === "Home"
          ? b.min
          : e.key === "End"
            ? b.max
            : Math.max(
                b.min,
                Math.min(
                  b.max,
                  size(key) + (direction ? 1 : -1) * (e.shiftKey ? 40 : 10),
                ),
              );
      apply();
      save();
    });
    toggles[key].onclick = () => set(key, maximized || !visible(key));
    document
      .querySelectorAll(`[data-close-panel="${key}"]`)
      .forEach((button) => (button.onclick = () => set(key, false)));
  }
  const backdrop = document.createElement("div");
  backdrop.className = "panel-backdrop";
  root.append(backdrop);
  backdrop.onclick = () => {
    state.compactOpen.left = state.compactOpen.right = false;
    apply();
    save();
  };
  function set(key, open) {
    maximized = false;
    if (compactMedia.matches && open && key !== "bottom")
      mode()[key === "left" ? "right" : "left"] = false;
    mode()[key] = open;
    apply();
    save();
  }
  function apply() {
    root.classList.toggle("compact-workspace", compactMedia.matches);
    root.classList.toggle("is-maximized", maximized);
    for (const key of Object.keys(panels)) {
      const open = visible(key),
        b = bounds(key),
        n = size(key);
      panels[key].hidden = !open;
      panels[key].classList.toggle("open", open);
      if (key === "bottom")
        panels[key].classList.toggle("compact-sequence", n < 150);
      toggles[key].setAttribute("aria-expanded", String(open));
      toggles[key].setAttribute("aria-controls", panels[key].id);
      root.style.setProperty(`--${key}-size`, `${n}px`);
      root.style.setProperty(
        `--${key}-track`,
        `${open && (!compactMedia.matches || key === "bottom") ? n : 0}px`,
      );
      grips[key].hidden = !open;
      grips[key].setAttribute("aria-valuemin", String(b.min));
      grips[key].setAttribute("aria-valuemax", String(b.max));
      grips[key].setAttribute("aria-valuenow", String(Math.round(n)));
    }
    backdrop.hidden = !(
      compactMedia.matches &&
      (visible("left") || visible("right"))
    );
    $("maximize-canvas").setAttribute("aria-pressed", String(maximized));
    $("maximize-canvas").textContent = maximized ? "↙ Restore" : "⛶ Canvas";
  }
  $("maximize-canvas").onclick = () => {
    maximized = !maximized;
    apply();
  };
  $("reset-layout").onclick = () => {
    state = defaultLayout();
    maximized = false;
    apply();
    save();
    requestAnimationFrame(fit);
  };
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        e.key === "Escape" &&
        maximized &&
        !document.querySelector("dialog[open]") &&
        document.getElementById("control-description")?.hidden
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        maximized = false;
        apply();
      }
    },
    true,
  );
  new ResizeObserver(apply).observe(root);
  compactMedia.addEventListener("change", apply);
  apply();
  return {
    show: (key) => set(key, true),
    close: (key) => set(key, false),
    getState: () =>
      structuredClone({ ...state, maximized, compact: compactMedia.matches }),
  };
}
