# Stroke-following satin lettering

New **Satin column** steps default to **Follow individual strokes**. This is a
separate generator from tatami and the previous globally directed column spans.
Artwork and editable text remain the source; every operation still owns its
independent thread, settings, order and enable state.

## Choosing a method

- **Satin column / Follow individual strokes:** automatically decompose filled
  outlines into variable-width stroke sections. Useful for stems, diagonals,
  bowls, counters and serif terminals. Inspect the extracted rails before sewing.
- **Satin column / Directional spans:** retain the earlier fixed-angle span
  construction. Useful for deliberate manually divided regions. Older projects
  without a saved column mode retain these exact directional commands.
- **Satin centerline:** a constant-width zigzag perpendicular to an explicit open
  or closed center path. Its width is a physical band setting, not inferred from
  a filled glyph.
- **Satin border:** constant-width satin around the chosen artwork boundary,
  including its offset and outer-boundary controls.
- **Tatami fill:** split, staggered fill rows for broad regions. It remains a
  distinct operation and an explicit fallback option.

## Automatic construction

`stroke-skeleton.js` uses an original bounded Zhang–Suen thinning implementation
for topology. Raster sampling starts at 0.075 mm and adapts to large regions;
this is an approximate stroke skeleton, not an analytic medial-axis solver.
Distance-to-boundary estimates identify stroke thickness. Degree-two chains,
collinear branch pairing, counter loops and sharp-turn segmentation create
stroke sections rather than globally oriented fill rows.

`stroke-satin.js` partitions competing branches by distance to their center
rails. Outer rails intersect the original vector contours; internal junction
seams use the bounded partition grid. Branches meet at a seam instead of sewing
several complete overlapping columns through a junction. This is an automatic
geometric approximation, not a hand-digitized machine font.

Cross-sections follow the local stroke tangent and derive variable widths from
the original geometry. Needle stations are paced by moving rail distance, so
outer curves get enough penetrations. Crowded inner turns alternate shortened
and full penetrations to reduce buildup without pulling every needle point away
from the edge. The corner threshold is a local crowding control, not a guaranteed
minimum between every pair of stitches. It does not round the source artwork.

Pull compensation extends outside rails, locally limited for narrow strokes;
counter rails retain clearance. Center-walk underlay travels out and back along
the stroke. Top stitching completes each section before the next. Safe hidden
travel follows the skeleton graph when a direct interior connector is blocked.
Visibility-tested shortcuts stay inside material and avoid counters. Unreachable
sections get actual jumps. Whole-object order and the existing fill/object graph
optimizer remain unchanged.

Wide floats use staggered split penetrations at **Maximum satin span** (default
6 mm). The segment-length setting controls those splits. Machine limits still
apply at emission, including entry connectors. A broad area with many splits is
usually a better candidate for tatami than satin.

All column and fallback paths pass through the existing 0.1 mm machine-grid
validator. It relocates only nearby legal needle positions and emits real path
breaks where a counter cannot be preserved. Unsewable points are reported.
Generated stitches, jumps, trims, time estimates, simulation and exports use this
same sequence.

## Local direction editing

Select one artwork object and its column step. **Show stroke rails and directions**
is an inspection overlay. **Edit direction guides on canvas** lets you drag a
cross-stroke rung, then drag its endpoint handles. **Escape** exits this mode.
Guide coordinates are also editable with keyboard or touch in millimeters;
individual Remove guide buttons undo a guide without deleting artwork.

A guide steers the nearest stroke locally, modulo 180 degrees; it does not rotate
the whole glyph or replace its outline. Extreme guide angles can invalidate the
rails and trigger the chosen fallback. Guides are saved per operation, copied
with operations, transformed with artwork and restored by Undo/Redo. Live font
changes preserve the lettering object and its steps; guides outside the new
outline produce a navigable Design Issue and need repositioning.

## Explicit fallback and limits

Automatic segmentation does not solve every font. Very small serifs, compact
junctions, ornamental or connected scripts, near-touching contours and broad
regions may require manual division or another method. A geometric band-coverage
check rejects rails covering less than 90% of sampled source cells or with more
than 15% repeated band overlap. These are geometric diagnostics, not a prediction
of fabric coverage, tension or sew-out quality. Complexity bounds reject excessive
analysis rather than freezing the editor.

Choose **Tatami fallback + Design Issue** or **Leave unsewn + Design Issue**.
Fallback is per connected region, not a silent conversion of the entire object.
The latter is an error that blocks export until repaired or explicitly disabled.
Existing directional digitizing, geometry editing and manual stitch tools remain
available. Guides steer automatic directions; they are not a complete manual
rail/branch authoring system.

A sans-serif B in the tested Windows device font currently fails the coverage
check and correctly uses tatami. It is not presented as successful satin. Font
outlines differ by device; projects retain their saved outlines, while switching
fonts uses that device's installed fonts. Native Brother machine lettering uses
purpose-digitized stitch programs; equivalent physical quality has not been
established for this automatic converter.

## Validation and related-method audit

`tests/stroke-satin.test.mjs` checks transverse T arms, curved rails and counters,
center underlay, safe graph travel, direction-guide coordinate effects and
transforms, project serialization/validation, explicit fallback, bounded wide
floats, legacy command equivalence and closed-loop satin seam parity.

`tests/satin-browser.mjs` compares MTR and OBS at 14 mm in serif, sans-serif,
monospace and device-script fonts against directional columns and tatami. It
records direction bins, section counts, coverage/overlap, stitch lengths,
counter clearance, jumps and trims in `test-results/satin-comparison.json`.
Tests require true stroke construction for MTR, and explicitly accept/report
unsuitable OBS regions rather than weakening geometric acceptance thresholds.
They exercise canvas guides, font switching on the same source, Undo, reload,
legacy controls and desktop/mobile layouts.

The test exports all eight samples through the unchanged production PES codec,
then independently decodes PEC and PES. Every needle coordinate and orientation,
preview sequence, extents and corrected PEC origin fields are checked. The
resulting PES samples are written under `test-results/` for optional sew-outs.
The existing suite continues to check operation dependencies, color/stop commands,
SE700 hoop size, SVG import and machine compatibility.

The limited method audit found an odd-station seam in closed satin borders and
centerlines. Uniform even station counts now preserve alternating rails through
the seam. Their physical band widths, turn-shortening option, center underlay,
compensation and machine-length subdivision remain intact. Existing tests check
running corners, bean forward/back/forward segments, triple full-path passes,
tatami staggering, counters and graph travel. These generators were not rewritten.

**Physical validation remains required.** Sew MTR/OBS and a connected script on
scrap fabric with the intended thread, stabilizer and needle. Inspect serif tips,
branch seams, inner turns, counter clearance, split floats and underlay show-through.
Compare against a native SE700 lettering sample at the same physical height.
Software decoding confirms the machine instructions, not their physical appearance.

## Measured comparison

Local Edge / Windows device fonts, 14 mm cap height, zero compensation, center-walk underlay enabled; values vary with device fonts. Jumps include initial positioning. Trims include the final cut.

| Font / sample  | Stroke satin stitches | Directional stitches | Tatami stitches | Jumps | Trims | Fallback regions |
| -------------- | --------------------: | -------------------: | --------------: | ----: | ----: | ---------------: |
| serif MTR      |                  1345 |                  783 |            1057 |     3 |     3 |                0 |
| serif OBS      |                  1173 |                  696 |             952 |     3 |     3 |                0 |
| sans-serif MTR |                   936 |                  631 |             869 |     3 |     3 |                0 |
| sans-serif OBS |                   928 |                  669 |             866 |     3 |     3 |                1 |
| monospace MTR  |                   832 |                  563 |             755 |     3 |     3 |                0 |
| monospace OBS  |                   952 |                  623 |             826 |     3 |     2 |                0 |
| cursive MTR    |                  1008 |                  675 |             933 |     3 |     3 |                0 |
| cursive OBS    |                  1005 |                  687 |             892 |     3 |     2 |                0 |

Each MTR sample used stroke satin for all three letters. The report checks rail directions and actual sewing segments, not stitch-count reduction alone. Software measurements do not establish equivalence to native Brother lettering.

## Research and licensing

Primary references:

- [Ink/Stitch satin columns](https://inkstitch.org/docs/stitches/satin-column/):
  rails/rungs, peak spacing, short inner stitches, underlay and compensation.
- [Ink/Stitch satin tools](https://inkstitch.org/docs/satin-tools/): manual direction
  rungs, branching and routing; automatic conversion still needs human judgment.
- [scikit-image morphology documentation](https://scikit-image.org/docs/stable/api/skimage.morphology.html):
  distinction between topology-preserving thinning and distance-based medial axes.
- [FlorisSteenkamp/MAT](https://github.com/FlorisSteenkamp/MAT): MIT analytic MAT/SAT
  alternative reviewed; not bundled because traced polygon complexity and junction
  decisions still need separate handling.

No Ink/Stitch (GPL) or scikit-image implementation was copied. The stroke topology,
partition, rails, turning and travel code is original under this repository's
license. No new runtime dependency was added. Existing licensed geometry and
PyEmbroidery libraries remain in use; the PES/PEC exporter was not replaced.

## Manual two-rail construction — 0.10.0

The earlier automatic direction guides are supplemented by a genuine editable
pair of source rails. This explicit Satin Column mode uses transverse rail spans,
not directional fill rows or a centerline-width approximation. See the
[manual rail guide](MANUAL_SATIN.md) for creation, rungs, seams and limitations.
Automatic stroke and legacy directional construction retain their algorithms.
