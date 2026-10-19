# Unified Embroidery properties

Select artwork and work in **Embroidery**. A sewing action is one pass or machine
command on the shared artwork, not another file or a duplicate shape.

For a circle: choose Tatami fill, choose a thread color, and set row spacing and
direction. Open **Add another sewing action** to add Satin border in a different
color. The machine completes the fill before the border. Changing an existing
action's method changes that action instead of adding another one.

Each card shows its sewing position, name, enable checkbox and management controls.
Expand its heading to reveal method, thread and relevant stitch settings directly
below. Only one action editor is shown at a time. Arrow controls reorder actions;
copy and delete retain Undo. Advanced settings include action naming, underlay,
pull compensation, ties, contour direction/start/offset and supported corner
optimization. Satin columns retain automatic/manual construction, local guides,
rail inspection, maximum-span controls and fallback behavior. Hidden or disabled
actions remain editable; a disabled action generates no machine commands.

Ordinary geometry, lettering, Smart Shape parameters, node tools, rounding and
transforms live separately in **Artwork**. Geometric closure is distinct from the
optional closing stitch of a running action. A fill/border selection on an open
path explains this distinction and offers **Close paths & use…** only for geometry
that forms a nonempty region. Closing and changing the method are one Undo edit.
Two-point or degenerate lines need node editing before they can define a fill.

**Sewing presets** configures outline, fill, fill plus running outline, or fill plus
satin border. Replacing multiple actions requires confirmation; colors and any
construction stops being replaced are explicitly mentioned. **Construction
presets** retains the separate fabric workflow: placement, positioning stops,
tackdown, trimming stops and finishing. Complex artwork can be surrounded by one
editable patch rather than converted into many fabric pieces.

Linked patch cards are displayed in manufacturing phase order: preparation before
decorative artwork, finishing afterward. Phase labels remain visible. Reorder
arrows operate inside a phase; the advanced phase selector makes a phase change
explicit. Changing a method retains the action's phase. Normal object sequencing,
color batching, operation colors and generated machine instructions remain intact.

For groups and multiselections, choose **First sewing action of each object** or
**All sewing actions of each object**. The inspector displays counts and mixed
values. Bulk setting edits preserve the action lists; changing every action's
method across multiple stacks requires confirmation. Add-action controls show the
compatible object count before applying; incompatible objects are explained.
Select one object to reorder, rename, duplicate or delete its individual actions.
Reference images and locked objects retain their dedicated editing behavior.
Manual stitch commands remain directly editable, with a thread color and object
sewing options rather than an artificial vector-operation list.

Project version 1 is unchanged. Merely selecting, expanding or inspecting a legacy
object does not materialize or rewrite its operations. Existing IDs, geometry,
operation parameters, colors, stops and sequencing survive save/reopen. No stitch
generator or PES/PEC exporter was replaced. Automated and browser coverage checks
the circle/fill/border workflow, closure, method identity, action management, bulk
scope, construction, persistence, Undo/Redo and independently decoded PES geometry,
stops, colors and corrected Brother origin metadata. Software validation does not
replace physical material/stitch-out assessment.
