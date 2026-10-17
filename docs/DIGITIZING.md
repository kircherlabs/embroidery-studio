# Digitizing and sequence planning

## Findings from the regression artwork

The original 96-path SVG imports as 95 fills and 96 running outlines. There are
only five actual paint colors, but source-order generation produced 70 color
blocks (69 single-needle thread changes), 35,782 stitches, 3,627 jumps and 1,702
trims. Of the sewing commands, 8,589 had identical start/end machine coordinates.
The timeline's 41,181 entries were **all commands**, not 41,181 sewing stitches.

With default preparation, the browser regression produces 15 color blocks, 14
manual changes, 13,868 penetrations (including 1,887 deliberate needle anchors),
1,887 jumps and 880 requested trims. Its actual PES round trip preserves all
13,868 penetrations in exactly the planned order; PES encodes 1,886 trim commands.
For comparison, exporting the original pipeline produces 36,360 penetrations,
4,954 jumps and 4,953 decoded trims. Counts can vary slightly with imported curve
sampling, size, settings and format. The test report distinguishes planned versus
decoded-file metrics rather than conflating them.

The source contains thousands of tiny disconnected contours, including specks
outside the main silhouette. They are not all generated travel errors. Each SVG
paint was previously made into an independent object; matching fill/stroke
paints caused the same boundaries to be sewn twice. SVG curve-flattening vertices
were also treated as needle points, and the stitch subdivider unnecessarily split
some already valid fill stitches. These inflated density and command counts.

## Pipeline and choices

1. Preserve editable source objects and their layer order. Planning is derived
   data; saving a project retains all original contours and digitizing settings.
2. Convert fill contours into independent filled components with explicit holes,
   respecting nonzero/even-odd rules. Boolean operations use the MIT-licensed
   polygon-clipping library on a 0.001 mm grid. If topology cannot be resolved
   reliably, keep the original scanline geometry and conservative source order.
3. Optionally omit disconnected positive islands below a user-visible diagonal
   size threshold (default 0.3 mm). Nested holes are retained, including small
   counters. Long thin details are not removed by an area threshold. Set the
   threshold to zero to retain small islands. Source vectors are never deleted.
4. Optionally skip matching same-color SVG fill-outline contours. New imports
   retain source association and stroke width, so thicker strokes remain. Legacy
   imports are recognized only by their generated SVG names plus coincident
   geometry. Unmatched stroke contours, different colors and intentional drawn
   running paths remain. Disabling the option restores the outlines.
5. Build precedence edges for actual fill intersections, compensated adjacent
   boundaries (including machine rounding), and conservatively for stroke
   intersections/unknown geometry. Manual stitch blocks are barriers.
   A deterministic topological scheduler favors the active thread and nearby
   compatible regions. It never accepts more color blocks than source order.
   This is a bounded heuristic, not a claim of globally minimal thread changes.
   More than 2,000 regions falls back to source order with a diagnostic.
6. Generate underlay and top fill per component. Underlay is omitted on very small
   components (under 1 mm across or 1.5 mm²) where it would mostly repeat needle
   penetrations. Pull compensation is capped relative to span width and adjacent
   gaps so a microscopic span does not become a large speck or close a counter.
7. Running stitches follow arc length with sharp corner retention and 0.04 mm
   flattening tolerance, rather than sewing every SVG sampling vertex. Generated
   penetrations are deduplicated **after** 0.1 mm machine quantization. Explicit
   manual commands and deliberate stationary needle anchors are retained. Long
   movements stay within the machine limit.
8. Travel between disconnected regions is a jump. Fill-row connectors are checked
   at every contour crossing so a narrow hole cannot hide between fixed probes.
   Long jumps request trims; locks/tacks follow existing sewn paths around breaks
   rather than creating new arbitrary geometry. Empty/unsewable units cannot
   introduce phantom color changes. A jump destination receives a deliberate
   needle-down anchor before sewing away: a positioning jump alone does not put
   the needle through the fabric. Anchors are labeled in the preview and counted
   separately from redundant zero-distance commands. Separate manual blocks get
   a positioning jump.

Overlapping fills are not globally subtracted: doing so without a controlled
overlap allowance can create fabric gaps, break underlay support, or change the
intended construction. Coincident SVG outlines and repeated penetrations are
addressed here; real overlaps remain in their original layer order and are
reported. Fabric-specific overlap compensation and more advanced contour-routing
optimization remain future work.

## Preview and formats

Solid colored lines are sewing movements. Dashed blue lines are jumps. Optional
crosses mark trims and rings mark color changes; the command track always shows
jump/trim/color ticks. Nonmovement commands never relocate the drawing cursor.
The summary distinguishes unique thread colors, actual color blocks, estimated
manual thread changes, jump count, trim count, thread path and time. Time is an
estimate, not a hardware promise.

After machine export the preview displays commands decoded from the actual file.
The proven pyembroidery PES/PEC writer can insert stationary needle anchors at
jumps and encode travel with trim flags. These remain visible and counted in the
decoded preview. Tests require every planned penetration in order and reject any
added moving sewing command; format-required stationary anchors are allowed.
Do not delete them merely to make the displayed count smaller. Firmware can
interpret trim requests differently; a physical sew-out is still necessary.

## Practice and validation references

- [Ink/Stitch lock stitches](https://inkstitch.org/docs/stitches/lock-stitches/):
  tack/lock placement around blocks, jumps and trims.
- [Ink/Stitch workflow](https://inkstitch.org/docs/workflow/): SVG stack order,
  preparation, and jump travel between separated objects.
- [Ink/Stitch fill tools](https://inkstitch.org/docs/fill-tools/): treating compound
  fills, counters and components as geometry rather than blindly joining paths.
- [polygon-clipping](https://github.com/mfogel/polygon-clipping): boolean geometry
  implementation and documented ring rules. No Ink/Stitch code is copied.

`tests/planning.test.mjs` checks layer dependencies, reversible options, tiny holes,
long details, duplicate outlines, arc-length spacing, rounded coordinates, narrow
travel gaps, manual positioning and preview command semantics.
`tests/digitizing-browser.mjs` uses the exact unchanged artwork, exercises controls
and validates that the source is untouched. `TEST_MACHINE=1` additionally verifies
the actual browser PES conversion and decoded penetration order.
