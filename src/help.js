const descriptions = {
  "multi-hoop-entry":
    "Standard rehooping uses separate numbered files while keeping one editable master. Place real machine fields, inspect source seams and export measured alignment templates. This is not proprietary multi-position encoding.",
  "multi-auto":
    "Suggest horizontal/vertical fields with the requested minimum overlap and safety clearance. Replaces the current placement; Undo restores it. Move fields for irregular layouts.",
  "multi-overlap":
    "Minimum overlap used by Auto place and Add. Existing fields keep their positions until adjusted. Alignment overlap never duplicates sewing.",
  "multi-registration":
    "Opt in to temporary running crosses shared by neighboring fields, followed by an operator pause. Two clear alignment points are required. Disable marks for formats that cannot preserve that pause.",
  "multi-seam-x":
    "Move the selected field’s split ownership center horizontally within overlapping coverage. The physical field stays in place. Inspect regenerated joins before exporting.",
  "multi-seam-y":
    "Move the selected field’s split ownership center vertically. This supports vertical and irregular joins; it does not rotate or enlarge the machine field.",
  "multi-export":
    "Encode and independently decode every section, then download numbered files, thread order, a shared-coordinate guide and measured 1:1 templates. No physical alignment guarantee is implied.",
  "machine-brand":
    "Choose a manufacturer, or Generic / Custom for your own dimensions. Selecting equipment changes the design field; artwork is never resized automatically.",
  "machine-hoop":
    "Only documented compatible hoops are listed for verified models. Dimensions are sewing fields in millimeters, not outside hoop measurements. Custom dimensions are user-provided.",
  "equipment-default":
    "Use this machine and hoop for future new designs on this device. Existing projects retain their own selection.",
  "equipment-new":
    "Save a named custom machine with your continuous field dimensions and preferred export format. These measurements are not manufacturer-verified.",
  "equipment-center":
    "Center unlocked visible embroidery artwork in the hoop without changing its size, colors or stitching. Locked objects retain their position. Undo restores the previous positions.",
  "equipment-view":
    "Fit all embroidery artwork in the view. This changes the camera only; it does not resize artwork to fit the hoop.",
  "text-use-path":
    "Place this editable lettering along a copy of the selected curve. The baseline becomes part of the lettering source and generates no separate stitches; Node edits it later.",
  "text-hide-path":
    "When following the selected curve, hide the original artwork so its own sewing actions do not also stitch. The original remains editable and Undo restores its visibility.",
  "text-path-source":
    "Choose one existing single-contour path or shape to copy as this lettering's editable baseline. Original artwork remains independent after copying.",
  "text-path-attach":
    "Place the existing text on the chosen copied baseline while retaining its content, font and sewing actions. Optional source hiding and attachment share one Undo step.",
  "text-path-hide-source":
    "Hide the original baseline artwork after copying it so its independent sewing actions do not sew twice. This does not delete the original.",
  "text-path-offset":
    "Shift the whole text run along its baseline in source millimeters, after Left/Center/Right alignment. Closed baselines wrap; open baselines reject text that would extend beyond an end.",
  "text-path-normal":
    "Move letters across the curve in source millimeters. Positive values move toward the local right-hand side of the baseline's forward direction; letters retain their outlines.",
  "text-path-reverse":
    "Follow the baseline in its opposite direction. Letters rotate with that direction, which can place circular lettering on the opposite side. This is independent of machine sewing-order reversal.",
  "text-path-edit":
    "Use Node to edit the copied baseline's anchors, handles or segments. Editable text, font controls and sewing actions are preserved; this does not convert letters into fixed paths.",
  "text-path-detach":
    "Return to straight editable lettering centered at the current artwork position. Content, font and sewing actions remain intact; Undo restores the baseline and curved arrangement.",
  "rails-closed":
    "Create two closed boundaries forming one ring. Rail A and B must enclose the same opening; both seam nodes are editable after creation. This differs from drawing two satin outlines.",
  "rails-from-selection":
    "Create an independent manual satin column from two selected single-contour paths, or one shape with two nested contours. The dialog can hide the editable sources so they do not sew twice.",
  "active-rail":
    "Choose the boundary edited by Node. A is solid blue with a circular seam; B is dashed plum with a diamond seam. Both have light halos. Moving anchors, tangent handles or segments changes local satin width and rebuilds the generated stitches.",
  "rail-set-seam":
    "Use the selected node on this closed rail as its marked start/end. Choose corresponding nodes on both rails to keep spans from crossing the opening.",
  "rail-width-scale":
    "Scale each local rail span around its midpoint. 100% follows your drawn rails. Pull compensation adds millimeters afterward; maximum satin span limits uninterrupted floats separately.",
  "rail-underlay":
    "Choose center-walk, inset rail walks or both. This changes actual underlay stitches only when Light underlay is enabled for the action.",
  "rail-sew-reverse":
    "Sew the complete manual column in the opposite direction without moving artwork or reversing only one rail.",
  "reverse-rail-b":
    "Reverse B's correspondence with A. Use to correct opposing rail directions. This can invalidate a closed ring if its seams/guides no longer agree; Design Issues explains the required repair.",
  "rail-seam-a":
    "One-based node number marking the start/end of closed rail A. Insert a node with Node if you need a different seam position. The marked node stays with transformed geometry.",
  "rail-seam-b":
    "One-based node number marking the start/end of closed rail B. Pair it with A's seam across the material, not through the opening.",
  "rail-round-radius":
    "Round the active rail's geometry in millimeters. It stays editable; satin pacing is rebuilt along the resulting rails. Undo restores original nodes and handles.",
  "round-manual-rail":
    "Round only the active boundary. The nearest rounded node retains its seam. Review tight turns and guide crossings; source geometry and needle spacing remain separate concepts.",
  "split-manual-column":
    "Split both rails at the same guided correspondence into two editable columns. Sewing actions and colors are retained; stops repeat per piece. Undo restores the single column.",
  "rail-split-position":
    "Position along rail A's current seam-to-end traversal as a percentage. Rail B is divided at its corresponding position, including direction-guide constraints.",
  "edit-manual-rails":
    "Activate Node editing for the two independent source rails. Use Editing rail above the canvas to choose A or B; precise handles and curve sculpting remain available.",
  "pencil-smoothing":
    "Approximate freehand fitting tolerance in millimeters. Smaller values follow the captured trace more closely with more editable nodes. Smoothing does not change stitch density.",
  "sculpt-radius":
    "Local influence distance in millimeters when pulling imported polygon contours. Bézier segments instead update their own tangent handles. Redundant local polygon samples are compacted within 0.025 mm (tighter for small reaches); sharp turns, other contours and holes stay separate. This does not change stitch density.",
  "knife-mode":
    "Split regions creates closed pieces with real Boolean geometry and retains holes. Split contours opens line pieces; incompatible fill/border actions need explicit conversion to Running.",
  "erase-mode":
    "Area subtracts the brushed region from closed vector artwork. Line removes portions of a single path, preserving the remaining Bézier segments. This does not delete individual needle commands.",
  "erase-width":
    "Vector eraser brush diameter in millimeters. The brush preview shows the actual subtraction width, independent of canvas zoom.",
  "allow-open-run":
    "Explicitly allow filled-region or closed-boundary actions on newly opened pieces to become Running outlines. Other compatible action settings and thread colors are retained. Undo restores the source stack.",
  "join-gap":
    "Maximum deliberate bridge between the nearest two open endpoints, in millimeters. Large gaps are rejected so joining does not create unexpected long sewing lines.",
  "join-use-first":
    "Allow joining paths with different colors or action stacks by taking the first path's sewing actions. Leave off to reject incompatible setups. Undo restores both originals.",
  "join-vectors":
    "Join two selected open paths in the same group at their nearest endpoints. Adjust Join gap if you deliberately want a connecting segment.",
  "split-node":
    "Split an open path at the selected anchor; open a closed contour at that anchor. Closed-region actions require explicit conversion. Knife can also split at a clicked location.",
  "close-vector":
    "Explicitly connect the last endpoint to the first. Source geometry and compatible outline actions close together; Undo restores the open path.",
  "reverse-vector":
    "Reverse selected vector path directions, including Bézier handles, while preserving artwork position and sewing settings.",
  "node-symmetric":
    "Set opposite tangent handles to the same length and direction around this anchor. Dragging either handle then maintains symmetry. Corner mode retains independent control.",
  "finish-draw":
    "Complete this path using the placed points. Enter also finishes. The drawing controls stay above the canvas so they do not cover your artwork.",
  "cancel-draw":
    "Discard the unfinished path without changing existing artwork. Escape also cancels the current draft.",
  "embroidery-style":
    "Configure outline, fill or combined stitching with existing editable operations. Replacing a multi-step stack requires confirmation; source geometry stays unchanged.",
  "draw-style":
    "Set stitching for shapes you draw next. This does not change existing artwork until you choose Apply to selected artwork. Open paths and eyelets keep their dedicated drawing methods.",
  "apply-draw-style":
    "Apply the chosen style to compatible selected vector artwork, including SVG groups. Replaces its operation stacks; multiple-step stacks require confirmation. Geometry remains editable and Undo restores previous stitching. Locked objects, images and manual stitches are excluded.",
  "construction-stage":
    "For a linked patch boundary, place this operation before or after the decorative artwork. Within a phase, listed step order is preserved.",
  "close-artwork":
    "Explicitly close the selected source geometry so it can define a filled region or fabric piece. Undo restores the open source. This is different from sewing one operation's closing segment.",
  "live-text":
    "Edit this lettering object's content, including line breaks. Its identity, position and shared operation stack remain intact.",
  "live-font":
    "Compare font families on the same editable lettering. Generated outlines and stitches update; saved outlines are portable, but device fonts may vary when edited elsewhere.",
  "live-align":
    "Align individual text lines within this lettering block. This changes glyph layout, not the object's placement in the hoop.",
  "align-reference":
    "Choose the hoop, combined selection bounds, or an object/group as alignment reference. A specific reference stays stationary while selected artwork moves.",
  "outer-only":
    "Use only outer contours for this outline operation. Enable to avoid stitching counters as extra finishing borders; disable when inner boundaries also need construction stitching.",
  "corner-adaptive":
    "Alternate short and full penetrations only on compressed inner satin turns; preserve full outer-curve coverage. Running corners stay on the source path. Satin rail spacing is preserved even when this option is off.",
  "eyelet-marker":
    "Add a real running-stitch reference cross at the hole center before reinforcement. Cutting or punching the fabric is manual.",
  "node-smooth":
    "Align the selected Bézier anchor's tangent handles to form a smooth transition. Move handles on canvas for finer control.",
  "node-corner":
    "Make the selected vertex a corner with independent handle directions. Existing handles and curved edges remain intact. Double-click a closed-shape vertex to toggle Corner / Smooth; Undo restores the edit.",
  "pen-closed":
    "Close this Pen or Pencil path and generate a filled artwork region when finishing. Leave off for an open running-stitch curve.",
  "raster-colors":
    "Detect up to 128 meaningful color clusters. Uncheck shades in the palette to merge their artwork into retained colors. Higher counts preserve detail and may need lower processing resolution.",
  "raster-bg":
    "Propose removal of border-connected background areas. Nothing is removed until you confirm the red preview. Enclosed foreground details of the same color are retained.",
  "trace-area":
    "Merge tiny color islands below this area in square millimeters into a touching color. No transparent pinholes are created. Set zero to keep all islands; existing holes remain open.",
  "trace-simplify":
    "Maximum contour simplification tolerance in millimeters. Larger values reduce nodes but can remove fine edge detail; inspect the vector preview.",
  "trace-smooth":
    "Apply one corner-cutting smoothing pass to traced boundaries. This changes actual vector geometry; inspect counters and fine details before accepting.",
  "trace-alpha":
    "Ignore pixels at or below this opacity threshold, from 0 transparent to 254 nearly opaque. Use the preview to inspect antialiased edges.",
  "toggle-sequence":
    "Open Stitch preview to inspect sequence, timeline and playback. In preview, toggle its panel. Design mode automatically hides it without changing generated commands.",
  "toggle-tools":
    "Show or hide the design-tool icon bar to give the canvas more room. Your active tool and unfinished path stay intact. From Stitch preview, opens Design. This workspace preference is saved on this device.",
  "maximize-canvas":
    "Temporarily hide all three panels to expand the canvas. Restore or Escape brings back your previous panel sizes and visibility.",
  "reset-layout":
    "Restore default panel sizes and visibility and fit the hoop in view. Artwork and embroidery settings stay unchanged.",
  "tools-prev":
    "Scroll back through the drawing tools. Arrow buttons and scrolling keep every tool accessible in a small workspace.",
  "tools-next":
    "Scroll forward to more drawing tools. Tools stay available when panels or the browser window are resized.",
  "arrange-selection":
    "Open positioning and alignment actions for selected objects or groups. Also available by right-clicking the canvas or pressing Shift F10.",
  "snap-objects":
    "Snap artwork dragging to the hoop center or visible object edges and centers within 7 screen pixels. Guides show the alignment; hold Alt to bypass snapping.",
  "navigation-mode":
    "Auto: notched mouse wheels zoom; small pixel scrolls and horizontal trackpad gestures pan. Choose Mouse or Trackpad explicitly if needed. Pinch and Ctrl/Command-scroll always zoom over the canvas.",
  "fit-design":
    "Fit all visible source artwork in the current canvas area. This changes the view only, not geometry or physical dimensions.",
  "view-command":
    "Fit selection, all artwork or the hoop; center the hoop view at the current zoom, or reset to Fit Hoop. Panel resizing never changes source artwork.",
  "context-help":
    "Turn detailed hover and keyboard-focus hints on or off. Design tool names remain available when off; on adds descriptions. On touch, hold a control to read its hint. Ordinary taps still operate controls. Your preference is remembered on this device.",
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
    "Focus Mode temporarily isolates an object or group for editing. With Select, double-click artwork to focus it or its outer group; double-click inside a focused group to go one level deeper. Exit Focus Mode returns directly to the full workspace. Esc normally also exits fully; while editing satin direction guides, Esc first leaves that guide tool. Manual Show/Hide settings and exports are unchanged.",
  "optimize-colors":
    "In automatic mode, batch compatible colors and reduce travel while preserving overlaps, sequence pins and complete operation stacks. Manual mode always respects your chosen order.",
  "quality-safeguards":
    "Avoid routing back over completed fill rows and retain curved satin underlay. This can add jumps where a concealed connection is unavailable. Enabled for new blank designs; older projects keep their historical stitch output until you enable it. Undo restores the previous plan.",
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
  "show-manual-trims":
    "Highlight estimated connecting threads to inspect after sewing. Red solid = no effective trim; dashed/hollow = a trim command exists but machine execution is unverified. Blue jumps and orange trim commands remain separate. This diagnostic never changes stitches or exports.",
  "sequence-zoom-in":
    "Zoom the existing command timeline around the playback cursor. Ctrl/Command-wheel zooms at the pointer; Shift-wheel pans. Nearby important events remain individually inspectable.",
  "sequence-zoom-out":
    "Show a wider command range. Ordinary stitch marks aggregate by screen pixel; jump, trim, stop, color and cleanup markers retain separate lanes.",
  "sequence-zoom-fit":
    "Show the complete command sequence. The original stitch scrubber and playback controls still navigate the full design.",
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
  "image-import-mode":
    "Use as Reference keeps a background image without creating stitches. Automatically Trace opens the existing color-reduction and editable-vector workflow.",
  "reference-storage-mode":
    "Original preserves exact uploaded image bytes. Optimize explicitly resizes to at most 2048 pixels and re-encodes the stored copy; the original is not embedded afterward.",
  "edit-reference":
    "Unlock and select this background reference for moving, resizing or rotating with canvas handles. Finish editing locks it so drawing tools target foreground artwork.",
  "reference-opacity":
    "Display opacity of the reference image only. This does not affect stitch density, thread colors or exported files.",
  "reference-name":
    "Rename the reference layer without changing its shared image asset or embroidery artwork.",
  "object-name":
    "Rename the selected source object, SVG or group without changing its geometry or stitching.",
  "bulk-scope":
    "Choose the first sewing action of each selected object, or every sewing action. This changes settings on existing actions without replacing or flattening their lists.",
  "stitch-type":
    "Change this sewing action's stitch method. Its identity, color and position in the sewing order stay independent. Add another sewing action creates an additional pass. Fill and border methods require a closed area.",
  "construction-method":
    "Change this action's fabric-construction purpose or machine command. Placement marks fabric position, Tackdown holds fabric, Basting stabilizes material, and Offset follows an expanded or inset boundary. Use Add another sewing action to keep the current stitching.",
  "add-construction":
    "Add a specialized fabric outline, marker, stop or trim while retaining existing actions. Closed fabric boundaries are required for placement, tackdown, basting and offsets.",
  "construction-add":
    "Add the selected construction action to compatible artwork. Existing actions keep their settings, colors and sewing order.",
  "sewing-presets":
    "Configure outline, fill, or fill plus border as editable sewing actions. Replacing multiple existing actions requires confirmation; Undo restores them.",
  "bulk-action-enabled":
    "Enable or disable the sewing actions in the displayed bulk scope. Their settings are preserved; disabled actions generate no machine commands.",
  "thread-color":
    "Assign the selected thread color to applicable operations. Color changes affect batching and machine thread-change instructions.",
  spacing:
    "Spacing in millimeters between fill rows, or same-side satin penetrations on the faster moving rail. Satin adds stations around outer curves to retain coverage. Smaller spacing increases density, thread usage and puckering risk.",
  length:
    "Maximum segment length in millimeters for fill, or target length along a running path. Satin columns use it only when wide spans need splitting. Travel moves are separate.",
  angle:
    "Tatami or filled-region satin direction in degrees. Changes needle spans, not artwork orientation. Split complex branches into separate regions for different directions.",
  "fill-pattern":
    "Stagger needle penetrations between fill rows to control texture. Spacing still controls coverage density.",
  "column-mode":
    "Follow strokes extracts branches and curved rails from filled artwork. Directional spans retain the earlier fixed-angle column method for manual digitizing. Source lettering remains editable.",
  "column-fallback":
    "Choose an explicit tatami fallback or leave unsuitable regions unsewn. Both report a Design Issue; unsewn errors block export until reviewed or disabled.",
  "satin-structure":
    "Display extracted center rails and cross-stroke directions for selected lettering. This overlay does not add stitches. Draw local direction guides to influence actual needle movements.",
  "column-max":
    "Maximum continuous satin float in millimeters. Wider crossings get staggered split penetrations; broad areas may be better suited to tatami.",
  "satin-width":
    "Width of centerline satin or a boundary band in millimeters. Filled-region satin columns derive width from geometry and use Maximum satin span for split control.",
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
    "Resize selected artwork to this physical width along the chosen Object or Canvas axes in millimeters. Stitches regenerate; stitch spacing and satin width keep their millimeter values.",
  "size-h":
    "Resize selected artwork to this physical height along the chosen Object or Canvas axes in millimeters. With proportions enabled, both dimensions scale together.",
  proportional:
    "Keep the selection's width-to-height ratio while resizing. Shift temporarily toggles this during handle dragging.",
  "transform-orientation":
    "Object resizes along the artwork's rotated axes. Mixed orientations fall back to Canvas axes. Canvas resizes horizontally/vertically; unequal scaling can skew rotated artwork. This view preference does not alter geometry. Shift toggles corner proportions; Alt resizes about the center and bypasses grid snapping.",
  rotate:
    "Rotate the selection BY this angle in degrees, relative to its current orientation. The field resets to zero after applying. The current object-axis angle and Reset rotation are shown in Object mode. Fill directions rotate with artwork.",
  "sequence-locked":
    "Pin this object's position during automatic sequencing. Other objects cannot cross it; a pinned group protects all its descendants.",
  "convert-manual":
    "Replace generated operations with editable machine commands. Vector-based regeneration is lost for this object until undone.",
  "add-operation":
    "Choose a new sewing action sharing the existing artwork. A running outline, fill and satin border can each have independent colors and settings.",
  "operation-add":
    "Add the chosen sewing action after the existing actions. For a group or multiselection, the displayed count states which objects are compatible.",
  "operation-name":
    "Rename this sewing action without renaming the artwork or changing its stitch method.",
  "applique-recipe":
    "Check fabric-piece suitability, then choose direct construction or a surrounding editable patch. Complex artwork stays decorative; stacks are replaced only after an explicit choice.",
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
  if (el.dataset.toolDescription) return el.dataset.toolDescription;
  if (el.dataset.toolName && el.dataset.help) return el.dataset.help;
  if (descriptions[el.id]) return descriptions[el.id];
  if (el.dataset.help) return el.dataset.help;
  if (el.matches("[data-close-panel]"))
    return "Collapse this panel and give its space to the canvas. Reopen it with Objects, Properties or Sequence in the workspace bar. Its size is remembered.";
  if (el.matches("[data-check]"))
    return "Toggle this artwork's selection without clearing other selected objects. Selecting a parent includes its descendants.";
  if (el.matches("[data-select]"))
    return `${el.closest(".focus-outside") ? "Temporarily outside Focus Mode. Selecting this artwork leaves the current focused view; its eye setting has not changed. " : ""}Select this artwork and edit its properties. Shift/Ctrl-click adds or removes it from the selection. A parent selects all its regions.`;
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
    return "Enable or disable this sewing action. Disabled actions retain their settings and generate no machine commands.";
  if (el.matches("[data-operation]"))
    return "Expand this sewing action to edit its method, thread and stitch settings directly below. All actions share the artwork geometry. Click again to collapse.";
  if (el.matches("[data-op-action]"))
    return {
      up: "Sew this action earlier on the same artwork. Linked patch preparation stays before decorative artwork and finishing stays after it.",
      down: "Sew this action later on the same artwork. Review placement and tackdown order for fabric construction.",
      copy: "Add a copy of this sewing action with independent settings on the same artwork.",
      delete:
        "Remove this sewing action without deleting the artwork. Undo restores it.",
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
        "Draw a custom closed outline by placing points. Apply satin borders, tatami fills, or other stitch styles.",
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
    enabled = false,
    hold = null,
    blockedClick = null;
  const preferenceKey = "embroidery-hints-v1";
  const isTool = (el) => !!el?.dataset.toolName;
  try {
    enabled = localStorage.getItem(preferenceKey) === "true";
  } catch {}
  const button = document.getElementById("context-help");
  const cancelHold = () => {
    if (hold) clearTimeout(hold.timer);
    hold = null;
  };
  function hide() {
    clearTimeout(timer);
    tip.hidden = true;
    active?.removeAttribute("aria-describedby");
    active = null;
  }
  function show(el) {
    if (
      (!enabled && !isTool(el)) ||
      !el ||
      !el.isConnected ||
      !el.getClientRects().length ||
      document.body.classList.contains("reordering")
    )
      return;
    const text = isTool(el)
      ? `${el.dataset.toolName}${el.dataset.toolShortcut ? ` · ${el.dataset.toolShortcut}` : ""}${enabled ? ` — ${description(el)}` : ""}`
      : description(el);
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
    if (e.pointerType === "touch") return;
    const el = e.target.closest(selector);
    if (!enabled && !isTool(el)) return;
    if (!el || el === active || el.tagName === "CANVAS") return;
    hide();
    timer = setTimeout(() => show(el), 400);
  });
  document.addEventListener("pointerout", (e) => {
    if (e.pointerType === "touch") return;
    const el = e.target.closest(selector);
    if (
      !el?.contains(e.relatedTarget) &&
      (isTool(el) || active !== document.activeElement)
    )
      hide();
  });
  document.addEventListener("focusin", (e) => {
    if (
      (enabled || isTool(e.target)) &&
      !suppressFocus &&
      e.target.tagName !== "CANVAS"
    )
      show(e.target.closest(selector));
  });
  document.addEventListener("focusout", hide);
  document.addEventListener(
    "pointerdown",
    (e) => {
      cancelHold();
      hide();
      suppressFocus =
        e.pointerType === "touch" || isTool(e.target.closest(selector));
      blockedClick = null;
      const el = e.target.closest(selector);
      if (
        (!enabled && !isTool(el)) ||
        e.pointerType !== "touch" ||
        !el ||
        el.id === button.id ||
        el.matches("canvas,[data-tree-grip],[data-sew-grip]")
      )
        return;
      const pending = {
        el,
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        shown: false,
      };
      hold = pending;
      pending.timer = setTimeout(() => {
        if (hold !== pending || (!enabled && !isTool(el)) || !el.isConnected)
          return;
        show(el);
        pending.shown = !tip.hidden;
      }, 500);
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (
        hold?.id === e.pointerId &&
        Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8
      ) {
        cancelHold();
        hide();
      }
    },
    true,
  );
  document.addEventListener(
    "pointerup",
    (e) => {
      if (hold?.id !== e.pointerId) return;
      if (hold.shown) blockedClick = { el: hold.el, until: Date.now() + 1000 };
      cancelHold();
    },
    true,
  );
  document.addEventListener(
    "pointercancel",
    () => {
      cancelHold();
      hide();
    },
    true,
  );
  document.addEventListener(
    "contextmenu",
    (e) => {
      // Keep native long-press menus from covering a touch hint. Canvas context
      // menus and ordinary mouse right-clicks retain their normal behavior.
      if (
        hold?.el.contains(e.target) ||
        (blockedClick?.until > Date.now() && blockedClick.el.contains(e.target))
      )
        e.preventDefault();
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      if (
        blockedClick?.until > Date.now() &&
        blockedClick.el.contains(e.target)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      blockedClick = null;
    },
    true,
  );
  function setEnabled(value, persist = true) {
    enabled = value;
    button.setAttribute("aria-pressed", String(value));
    button.textContent = value ? "Hints: On" : "Hints: Off";
    cancelHold();
    blockedClick = null;
    hide();
    if (persist)
      try {
        localStorage.setItem(preferenceKey, String(value));
      } catch {}
  }
  setEnabled(enabled, false);
  button.onclick = () => setEnabled(!enabled);
  document.addEventListener("keydown", (e) => {
    suppressFocus = false;
    if (e.key === "Escape" && !tip.hidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
      hide();
      cancelHold();
    }
  });
  const dismiss = () => {
    cancelHold();
    hide();
  };
  document.addEventListener("scroll", dismiss, true);
  window.addEventListener("resize", dismiss);
  document.addEventListener("close", dismiss, true);
}
