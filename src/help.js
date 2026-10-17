const descriptions = {
  "context-help":
    "Explain controls: turn this on, then tap any control to read its description without changing the design. Tap Explain again or press Escape to resume editing.",
  help: "Open the workflow guide and keyboard shortcuts.",
  "new-project":
    "Start an empty design. You can save your current editable project before replacing it.",
  "open-file":
    "Add SVG or image artwork, import machine stitches, or reopen an editable .embstudio project.",
  "file-input":
    "Import artwork, machine stitches or an editable studio project. Multiple SVGs remain separate parent objects.",
  "save-project":
    "Download an editable project with artwork, hierarchy, operations and manual sewing order. This is separate from a machine file.",
  export:
    "Generate a machine file for the selected hoop. The preview then shows commands decoded from that exported file.",
  "project-name":
    "Name this project. The name is also used for downloaded files.",
  "design-tab":
    "Edit source artwork and embroidery operations. Changes regenerate the machine sequence.",
  "preview-tab":
    "Inspect the actual needle sequence, including travel, trims, stops and thread changes.",
  undo: "Undo the last artwork, operation, setting or sequence edit (Ctrl Z).",
  redo: "Restore an undone edit (Ctrl Shift Z).",
  "toggle-layers":
    "Open or close the artwork hierarchy. Select SVG parents, groups or individual regions.",
  "toggle-inspector":
    "Open or close properties and embroidery operations for the current selection.",
  "select-all":
    "Select the entire project, including all SVGs and their regions (Ctrl A). Locked artwork remains protected from edits.",
  "group-selection":
    "Organize selected artwork under a new group without merging its editable regions (Ctrl G).",
  "ungroup-selection":
    "Remove selected group containers and keep their child artwork (Ctrl Shift G).",
  "edit-command":
    "Selection, alignment and construction tools act on the selected artwork or its descendants. Focus changes only the view.",
  "exit-isolation":
    "Show all artwork again. Focus mode does not remove anything from the exported design.",
  "optimize-colors":
    "In automatic mode, batch compatible colors and reduce travel while preserving overlaps, sequence pins and complete operation stacks. Manual mode always respects your chosen order.",
  "order-mode":
    "Automatic uses safe color and travel optimization. Manual preserves the complete object order shown below; operation steps stay together. Changing sewing order can change which overlapping thread is sewn on top.",
  "skip-outlines":
    "Omit a thin SVG stroke that exactly duplicates its same-color fill boundary. Source artwork remains editable; substantial or different-color outlines still sew.",
  "small-detail":
    "Skip isolated contours smaller than this diagonal in millimeters during digitizing. Set 0 to retain every detail. Source artwork is kept.",
  "move-up":
    "Move selected siblings earlier in artwork layer order and use the tree as manual sewing order. Undo restores the previous order.",
  "move-down":
    "Move selected siblings later in artwork layer order and use the tree as manual sewing order. Undo restores the previous order.",
  duplicate:
    "Duplicate selected artwork, groups and operation settings (Ctrl D). Copies remain individually editable.",
  delete:
    "Delete selected unlocked artwork and its descendants. Undo restores it.",
  machine:
    "Choose the machine and supported hoop. This sets the usable embroidery field and fit diagnostics; it does not resize artwork.",
  "machine-panel":
    "Expand Machine & hoop to choose your machine. Hoop size and design-fit status stay visible when collapsed.",
  "show-stitches":
    "Show sewing needle movements in the canvas. This display toggle does not change the machine file.",
  "show-jumps":
    "Show dashed travel moves with the needle raised. Jumps are real commands and remain in the file when hidden here.",
  "show-underlay":
    "Show foundation stitches beneath the top stitching. This changes the display; enable or disable generated underlay in object properties.",
  "show-events":
    "Show markers for actual trims, stops and thread changes. These events remain in the export even when markers are hidden.",
  "snap-grid":
    "Snap artwork dragging and drawing to the millimeter grid. This edits geometry, not stitch density.",
  "preview-selection":
    "Focus stitches: show only stitches for selected source objects or the active operation. Export still contains the complete design. Unavailable in decoded machine previews without source identifiers.",
  "zoom-fit":
    "Fit the selected hoop in the workspace. Zoom affects the view only; F fits selected artwork.",
  "zoom-in": "Magnify the workspace without changing physical dimensions.",
  "zoom-out": "Reduce workspace magnification without resizing the design.",
  timeline:
    "Scrub through individual machine commands in sewing order. This includes jumps, trims, stops and color changes, not just needle penetrations.",
  speed:
    "Simulation playback rate in commands per second. This does not set your embroidery machine's sewing speed.",
  play: "Play or pause the actual stitch sequence. Playback speed affects the simulation only.",
  rewind: "Inspect the start of the machine sequence.",
  end: "Inspect the complete machine sequence.",
  "step-back": "Step back one machine command, including non-sewing events.",
  "step-next": "Step forward one machine command, including non-sewing events.",
  "text-tool":
    "Create lettering as editable vector fill outlines. Device fonts determine the artwork; use sufficiently large letters for your thread.",
  "object-name":
    "Rename the selected source object, SVG or group without changing its geometry or stitching.",
  "bulk-scope":
    "Choose whether bulk settings affect each region's primary operation or all its sewing operations. Other operation settings stay independent.",
  "stitch-type":
    "Choose how selected artwork is sewn. For multiple manufacturing steps on the same geometry, add operations below.",
  "thread-color":
    "Assign the selected thread color to applicable operations. Color changes affect batching and machine thread-change instructions.",
  spacing:
    "Row spacing in millimeters. Smaller spacing gives denser fill or satin coverage, more thread and greater puckering risk. Artwork size stays unchanged.",
  length:
    "Target sewing stitch length in millimeters. Shorter stitches follow detail more closely and increase needle penetrations. Travel moves are separate.",
  angle:
    "Tatami stitch direction in degrees. Changes fill rows, not the orientation of the artwork.",
  "fill-pattern":
    "Stagger needle penetrations between fill rows to control texture. Spacing still controls coverage density.",
  "satin-width":
    "Width of the satin column or border in millimeters. Wide spans need appropriate stabilization and may snag.",
  compensation:
    "Pull compensation in millimeters. Extends coverage to counter thread pull-in; too much creates unwanted overlap. Test on your fabric.",
  underlay:
    "Generate preliminary foundation stitching to support the top thread and stabilize the shape. Adds real stitches and travel.",
  "closed-path":
    "Sew the last contour point back to the first. Leave off for an intentionally open path.",
  "reverse-path":
    "Reverse contour sewing direction and its entry/exit. Fill direction is controlled separately by its angle.",
  "op-offset":
    "Offset a closed outline in millimeters: positive goes outward, negative inward. Useful for placement, tackdown and finishing allowances.",
  "start-index":
    "Choose the starting vertex of a closed contour. Combines with path reversal to control entry and exit; it does not set fill entry points.",
  "tie-in":
    "Add short anchoring stitches at the start of sewing after unthreaded travel. Helps secure thread.",
  "tie-off":
    "Add short anchoring stitches before trims or thread changes to help prevent unraveling.",
  "pos-x":
    "Move the center of the selected artwork horizontally, in millimeters relative to hoop center. All selected regions move together.",
  "pos-y":
    "Move the center of the selected artwork vertically, in millimeters relative to hoop center. Positive Y moves down.",
  "size-w":
    "Resize selected artwork to this physical width in millimeters. Stitches regenerate; stitch spacing and satin width keep their millimeter values.",
  "size-h":
    "Resize selected artwork to this physical height in millimeters. With proportions enabled, both dimensions scale together.",
  proportional:
    "Keep the selection's width-to-height ratio while resizing. Shift temporarily toggles this during handle dragging.",
  rotate:
    "Rotate selected artwork together by this angle in degrees, then regenerate stitches. Fill directions rotate with artwork.",
  "sequence-locked":
    "Pin this object's position during automatic sequencing. Other objects cannot cross it; a pinned group protects all its descendants.",
  "convert-manual":
    "Replace generated operations with editable machine commands. Vector-based regeneration is lost for this object until undone.",
  "add-operation":
    "Choose an additional manufacturing step that shares the selected artwork geometry.",
  "operation-add":
    "Append the chosen operation to each selected vector object's stack. Existing steps keep their order.",
  "operation-name":
    "Name this embroidery step independently of its source artwork.",
  "applique-recipe":
    "Replace selected operation stacks with placement, stop for fabric, tackdown, stop for trimming and satin border. Undo restores existing steps.",
  "manual-index":
    "Choose the individual machine command to inspect or edit. Indices include jumps, trims and stops.",
  "manual-cmd":
    "Set whether this command sews, travels with the needle raised, trims or stops. This changes the exported machine instructions.",
  "manual-x":
    "Set this command's needle X coordinate in millimeters from hoop center.",
  "manual-y":
    "Set this command's needle Y coordinate in millimeters from hoop center; positive is down.",
  "manual-insert":
    "Insert a sewing command after the inspected command. Check its physical stitch length before export.",
  "manual-delete": "Remove the inspected machine command. Undo restores it.",
};
const selector =
  "button,input:not([type=hidden]):not([type=file]),select,summary,canvas[tabindex],[data-help]";
function description(el) {
  if (descriptions[el.id]) return descriptions[el.id];
  if (el.dataset.help) return el.dataset.help;
  if (el.matches("[data-check]"))
    return "Toggle this artwork's selection without clearing other selected objects. Selecting a parent includes its descendants.";
  if (el.matches("[data-select]"))
    return "Select this artwork and edit its properties. Shift/Ctrl-click adds or removes it from the selection. A parent selects all its regions.";
  if (el.matches("[data-visibility]"))
    return el.closest(".object-row.hidden") &&
      el.getAttribute("aria-label")?.startsWith("Hide")
      ? "Hidden by a parent group. Show that parent to display or sew this artwork. This eye toggles the child's own visibility without deleting geometry."
      : "Visibility: hide or show this object and its descendants on the canvas and in generated embroidery, without deleting artwork.";
  if (el.matches("[data-lock]"))
    return el.closest(".object-row.locked") &&
      el.getAttribute("aria-label")?.startsWith("Lock")
      ? "Protected by a parent lock. Unlock that parent to edit this artwork. This control toggles the child's own lock; locked artwork still sews."
      : "Protect this artwork from geometry and property edits. Locked artwork still generates stitches; a parent lock also protects children.";
  if (el.matches("[data-expand]"))
    return "Expand or collapse this group's children in the tree. This changes only the list, not canvas visibility or stitching.";
  if (el.matches("[data-tree-grip]"))
    return "Drag to reorder siblings within their current SVG or group. Selected siblings move together. This changes artwork layers and sets manual sewing order. Alt+Up/Down also moves.";
  if (el.matches("[data-sew-grip]"))
    return "Drag left or right to set manual sewing order without changing artwork layers. The whole object and its operation stack move together. Alt+Left/Right also moves. Sequence pins cannot be crossed.";
  if (el.matches("[data-object-step]"))
    return "Inspect this object's first sewing command. Use its grip to reorder the complete object; internal operation steps stay together.";
  if (el.matches("[data-op-enabled]"))
    return "Enable or disable this embroidery step. Disabled steps stay editable but generate no machine commands.";
  if (el.matches("[data-operation]"))
    return "Select this operation to edit its independent stitch settings. All operations share their object's source geometry.";
  if (el.matches("[data-op-action]"))
    return {
      up: "Move this step earlier within its object's operation stack. Check construction order, such as placement before tackdown.",
      down: "Move this step later within its object's operation stack. Check construction order before export.",
      copy: "Duplicate this operation and its settings on the same source artwork.",
      delete:
        "Remove this operation without deleting the source artwork. Undo restores it.",
    }[el.dataset.opAction];
  if (el.matches("[data-color]"))
    return "Apply this thread color to selected objects or operations. Compatible colors can be batched in automatic sewing order.";
  if (el.matches("[data-start]"))
    return "Jump the simulation to this thread-color block. This does not reorder or recolor the design.";
  if (el.matches("[data-tool]"))
    return {
      select:
        "Select and drag artwork (V). Shift/Ctrl-click to multiselect; drag empty space to select a box. Alt-click selects a region within an SVG.",
      node: "Edit actual vector or manual needle points (N). Drag a node; double-click an edge to insert a point. Stitches regenerate after geometry edits.",
      polygon:
        "Draw a closed region for tatami fill (P). Click vertices, then Enter to finish.",
      run: "Draw an open running-stitch contour (R). Click vertices, then Enter to finish.",
      satin:
        "Draw a satin centerline (S). Satin width and row spacing determine the generated column.",
      rectangle:
        "Drag to create a rectangular fill region. Configure its stitching in properties.",
      ellipse:
        "Drag to create an elliptical fill region (E). Configure its stitching in properties.",
      manual:
        "Place individual needle points to create an editable sewing path. Check stitch lengths before export.",
      pan: "Drag to pan the view (H), or hold Space while editing. This does not move artwork.",
    }[el.dataset.tool];
  return (
    el.getAttribute("title") ||
    el.getAttribute("aria-label") ||
    el.closest("label")?.textContent.trim() ||
    el.textContent.trim()
  );
}
export function installHelp() {
  const tip = document.createElement("div");
  tip.id = "control-description";
  tip.className = "control-help";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(tip);
  let active,
    timer,
    suppressFocus = false,
    explain = false;
  function hide() {
    clearTimeout(timer);
    tip.hidden = true;
    active?.removeAttribute("aria-describedby");
    active = null;
  }
  function show(el) {
    if (
      !el ||
      !el.isConnected ||
      !el.getClientRects().length ||
      document.body.classList.contains("reordering")
    )
      return;
    const text = description(el);
    if (!text) return;
    hide();
    active = el;
    tip.textContent = text;
    // A modal's top layer would otherwise cover a body-level tooltip.
    (el.closest("dialog[open]") || document.body).append(tip);
    tip.hidden = false;
    el.setAttribute("aria-describedby", tip.id);
    tip.style.left = "8px";
    const r = el.getBoundingClientRect(),
      t = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(innerWidth - t.width - 8, r.left))}px`;
    tip.style.top = `${r.bottom + t.height + 10 < innerHeight ? r.bottom + 8 : Math.max(8, r.top - t.height - 8)}px`;
  }
  function decorate(root) {
    const list = root.matches?.(selector)
      ? [root, ...root.querySelectorAll(selector)]
      : [...root.querySelectorAll(selector)];
    for (const el of list) {
      if (el.hasAttribute("title")) {
        el.dataset.help ||= description(el);
        el.removeAttribute("title");
      }
      const text = description(el);
      if (text) el.setAttribute("aria-description", text);
    }
  }
  decorate(document.body);
  new MutationObserver((changes) => {
    for (const c of changes)
      for (const n of c.addedNodes)
        if (n.nodeType === 1 && n !== tip && !tip.contains(n)) decorate(n);
    if (active && !active.isConnected) hide();
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch" || explain) return;
    const el = e.target.closest(selector);
    if (!el || el === active) return;
    hide();
    timer = setTimeout(() => show(el), 400);
  });
  document.addEventListener("pointerout", (e) => {
    const el = e.target.closest(selector);
    if (
      !explain &&
      !el?.contains(e.relatedTarget) &&
      active !== document.activeElement
    )
      hide();
  });
  document.addEventListener("focusin", (e) => {
    if (!suppressFocus) show(e.target.closest(selector));
  });
  document.addEventListener("focusout", () => {
    if (!explain) hide();
  });
  document.addEventListener(
    "pointerdown",
    (e) => {
      suppressFocus = e.pointerType === "touch";
      setTimeout(() => {
        suppressFocus = false;
      }, 0);
      const el = e.target.closest(selector);
      if (explain && el && !["context-help", "help"].includes(el.id)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        show(el);
      } else hide();
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest(selector);
      if (explain && el && !["context-help", "help"].includes(el.id)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        show(el);
      }
    },
    true,
  );
  const button = document.getElementById("context-help");
  function setMode(value) {
    explain = value;
    button.setAttribute("aria-pressed", String(value));
    document.body.classList.toggle("explain-mode", value);
    button.textContent = value ? "Done explaining" : "Explain";
    hide();
    if (value) show(button);
  }
  button.onclick = () => setMode(!explain);
  document.addEventListener("keydown", (e) => {
    suppressFocus = false;
    if (e.key === "Escape") {
      if (explain || !tip.hidden) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      setMode(false);
      hide();
    }
  });
  document.addEventListener(
    "scroll",
    () => {
      if (!explain) hide();
    },
    true,
  );
  window.addEventListener("resize", hide);
  document.addEventListener("close", hide, true);
}
