# Tatami textures and decorative fills

Select closed artwork, open its sewing action in **Properties → Embroidery**,
choose **Fill**, then choose the **Fill method** beside it. **Browse fill samples**
shows small samples made by the real generators. They are examples, not a
prediction of fabric appearance. Changing a method updates this action; **Add
another sewing action** deliberately creates a separate pass/color.

Artwork stays editable. Sewing actions keep their color, physical-thread snapshot,
position in the stack and identity. Geometry/text/rails are not converted to
stitches. Undo/Redo, project files, style transfer and My Artwork carry fill settings.

## Choosing a construction

| Method | Actual construction | Useful controls / limits |
| --- | --- | --- |
| Tatami | Parallel rows, staggered interior needle placements | Row spacing, maximum segment length, direction and texture; dense underlay and pull compensation remain available. |
| Contour | Closed running loops inset from the original region at each level | Loop spacing, segment length, outside-in/inside-out, boundary inset. Narrow tips and final cores can be less covered. |
| Stipple / Meander | Curved wandering running paths around a clearance-constrained branching coverage forest | Style, physical scale, paired-line spacing, curviness, seed, direction, inset. This is intentionally open coverage. |
| Cross Stitch | Complete X cells with the same local diagonal sewn last | Cross size, grid pitch, direction and origin. Partial edge cells/cells enclosing counters are excluded. |
| Embossed Tatami | Tatami rows with real penetrations pinned to motif boundaries | Motif, scale/repeat, emphasis, direction and phase. Surface texture, not raised padding. |
| Ripple | Concentric circular/elliptical running paths clipped to the region | Minimum turn spacing, ellipse ratio, center, orientation, base direction, inset. Safe nearby seams connect. |
| Spiral | One monotonic Archimedean spiral, clipped where necessary | Same radial controls. A simple disk has one outward path; holes/concavities can produce separate arcs. |

Closed-region methods require closed artwork; the existing open-path guidance
offers closing without discarding nodes. Satin Centerline, Border, Column and
manual rails remain separate constructions. These fills do not change their algorithms.

## Tatami textures

Classic / Quarter, Brick / Half and Aligned preserve the legacy generator when
expanded settings have not been used. Existing projects' command streams remain
unchanged. Twill, Random, Wave, Third, Fifth, Progressive, Chevron and Custom opt
into the new physical pattern frame. Reset returns this action to original Classic.

- Twill has a row repeat; Wave has repeat and amplitude.
- Random has a deterministic integer seed and bounded phase variation.
- Progressive advances by an editable fraction per row; Chevron reverses its
  stagger. Repeated/aligned turns can concentrate needles and produce a warning.
- Custom accepts 1–32 comma-separated fractions `0 <= offset < 1`, repeated by row.
  For example `0, 0.4, 0.1, 0.65`. Fractions multiply maximum segment length.
- Smaller row spacing increases density. Texture controls needle placement, not
  extra fill passes. Changing stitch count alone is not a preview effect.

**Pattern placement & edge quality** exposes an optional constrained correction
for short edge intervals. It repositions interior penetrations while preserving
row endpoints and maximum segment length. It does not delete narrow spans or
reduce row coverage. If a requested minimum is impossible, boundary stitches stay
and Design Issues explains the limitation. Machine coordinates use a 0.1 mm grid;
source interval limits have that final rounding tolerance.

## Placement and physical units

**Follow artwork** carries the pattern origin/orientation through translation,
rotation, mirroring, duplication and library insertion. Spacing, stitch length,
cross size and motif dimensions remain millimeters on resize: enlarging artwork
creates more pattern, not scaled stitches. **Shared canvas grid** stays fixed and
lets adjacent regions share a lattice. Origin X/Y set its phase explicitly.
Switching anchor deliberately rebases the frame; Undo restores it.

Pattern direction is relative to an attached artwork frame, or to the canvas for
a shared grid. Radial center coordinates are offsets from that pattern origin.
Ellipse turn spacing is the minimum normal gap; elongated ellipses have wider
gaps in other directions. Radial clipping keeps 0.12 mm clearance for rounding.
Clipped arcs can reverse to reduce travel; the base curve's clockwise control
still defines the underlying construction. A single unclipped Spiral is never
reversed or replaced by stitched concentric rings.

## Meander and motif details

Classic uses rounded branching coverage; Fine resets to smaller scale/spacing,
Open to larger scale/spacing. Organic and Looping use irregular Poisson stations
rather than a smoothed rectangular maze. Looping inserts checked circles with
intentional attachment points. Proper unintended crossings are rejected after
machine quantization. Every surviving connected region is considered. Very narrow
tips or isolated stations can stay empty; the notice names that open-coverage limit.

Line spacing is the nominal separation of paired branches, not a promise of
uniform separation at every bend. It must remain below 80% of scale for this
construction. Styles reset scale/spacing/curvature/variation; seed and source stay.
Dense Tatami underlay is not silently added to open fills.

Emboss motifs are Dots, Diamonds, Checkerboard, Lattice, Diagonal Bands and Waves.
Emphasis is the evenly distributed fraction of rows pinning motif boundaries.
Row spacing stays fixed. Close marks are reduced with a warning; thin spans keep
their endpoints. Zero emphasis gives the new ordinary Quarter Tatami stream.
For line motifs, scale and repeat control slope/lattice proportions. Motifs may
increase local needle buildup even when total rows are unchanged.

Crosses use jump travel between legs to avoid unwanted front-side bars. Nearby
untrimmed jumps do not add repeated tie locks; actual trims/first entry retain
normal securing rules. Maximum segment length can subdivide a long diagonal.
This is not a claim about a hand-sewn reverse side or machine trim capability.

## Safety, projects and practical testing

Design Issues reports core collapse, narrow spans, concentrated penetrations,
reduced motif fidelity, unsuitable geometry and generation budgets. Impossible
methods generate an error and no substitute stitches. Any error blocks normal
export; a failed generator is never exported as a truncated prefix.

New fill settings require project version 2 / `fills-1`. Legacy projects remain
version 1 until opting in; Reset downgrades only if no advanced fills remain.
Older Studio builds cannot safely open the new capability. Unknown future saved
library records are retained, not purged as corrupt. Export backups before moving
between versions. No account or catalog is required.

Generation remains bounded (5 million geometry work units / 200,000 fill points;
existing whole-design 250,000-command cap). Obsolete browser workers terminate
rather than queue expensive synchronous work. Extreme spacing/scale, centers far
from artwork, elongated ellipses or intricate tiny contours may need larger
spacing, simpler geometry, another seed or an explicit different method. They
produce guidance, not silent geometry deletion or Tatami substitution.

The same generated events feed Design, simulator and the unchanged exporters.
PES/PEC corrected origin metadata, JEF restrictions, VP3 stop restrictions and
multi-format package safety remain in force. Software decoding checks are not
physical machine validation.

Use [reference projects and PES samples](../examples/fill-swatches/README.md) for
fabric tests. Assess density, sheen, puckering, thread buildup, short stitches,
travel and stabilizer on a swatch before sewing a product. No new fill method is
claimed to have undergone a physical sew-out.

See [benchmarks](FILL_BENCHMARKS.md), [technical assessment](FILL_ENGINE_ASSESSMENT.md)
and [milestone status](FILL_ENGINE_PROGRESS.md).
