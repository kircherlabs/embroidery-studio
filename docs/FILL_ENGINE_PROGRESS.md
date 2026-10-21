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

Implementation status: A and B complete; C custom/edge controls in progress next.
D Contour, E Meander, F Cross, G Emboss, H Ripple/Spiral and I release integration
remain unimplemented. Order: A → B → C → D → F → E → G → H → I.

Baseline commit: `787ef69`. Next: commit B, then implement C custom sequences,
explicit pattern anchoring and constrained edge-spacing optimization.
Preserve every protected backup ref. Do not regenerate legacy expectations to
accommodate changed output. No public release until validated working milestones.

The matching attachment is assessed separately: existing Delta E76 should not be
silently replaced during fill development; see assessment appendix for a future
CIEDE2000 milestone and corrections to its proposed lightness/distinctness rules.
