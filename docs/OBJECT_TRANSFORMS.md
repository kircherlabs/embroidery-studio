# Object-aligned selection and transforms

## Controls

Select artwork, then open **Properties → Position, size & rotation**. Reference
images expose the same controls in their existing properties section.

- **Transform orientation: Object** follows the artwork's stored axes. Side
  handles change local width or height; corners change both. The opposite handle
  stays anchored. Corners keep proportions by default; Shift toggles this choice.
- **Alt-drag a resize handle** scales about the selection center and bypasses
  snapping. Ordinary movement still uses Alt to bypass snapping.
- **Canvas** retains horizontal/vertical resizing. Switching modes changes only
  the cage and control axes, without changing artwork, stitches or history.
- Width and height follow the chosen axes. Center X/Y remain world positions in
  millimeters. Numerical scaling and rotation use the selection center.
- **Rotate selection by** remains a relative angle in degrees. The current local
  axis angle appears above it in Object mode; **Reset rotation** rotates that axis
  back to horizontal. Dragging the rotation handle uses the same center; Shift
  snaps rotation to 15-degree increments.
- Object/Canvas is remembered on this browser, separately from project data.

Groups whose editable descendants share parallel local axes use a shared rotated
cage. Mixed orientations fall back to Canvas, with an explanation in Properties.
Locked descendants stay protected. Hidden descendants still transform with their
selected parent and contribute to its frame, while their source overlays remain
hidden. Grouping and ungrouping do not bake or reset geometry.

## Architecture and compatibility

The old renderer and pointer resize code always used world-axis bounds. Editable
shapes, Bézier curves, lettering, path lettering, references and manual satin
rails already retain affine source frames; imported polygon rings did not retain
their SVG orientation.

`src/transform-box.js` projects actual world geometry onto a stable orthogonal
basis. The renderer, handles, hit testing, cursor, numerical fields and resize
calculations share this basis. Local scaling extends the existing
`transformSelection` with `R(axis) × Scale × R(-axis)` around the chosen anchor.
The same matrix updates world rings, manual commands and existing source frames
once. No alternate geometry pipeline is introduced.

An optional normalized `localAxis: [x, y]` stores orientation, not another geometry
transform. It follows the existing `sourceTransform` pipeline and survives
detaching editable sources. Existing framed artwork recovers its axis from its
source frame. SVG imports retain the first transformed axis, including nested
rotation/reflection, before their usual uniform fitting. Geometry is not transformed
twice. Old projects remain version 1 and require no mandatory migration.

Pointer transforms restore original rings, orientation, BOTH rail frames and
operation guides before each sample. The previous implementation omitted rail
frames, allowing successive pointer moves to compound them. Completed drags still
produce one Undo step; Escape restores the pre-drag project. Stitch regeneration
remains deferred until completion. Hover cursors reuse the rendered frame rather
than traversing a dense contour on every pointer event.

Hoop validation continues using actual generated stitch/jump bounds. Located
Design Issues now identify offending objects/actions and count outside machine
positions. Reference images, cages, handles and source guides cannot cause those
issues. No stitch-generation algorithm or machine-file writer is changed.

## Deliberate limits

- Legacy unframed polygon projects cannot reveal a rotation that was previously
  baked into their points. They start with horizontal axes and retain subsequent
  rotations; the frame is never guessed from their contour.
- Groups have hierarchical membership, not persistent affine frames. Shared leaf
  axes are supported; mixed groups use Canvas instead of inventing an angle.
- A skewed imported SVG or unequal Canvas scaling may have nonorthogonal source
  axes. Its cage is an orthogonal projection aligned with its retained x axis,
  not a skew-editing parallelogram. Object resizing itself does not add shear.
- Pivots are center-based rotation/numerical scaling and opposite-handle or
  Alt-center resizing. Custom pivot handles are outside this update.
- A reflected x axis can read 180 degrees; Reset rotates it horizontally while
  retaining reflection. Use Arrange's existing flips to change reflection.

## Validation

`tests/transform-box.test.mjs` verifies angles 0/30/45/90/175 degrees, exact cage
corners, fixed anchors, local side scaling without shear, proportional/center
scaling, cursor direction, Canvas parity, mixed/shared group axes, ungrouping,
mirroring, source-frame regeneration, Bézier handles, satin rails/guides, path
lettering/counters, manual command identity, persistence and located hoop issues.
Numerical comparisons use 1e-7 mm; adaptive curve flattening is compared against
segments within 0.08 mm rather than assuming unchanged sample counts.

`tests/transform-browser.mjs` uses real mouse/touch input and actual canvas pixels.
It covers a reconstructed Cuban flag, rotated handles, local/numerical resize,
Canvas switching without regeneration, rotation/corner/center pivots, cancellation,
Undo/Redo, saved projects, preference reload, nested mirrored SVG holes, multiple
angles/zoom/tablet viewport, rail frame restoration and Node editing, hidden group
members, and mixed selections. It independently decodes exported PES instructions
and checks each stitch against the generated plan at PEC's 0.1 mm precision.

Ignored `test-results/transform-cuban-flag-object.png`,
`transform-cuban-flag-canvas.png`, `transform-touch.png` and
`transform-pixel-report.json` capture the browser evidence. Existing browser suites,
unit tests and Python export tests remain part of the deployment checks. Physical
SE700 sew-outs are still required to evaluate fabric/thread behavior.
