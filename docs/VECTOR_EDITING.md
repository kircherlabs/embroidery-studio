# Drawing and vector repair — 0.9.0

This completes drawing/editing milestone 1 of the [workspace audit](WORKSPACE_MILESTONES.md).
It adds editable artwork tools; it does not convert drawings into irreversible
needle commands. Existing sewing actions regenerate from the edited geometry.

## Draw and reshape

- **Pencil** in the drawing rail captures mouse, stylus or single-finger strokes.
  Adjust **Smoothing · mm** above the canvas, then **Finish path**. **Closed fill**
  deliberately closes the trace and uses the existing drawing-style default.
  Open paths start as Running Stitch and can use Satin Centerline. Closed areas
  can use fill, border or column methods through Embroidery.
- Smoothing simplifies captured points and fits cubic handles, checking local
  overshoot against the original trace. It is an approximate physical fitting
  tolerance, independent of display zoom. Capture samples at about one screen
  pixel; zoom in for tiny details. Long strokes stop at 6,000 captured points
  with a notice; fitting refuses more than 1,800 anchors instead of freezing.
- A stroke stays pending until Finish. Completing another valid stroke finishes
  the preceding one. Cancel discards the pending stroke. A second touch switches
  to navigation and cancels the current gesture without adding artwork.
- **Node (N)** still moves anchors and handles and adds an anchor by double-click.
  Pull between handles to sculpt a cubic segment. Smooth nodes retain aligned
  tangents; symmetric nodes also share handle length; corner handles are
  independent. These modes are in Artwork → Bézier node controls.
- Imported polygon contours use **Sculpt reach · mm**, a local arc-length
  influence that leaves other contours unchanged. Drags that invalidate an area,
  merge islands or lose counters are rolled back. Zoom in when dense anchors
  make a segment hard to grab. Delete still removes the selected node.
- **Shapes** expands Rectangle, Ellipse, Regular Polygon, Star and Eyelet. Their
  existing parameters remain editable until an explicit vector conversion.

## Cut, erase and repair

Select artwork in Objects first. Group selection applies cuts/erasures to its
editable visible descendants. Locked/hidden artwork, references and manual
needle commands are protected. Node sculpting targets one selected leaf.

**Knife** supports two modes:

- **Split regions / open paths:** drag a straight line completely across a closed
  region. Boolean intersection makes independent closed pieces, preserving holes
  and islands. Open paths split where the finite cutting line crosses them.
- **Split contours into open paths:** cuts a single closed contour into open
  editable arcs. Clicking near a path also splits at that location. Compound
  contours with counters use area splitting instead of ambiguous path joins.

**Eraser** has a physical brush width in millimeters:

- **Erase area** subtracts a round brush from closed geometry, including making
  holes or independent islands. A click makes a circular cutout.
- **Erase line segments** removes brushed sections and keeps the remaining
  cubic subcurves. Separate pieces get actual jumps between them, not sewn
  connectors across the erased space.

Node and Knife expose **Path repair** above the canvas:

- **Split at selected node** opens a closed contour or divides an open path.
- **Close path** adds a closing segment deliberately and updates applicable
  running/centerline actions. **Reverse path** reverses anchors and tangent handles.
- **Join two paths** uses the nearest endpoint pair within the chosen **Join gap**.
  It creates an explicit bridge across a nonzero gap. Paths must be open, have
  one contour and share a parent. Different sewing settings require **Use first
  path's sewing actions**; otherwise joining is refused. The first object in
  source order supplies the retained identity and actions. Review path direction.

## Sewing actions and data integrity

Pieces inherit independent copies of all sewing actions and colors. Cutting an
area with a satin border gives each resulting piece its own border, including
the new cut edge. Construction stops repeat per piece. Review construction and
sewing order after dividing artwork; linked patch boundaries are protected
because splitting them would require rebuilding manufacturing dependencies.

Open results cannot carry fill or closed-boundary actions. The explicitly labeled
**Convert incompatible actions on open pieces to Running** option is required
before those actions are replaced with running outlines. Compatible actions and
machine commands keep their settings. Without consent, the entire edit rolls back.

Cuts and erasures retain parent membership, manual sequence positions and linked
decorative-artwork references. Tiny fragments are retained and reported; the
existing Small islands stitch filter is separately configurable. Invalid or
self-intersecting filled boundaries explain why repair is required.

Vector conversion of a Smart Shape or text is destructive to its parametric/font
source and is stated in the tool dock. Undo restores it. Normal drawing, moving,
font editing and saved older projects retain their existing behavior. Every edit
uses the current history, autosave and portable project format.

## Precision, testing and remaining work

Cubic point splitting uses De Casteljau subdivision, preserving the exact curve.
Line/brush intersection location uses adaptive subdivision with approximately
0.005 mm local parameter-interpolation tolerance. Brush Boolean geometry uses
Clipper's 0.001 mm integer grid; point erasing uses a 40-sided circular brush.
Area Boolean results are editable polygon contours, rather than reconstructed
parametric shapes. Rejoining or closing paths can introduce self-intersections;
the existing construction preflight and stitch diagnostics still apply.

New tests cover organic tracing, cusps, local sculpting, endpoint modes,
transformed cubics, concavity, counters, disconnected islands, invalid contours,
cuts, joins, erasure gaps, operation preservation and bounded sewing commands.
The browser workflow exercises locked references, mouse/touch drawing, pinch
cancellation, real cuts/erasures/repairs, Undo/Redo, manual sequencing, save/reload,
five viewports and independent PES decoding against every preview needle point.
The existing engine, satin, routing, tracing, project and PES regression suites
remain in the release checks. No engine or exporter algorithm was replaced.

Two independent manual satin rails, variable-width rail correspondence and
hollow-ring seam tools were added in **milestone 2 / 0.10.0**; see
[Manual satin rails](MANUAL_SATIN.md).
Text on paths, additional nondestructive effects, style transfer and linked/repeat
tools are **milestone 3**. Existing satin direction guides remain available.
Physical SE700 sew-outs of newly edited designs are still required: software
geometry and file validation do not establish fabric coverage or tension quality.
