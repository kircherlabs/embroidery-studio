# Manual cleanup preview — release progress

Base: latest stable main v0.16.0, `1857a9d`. Branch:
`feature/manual-cleanup-preview`. Target release: v0.17.0.

Implemented:

- `src/manual-cleanup.js`: read-only sewn-anchor estimator, consecutive-jump
  grouping, effective/uncertain/omitted/inferred trim handling, explicit exposed
  travel, object/region/color/length/reason metadata, high-contrast canvas overlay.
- `src/sequence-timeline.js`: existing-track replacement renderer/controller,
  pixel-binned sewing, distinct significant-event lanes, fully inspectable clusters,
  hover/tap/keyboard descriptions, cursor synchronization, zoom/fit/pan and paged
  cleanup location disclosure. No stitch or file changes.
- `src/app.js`, `src/stage.js`, `index.html`, `workspace.css`, `src/help.js`: independent
  Display toggle, cached diagnostics, selected connection focus, source-format
  metadata on machine imports, legible dark-theme controls and compact legend.
- `tests/manual-cleanup.test.mjs`, `tests/cleanup-browser.mjs`, CI workflow: new
  actual-event, rendered-pixel, large-plan, interaction and export coverage.
- `docs/MANUAL_CLEANUP.md`: user workflow, assumptions, official SE700 source,
  pinned codec evidence and limitations.

Confirmed nuance: JEF's decoder infers trim markers from jump distance even though
the current writer omits explicit trims. The diagnostic distinguishes these from
encoded cuts. Neither codec nor existing statistics were changed.

Verification so far: 354 Node tests; 4 codec + 6 format-safety Python tests pass.
New browser workflow passes in Edge and Chrome, including actual red canvas pixels,
three expected connections from five jump commands, hover/navigation, zoom/pan,
cluster member selection, exact cursor alignment, co-located keyboard events,
real touch/mobile, Undo/Redo, actual PES/JEF decoding, source-format
persistence, unchanged project/plan and byte-identical PES with the overlay off/on.
250k synthetic commands: 49,999 candidates and 360 screen clusters. Actual browser
pixel readback verifies the red overlay. Estimation/clustering measured roughly
105–336 ms under local concurrent test load; rendering dropped from ~332 ms to
65–124 ms with batched/coincident overlay strokes, without reducing the diagnostic
count. These are measurements, not hardware timing guarantees.

All 46 browser suites pass locally and in exact-head CI run `39674098264` for
`0d53e51`. [PR #28](https://github.com/kircherlabs/embroidery-studio/pull/28) is merged
as `6a93f09`. Main-branch [release workflow 39675964876](https://github.com/kircherlabs/embroidery-studio/actions/runs/39675964876)
passed all tests, the production build and Pages deployment on 2026-10-21.
**v0.17.0 is live and verified.** Seven changed public runtime assets match the
merged source (normalized SHA-256), including the versioned HTML. The complete
cleanup browser workflow passed against the public GitHub Pages URL in Chrome:
actual overlay pixels, marker inspection/navigation, zoom/cluster/pan, independent
toggles, real touch/mobile, imported provenance, history/persistence and actual
PES/JEF exports with unchanged commands and byte-identical overlay on/off PES.
The live 250k-command check retained 49,999 candidates and measured 55.8 ms
estimation plus 27.2 ms rendering on this test machine; this is not a hardware
timing guarantee. Local evidence: `test-results/live-cleanup-verification.json`
and `cleanup-{desktop,timeline,mobile,touch}.png` (generated, not shipped).
Protected backup branches, including the existing BACKUP-V0.16.0, were verified
unchanged after merge. Task-owned local preview servers have been stopped.
The established mobile order test now scrolls the unchanged sewing-order row
into view before injecting raw CDP touch coordinates, since the improved command
track appears above that row. Its drag/order assertions remain unchanged.
One dense SVG regeneration timed out under concurrent local load and passed
unchanged in isolation; no assertion or timeout was weakened.

Remaining limitations: estimates cannot determine physical trimming, future stitch
coverage, actual fabric visibility, or hidden travel intent in decoded stitches.
Initial/final free thread tails are outside this connecting-thread count. No physical
sew-out is claimed. These are deliberate documented limits, not unfinished routing
or export changes. No embroidery-engine or codec changes are required.

Next steps: no software release work remains for this request. Optional physical
sew-outs can compare the estimates with actual machine/fabric/thread behavior;
they must be recorded separately from the completed software verification.
