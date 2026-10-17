# Engineering research and choices

Research performed October 17, 2026. Primary sources:

- [pyembroidery](https://github.com/EmbroidePy/pyembroidery): MIT, pure Python,
  multiple readers/writers, command normalization, PES v6 custom thread table.
  Reused unchanged at a pinned commit for format conversion. Vendoring its small
  Python package avoids a package-install request on every launch. Runs inside a
  lazy Pyodide worker; there is no Python server or paid API.
- [Ink/Stitch](https://github.com/inkstitch/inkstitch) and its
  [stitch documentation](https://inkstitch.org/docs/stitches/): strong SVG workflow,
  underlay and routing. Its desktop Inkscape/Shapely integration is not a small
  browser dependency. GPL source was not copied. Our original fill implementation
  uses rotated scanlines, winding/even-odd intersections, alternating row direction
  and staggered penetrations; interrupted spans use jumps instead of sewing through
  counters. Routing is deliberately conservative, with more trims than a mature
  contour-routing optimizer.
- [EmbroideryIO](https://github.com/EmbroidePy/EmbroideryIO): MIT Java port of
  pyembroidery. Confirms the usefulness of a normalized machine command model;
  Python is easier to reuse unchanged in a browser than maintaining another port.
- [Brother SE700 product specification](https://www.brother-usa.com/p/sewing-embroidery/SE700):
  100 × 100 mm embroidery field. The profile uses a conservative 7 mm stitch
  generation limit and 400 stitches/minute for an approximate time estimate.
  Time estimates include allowances, not a guarantee of machine speed.
- [Pyodide workers](https://pyodide.org/en/0.27.7/usage/webworker.html): isolate the
  Python runtime from interactive canvas/editor work.
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages):
  official Pages artifact/deploy actions with minimal permissions.

## Data and correctness

Editable source geometry is in millimeters with the hoop center as origin and
positive Y downward. Machine commands retain this coordinate orientation.
Quantization is at 0.1 mm, matching the codec's embroidery units. Long stitches
are subdivided with allowance for coordinate rounding. Generation is deterministic.
PES contains stitch data; it does not preserve studio editability. Projects do.

Every exported file is immediately decoded using the same vendored library. The
preview then uses those decoded commands, showing any normalization, trim or
palette changes introduced by the format. This is a software round trip, not
independent hardware certification. Physical SE700 sew-out validation is still
required. DST and EXP do not preserve the studio thread palette. PES/PEC trims
and stops may be interpreted differently by firmware.

## Honest boundaries of the initial release

- Auto-digitizing is flat-art color quantization plus boundary tracing, not
  photo-realistic stitch painting. Images are reduced to at most 160 pixels on
  their longest edge and 2–10 thread regions. Border background removal is optional.
- Satin uses a centerline with constant width. It is not a dual-rail satin
  auto-router. Sharp corners and very wide columns need manual refinement.
- Fill underlay is a light perpendicular scan; satin/run underlay follows the
  centerline. Fabric-specific underlay recipes and true geometric offsets are
  future work. Pull compensation extends fill-row ends and satin width.
- SVG supports basic path/shape geometry, transforms, solid fill/stroke paint,
  and inherited inline paints. Filters, clipping, masks, use-symbol references,
  embedded images, CSS style sheets and SVG text are not implemented. Unsupported
  constructs are removed; import reports them to the user. Convert/expand these
  upstream before importing.
- Lettering traces device-rendered bold system glyphs into editable contours.
  The project stores contours, so saved projects do not depend on the recipient's
  fonts. Very small glyphs and script joins require manual refinement.
- The SE700 is the only default machine. Larger profiles represent other machines;
  selecting a larger profile does not enlarge the SE700's physical field.
- No hoop splitting, multi-needle/sequin support, professional font library,
  applique wizard, exact thread inventory, or automatic overlap removal yet.
- Editor/project files work without a backend. The first machine conversion
  requires internet access for the pinned Pyodide runtime. This is not a fully
  offline installable PWA.

## Extension seams

`model.js`: versioned projects, machine profiles and geometric transforms.
`engine.js`: pure stitch algorithms and analysis, executed by `digitize-worker.js`.
`importers.js`: safe SVG sampling, raster tracing and glyph contours.
`codec.py` / `format-worker.js`: format plugins with a shared event schema.
`stage.js`: canvas interaction/rendering. `app.js`: history, storage and controls.
New formats belong in the codec boundary; new stitch generators belong in the
pure engine. Keep machine commands separate from editable source objects.
