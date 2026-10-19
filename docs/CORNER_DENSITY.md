# Rounded geometry and stitch coverage

Rounding changes editable artwork. Every sewing action is rebuilt from those new
contours; source vertices are not reused as a fixed number of needle positions.
The operation's physical spacing, width, compensation, underlay and color remain
independent of the rounding radius.

## Satin reconstruction

Satin borders and centerlines formerly paced needles along the center path. A
curve's outer rail is longer, so its needle spacing grew beyond the requested
density. A 3 mm-radius circle with a 4 mm band and 0.42 mm spacing produced outer
gaps of 0.699 mm. Reconstructed rails produce a maximum gap of 0.419 mm while
retaining the 5 mm outer radius, before the machine's 0.1 mm quantization.

`satin-rails.js` now supplies common millimeter pacing for centerline/border satin
and stroke-following columns. Consecutive stations advance by at most half the
requested peak-to-peak spacing, measured on the faster moving rail. Closed loops
have even station counts and cross the seam to the opposite rail. Wide floats
still split at the existing safe limits.

The crowded-corner option previously could shorten both rails, including straight
strokes, and measured against previously shortened points. It now shortens only a
compressed inner rail, alternating short and full penetrations against unmodified
rail measurements. Shortening is permitted only when the remaining full inner
penetrations still meet the requested spacing. Outer penetrations remain full
width. Turning coverage is
always paced correctly even when optional short stitches are disabled.

If the inside turn radius is smaller than half the compensated band width, a
parallel inner offset folds back. The centerline reconstruction instead fans to
the local pivot and reports a located **Design Issue**. Increase radius, reduce
band width or divide the turn. This is an explicit geometric limitation; no
setting can keep a full parallel band in a turn that cannot accommodate it.

## Running outlines and tatami

Running, bean and triple outlines retain length stations and add curve-following
needle positions where their chords would depart from the source by more than
0.1 mm before machine quantization. Straight paths retain length-based sampling;
SVG flattening vertex counts do not control density. Underlay benefits from the
same curve-following correction.

Tatami was already rebuilt from current contours with millimeter row spacing.
Regression tests verify unchanged row separation and correct clipping to rounded
edges and counters. No arbitrary extra edge passes or density multipliers were
added. Legacy directional columns retain their span-based construction.

## Validation and limits

Coordinate tests cover outer spacing and width, seam parity, open bends, pivots,
inner shortening, rounded counters, hearts, small polygons, straight columns,
tatami clipping and running-curve fidelity. Browser tests cover serif, sans,
monospaced and script MTR/OBS lettering (including 4 mm small text), SVG imports,
editable font switching, rounding Undo/Redo, persistence, warnings and independently
decoded PES needle coordinates and corrected origin metadata. Unsuitable automatic
letter rails still use an explicit tatami fallback or manual guidance.

These are software geometry checks. Fabric, thread, stabilizer, tension and very
small lettering still require physical sew-outs, including tight pivot fans.
The PES/PEC exporter and graph travel optimizer are unchanged.

## Technique references

The original implementation follows rail spacing, alternating short inner stitches
and bounded float splitting, consistent with the distinctions documented in
[Ink/Stitch satin parameters](https://inkstitch.org/docs/stitches/satin-column/)
and [simple zigzag limitations around curves](https://inkstitch.org/docs/stitches/zigzag-stitch/).
No Ink/Stitch code was copied or bundled.
