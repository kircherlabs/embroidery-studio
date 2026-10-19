# Manual satin rails — milestone 2

Baseline: main `88e8b65` (0.9.0). Both backup refs were verified unchanged.

## Audit and implementation boundary

Existing automatic stroke columns, directional columns, Centerline and Border
remain distinct. Reuse `paceRails`, `shortInnerTurns`, machine-grid validation,
operation stacks, direction-guide editing, source frames and the Node tool.

Add two independent editable Bézier rails as artwork source geometry. The closed
band is derived from them; individual sewing actions retain their own settings.
Open rails use explicit end caps. Closed rails preserve a counter and independently
chosen seam nodes. Rungs map positions on the two rails rather than acting as
global scanline angles. Invalid crossing/counter correspondence must report a
located error, preserve the source, and block export until repaired.

Milestone 2 includes direct rail drawing, creation from two paths or a two-contour
ring, rail/node editing, seam and direction controls, width adjustment, splitting,
underlay, compensation, bounded wide floats, persistence and machine validation.
The existing graph travel optimizer and PES/PEC origin encoder are preserved.
Milestone 3 (text along paths, additional effects, styles and repeats) stays separate.

## Research

The [Ink/Stitch satin-column documentation](https://inkstitch.org/docs/stitches/satin-column/)
describes two rails with direction rungs, underlay and staggered wide-span splitting.
Its [satin tools](https://inkstitch.org/docs/satin-tools/) distinguish rail orientation,
column direction and splitting. These are embroidery principles informing this
original implementation; no Ink/Stitch source code is copied.

## Drawing and editing

1. Choose **Manual satin rails** (∥) in the drawing toolbar. Click anchors and
   drag tangent handles as with Pen. Finish rail A, then draw rail B along the
   other side in the same direction and choose **Create column**. Neither half
   generates stitches by itself. Cancel/Escape abandons both unfinished rails.
2. For a ring, enable **Closed rails · ring** before drawing A. The two closed
   contours must form one nested opening. A hollow heart and a circular ring are
   supported; a branching shape needs several separate columns.
3. Alternatively, select two single-contour paths, or one closed shape with two
   contours, and choose **Create satin from selected paths / ring** above the
   canvas. Creation copies source curves and asks whether to hide the originals
   to avoid duplicate sewing. It does not delete them or flatten their operations.
4. Use **Node → Active rail A/B** for independent anchors, tangent handles,
   corner/smooth/symmetric modes, segment sculpting, insertion and deletion.
   Amber identifies A; blue identifies B. The marked points show the starting pair.
   Move, rotate, scale, mirror, duplicate and group the whole artwork normally.

**Artwork → Manual satin rails** holds shared source controls. Closed rails have
independent seam node fields (numbered from 1); selecting an anchor and clicking
**Set seam at selected node** positions a seam graphically. **Reverse rail B
correspondence** pairs opposite source directions. It does not reverse all sewing.
**Split into two columns** subdivides both curves at the corresponding position,
preserving cubic handles and the band opening. The new pieces retain their parent,
sewing actions and manual order; copied stops repeat per piece, as explained before
splitting. Direction guides are retained only on their compatible piece.

**Round active rail corners** rounds the selected A/B contour, retaining an editable
polygon and the nearest existing seam location. This explicitly replaces that
rail's cubic handles; Undo restores them. Use curve handles for precise Bézier
rounding. Generic Boolean cutting, offsets and hole subtraction explain that they
would discard paired boundaries; edit rails or use paired splitting instead.

## Sewing actions and direction

One normal **Satin Column** sewing action uses **Manual · two editable rails**.
The ordinary operation stack remains available for additional independent passes.
Source edits update all actions; action settings do not change the source rails.

- **Direction guides:** use the existing Draw/Edit direction guides control.
  Draw a finite rung crossing each rail exactly once. Its ends may extend outside
  the band. It fixes correspondence between those two rail positions. Guide
  endpoints and numerical coordinates remain editable. Rungs may not cross in
  their rail order or coincide with seams/end caps.
- **Row spacing:** full same-side penetration spacing in millimeters, measured on
  whichever rail advances farther. Outer bends keep coverage rather than inheriting
  sparse centerline spacing. Changes in source node count do not set density.
- **Rail width adjustment:** scales each local span around its midpoint; 100%
  follows the source. **Pull compensation** then extends each side in millimeters.
  Both are per-action settings. Invalid or collapsed adjusted bands are reported.
- **Protect inner turns:** reuses existing alternating short/full inner stitches
  on compressed turns while keeping full outer penetrations and coverage.
- **Light underlay:** center walk, inset rail walks, or both, using running
  segments up to 2.5 mm and checked continuity. The ordinary Underlay checkbox
  controls whether these walks sew.
- **Maximum satin span:** wide floats get staggered intermediate penetrations,
  an explicit Design Issue and machine-safe limits. Use tatami for broad regions
  when a split satin construction is inappropriate.
- **Reverse complete sewing direction:** reverses the column's execution, while
  rail B orientation controls correspondence. These have distinct purposes.

## Reconstruction and validation

The source is two independent curves with affine frames, seams and orientation;
`rings` are derived artwork. Rungs map normalized arc positions piecewise along
the rails. Cubics use adaptive parameter interpolation at approximately 0.005 mm
tolerance; correspondence is sampled at no more than 0.08 mm of rail travel before
physical spacing is rebuilt. Existing rail pacing, inner turning and machine-grid
validation are reused. There is no scanline fill in this mode.

Closed rails preserve the counter and even alternating seam parity. Correspondence
is checked against the full precision adjusted footprint; Boolean topology uses
the existing 0.001 mm grid. A 0.002 mm numerical containment tolerance prevents a
nearly tangent boundary from being rejected solely by Boolean rounding; it does
not move needle coordinates. The existing 0.1 mm machine-grid reconstruction then
checks actual stitches, including safe underlay transitions. Legitimate remaining
breaks are represented as jumps/trims, not hidden connecting sewing stitches.

Crossings, spans leaving the band, rungs crossing an opening twice, and collapsing
width/compensation give located **Design Issues**. The invalid action stays unsewn
and export is blocked until repaired or disabled. There is no silent tatami
fallback for explicitly digitized rails. Width below 0.8 mm prompts a crowding
review; meeting rails or width below 0.1 mm require separation or a split.

The additive project source and action settings save in `.embstudio` and autosave.
Older projects retain their existing modes and algorithms. PES contains the actual
generated commands; editable rail/guide metadata stays in the project. The graph
travel optimizer, machine profiles and corrected PEC origin encoder are unchanged.

## Coverage and remaining limits

Automated cases include straight and variable-width columns, cubic rails/rungs,
closed rings with unequal node counts/opposite winding, a hollow heart, curved
outer-density measurements, seams, mirroring, nonuniform transforms, split areas,
underlay, compensation, wide spans, narrow terminals and invalid correspondence.
Browser tests exercise actual drawing, independent handle edits, rungs, splitting,
history, source conversion, seams, rounding, project reload, touch cancellation,
five responsive viewports and independent PES decoding against every preview
needle coordinate and the declared origin/bounds. Existing regression suites and
production builds remain part of release checks.

This is manual digitizing: ambiguous branches, intersections, multiple counters,
zero-width shared tips and self-crossing bands need separate columns or geometry
repair. Closed seam auto-pairing is an initial suggestion; asymmetric contours can
need seam/rung edits. Split column placement is a percentage along A, not an
arbitrary knife gesture. Source rounding is explicit, not a nondestructive effect.
Very complex sources retain bounded sample/stitch limits and request subdivision.

Software geometry and PES decoding do not establish fabric coverage, registration,
tension or production quality. **Physical SE700 sew-outs are still required**,
especially for heart notches, narrow turns, split floats and underlay choices.
