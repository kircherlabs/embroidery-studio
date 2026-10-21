import {
  PROJECT,
  children,
  roots,
  leaves,
  selectionBounds,
  transformSelection,
} from "./hierarchy.js";

export function alignmentUnits(p, ids) {
  const selected = roots(p, ids);
  return (selected.includes(PROJECT) ? children(p).map((n) => n.id) : selected)
    .map((id) => leaves(p, [id], { editable: true }))
    .filter((items) => items.length);
}
export function arrangeArtwork(p, ids, action) {
  const units = alignmentUnits(p, ids),
    objects = units.flat();
  if (!objects.length) return false;
  const b = selectionBounds(objects),
    center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  if (["flip-horizontal", "flip-vertical"].includes(action)) {
    transformSelection(objects, {
      sx: action === "flip-horizontal" ? -1 : 1,
      sy: action === "flip-vertical" ? -1 : 1,
      pivot: center,
    });
    return true;
  }
  if (["center", "hoop-x", "hoop-y"].includes(action)) {
    transformSelection(objects, {
      dx: action === "hoop-y" ? 0 : -center.x,
      dy: action === "hoop-x" ? 0 : -center.y,
    });
    return true;
  }
  if (action === "match-width" || action === "match-height") {
    const size = action.endsWith("width") ? "width" : "height",
      first = selectionBounds(units[0]);
    if (units.length < 2 || first[size] < 0.001) return false;
    units.slice(1).forEach((items) => {
      const q = selectionBounds(items);
      if (q[size] < 0.001) return;
      transformSelection(items, {
        sx: size === "width" ? first.width / q.width : 1,
        sy: size === "height" ? first.height / q.height : 1,
        pivot: { x: q.minX, y: q.minY },
      });
    });
    return true;
  }
  return false;
}

// Guides are screen-distance based. Only geometry is translated; no stitch
// spacing, width, density or operation parameters are changed by snapping.
export function snapTranslation(b, dx, dy, targets, tolerance) {
  const guides = [];
  const snap = (axis, delta) => {
    const lo = axis === "x" ? "minX" : "minY",
      hi = axis === "x" ? "maxX" : "maxY",
      values = [b[lo] + delta, (b[lo] + b[hi]) / 2 + delta, b[hi] + delta];
    let best = {
      distance: Math.abs(values[1]),
      offset: -values[1],
      position: 0,
      kind: "Hoop center",
    };
    for (const q of targets)
      for (const target of [q[lo], (q[lo] + q[hi]) / 2, q[hi]])
        for (const value of values) {
          const distance = Math.abs(target - value);
          if (distance < best.distance)
            best = {
              distance,
              offset: target - value,
              position: target,
              kind: "Artwork alignment",
            };
        }
    if (best.distance <= tolerance) {
      guides.push({ axis, position: best.position, kind: best.kind });
      return delta + best.offset;
    }
    return delta;
  };
  return { dx: snap("x", dx), dy: snap("y", dy), guides };
}

export function installArrangeMenu({ state, command, fitDesign, fitHoop }) {
  const menu = document.createElement("div");
  menu.id = "arrange-menu";
  menu.className = "arrange-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Position and align artwork");
  menu.hidden = true;
  document.body.append(menu);
  const add = (key, label, help, disabled = false) =>
    `<button role="menuitem" data-arrange="${key}" data-help="${help}" ${disabled ? "disabled" : ""}>${label}</button>`;
  let returnTo;
  const hide = (restore = false) => {
    menu.hidden = true;
    document
      .getElementById("arrange-selection")
      .setAttribute("aria-expanded", "false");
    if (restore) returnTo?.focus();
  };
  function open(x, y, trigger) {
    const count = alignmentUnits(state.project, state.selectionIds).length,
      any = count > 0;
    returnTo = trigger || document.getElementById("stage");
    menu.innerHTML =
      '<div class="menu-caption">Position in hoop</div>' +
      add(
        "center",
        "Center selection",
        "Move selected unlocked artwork together to the hoop center. Geometry moves; stitch parameters stay unchanged.",
        !any,
      ) +
      add(
        "hoop-x",
        "Center horizontally",
        "Set selection center X to 0 mm; keep its vertical position.",
        !any,
      ) +
      add(
        "hoop-y",
        "Center vertically",
        "Set selection center Y to 0 mm; keep its horizontal position.",
        !any,
      ) +
      add(
        "center-design",
        "Center entire design",
        "Center all visible, unlocked artwork together in the hoop. Locked artwork stays in place.",
        !state.project.objects.length,
      ) +
      (count >= 2
        ? '<div class="menu-caption">Align selected objects / groups</div><div class="alignment-grid">' +
          [
            ["left", "Left"],
            ["center-x", "H centers"],
            ["right", "Right"],
            ["top", "Top"],
            ["center-y", "V centers"],
            ["bottom", "Bottom"],
          ]
            .map(([key, label]) =>
              add(
                "align-" + key,
                label,
                "Align source artwork within the combined selection bounds. Selected groups move as complete units.",
              ),
            )
            .join("") +
          "</div>" +
          add(
            "distribute-x",
            "Distribute horizontal gaps",
            "Keep outer positions and equalize horizontal space between selected units.",
            count < 3,
          ) +
          add(
            "distribute-y",
            "Distribute vertical gaps",
            "Keep outer positions and equalize vertical space between selected units.",
            count < 3,
          ) +
          '<div class="menu-caption">Match first selected item</div><div class="alignment-grid">' +
          add(
            "match-width",
            "Match width",
            "Scale other selected units to the first selected width; keep their heights and stitch parameters unchanged.",
          ) +
          add(
            "match-height",
            "Match height",
            "Scale other selected units to the first selected height; keep their widths and stitch parameters unchanged.",
          ) +
          "</div>"
        : "") +
      '<div class="menu-caption">Mirror selection</div><div class="alignment-grid">' +
      add(
        "flip-horizontal",
        "⇋ Flip Horizontal",
        "Mirror the complete selection left to right around its center. Geometry, Bézier handles and needle coordinates change; stitch width and spacing stay unchanged. Editable lettering asks for confirmation.",
        !any,
      ) +
      add(
        "flip-vertical",
        "⇵ Flip Vertical",
        "Mirror the complete selection top to bottom around its center. Groups keep their relative arrangement and operations. Editable lettering asks for confirmation.",
        !any,
      ) +
      "</div>" +
      '<div class="menu-caption">Repeat & sewing style</div>' +
      add(
        "save-artwork",
        "Save to My Artwork",
        "Save selected editable source objects and groups to your personal library without changing the project.",
        !leaves(state.project, state.selectionIds || []).length,
      ) +
      add(
        "repeat",
        "Repeat artwork…",
        "Create independent editable linear, radial or mirrored copies. Keeps hierarchy and complete sewing actions; Undo removes copies.",
        !any,
      ) +
      add(
        "copy-style",
        "Copy sewing style",
        "Copy the selected artwork’s current sewing action and complete setup without copying its geometry.",
        !any,
      ) +
      add(
        "transfer-style",
        "Transfer sewing style…",
        "Choose a source to sample thread color, one action’s settings or its complete setup. Complete replacement requires confirmation; incompatible targets stay unchanged.",
        !any,
      ) +
      '<div class="menu-caption">View & selection</div><div class="alignment-grid">' +
      add(
        "fit-design",
        "Fit design",
        "Fit all visible artwork in view without changing geometry.",
      ) +
      add("fit-hoop", "Fit hoop", "Fit the selected machine hoop in view.") +
      add("all", "Select all", "Select all source artwork for bulk editing.") +
      (any
        ? add(
            "duplicate",
            "Duplicate",
            "Copy selected artwork and operation stacks; Undo removes the copy.",
          )
        : "") +
      "</div>";
    menu.hidden = false;
    menu.style.left = "8px";
    menu.style.top = "8px";
    document
      .getElementById("arrange-selection")
      .setAttribute("aria-expanded", "true");
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(innerWidth - r.width - 8, x))}px`;
    menu.style.top = `${Math.max(8, Math.min(innerHeight - r.height - 8, y))}px`;
    menu.querySelector("button:not(:disabled)")?.focus();
  }
  menu.onclick = (e) => {
    const action = e.target.closest("[data-arrange]")?.dataset.arrange;
    if (!action) return;
    hide(true);
    if (action === "fit-design") fitDesign();
    else if (action === "fit-hoop") fitHoop();
    else command(action);
  };
  menu.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Tab") {
      hide(true);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hide(true);
      return;
    }
    if (
      ![
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(e.key)
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    const items = [...menu.querySelectorAll("button:not(:disabled)")],
      index = items.indexOf(document.activeElement);
    items[
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : (index +
              (["ArrowDown", "ArrowRight"].includes(e.key) ? 1 : -1) +
              items.length) %
            items.length
    ]?.focus();
  };
  document.addEventListener("pointerdown", (e) => {
    if (
      !menu.hidden &&
      !menu.contains(e.target) &&
      e.target.id !== "arrange-selection"
    )
      hide();
  });
  window.addEventListener("resize", () => hide());
  return { open, hide };
}
