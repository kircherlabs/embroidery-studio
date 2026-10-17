# Object editing and embroidery operations

## Workflow

Import one or several SVG files. Each file becomes a selectable parent in the
artwork tree; supported nested SVG groups retain their names and structure.
Expand the tree to select the original regions and outlines. Colors remain
properties, not organizational containers. The original region IDs, rings, holes,
SVG fill/outline associations and digitizing settings remain editable.

Select the SVG parent and drag its shared corner handles to resize it. Corners
keep proportions by default; Shift toggles that behavior. Edge handles change
one dimension. Drag the round control above the box to rotate; Shift snaps the
angle to 15°. Drag selected artwork to move it. Every edit changes source points
and regenerates stitches after release; density, stitch length and satin width
remain physical millimeter settings. Rotation also rotates fill direction.

Click normally to select a top-level artwork object. Double-click to focus a
group, then select its children on the canvas. Alt-click selects an individual
region directly. The tree always permits selecting any visible row. Shift-click
or Ctrl/Cmd-click adds/removes selections. Drag on empty canvas to box-select.
Locked artwork is excluded from canvas editing and bulk changes, but still sews.
Hidden groups exclude their descendants from manufacture. **Focus mode and Focus
stitches are view filters; exports still contain the complete generated design.**

The inspector shows shared properties and blank “Mixed” values/indeterminate
checkboxes when appropriate. A new value applies to every compatible unlocked
selected region, preserving its other settings. For operation stacks, bulk edits
target each region's primary sewing operation by default; choose **All sewing
operations** explicitly when desired. Manual stitch blocks retain their commands
when vector stitch parameters are edited; color and transformations apply to them.

Use the selection menu to select children/similar artwork, copy/paste, lock,
hide, align, distribute gaps, center in the hoop, or add basting/registration
geometry. Aligning selected groups moves each group's children together. Group
and Ungroup change organization without flattening geometry. Reorder siblings
with the layer arrows; a group's whole block moves together. Turn off compatible
color grouping or pin sequence positions for manufacturing order overrides.

## Ordered operations

Artwork, embroidery operations and generated commands are separate layers:

- Artwork retains its editable geometry and parent membership.
- Each vector region can have up to 32 ordered operations with independent
  colors, density, direction, underlay, compensation, visibility and path settings.
- Generation resolves those operations into bounded, quantized machine commands.

Select a step in **Embroidery operations** to edit it. Add, duplicate, rename,
enable/disable, reorder or remove steps. An empty explicit stack produces no
stitches but keeps the source artwork. Legacy objects retain their single
implicit operation until a stack is needed. All steps use the same live source
geometry; resizing a patch updates every placement/tackdown/border step.

Implemented techniques:

| Technique                      | Actual construction                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Running / placement / tackdown | Arc-length sampled contour, bounded stitches; tackdown defaults to a 0.4 mm inset                      |
| Bean                           | Each segment sews forward, back, forward                                                               |
| Triple run                     | Entire contour sews forward, reverse, forward                                                          |
| Tatami                         | Existing routed fills with quarter-stagger, half-stagger or aligned needle patterns                    |
| Satin centerline / border      | Alternating perpendicular penetrations across a constant-width path; closed borders use cyclic normals |
| Offset outline                 | Robust integer polygon offset followed by a running stitch, preserving hole winding                    |
| Basting                        | Longer running stitches on an expanded contour or one shared selection bounding box                    |
| Registration                   | Editable running-stitch crosses outside the selection bounds                                           |
| Stop / trim                    | Actual nonsewing commands, displayed and counted in the simulator                                      |

Closed outline operations use vendored Clipper at 0.001 mm resolution, with round
joins, before machine quantization to 0.1 mm. Open artwork is excluded from bulk
closed-outline operations with a notice. Ambiguous contour topology fails with a
specific message rather than generating a guessed offset. An inset that collapses
the entire region warns and produces no sewing for that step. Narrow features
can change topology under offsetting; inspect each contour and test the sew-out.

**Use appliqué recipe** replaces the selected regions' stacks with placement →
stop (position fabric) → inset tackdown → stop (trim fabric) → satin border.
Undo restores the previous stack. This is a recipe for closed patch shapes;
bulk application creates two real stops **per region**, not one pause for an
entire multiregion illustration. Give each step enough clearance for the chosen
fabric, stabilizer and trimming method. Satin corners and narrow features need
careful inspection; the border is constant-width, not automatic branched satin.

Objects are planned as complete source units before their operations expand.
Color batching can move compatible objects but cannot interleave or revisit
their steps. Overlap dependencies, manual blocks and sequence pins remain in
effect. Manual operation reordering is intentional source order; the recipe's
manufacturing dependencies are preserved against automatic color optimization.
Complete multicolor stacks are compared against source order; the planner falls
back to source order if first-color batching would add manual thread changes.

The generator inserts normal tie-ins/offs unless disabled, jumps across
disconnected contours, and retains the existing routed fill travel. Reversal and
first-vertex controls set contour direction/start; fill routing chooses safe
entry/exit travel automatically. Direct command conversion remains available for
precise needle-point, jump, trim and stop edits; Undo restores the vector stack.

## Simulation, persistence and machine files

Generated events carry source object, region and operation IDs. The sewing-order
list identifies operation boundaries, including stops; the timeline and canvas
display jumps, trims, color changes and stops separately. Selection highlights
its stitches; Focus stitches filters the drawing without changing statistics or
export. Stops count separately from manual thread changes and add operator time
to the estimate (a fixed estimate, not a promise of actual handling time).

PES/PEC represent stops using repeated thread colors. The existing decoder
recovers these as stop commands, while an independent decoder verifies the
underlying color markers and all sewing coordinates. Verify machine pauses before
appliqué sewing. Other formats can handle stop/color commands differently.

Machine files do not retain artwork hierarchy or source operation boundaries.
After export the simulator displays actual decoded machine commands; the source
focus filter clears because those IDs are unavailable. Return to Design to
regenerate source-aware preview. Save an `.embstudio` project to retain the tree,
editable geometry, operation stacks and settings. Autosave and undo/redo retain
these too. Older format-v1 projects remain readable; missing source filenames or
original SVG nesting cannot be reconstructed from old flat projects. Select and
group those existing regions manually or reimport the original SVG.

Coincident same-color source geometry, dense spacing, skipped details/outlines,
offset collapse, overlapping construction and hoop violations produce diagnostics.
**Review duplicate objects** selects only duplicate candidates, leaving the first
copy intact; use reversible hide/delete only after checking intentional repeated
passes. No duplicate geometry is silently removed.

## Shortcuts and touch

| Shortcut                        | Action                                              |
| ------------------------------- | --------------------------------------------------- |
| Ctrl/Cmd A                      | Select design (current focus scope when isolated)   |
| Ctrl/Cmd G / Shift G            | Group / ungroup                                     |
| Ctrl/Cmd D                      | Duplicate                                           |
| Ctrl/Cmd C / V                  | Copy/paste artwork within this studio session       |
| Delete / Backspace              | Delete selection or selected vector node            |
| Arrow / Shift Arrow / Alt Arrow | Move 1 / 10 / 0.1 mm                                |
| F                               | Fit selection in view                               |
| Ctrl/Cmd Z / Shift Z            | Undo / redo                                         |
| Escape                          | Cancel gesture/drawing, clear selection, exit focus |
| Space / H                       | Temporary pan / hand tool                           |

Touch supports object/handle dragging and two-finger zoom/pan. The left and right
panel toggles retain the mobile layout. Grid snapping uses a 1 mm grid; Alt
temporarily bypasses it. Copy/paste uses the studio's internal artwork clipboard
and does not request operating-system clipboard access. Text inputs retain their
normal text selection and clipboard shortcuts.

## Validation and remaining limits

`tests/editor.test.mjs` checks group identity, transforms, winding/offsets,
sequencing, locks, persistence validation, duplicate diagnostics and stitch
construction. `tests/editor-browser.mjs` exercises the actual import/tree/canvas/
inspector/project workflow; `TEST_MACHINE=1` adds independent verification of the
PES downloaded by the browser, including appliqué stops. It joins existing SVG,
desktop/mobile, digitizing, travel and PES fixture checks in GitHub Actions.

The PES exporter and its four-byte origin correction are preserved; the
hardware-verified HayDave file remains an exact regression. See
[PES compatibility](PES_COMPATIBILITY.md). Software tests do not confirm a new
operation's physical sew-out quality. Test the new appliqué/border operations on
scrap with the SE700, including actual pauses, trims, density and corners.

Decorative motif fills, automatic medial-axis satin branching, arbitrary guides,
boolean artwork editing and cross-application vector clipboard formats remain
future work. There are no inactive controls for those techniques.

Research: [Ink/Stitch running and bean construction](https://inkstitch.org/docs/stitches/running-stitch/),
[appliqué workflow](https://inkstitch.org/tutorials/applique/), and
[Clipper offset documentation](https://github.com/junmer/clipper-lib/blob/master/Documentation.md).
No Ink/Stitch source code is included.
