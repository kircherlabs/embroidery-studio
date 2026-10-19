# Embroidery Studio

A free, browser-based embroidery workbench for drawing, digitizing and inspecting
machine embroidery. Designed around the **Brother SE700's 100 × 100 mm field**.
No account, paid service, design upload or backend required.

**[Open the studio](https://kircherlabs.github.io/embroidery-studio/)**

This is an early, functional release. It covers the complete artwork → stitches →
simulation → machine file workflow. It is not yet a replacement for every feature
in a mature commercial digitizing package. Test sew-outs on scrap fabric; the
software has been tested in browsers and through independent file decoding.
The PES origin repair matches a file verified by the owner on a physical SE700;
new exports and sew-out quality still need machine testing.

**Drawing style** sets the stitching for newly drawn closed shapes. To change
existing artwork, select its objects or SVG group, choose a style, and click
**Apply to selected artwork** in the same popup. Multi-step replacement requires
confirmation; Undo restores previous operations. Locked objects, reference images,
manual stitches and linked patch boundaries are protected, and incompatible open
paths are explained. The drawing default is remembered on this device.

Active path controls (point count, Closed fill, Finish and Cancel) are docked above
the drawing surface. They never float over artwork. The Objects panel displays
the colors of enabled sewing operations; multicolor stacks have striped swatches
instead of showing the source artwork's original paint.

Rounded satin borders, centerlines and stroke columns preserve spacing on the
outer rail of bends. Running outlines follow rounded curves; tight turns report
located Design Issues. See [corner coverage and validation](docs/CORNER_DENSITY.md).

## Properties and construction

Properties now has one **Embroidery** section. Ordered sewing-action cards keep
each action's method, independent thread color and stitch settings together.
Expand a card to edit it; **Advanced** holds underlay, compensation, ties, contour
controls, corner optimization and action naming. **Add another sewing action**
creates an extra pass without duplicating artwork. Changing the method updates
the existing action. **Sewing presets** offers outline/fill combinations without
a second permanent method dropdown. Bulk scope is explicit for SVG groups and
multiselections; it preserves individual action lists and colors.

**Artwork** separately holds names, geometry, lettering and transformations.
Choosing fill or border on an open path offers an explicit, reversible closure
when the geometry forms a valid region; unsuitable lines explain the required
node edits. Existing projects keep their operations and settings unchanged.

**Construction presets** checks the fabric boundary before replacing any steps.
For an illustration, create a surrounding rectangle, rounded rectangle, circle or
oval patch. One editable boundary sews preparation, then the original decorative
objects, then finishing. It does not turn every illustration region into a separate
fabric piece. Manual fabric-piece construction remains available after preflight.

**Design Issues** distinguishes errors, warnings and notices and locates affected
artwork/steps. Invalid steps preserve the rest of the preview but block export
until repaired or explicitly disabled. See [Properties audit and construction
workflow](docs/PROPERTIES.md) for applicability, testing and limitations.

## Manual references and flipping

Raster import now offers **Use as Reference** or **Automatically Trace**. References
are separate locked background layers with opacity, canvas transforms and shared
embedded image data. They never sew, export, or affect hoop fit. Select an image
in Objects and choose **Edit reference** to reposition it, then lock it and draw
over it with the existing tools.

**Arrange** and the canvas context menu include **Flip Horizontal / Flip Vertical**
for selected artwork, groups, Bézier paths and manual stitches. Live lettering
asks before mirroring and stays editable. See [manual digitizing and image storage](docs/MANUAL_DIGITIZING.md)
for controls, quality choices, project limits and validation.

## Stroke-following satin lettering

New Satin column steps follow individual letter strokes with variable-width rails,
branch sections, curve-aware spacing, center underlay and local direction guides.
Expand a Satin column action in **Embroidery → Satin column construction** to inspect rails, edit
cross-stroke guides, or choose the legacy directional mode. Unsuitable regions
report an explicit tatami or unsewn fallback. Text and fonts remain editable.
See [satin construction, validation and limits](docs/SATIN.md), including the
remaining physical SE700 sew-out checks.

## What works

- SVG vector import (including transforms and holes), PNG/JPG/WebP references or color-region
  digitizing, and existing PES, PEC, DST, EXP, JEF, VP3 and XXX stitch imports.
- Fill polygons, rectangles, ellipses, running paths, constant-width satin
  centerlines, lettering/monograms, and direct needle-point placement.
- Node editing, precise position/size/rotation, thread colors, object visibility,
  stitching order, duplication and deletion.
- Imported SVG parents and nested groups in an expandable artwork tree;
  project/group/region multiselection, grouping, locking, isolation and undo.
- Clear selection boxes and eye toggles, touch-friendly tree rows, drag grips in
  both the artwork tree and complete-object sewing strip, and persisted manual
  sewing order with an explicit Automatic/Manual switch.
- Optional hover/focus descriptions controlled by **Hints: On / Off**.
  The compact Machine & hoop panel sits above the canvas.
- Resizable Objects, Properties and Sequence panels, a temporary canvas maximize
  mode, saved workspace layout and an adaptive scrolling tool rail.
- Mouse/trackpad/touch navigation, fit/center commands and contextual alignment,
  size matching and drag guides that preserve physical stitch settings.
- Shared canvas resize/rotation handles, proportional scaling, box selection,
  bulk editing with mixed values, alignment/distribution, grid snapping and
  touch zoom/pan.
- Ordered operations sharing source geometry: placement, inset tackdown,
  appliqué stops, satin borders, offset/basting outlines, bean and triple runs,
  tatami stagger patterns, registration marks and configurable ties.
- Running stitches, angled/staggered tatami fill, satin zigzags, light underlay,
  row spacing, stitch length and pull compensation.
- Individual stitch/command editing, including jumps, trims and stops. Vector
  objects can be converted to editable stitches; Undo restores their vector form.
- SE700 and larger machine profiles, hoop boundary checks before **and after**
  file conversion, bounded segment lengths and 0.1 mm coordinate quantization.
- A slicer-inspired simulator: playback, timeline scrubbing, stepping, click-to-
  inspect needle positions, color blocks, jumps and underlay visibility.
- **PES v6**, PEC, DST, EXP, JEF and VP3 export using pinned pyembroidery. The
  simulator switches to commands decoded from the exported bytes after export.
- Editable `.embstudio` project files, browser autosave, undo/redo and a responsive
  desktop/mobile interface with collapsible side panels.

## Quick start

1. Open the studio. The wildflower example is ready to inspect and export.
2. Use **Import / Open** for artwork, machine files or saved projects. Or choose a
   drawing tool. For paths, click points and press **Enter / Finish path**.
3. Select an imported SVG parent and drag its corner handles to resize it.
   Expand the tree to edit regions. Shift-click to multiselect and bulk-edit
   settings; mixed values stay blank until you apply a new value. Layer order
   stays in the tree; actual optimized sewing order appears in the preview.
   Add independent operations in the inspector, or use the appliqué recipe on
   closed patch shapes. Read the [editing and operation guide](docs/EDITING.md).
4. Open **Stitch preview**, scrub or play the sequence, and enable **Display → Jumps** to
   inspect travel. Click a stitch or color block to inspect its position.
5. Choose **Export → PES** for the SE700. The first conversion loads its local
   WebAssembly engine. Save the file to your usual machine transfer medium.
6. Save a **project file** to keep the editable artwork and parameters. PES is a
   machine stitch file and cannot restore the original vector editability.

On mobile, the two list buttons above the canvas toggle Objects and Properties.
Turn **Hints: On** to see hover/focus descriptions, or hold a control on touch.
**Hints: Off** hides all popups. Ordinary clicks/taps work in either state; the
preference is remembered on this device. **?** opens the workflow guide and shortcuts. Zoom with the canvas
buttons or a mouse wheel; pan with the hand tool or Space-drag.

## Run locally

Node.js 20+ is sufficient; the application has **no build/runtime npm packages**.

```sh
node scripts/serve.mjs
# Open http://127.0.0.1:5173
```

Serve over HTTP; ES modules and workers cannot run correctly from `file://`.

```sh
node --test tests/*.test.mjs
python tests/test_codec.py
node scripts/build.mjs
```

Python 3.10+ is used only for native codec tests, including the independent PES
tests invoked by the Node suite. Set `PYTHON` to its executable if `python` is not
on PATH. The vendored ZIP imports directly, so no pip installation is needed.
The build copies runtime assets into `dist/`.

Optional browser integration (run the local server in another terminal):

```sh
npm install --no-save playwright@1.56.1
npx playwright install chromium
node tests/browser.mjs
node tests/svg-browser.mjs
node tests/digitizing-browser.mjs
node tests/travel-browser.mjs
node tests/editor-browser.mjs
node tests/ux-browser.mjs
node tests/workspace-browser.mjs
# Include the actual CDN/WASM export/import path:
TEST_MACHINE=1 node tests/browser.mjs
TEST_MACHINE=1 node tests/digitizing-browser.mjs
TEST_MACHINE=1 node tests/travel-browser.mjs
TEST_MACHINE=1 node tests/editor-browser.mjs
# Hardware-verified PES fixture through the actual browser/Pyodide exporter:
node tests/pes-browser.mjs
```

On PowerShell, use `$env:TEST_MACHINE='1'` before the test command.
`STUDIO_URL`, `BROWSER_CHANNEL` and `PLAYWRIGHT_MODULE` support other test setups.
The test checks editing, history, playback, lettering, safe SVG import, counters,
manual stitches, saving/reloading and a touch-sized viewport. Screenshots go to
ignored `test-results/`.

The SVG regression suite includes the unchanged 96-path user attachment. It
checks compact path syntax, temporary geometry lifecycle, transforms, empty and
degenerate elements, independent fill/outline points, and the actual file-input
workflow. It compares normalized paths with native SVG geometry and rasterizes
both the original artwork and imported fills to detect geometry or color loss.

## Creative editing

Selection-first canvas editing, parametric shapes, Bézier handles, live lettering,
reference alignment, eyelets, construction templates and repeatable image tracing
are available in v0.3. See [creative workflows and limits](docs/CREATIVE_EDITING.md).

## GitHub Pages

`.github/workflows/pages.yml` tests and builds every push to `main`, then uploads
and deploys `dist/` with the official GitHub Pages actions. Pull requests run tests
and builds without publishing. No deployment secret is needed. For first-time
setup, select **Settings → Pages → Source → GitHub Actions**. Subsequent updates
publish automatically after checks pass.

All runtime asset URLs are relative, including worker/codec paths, so the studio
works under the repository subpath `/embroidery-studio/`.

## Privacy, formats and present limitations

Open **Objects → Digitizing & sequence** to control safe color grouping, matching
SVG outline suppression and small-island handling. These settings change derived
stitches; the artwork remains editable. The list shows artwork layer order, while
the preview timeline and expandable **Object sewing order** show generated sewing
order. Each source object is completed before the next. Disable grouping to use
exact layer order, or select **Keep sequence position** to pin an individual
object while others are batched. Small holes are preserved.
Use **Events** and **Jumps** to inspect trim/color markers and travel. The summary
shows color blocks, estimated manual thread changes, jumps and trims. Read
the jump breakdown for initial positioning, between-object, between-region and
internal travel. Decoded file counts report actual encoded commands without
guessing source-object boundaries. See
[digitizing practices and limits](docs/DIGITIZING.md) for the measured root causes,
algorithm choices and format behavior.
See [Brother PES compatibility](docs/PES_COMPATIBILITY.md) for the origin-prefix
repair, independent decoding tests and remaining physical-machine validation.

Artwork and stitch conversion stay on your device. Autosave uses localStorage;
save a project file for a portable backup. Core editing loads from this site.
Machine conversion lazily downloads pinned Pyodide 0.27.7 from jsDelivr. Network
access is required on first conversion; this release is not a fully offline PWA.

Image digitizing targets flat artwork, not photographic embroidery. Satin columns,
borders and centerlines are separate operations. Stroke-following columns preserve
counters and split overly wide spans; difficult junctions and fonts can require
manual region/direction refinement or an explicit fallback. SVG filters,
clipping, masks, symbols, CSS style sheets and text should be expanded to plain
paths before import; unsupported content is skipped with a notice. Underlay and
pull compensation are intentionally simple and documented in
[engineering research](docs/RESEARCH.md).

DST/EXP lack embedded thread palettes. Other formats may quantize colors, trims,
stops or jump commands. Inspect the decoded export preview. Machine firmware can
interpret these commands differently. Selecting a larger profile never enlarges
the SE700's physical field. Designs are limited to 250,000 commands, projects to
1,000 objects and 500,000 input points. Fabric behavior, thread tension, stabilizer
and sew-out quality cannot be guaranteed by a screen preview.

## Architecture and license

Small ES modules separate the project model, pure stitch engine, importers,
canvas renderer, interface and machine codec. Both stitch generation and Python
conversion run in workers. See [research and extension seams](docs/RESEARCH.md).
The hierarchy references the original flat region array; ordered operations
expand only after whole-object planning. Existing format-v1 projects remain
readable. See [editing architecture and limits](docs/EDITING.md).

MIT licensed. pyembroidery is vendored under MIT with its license. Pyodide loads
unmodified under its own license. No Ink/Stitch GPL code is copied. See
[third-party notices](THIRD_PARTY_NOTICES.md).
