# Smart image import and palette reduction

## Workflow

Import PNG, JPEG or WebP, then choose **Use as Reference** for a locked,
non-stitching image layer, or **Automatically Trace** for editable vector artwork.
References retain their existing workflow and do not contribute to embroidery.

The trace dialog keeps all detected colors and the background by default.
**Detailed Colors** starts with a modest maximum of 16 clusters; **Reduced Colors**
offers 4, 6, 8, 12 or a custom maximum. Both support 1–128 clusters. Actual detected
counts may be lower when an illustration contains fewer distinct colors.

Each palette row shows its original area and an independent retention checkbox:

- Uncheck a shade to merge its pixels into the closest retained CIELAB color.
  The arrow shows the result. Choose another retained target explicitly if needed.
  Removing a target recalculates automatic mappings. One color must remain enabled.
- **Make transparent** deliberately removes every area of that source color,
  including foreground details. It is separate from merging and can be restored
  or reversed with **Undo palette edit** before import.
- **Background** proposes only border-connected regions of a detected or manually
  chosen color. Red marks the proposed removal; confirmation is required. Enclosed
  foreground details of the same color remain. Cancel keeps the background.
  Confidence describes border coverage, corners and connected area; it is a
  geometric heuristic, not semantic recognition of a patch versus a background.

Desktop previews remain beside the settings while scrolling. Smaller screens use
a compact comparison above the controls. Large palettes scroll independently and
sort by area, lightness or hexadecimal value. Enter activates the primary action
when ready; Escape cancels without touching the project; Space toggles checkboxes.
No preview can be imported while a newer calculation or background approval is pending.

## Geometry and processing

`image-colors.js` uses a weighted 32,768-bin RGB histogram, D65 CIELAB clustering,
deterministic farthest seeds and weighted refinement. Seed distances are cached;
rare occupied bins are not discarded from training. Palette edits reuse detected
labels. `trace-worker.js` performs quantization and geometry processing outside
the UI thread, debounces requests and rejects stale results. It processes at most
one running request plus the latest pending revision.

Remapping happens **before boundary tracing**, so adjacent colors merged into one
thread produce consolidated contours without an internal sewn boundary. Holes and
disconnected regions remain in normal editable objects. Minimum-area filtering
reassigns tiny color islands to a touching color rather than punching transparent
holes. Isolated details with no opaque neighbor are retained.

Shared color edges are protected during simplification and smoothing. Exposed-edge
smoothing is limited to subpixel distances; it does not round a whole rectangle
by a quarter of each long edge. New crossings, collapsed winding or invalid hole
geometry fall back to exact contours. Existing drawing, Node, Sculpt, Knife,
Eraser, Boolean and embroidery methods continue using the same vector model.

Processing resolution is 192, 384, 640 or 1024 pixels along the longest edge, up to
one megapixel. Higher color counts are allowed; complex results show a performance
notice and excessive node counts request lower resolution, fewer colors or filtering.
A 450,000-node trace guard leaves room under the project's geometry limit.

## Revisions and storage

Select the imported parent and open **Artwork → Image tracing reference →
Colors & tracing**. Choose:

- **Palette only:** the default. Recolor matching traced paints while preserving
  actual edited geometry, per-action overrides in unrelated colors, settings,
  visibility and sewing order. The preview uses the existing edited artwork.
  Geometry/background controls are disabled with a clear explanation.
- **Create a revised trace:** keep the original edited version and add a new,
  consolidated vector trace fitted within its current bounds without stretching,
  retaining center and shared orientation. Resize it on canvas afterward.
- **Replace this trace:** requires explicit confirmation that geometry and sewing
  actions will be replaced. Locked artwork must first be unlocked. Undo restores
  the prior group. Shared-axis orientation is retained; mixed axes use canvas bounds.

The original PNG/JPEG/WebP bytes are embedded in the parent group's `imageSource`
by default. Original quantization, mappings and approvals are in `traceSettings`;
non-geometric recolor revisions use `paletteSettings`, preserving the original
background-removal and contour decisions.
Project version 1 and older tracing projects remain readable. Older projects can
only retrace the source they already stored; lost original resolution cannot be recovered. An explicit source
storage option creates a 2048-pixel PNG instead and states that original bytes will
not be stored. Processing resolution never silently replaces the original source.
Sources are limited to 50 megapixels and 12,000 pixels per stored edge; larger edges
require the explicit optimized-storage choice. Embedded trace/reference data share
a 64 MB validation budget. Large original files can exceed browser autosave capacity;
save an `.embstudio` backup. Undo history retains its existing memory budget.

Image sources/settings are excluded from stitch-worker messages. Reference images,
source bytes and trace UI metadata cannot become needle commands or machine bounds.
New regions use ordinary tatami defaults; no automatic satin-column conversion is added.

## Export defaults and drawing corrections

The export dialog preselects PES for the exact SE700 profile and remembers each
successfully exported choice separately per machine/hoop profile. Other app formats
remain available for conversion. Generic hoop profiles explicitly lack model-specific
verification. `export-preferences.js` holds exact-model records rather than inferring
compatibility from manufacturers. Brother lists PES, PHC and DST for the
[SE700](https://support.brother.com/g/b/sp/faqend.aspx?c=us&faqid=faqh00100271_002&ftype3=2103&lang=en&prod=hf_se700eus);
this application exports PES/DST, while PHC is not offered. Other formats show a
compatibility notice for this model. The prior PEC-origin repair was independently
stitched; current exports remain software-validated, requiring physical sew-outs.

During Closed Shape, Running Stitch, Satin Line, Manual Stitch or Bézier Pen
construction, Ctrl/Cmd+Z removes one pending point and Shift+Ctrl/Cmd+Z restores it.
Backspace or the contextual Undo-point button also removes the last point. Empty
drafts stay in the drawing session and cannot consume project history. New point
placement clears draft Redo. Completing or canceling returns to normal project Undo.
Two-finger navigation restores the previous draft and its point history.

## Validation and limits

`image-colors.test.mjs` tests white/black/transparent/uncertain backgrounds,
same-color enclosed foreground, exact opaque coverage, perceptual/manual merges,
last-color protection, deliberate transparency, holes, shared-edge geometry,
island reassignment, 4/6/8/12/24/32/64-color stitch plans, one-megapixel processing,
source/settings persistence and per-model export defaults.

`smart-import-browser.mjs` tests the real 10→5 workflow, PNG/JPEG original bytes,
background proposal pixels and confirmation, palette-only/revised/confirmed
replacement, palette Undo, keyboard actions, 12/24/32/64-color imports, mobile
scrolling/sorting, save/reload and every independently decoded PES needle, color
change and origin. `draft-undo-browser.mjs` covers exact anchors/handles, touch,
zero-point edge cases and completed project history across five drawing tools.
All existing browser and codec checks remain in deployment CI.

Palette-only revisions deliberately do not union manually edited contours; choose
a revised trace for consolidation. Detection is intended for logos/flat artwork,
not photographic embroidery. Backgrounds with several dissimilar colors may need
multiple deliberate transparency decisions. Software tests do not prove physical
stitch-out quality or validate other machine models.
