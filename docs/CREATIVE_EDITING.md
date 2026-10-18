# Creative editing and construction (v0.3)

The native region array, hierarchy, whole-object sequencing, operation stacks,
workers, and PES codec are retained. New source descriptions are optional fields
in version-1 projects. Older projects continue to use their saved rings. Generated
rings remain the shared input for every operation and for preview/export.

## Editing

Select any SVG, group, or region in the artwork tree before dragging its actual
geometry on the canvas. Existing selections win over higher layers. Selection
handles remain first priority. Empty bounding-box space does not intercept other
objects. Alt-click cycles overlapping eligible regions; Shift/Ctrl/Command-click
changes selection. Hidden/locked artwork stays protected. Moving never changes
layer, hierarchy, or sewing order. Double-click a tree name, press F2 on a row, or
use **Edit selection → Rename** (also available on touch) to rename inline.

Draw rounded rectangles, ellipses, regular polygons and stars by dragging. Source
width/height, radius, sides, star ratio and the eyelet dimensions remain editable
in the inspector. A rectangle's gold corner control adjusts radius on canvas.
Parametric source frames follow group transforms, clipboard duplication,
alignment and distribution; stitch spacing and band width remain physical units.
Node edits convert ordinary parametric shapes to editable contour paths. Undo
restores the source description.

The Pen tool uses click-drag cubic anchors. Choose **Closed fill** before finishing
for a filled path. The Node tool edits anchors and independent tangent handles;
double-clicking a curve splits it with de Casteljau subdivision. Delete removes
an anchor. Smooth/corner actions apply to the active anchor. Adaptive flattening
accounts for the source transform and retains collinear overshoot and loops.

**Shape tools & construction** provides union, subtract, intersect and symmetric
difference using the existing polygon-clipping library. Subtract uses the first
source object as base. The base keeps its identity, parent and operations; Undo
restores the operands. Contour offsets use the existing Clipper round joins.

**Corner & curve control** distinguishes explicit geometry fillets (radius in mm)
from optional adaptive needle spacing. Fillets retain source contours while the
radius is adjusted; zero restores those contours. They clamp tangent distances to
adjacent edges and reject topology changes. The active polygon vertex can be
rounded separately. Applying fillets converts text/shapes to contour artwork;
Undo restores their editable source. No imported artwork is rounded automatically.
Stitch corner control preserves running-path corner points while removing nearby
redundant penetrations and shortens crowded inner satin turns. It is opt-in;
legacy stitch construction is unchanged. This is not an automatic split/miter
solver for every junction. Split very sharp columns and control their order.

## Lettering and positioning

New lettering stores content, family, height, tracking, line spacing, alignment
and its source frame. Change these in **Editable lettering** without replacing the
object, its parent, position, color or operation stack. Font previews use the same
browser font family. Canvas glyph coverage tracing reuses the existing contour
tracer. Saved outlines stay portable and are not silently regenerated on reopen;
editing device fonts on another platform can change outlines. Legacy lettering
without source text remains editable as outlines. Heights below 6 mm show a
physical-quality reminder. Test small lettering and serif detail on fabric.

**Align to reference** supports hoop, combined selection, or a named object/group.
A chosen reference stays stationary; selected groups move together and locks are
respected. Hoop alignment moves the selection together. Selected bounds align
separate units. Match width/height changes source geometry, retaining physical
embroidery settings. Existing Arrange and equal-gap distribution remain available.

## Shared construction and eyelets

**Edit selection → Create editable product** creates a keychain/tag, patch/badge,
or appliqué from ordinary geometry and editable operation stacks. Size, radius
and border width are configurable. **Create from selection** applies construction
recipes to existing closed artwork without duplicating it. Recipes replace the
stack; Undo restores it. Review stops and construction order for your process.

Eyelets can be placed with a click or drag. The source is an annulus with editable
inner diameter and reinforcement width. Its default satin operation follows the
outer contour inset by half the band width, sewing one reinforcement band, not
two duplicate inner/outer borders. Optional Location marker adds a running-stitch
cross. **Subtract inner opening** explicitly removes the disk from chosen closed
artwork. These are separate actions. Brother SE700 does not cut or punch fabric;
any physical opening is made manually. Scaling artwork does not scale physical
operation widths; inspect the reinforcement after a large/nonuniform resize.

## Satin column

**Satin column** is a new filled-region operation, separate from centerline satin
and satin border. Directional scanline spans run boundary-to-boundary with variable
width, use the region's winding/counters and existing safe interior routing, and
complete the object before moving on. Narrow spans have no tatami interior
penetrations. Spans above Maximum satin span use staggered split stitches and
produce a diagnostic. Machine-length limits still apply after 0.1 mm quantization. Counter endpoints
have grid clearance, and every column connector is validated on the actual
needle grid. Nearby legal positions within 0.21 mm are preferred; if a connector
cannot stay in material, a real jump is generated and reported. Unsewable tiny
points produce a warning. Construction recipes use outer boundaries by default
to avoid duplicating eyelet reinforcement; toggle Outer boundary only to include
counters explicitly.
Light underlay uses the existing fill support construction.

This is directional column digitizing, not automatic medial-axis decomposition.
For curved letters, branches and junctions, divide into suitable regions and
adjust directions. M, T, R, O and B are covered by browser geometry/travel tests;
automatic curved-rail fitting is a future extension. Broad regions usually suit
tatami. Never infer physical sew-out quality from a clean preview alone.

## Image tracing

PNG/JPG import opens original/vector comparison with color reduction, explicit
minimum island area, opacity threshold, smoothing and simplification. Processing
is local at up to 384 pixels on the long edge, intended for flat graphics/logos,
not photographic embroidery. Minimum area filters four-connected components
before contour tracing; holes in surviving regions remain boundaries. Set area
to zero to keep small islands. Smoothing is an explicit Chaikin pass. Palette
quantization remains deterministic. Geometry is editable under one image parent.

The bounded PNG reference and settings are saved on that parent. **Adjust tracing**
repeats from that reference and replaces the parent's edited descendants/operations;
Undo restores them. Group dimensions/position are retained. The reference is
resampled rather than the full-resolution original; save the original image
separately if needed. Large projects can exceed browser autosave quota: use Save
project for a portable file.

## Verification and research

New tests cover source-frame regeneration, fillets/counters, Boolean openings,
Bézier subdivision/extrema, templates/real stops, references and distribution,
variable-width columns, wide-span splits, adaptive satin turns and explicit tracing
noise filters. The real browser suite covers overlap dragging/resizing, groups,
inline rename/cancel/touch access, smart parameters, live fonts, curve handles,
eyelet subtraction, tracing/retracing, project persistence and independent PEC
origin/header decoding. Existing import, travel, sequencing, workspace and codec
regressions remain required.

Research references (no new third-party source copied):

- [Ink/Stitch satin columns](https://inkstitch.org/docs/stitches/satin-column/): rails/rungs, width limits, underlay and split stitches.
- [Ink/Stitch fill-to-satin tools](https://inkstitch.org/docs/satin-tools/): conversion needs direction guidance and often simpler regions.
- [ImageTracer options](https://github.com/jankovicsandras/imagetracerjs/blob/master/options.md): palette/edge/noise controls informed the existing tracer's interface.
- [opentype.js](https://github.com/opentypejs/opentype.js): MIT font outline alternative evaluated; retained the existing native-font tracer to avoid adding a font parser/font distribution dependency in this release.

The PEC/PES exporter was not rewritten. Its hardware-verified origin-prefix fixture
and independent decoder tests remain unchanged. This release has software export
validation; new designs still need physical SE700 stitch-out verification.
