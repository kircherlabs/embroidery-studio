# Editable path lettering — 0.11.0 / milestone 3A

## Workflow

Draw a Pen/Pencil path or a circle, select it, then choose **Add lettering** and
**Follow a copy of [artwork]**. Hide the original baseline if it should not sew;
creation and hiding share one Undo step. Fabric-construction boundaries keep their
original visibility and sewing actions when used as a baseline. The new lettering inherits the source
parent, retains editable text/font controls and owns an independent copied curve.

For existing lettering, open **Artwork → Editable lettering → Text along a path**,
choose **Copy baseline from**, then **Attach to copied baseline**. Original artwork
is preserved. Later edits to that original do not change the independent copy.

- **Edit lettering baseline** activates Node. Anchors, tangent handles, segment
  sculpting, insertion/deletion and node modes reshape the curve while retaining
  content, font and sewing actions. The purple baseline is editing geometry only.
- **Text, font, height and letter spacing** regenerate glyph outlines and actual
  embroidery. Font changes keep the object ID, parent, transform and operation list.
- **Alignment** positions the whole run along the baseline. **Along path** shifts
  that position afterward; closed baselines wrap. Open paths reject overset text
  rather than silently clipping/discarding letters. Reduce height, spacing or offset,
  or lengthen the baseline. Rejected edits preserve the previous source and stitches.
- **Across path** moves glyphs perpendicular to the local baseline direction.
  Positive values move toward its right-hand side in the screen coordinate system.
- **Reverse baseline direction** reverses text traversal and glyph orientation.
  It is separate from reversing a sewing action. Circular text can move to the
  opposite side of the curve when reversed; inspect its orientation before sewing.
- **Make straight lettering** returns to editable straight text centered at the
  current artwork location. Sewing actions remain; Undo restores the path layout.

Move, scale, rotate and mirror the lettering normally, including in groups.
Baseline edits use the composite source frame so transformations are not doubled.
Parameter dimensions are source millimeters and scale with the artwork, consistent
with existing lettering. Locks, visibility, history and the unified Embroidery
section retain their existing behavior. Generic vector cutting is still an explicit
outline conversion with Undo; use baseline controls to retain editable text.

## Source and actual embroidery

The additive `textSource.path` stores a copied editable curve, direction and offsets.
`textSource.glyphs` stores per-glyph outlines and advances. Portable projects retain
these as well as the generated artwork contours. Reopening, changing offsets or
editing the baseline reuses saved glyphs, without requiring font availability.
Changing font/content/height/spacing regenerates glyphs with the device font, as
ordinary lettering already does; appearance may vary across devices at that point.

Glyph advance midpoints follow the baseline; each outline rotates to the local
tangent as a rigid shape. Counters and outline dimensions are retained rather than
stretching glyphs around bends. This follows the general placement principle in
the [SVG 2 text-on-path specification](https://www.w3.org/TR/SVG2/text.html).
This is original layout code using existing curve flattening and font tracing;
no third-party source or new runtime dependency is introduced.

The actual transformed contours feed the existing embroidery engine and all sewing
actions. The embedded baseline and glyph-source metadata do not become machine
commands and do not contribute to hoop bounds. An original independent path still
sews if left visible, which is why creation/attachment offers source hiding.
PES/PEC encoding, the corrected origin metadata, satin algorithms and graph travel
optimization are unchanged.

## Validation and limits

Pure tests check physical advances, rigid tangent orientation, counters, wrapping,
reversal, open-path overset, multiline rejection, affine frames, saved-source
validation and a baseline outside the hoop with valid lettering inside it.
Independent PES tests compare every needle coordinate in both stitch representations,
full dimensions, stops, colors and the origin invariant. Browser coverage exercises
creation, font families, real Node handles/insertion/deletion, attach/detach,
positioning, multiple sewing actions, Undo, autosave and portable projects.

This release supports **one text line per baseline**, using the same four generic
device font families as existing lettering. It does not add native machine fonts,
advanced script shaping, ligatures or automatic kerning. Glyphs are rigid, not
warped; tight bends or sharp baseline cusps can make neighboring letters overlap.
Use smaller lettering, suitable tracking, a smoother curve or separate text runs.
The copied baseline is not a live link to the original artwork. Baseline length
checks use advances; italic overhangs and physical fabric coverage still require
visual inspection and a test sew-out. Existing stitch diagnostics remain applicable.

Software checks are not a physical embroidery qualification. Test new lettering on
the intended fabric/stabilizer, especially small counters, tight curves and satin.
Further nondestructive effects, style transfer and repeat tools remain milestone 3
work; they are not claimed as complete in this release.
