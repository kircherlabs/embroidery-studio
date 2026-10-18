# Properties and fabric construction

The inspector edits source artwork, operation settings and manufacturing order
separately. Format-v1 projects remain readable; explicit operations are materialized
only when needed. Density, thread widths and offsets remain physical millimeters
when artwork is transformed. The PES/PEC exporter and its origin repair are unchanged.

## Control audit

All project edits use the existing atomic mutation, Undo/Redo and JSON persistence
path. Operation settings now resolve the same target for display and change. A
single object shows its active step, including disabled steps and real stop/trim
commands. Group/bulk editing chooses the first sewing step or all sewing steps;
stops are not accidentally recolored or changed by bulk sewing settings. An edit
reports incompatible targets. Locked descendants are excluded explicitly.

| Control                                                    | Actual effect and applicability                                                             | Verification / correction                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name; group/SVG name                                       | Renames source node, not its operations                                                     | Inline and Properties names persist; object name limit agrees with model (200)                                                                                                           |
| Text, font, height, tracking, leading, alignment           | Regenerates glyph contours in the existing source frame; all shared steps follow            | Existing lettering/browser regressions; rounding no longer discards editable text                                                                                                        |
| Smart shape dimensions, radius, points, inner ratio        | Regenerates editable source rings; transform frame remains intact                           | Existing shape tests and browser editing; source dimensions/radius are before source-frame scaling                                                                                       |
| Position, size, proportions, rotate **by**                 | Transforms actual selection geometry; rotation is relative and resets to zero               | Parent/child/locked selection and transform regressions                                                                                                                                  |
| Alignment reference and actions                            | Moves/resizes actual artwork against hoop, selection or a stationary chosen reference       | Existing alignment tests; no stitch-density changes                                                                                                                                      |
| Geometry offsets, booleans, eyelet subtraction, node tools | Explicitly changes source contours/counters; Undo restores sources                          | Existing creative tests; no implicit fabric cutting                                                                                                                                      |
| Round shape corners                                        | Explicit source geometry fillet, separate from needle spacing                               | Topology checked; original contours restore at zero; Smart shape parameters and text retained where supported; individual Bézier filleting converts to polygon and Undo restores handles |
| Artwork stitching style                                    | Replaces steps with running outline, satin border, tatami, or fill + running outline        | Tests all four styles on rectangles/ellipses/polygons/stars; multi-step replacement explicitly confirmed                                                                                 |
| Close artwork paths                                        | Explicitly closes source geometry, including the Bézier closing curve                       | Required before assigning filled-region methods to open sources; different from one operation's closing segment                                                                          |
| Active step method                                         | Changes operation technique while retaining source geometry, thread and prior settings      | Fixed legacy source-type mutation and lost inherited spacing; type-specific offset defaults only where old method could not use them                                                     |
| Thread color / palette                                     | Changes scoped sewing operation colors, influencing actual color blocks and machine changes | Existing bulk and sequencing/browser tests; per-operation colors remain independent                                                                                                      |
| Row spacing                                                | Physical distance between fill rows or satin penetrations; smaller means denser             | Actual needle-coordinate tests; density warning below 0.25 mm, including satin columns                                                                                                   |
| Running / maximum segment length                           | Running path sampling or fill split length; satin column uses it for wide-span splits only  | Needle-coordinate and bounded machine-segment tests; does not control ordinary unsplit satin width                                                                                       |
| Stitch direction                                           | Rotates fill scanline construction, not the artwork                                         | Tatami and column coordinate tests                                                                                                                                                       |
| Fill pattern                                               | Staggers interior fill penetrations; columns use it only for wide-span splitting            | Observable penetration tests; narrow columns have no interior splits                                                                                                                     |
| Satin band width                                           | Width of boundary/explicit-centerline band, not region-derived column width                 | Actual geometry/spans tested; column span derived from artwork                                                                                                                           |
| Maximum satin span                                         | Threshold for splitting directional region spans; split size also bounded by segment length | Wide-column span/penetration tests; directional digitizing, not automatic letter skeleton tracing                                                                                        |
| Pull compensation                                          | Extends fill/satin coverage; irrelevant to running lines                                    | Actual needle-coordinate tests; does not reshape source artwork                                                                                                                          |
| Light underlay / preliminary outline pass                  | Fill support or path-following preliminary pass                                             | Real underlay and sequence tests; label distinguishes an extra outline pass from fill underlay                                                                                           |
| Sew closing segment; reverse direction; vertex start       | Changes the active path operation's closure/direction/seam, preserving source geometry      | Real path coordinate tests; marker has no closure or vertex selector                                                                                                                     |
| Contour offset; outer boundary only                        | Offsets closed outline operation; optionally omits counters for that step                   | Clipper/holes and real contour tests; collapsed offsets are errors, with navigation                                                                                                      |
| Tie-in / tie-off                                           | Actual short securing penetrations when thread continuity requires them                     | Actual command/coordinate tests; not inserted indiscriminately on every fill row                                                                                                         |
| Optimize corner stitches / threshold                       | Retains contour turns, removes adjacent crowded penetrations and shortens inner satin turns | Needle-coordinate regressions, source geometry unchanged. Unavailable with inline reason for tatami/columns; threshold disabled until optimization enabled                               |
| Pin source sequence                                        | Keeps automatic/manual objects from crossing a barrier                                      | Existing sequencing tests; not a general lock on editing                                                                                                                                 |
| Enable, name, duplicate, delete, up/down step              | Changes the normal shared-geometry operation stack                                          | Existing + new browser tests; active step highlighted, endpoints and 32-step cap explained/disabled                                                                                      |
| Add step                                                   | Adds to each selected vector object's stack; does not replace the current method            | Closure and stack-limit checks report skips; expert manual offsets/stops remain available                                                                                                |
| Construction presets                                       | Preflight plus explicit direct replacement or new surrounding boundary                      | No blind per-region recipe button remains                                                                                                                                                |
| Boundary step before/after artwork                         | Explicit dependency stage for a linked patch boundary                                       | Manual reversed-order tests and independent PES decoding verify preparation → decoration → finish                                                                                        |
| Make stitches editable; manual command controls            | Explicit vector-to-machine-command conversion and actual command edits                      | Existing browser and machine codec tests; reversible through Undo                                                                                                                        |
| Image retracing                                            | Explicit regeneration from stored original image                                            | Existing tracing regressions and replacement guidance                                                                                                                                    |

Some controls have no visible change when geometry has no relevant feature: an
outer-only contour on a shape with no holes, corner control on a straight line,
column split settings on an entirely narrow column, or tie settings on a path
without a thread break. The inspector explains these conditional meanings rather
than promising an effect in every case.

## Construction sequence

A simple closed fabric boundary can receive placement, a position-fabric stop,
a 0.4 mm inset tackdown, a trim-fabric stop and an inward satin finishing band.
Preflight checks closure, contour topology, disconnected fabric pieces, counters,
collapsed offsets, band size and hoop clearance. Geometry errors prevent the
automatic recipe; manual independent operations remain available for experts
using a different, deliberate inset or construction.

For a complex SVG or group, the default is a surrounding patch wizard. It offers
rectangle, rounded rectangle, circle and oval, automatic bounds plus margin,
manual dimensions, border width/color, radius, and independent placement,
tackdown and stop choices. The live preview warns when artwork is outside the
boundary or the boundary exceeds the hoop. Ellipse auto-sizing encloses the
artwork's bounding rectangle rather than clipping its corners. No ambiguous
outer silhouette is inferred.

After creation, Patch boundary sizing can explicitly refit the margin around the current linked artwork. Refit resets boundary orientation to the hoop axes while retaining all operation IDs and independent settings. Manual dimension and corner controls remain available.

The boundary is a normal editable Smart shape with normal operations and a list
of linked decorative object IDs. Geometry and existing operations of decorative
artwork stay intact. The planner deliberately stages the boundary around complete
decorative objects, respecting their manual order or safe automatic batching.
The finishing strip is labeled separately and cannot be dragged as a free-standing
manufacturing step. Dragging preparation moves the whole construction. Experts
can assign a boundary operation to either phase. Stage order has priority over
color optimization. Copying the complete group remaps all links and operations;
new construction cannot overlap/nest another linked construction.

Deleting artwork leaves the remaining linked objects intact and reports missing
links. Ungrouping changes visual organization, not manufacturing dependencies.
Hiding a boundary excludes its construction steps; source visibility rules still
apply independently to the linked decoration. Geometry is never silently clipped.

## Design Issues

Errors describe invalid or empty required operation paths and prevent machine
export until fixed or deliberately disabled. Warnings identify conditions needing
review; notices describe intentional stops, overlap constraints and optional
filtering. The compact disclosure deduplicates issues, shows object/operation
names, explains consequences and corrective actions, and locates editable source
steps. Hints On/Off still controls optional hover/focus popups; inline limitations
remain readable with hints off, by keyboard and on touch.

## Evidence and limits

`tests/properties.test.mjs` checks all supported patch shapes, actual parameter
effects, scope, source preservation, preflight, dependency/manual ordering,
copy/remapping, persistence, issue severity and geometry-vs-stitch rounding.
`tests/properties-browser.mjs` uses the original 11-region manatee fixture and
checks the live wizard, two-stop shared construction, editing, Undo/Redo/reload,
style replacement, narrow boundaries, issue navigation and a mobile layout.
`tests/pes-export.test.mjs` independently decodes the new staged construction and
compares every sewing coordinate, stops, size and origin against the preview.
Existing SVG accuracy, machine fixture, travel, workspace and editing suites remain.

New outputs have software validation, not new physical SE700 sew-outs. Fabric,
stabilizer, thread weight, clipping clearance and the suitability of border widths
still need user judgment and a scrap-fabric test. Preflight detects collapsed and
split insets, not every locally narrow neck or physical fabric interaction. It
does not automatically remove overlapping decorative fills or infer custom fabric
silhouettes. Curved/branching lettering still needs deliberate directional satin
regions where appropriate.

Construction references: [Ink/Stitch appliqué tutorial](https://inkstitch.org/tutorials/applique/),
[Ink/Stitch commands](https://inkstitch.org/docs/commands/) and
[Brother appliqué workflow](https://help.brother-usa.com/app/answers/detail/a_id/75054/).
These inform placement, tackdown, operator stops and finishing order. No code
from those documentation sources was copied; existing licensed geometry and
machine-code libraries remain in use.
