# Decorative fill package — progress

Base: main, v0.15.0, `6a0dcd2`. Branch: `feature/decorative-fills`.
The user approved the assessment and sequential implementation. **All milestones
A–I are complete and released as v0.16.0 on 2026-10-21.**
PR [#27](https://github.com/kircherlabs/embroidery-studio/pull/27) merged as
`6f16b20f5227b85d83dbbabb1113ebab3f031f94` and is live on GitHub Pages.
The final release evidence and remaining practical limitations are below.

Read: requested five starting reports, all topic/license reports, relevant
experimental prototypes, attached thread-matching specification and current
engine/model/operations/planning/worker/inspector/source/library/export modules.
Primary external references were checked. See FILL_ENGINE_ASSESSMENT.md for
corrections, integration points, version/coordinate decisions and acceptance gates.

Measurements on unchanged main:

- 120 legacy Tatami cases: ten geometries × three patterns × two angles × two
  spacings; identical full events on repeated generation.
- Raw short-edge and adjacent-region phase findings reproduced.
- Local Node benchmark medians: 40 × 25 rectangle 1.58 ms; 100 × 100 rectangle
  7.73 ms; traced shape 6.12 ms (warm runs, underlay/compensation included).
- 310 Node tests pass; 4 codec + 6 format safety Python tests pass.
- No new browser suite was run in this assessment; current release's 42-suite
  verification remains recorded in MY_ARTWORK_PROGRESS.md.

Scratch evidence (ignored): test-results/fill-engine-audit.mjs,
fill-engine-audit.json/.log, fill-legacy-audit-goldens.json,
fill-audit-units.log. These are assessment measurements, not committed regression
fixtures or completed fill implementations.

Milestone A baseline checkpoint: `tests/fill-legacy.test.mjs` and
`tests/fixtures/tatami-legacy.json` protect the original 120 complete event/row
streams plus 14 compensation/underlay/winding/stack cases, including a dense
transformed SVG-like traced region. Both regression tests pass. These fixtures
are recorded before any production fill changes. Architecture work remains.

Milestone A architecture: implemented data-only fill schema and v1/v2 capability
guards, object/global physical-mm pattern frames, shared exact interval clipping,
bounded generation work, a generator registry/path adapter, structured Design
Issues and a latest-request worker wrapper that terminates obsolete synchronous
work. New settings survive My Artwork backups/insertion and style transfer;
unsupported future library records are retained during invalid-record cleanup.
Satin operations/fallbacks are explicitly excluded. No unimplemented method is
exposed in the UI, and a missing generator produces an error, never substitute
Tatami stitches.

Verification: all 317 automated tests pass (including original event hashes).
Existing action-card, library storage and full artwork workflow browser suites
pass in Chrome/Edge, covering touch, nested source, history, live fonts and decoded
PES needle/stops/dimensions/origin. A committed as `f377937`.

Milestone B: real Twill, deterministic Random, Wave, Third, Fifth, Progressive
and Chevron Tatami phase generators with fixed physical-mm frames. Existing
Classic/Brick/Aligned stay legacy until an expanded texture is explicitly chosen.
The action card has one texture dropdown plus an optional grid of generated
needle-placement samples and contextual period/amplitude/step/seed controls.
Reset restores the original Classic generator. Settings remain independent per
action; source-level settings migrate safely on materialization. Aligned/repeated
penetrations receive an actionable warning, not artificial preview differences.

B verification: 322 Node tests pass, including 134 immutable legacy baselines,
actual event distinctions, holes/islands/connectors, transforms, density,
underlay/compensation and Reset. New Edge browser workflow passes: invalid input,
single-action edits, real sample geometry, Undo/Redo, save/reload, legacy Reset,
desktop/mobile overflow and independently decoded PES coordinates/dimensions.
Screenshots: ignored test-results/fill-textures-{desktop,mobile}.png. Static build
and diff check pass. No physical sew-out performed.

Milestone B committed: `b0a6572`. Existing sewing-action Chrome regression also
passes (construction, independent colors, bulk scopes, decoded PES and mobile).

Milestone C: editable validated 1–32-entry fractional sequences, explicit
object-attached/shared-canvas anchoring, origin coordinates, inset and opt-in
short-edge interval redistribution. Boundary endpoints and every row are retained;
the constrained solution respects maximum length and minimum interval whenever
feasible. Impossible narrow spans remain sewn and receive an informational issue.
Legacy output stays exact when these settings are unused. Pattern frames use
canonical zero values so JSON reload is identical.

C verification: 324 Node tests pass; the 120-vertex circle has 23 raw top-row
intervals below 0.5 mm before correction and 0 after, with all 86 rows and their
endpoints unchanged. Tests check feasible length bounds over 999 spans, local
phase preservation and explicit narrow-span guidance. Expanded Edge browser
passes custom edits/validation, anchors/origin, edge settings, Undo/Redo,
save/reload, mobile, legacy Reset and independently decoded PES coordinates.
Build and diff check pass. These are software measurements, not sew-out results.

Milestone C committed: `37dd06a`.

Milestone D: real Contour Fill offsets every level from the original normalized
region using the existing Clipper library, preserves counters/islands, follows
explicit outside-in/inside-out levels and chooses nearby seams within a level.
Quantized sewn paths and connectors are checked against the entire material
region. Invalid tight geometry fails explicitly; no replacement fill is sewn.
Core collapse and narrow-neck splitting are explained. The category is now Fill,
with a contextual fill-method selector; irrelevant dense-fill underlay and pull
compensation are hidden for Contour while retained for later Tatami editing.

D verification: 326 Node tests pass, including every legacy event hash; rectangle,
donut, islands, narrow-neck split, reversal, spacing, transforms and collapse
cases verify real loops and full-segment containment. Edge browser tests verify
one-action switching, colors/source preserved, controls, Undo/Redo, reload and
independently decoded Contour PES needle coordinates/dimensions. Tatami texture
Edge and existing sewing-action Chrome workflows also pass. Build/diff check pass.
Screenshot: test-results/contour-fill-desktop.png (ignored). No physical sew-out.

Milestone D committed: `3492966`.

Milestone F: complete-cell Cross Stitch, explicit size/pitch/direction/inset and
pattern placement. Each cell's boundary and both diagonals must be contained;
even tiny counters fully enclosed by a cell exclude it. Quantized diagonals are
validated again. Serpentine row tours keep the same local second diagonal on top.
New explicit jump travel prevents the existing nearby-fill connector from adding
front-side bars; internal untrimmed jumps avoid unnecessary repeated tie locks.
Legacy paths do not use these opt-in flags and every legacy hash stays exact.

F verification: 328 Node tests pass, including actual leg order, jump/needle
commands, tiny counters, transforms, physical pitch and no-fit diagnostics.
Expanded Edge browser verifies pitch/direction, invalid size, contextual controls,
action identity/colors and exact independently decoded Cross PES coordinates.
Rendered screenshot: test-results/cross-fill-desktop.png. Build/diff check pass.
Physical sew-outs remain required; these are front-side crosses with jump travel,
not claims about a hand-sewn reverse side or automatic machine trimming support.

Milestone F committed: `2ecccde`.

Milestone E: Classic, Fine, Open, Organic and Looping Meander. Coverage stations
form a clearance-constrained spanning forest; round buffered branches and curved
refinement yield wandering running paths. Organic/Looping use deterministic
Poisson stations, rather than relabeling a grid maze. Every connected component
is considered, holes are retained, and quantized paths undergo containment and
crossing checks. Looping inserts complete circles only after local collision,
clearance and containment tests; a spatial index keeps full-hoop work bounded.
Scale, paired-line spacing, curviness, seed, direction and inset are contextual.
Impossible geometry fails explicitly; narrow omitted stations/open coverage are
explained. Dense-fill controls and irrelevant row-density warnings are excluded.

E verification: 331 Node tests pass; five distinct deterministic real streams,
no unintended proper crossings, holes/islands, actual needle containment,
seed changes, scale limits and 96 mm designs. Full-suite local 96 mm measurements:
Classic 4,340 events/285 ms; Fine 8,617/881 ms; Open 2,568/50 ms; Organic
4,738/176 ms; Looping 6,623/91 ms. Times include concurrent test load and are
measurements, not guarantees. The original unindexed full-hoop Looping exceeded
the work budget; indexed collision queries fix that without weakening checks.
Edge browser renders reviewed for all five styles and exact decoded Looping PES
coordinates pass. Screenshots: test-results/meander-{style}-desktop.png. Static
build/diff check pass. Physical sew-outs remain required.

Milestone E committed: `c950409`.

Milestone G: Dots, Diamonds, Checkerboard, Lattice, Diagonal Bands and Waves
Embossed Tatami. Analytic/polyline motif boundaries are intersected with actual
fill rows and pin real needle penetrations. Emphasis controls the fraction of
rows carrying motif marks; ordinary row density and endpoints remain unchanged.
Constrained redistribution retains maximum segment length and avoids crowded
marks, reporting reduced motif fidelity. Scale/repeat/angle/phase/inset/placement
remain editable; ordinary Tatami underlay and compensation remain applicable.
This is surface texture, not raised padding or a cosmetic motif overlay.

G verification: 333 Node tests pass, including six distinct real streams,
unchanged row count/coverage, exact zero-emphasis equivalence, bounds, holes,
parameter effects and narrow endpoint retention. Growth stays below 2× baseline
for representative full-emphasis motifs. Expanded Edge browser verifies all six
motifs/controls/action identity and exact decoded Emboss PES coordinates.
Build/diff check pass; physical texture appearance requires sew-out validation.

Milestone G committed: `28c81fe`.

Milestone H: circular/elliptical Ripple and a monotonic Archimedean Spiral,
with center/ratio/orientation/clockwise controls. Minimum physical turn spacing
is retained; ellipse gaps may be larger in other directions. Exact contour
interval clipping preserves holes/islands. A 0.12 mm clearance, chord refinement,
quantized containment, repeated-point and crossing checks protect machine paths.
Conservative clipping fragments may rejoin only via fully contained short chords
within a 0.04 mm curvature bound; counters are never bridged. Ripple may connect
nearby safe seams; genuinely separated Spiral arcs use jumps. Unsupported tight
cases fail with actionable Contour guidance, not a renamed fallback algorithm.

H verification: 337 Node tests pass, including closed concentric loops versus a
single outward spiral on a disk, monotonic radius, holes/islands, ratio/center/
direction, transforms, collapse and bounded 96 mm designs (Ripple 9,967 events,
Spiral 9,649; standalone local measurements about 32–46 ms). Expanded Edge browser
verifies radial controls/action identity and exact independently decoded Ripple
and Spiral PES coordinates. Rendered screenshots reviewed. Build/diff check pass.
No physical sew-out claimed.

Milestone H committed: `cf6f335`.

Milestone I integration implemented locally: cached real-generator method samples
beside the method selector, moved before thread controls; correct method labels
in source/style views; mixed checkbox state; exact spatially indexed clipping;
nearby clipped-arc routing and closed-ring seam placement. Independent clipped
arcs may reverse; a single unclipped Spiral keeps its parametric order. Stress
testing exposed the original radial clipping budget and excessive-trim problems.
Both are fixed without raising the work cap or dropping holes: the 147-vertex
trace/counter now generates every method; square radial trims drop from 189 to
Ripple 9 / Spiral 7. See FILL_BENCHMARKS.md for current measured counts/timings.

Ten original editable reference projects + PES files and exact settings/issue
manifest are in examples/fill-swatches. Regression tests compare every stored
PES needle to the current plan. All seven families round-trip through PES, PEC,
DST, EXP, JEF and VP3; PES coordinates are independently decoded. No writer was
rewritten and existing safety restrictions remain.

Local verification: 345 Node tests + 4 codec / 6 format-safety Python tests
pass. All 45 established/new browser suites pass locally in Edge. Fill integration
browser covers keyboard samples, method/thread layout,
My Artwork save/new-project/insert, independent IDs/history/reload, seven mobile
methods and actual obsolete-worker termination. All three fill workflows also pass
against the built production artifact in Chrome. Final compatibility review added
safe normalization of optional fields and direct first-use Custom sequences;
their regressions and all three production fill workflows pass after the fixes.
Ordinary presets now deliberately clear decorative settings; source-level and
per-action style-transfer defaults are distinguished so color-only transfer
preserves construction and ordinary method transfer does not inherit it.
These compatibility cases have unit and production-browser/Undo coverage.
The initial local runner needed the explicit bundled PYTHON executable; a sample
count assertion was scoped to the eleven texture buttons, independently of the
seven method buttons. No existing behavioral test was weakened.
Documentation: DECORATIVE_FILLS.md, FILL_BENCHMARKS.md,
examples/fill-swatches/README.md. Released as v0.16.0.

Implementation status: A–I complete in the approved A→B→C→D→F→E→G→H→I order.
I source integration is committed as `ae51057`, with optional-field/Custom fixes
in `9a8d6ec` and final preset/transfer hardening in `f1f83a1`. Browser synchronization
is finalized in `5fe3a26`; PR #27 is merged and attached.

Linux CI exposed native-dialog close timing in the new integration test's preset
and New Project baseline reads, plus the established mobile equipment test
measuring before its responsive media event. Tests now wait for the intended
project/compact state; all original assertions remain. A deliberate 200 ms
dialog-listener delay reproduces the original failure and passes the corrected
test. No production dialog, equipment or layout changes were needed.

Release verification:

- Exact-head PR CI on `5fe3a26` passed:
  [run 39657226625](https://github.com/kircherlabs/embroidery-studio/actions/runs/39657226625).
- Merged-main tests, build and Pages deployment passed:
  [run 39659120531](https://github.com/kircherlabs/embroidery-studio/actions/runs/39659120531).
  Both runs passed 345 Node tests, 4 codec + 6 format-safety Python tests and all
  45 browser suites. Existing satin, drawing, import, library and export tests
  remain enabled.
- At 2026-10-21 19:21:56 UTC, all 30 changed public runtime files matched merged
  source SHA-256 hashes (line endings normalized); live footer is v0.16.0.
- All three fill browser suites passed against the actual GitHub Pages URL in
  isolated Edge contexts: real textures/method samples, geometry/settings,
  independent decoded PES needles/dimensions, history, save/reload, cross-project
  My Artwork, seven mobile methods and real obsolete-worker termination.
- Ignored local evidence: test-results/live-fill-verification.json,
  fill-slow-dialog-before.log and generated live browser screenshots.

Baseline commit: `787ef69`. There are no remaining implementation or release
gates for this package. Practical follow-up is physical fabric sew-outs using
examples/fill-swatches; none has been claimed. Open-coverage tips/cores, radial
clipping and complexity limits remain documented in DECORATIVE_FILLS.md.
Protected refs checked unchanged after deployment, including BACKUP-V0.15.0 at
`6a0dcd2`, BACKUP-V0.14.1 at `8c6636b` and backup-before-creative-update at `99c0a78`.
Preserve every protected backup ref. Do not regenerate legacy expectations to
accommodate changed output.

The matching attachment is assessed separately: existing Delta E76 should not be
silently replaced during fill development; see assessment appendix for a future
CIEDE2000 milestone and corrections to its proposed lightness/distinctness rules.
