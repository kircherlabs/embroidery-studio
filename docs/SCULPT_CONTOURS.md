# Compact contour sculpting — 0.12.5

## Confirmed cause

The supplied before/after screenshots were inspected. They are screenshots rather
than editable projects, so reproducible synthetic contours and an actual traced
PNG exercise the same workflow.

`sculptArtwork()` previously subdivided **entire polygon edges** whenever any part
was within Sculpt reach. Its subdivision step was `max(0.1, reach / 8)` mm: 0.25 mm
at the reported 2 mm reach. These samples were assigned directly to `o.rings`.
Long portions outside the influence could acquire nodes as well. On subsequent
gestures, stretched segments could exceed the subdivision step and split again.
There was no compaction pass. The Stage already restores the original geometry
before each pointer move; growth occurred across completed gestures, rather than
compounding every pointer event within one gesture.

Those polygon nodes really were persisted and editable. Existing Bézier objects
already use `curve.nodes` for editing and `curveRings()` samples for rendering and
stitches. That distinction is correct and remains unchanged. No nodes are hidden
to disguise excessive geometry.

## Local repair

`src/sculpt-contour.js` retains the same arc-length cosine displacement:

- Split edges at the influence boundaries and grabbed position; refine only the
  affected arc, rather than the entire nearby edge.
- Choose sampling intervals from a curvature/error bound, based on displacement
  and reach. Larger or tighter bends receive more samples when necessary.
- Simplify the result with the existing tolerance-based polyline utility. Protect
  original turns of at least 20 degrees, open endpoints, the current influence
  boundaries and grab point. The original seam/order and explicit closure remain.
- Include a small cleanup collar extending to 1.5 times reach, so obsolete support
  endpoints from earlier gestures do not each become permanent nodes. Outside the
  collar, original vertices remain unchanged. Inside it, any geometric change from
  simplification stays within the error budget.
- Check simplification shortcuts against contours/counters. If a shortcut crosses
  a boundary, keep the accurate samples instead. No arbitrary vertex-count cap is
  used. A bounding-box sweep avoids comparing all pairs for typical dense traces.
- On completion, reject new crossings/touches on previously valid contours and lost islands/counters, restoring the
  exact pre-drag project with concise guidance. Undo/cancel still restore source
  descriptions and operation settings.

The error budget is `min(0.025 mm, reach / 100)`: 0.01 mm at 1 mm reach, 0.02 mm at
2 mm, and 0.025 mm at 5–10 mm. Half is reserved for sampling the analytical
deformation; half for simplification. This is a physical tolerance independent of
zoom, smaller than a 0.1 mm machine-coordinate increment and normal 0.42 mm tatami
row spacing. It is a **per-edit** bound, not a claim that arbitrary repeated edits
cannot accumulate approximation error. Sharp narrow features and untouched holes
are tested separately. Deliberately complex contours can still need many nodes.

No automatic Bézier conversion, global image simplification, point reordering,
neighbor-region movement, stitch-density change or engine/export rewrite occurs.
Existing curve/rail/baseline sculpting continues adjusting its own handles. Smart
Shape/text-to-path behavior remains explicit and reversible, as before.

## Measured vertex counts

Counts below refer to the edited outer contour, before / first / tenth / fiftieth
gesture. These deterministic tests deepen one bend by 0.08 mm per gesture.
The older implementation was measured from commit `a482594`.

| Fixture, reach 2 mm     | Before fix            | After fix             |
| ----------------------- | --------------------- | --------------------- |
| Long smooth contour     | 15 / 55 / 67 / 95     | 15 / 17 / 19 / 23     |
| Dense imported contour  | 403 / 403 / 403 / 433 | 403 / 369 / 369 / 375 |
| Filled region with hole | 33 / 49 / 55 / 87     | 33 / 33 / 33 / 39     |
| Sharp/narrow details    | 31 / 51 / 59 / 89     | 31 / 33 / 33 / 37     |
| Pixel-traced contour    | 45 / 117 / 133 / 159  | 45 / 48 / 48 / 54     |

Additional nodes in a progressively deeper/narrower bend represent real added
curvature. An oscillating same-area edit also runs 100 times and checks that counts
settle rather than adding two influence endpoints on every gesture.

In the real browser PNG-import test, fifty alternating 2 mm-reach adjustments give
**167 / 174 / 178 / 175** outer-contour vertices. Instrumented canvas drawing checks
that every Node square corresponds to a true stored control; local rendered counts
are **0 / 7 / 11 / 8**, rather than an accumulating set of flattened samples.

## Accuracy and validation

The independent reference evaluates the intended deformation at <=0.008 mm
intervals; bidirectional point-to-contour deviations are measured on each edit.
Across five fixtures and 50 gestures per reach:

| Reach | Maximum measured per-edit deviation |
| ----- | ----------------------------------- |
| 1 mm  | 0.00607 mm                          |
| 2 mm  | 0.01088 mm                          |
| 5 mm  | 0.01247 mm                          |
| 10 mm | 0.01212 mm                          |

The real PNG browser workflow measures <=0.01246 mm. Separate tests cover 0.2 mm
reach, stronger/tangential pulls, seam wrapping, tiny closed objects, explicit
duplicate closures, protected narrow corners, disconnected islands and counters.
A 5,003-vertex contour averaged about 4.2 ms per Sculpt calculation over 20 local
edits on the development machine; this is an observation, not a portable timing
guarantee.

`tests/sculpt-contour.test.mjs` and `tests/sculpt-browser.mjs` cover accuracy,
stability, actual raster tracing, canvas controls, different zooms, mouse and touch
pointers, invalid-drag restoration, cancel, Undo/Redo, saved-project reload,
unchanged neighbors/settings, regenerated stitches and independently decoded PES
needle coordinates/dimensions. Reports and before/after screenshots are saved to
ignored `test-results/sculpt-*` files. The browser suite is part of Pages CI.

Software validation does not constitute a physical machine sew-out. Existing
Tatami/Satin algorithms, travel routing and corrected Brother PEC origin handling
are unchanged.
