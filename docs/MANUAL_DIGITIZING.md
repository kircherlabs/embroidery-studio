# Manual reference images and mirroring

## Import and digitize over an image

Import a PNG, JPG/JPEG or WebP using **Import / Open** or file drag-and-drop.
Choose **Use as Reference** to keep a raster image without tracing or stitches.
Choose **Automatically Trace** to use the existing vector tracing preview and its
color, filtering and simplification settings. The two workflows are separate;
reference import never automatically creates embroidery artwork.

References appear with an image icon and “Reference image · no stitches” in
**Objects**. They start centered, sized to at most 80 mm, 50% opaque and locked.
They are painted behind embroidery artwork in Design view. Ordinary canvas
clicks and box selection target artwork, so a background image is not selected
accidentally. Stitch preview shows actual machine instructions without images.

Select the image row, then choose **Edit reference · unlock** in Properties.
The normal canvas handles move, resize and rotate it. Proportional resizing,
Shift toggling, precise position/size/rotation fields, alignment, zoom, pan,
existing snapping and the Alt bypass all use the current workspace tools.
Opacity is a display setting. **Finish editing & lock reference** makes it safe
to draw over again; tree eye/lock controls remain available. References can be
renamed, duplicated, copied/pasted, deleted and organized in groups. Parent locks
must be released before editing descendants.

Use the existing Pen, Node, polygon, shape, running and satin centerline tools
to digitize over the image. Assign fill, border, column and construction operations
to the resulting vector objects as usual. Images themselves have no embroidery
method or operation stack. In a mixed selection, embroidery settings affect only
compatible embroidery objects, while unlocked image layers can participate in
intentional shared geometric transforms.

References never contribute needle movements, color blocks, jumps, trims, Design
Issues, or hoop-fit calculations. **Fit Design** and **Center entire design** use
embroidery artwork. **Fit Selection** can intentionally fit a reference selected
in the tree. A reference outside the hoop does not invalidate a stitchable design.

## Image storage and quality

Image bytes are embedded in the editable `.embstudio` project, under a shared
`referenceAssets` dictionary. Reference layers store an asset ID, an affine frame,
opacity and normal hierarchy/visibility/lock properties. A duplicate shares its
asset instead of embedding another copy. Clipboard transfer between projects
brings the needed assets; deleting the last use prunes the saved asset. Undo
restores the layer and image data together. No external image link is required.

The default **Keep original image bytes** preserves the uploaded PNG/JPEG/WebP
without re-encoding. **Reference image storage → Optimize** is an explicit choice:
it resizes to at most 2048 pixels on the longer edge and re-encodes JPEG at 90%
quality, or PNG for PNG/WebP. The dialog explains that the original is not embedded
after optimization. Stored dimensions and optimization status remain visible in
Properties. Original dimensions/byte count are retained as descriptive metadata.

Raster import is limited to 20 MB and 50 megapixels. Reference storage limits
the saved image to 12,000 pixels per edge; larger inputs require the explicit
Optimize option or resizing. Automatic tracing retains its existing pixel limit.
Embedded reference data is limited to 64 MB of base64 text per project, and project
files can be reopened up to 96 MB. Large originals may exceed browser localStorage
capacity; the save-status message and import notice direct users to **Save project**
for a portable backup. Large originals also reduce the number of Undo states retained
under the existing history memory budget. Optimization is useful for large references and mobile
workspaces. This does not add a pixel editor, cropping tool, or linked external files.

Asset payloads are excluded from the worker's digitizing input. The generator also
filters reference objects explicitly when called directly. Export continues to
receive machine events only. Tests verify identical PES bytes before and after
adding an off-hoop reference, including embedded machine preview graphics.

Existing projects remain readable. Projects containing the new reference-layer
type need v0.6.0 or later; the project version remains additive version 1.

## Flip artwork

Select an object, group or multiple objects and open **Arrange** below the canvas,
or right-click / Shift-F10 on the canvas. Choose **⇋ Flip Horizontal** or
**⇵ Flip Vertical**. The whole unlocked selection is reflected around its shared
bounds, preserving relative placement, IDs, parentage, source layer order and
manual sewing-order settings. Locked artwork stays protected.

To make a symmetrical design: draw one half, **Duplicate** (Ctrl/Command-D), flip
the duplicate, then reposition or align it. The original remains unchanged.
There is no additional permanent drawing tool or redundant duplication command.

Flips change actual rings and editable source frames. Smart Shape parameters,
Bézier anchor/control-handle relationships, open/closed state, rounded sources,
counters, winding relationships and local satin guides remain editable. Fill
angles are reflected with the artwork; physical spacing, thread colors, satin
width, compensation, underlay and operation stacks remain independent. Existing
manual command types/order are preserved, including positions carried by trims,
stops and end commands. Automatic routing can choose different safe travel paths
after geometry moves; a flip does not replace a user's manual object order.

**Live lettering requires confirmation.** The dialog explains that the letters
will read backwards or upside down. Confirming mirrors its editable source frame;
it does not flatten or discard text. Later text/font changes retain that frame.
Cancel makes no edit, and Undo restores the previous orientation.

## Regression coverage

- Node tests: reference data/transform validation, unchanged machine commands and
  statistics outside the hoop, deduplication and clipboard assets, deletion and
  persistence, Smart Shapes after arbitrary rotation/free scaling, nested groups,
  selection-wide reflection, Bézier controls, holes, satin guides, duplicate/flip,
  manual commands and regenerated embroidery methods.
- Independent PES tests: identical file bytes with/without reference assets;
  mirrored running-path coordinates, extents and orientation match both preview
  and decoded PEC/PES, including the corrected Brother origin metadata.
- Browser tests: actual PNG/JPEG/WebP file-input choices; visible canvas pixels;
  locked background drawing with rectangles and Pen; image move/resize/rotation,
  opacity keyboard control, visibility/lock, duplicate/delete/rename; real project
  download/reopen and browser reload; explicit optimization and unchanged tracing;
  Arrange/context-menu flips; imported nested SVGs with counters; Node handles;
  original-preserving duplication; lettering confirmation/font edits; mobile UI.

The established satin, construction, travel, SVG and machine-format suites remain
in the GitHub workflow. No PES/PEC exporter rewrite was made. Machine decoding is
software validation; physical embroidery quality still requires appropriate
fabric, stabilizer, thread and sew-out checks.
