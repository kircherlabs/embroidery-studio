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

Full 46-suite browser regression is running. Before release: finish validation,
review final changes, build, commit/push, PR + exact-head CI, merge, Pages deploy,
live asset/browser verification. No deployment of this feature yet. Protected
backup branches, including the existing BACKUP-V0.16.0, must remain unchanged.

Remaining limitations: estimates cannot determine physical trimming, future stitch
coverage, actual fabric visibility, or hidden travel intent in decoded stitches.
Initial/final free thread tails are outside this connecting-thread count. No physical
sew-out is claimed. These are deliberate documented limits, not unfinished routing
or export changes. No embroidery-engine or codec changes are required.
