# Decorative fill package — progress

Base: main, v0.15.0, `6a0dcd2`. Branch: `feature/decorative-fills`.
The user approved the assessment and sequential implementation. No deployment
has been made for this package.

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

Implementation status: A, B, C and D complete. F Cross is next. E Meander,
G Emboss, H Ripple/Spiral and I release integration remain unimplemented.
Order: A → B → C → D → F → E → G → H → I.

Baseline commit: `787ef69`. Next: commit D, then F Cross Stitch: complete-contained
X cells, consistent top diagonal, safe row tours and real export verification.
Preserve every protected backup ref. Do not regenerate legacy expectations to
accommodate changed output. No public release until validated working milestones.

The matching attachment is assessed separately: existing Delta E76 should not be
silently replaced during fill development; see assessment appendix for a future
CIEDE2000 milestone and corrections to its proposed lightness/distinctness rules.
