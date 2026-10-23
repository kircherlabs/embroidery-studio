# Multi-hoop delivery progress

Release: **v0.18.0**. Base: stable main v0.17.0 (`535bce9`).
PR: [#29](https://github.com/kircherlabs/embroidery-studio/pull/29).
Status: all milestones A–F completed, merged and published after verification.

## Completed milestones

- A: versioned persistent layout, real machine fields, two-dimensional automatic
  placement, irregular exclusive domains, overlap/coverage and placement history.
- B: complete-object/group preference, atomic linked construction, explicit
  assignment, local hoop coordinates and preserved action/thread metadata.
- C: nondestructive source partition and regenerated Tatami/Emboss and
  Running/Bean/Triple stitching; preserved holes, shared phase, bounded seam
  compensation and layer order. Unsupported interior cuts block export with
  actionable guidance. The editable master never becomes machine stitch data.
- D: optional paired clear-area registration with a required operator pause,
  numbered setup instructions, actual-size SVG and tiled A4 HTML templates.
- E: independent existing preflight/writer/decoder/field checks for PES, PEC, DST,
  EXP, JEF and VP3, complete-format ZIP sets, shared-coordinate manifest, thread
  sequences, overview and templates. Single-hoop writers/origin handling unchanged.
- F: compact Machine & Hoop and Export entry points, draggable numbered overlays,
  selected/assembled stitch and Sequence views, revision-safe generation/export,
  Hints, desktop/mobile/touch checks, user guide and stable publication.

## Files changed

New modules: `src/multi-hoop-{schema,layout,assignment,split,registration,templates,export,overlay,ui}.js`.
Integration: `src/app.js`, `src/digitize-worker.js`, `src/model.js`,
`src/stage.js`, `src/preview.js`, `src/help.js`, `index.html`, `workspace.css`.
Localized temporary-domain clipping: `src/engine.js`, `src/fills/registry.js`.
Tests: `tests/multi-hoop.test.mjs`, `tests/multi-hoop-export.test.mjs`,
`tests/multi-hoop-browser.mjs`, `.github/workflows/pages.yml`.
Documentation/version: `docs/MULTI_HOOP.md`, this progress record, `README.md`,
`package.json`.

## Verification

- 373 Node tests, 10 Python codec/format-safety tests and all 47 browser suites pass.
- Final source Chrome and production-build Edge feature workflows pass.
- Browser workflow exports three hoopings in all six formats (18 machine files),
  independently checks PES needles, verifies actual rendered fields and print
  scale (50 mm ruler), real touch and mouse drag/cancel, Undo/Redo, source edits,
  regeneration, saved-master reload, section Sequence and mobile layout.
- Export units independently encode/decode two sections in all six formats,
  reject corrupt incomplete format sets, stale revisions and unsupported pauses.
- Legacy stitch regressions remain exact; no existing assertions were weakened.
- Dense-vector fixture: 48 contours, 4,608 samples, eight hoopings and 3,560
  stitches; approximately 80–178 ms locally, not a hardware timing guarantee.
- Final review reproduced and fixed a redundant SVG-outline regression:
  partitioning now respects master-planned source IDs before creating fragments.
- Numerical layout intersections use a 1e-8 mm grid to prevent near-zero slivers.
- PR CI: [39990505176](https://github.com/kircherlabs/embroidery-studio/actions/runs/39990505176) (exact source head `903cac9`), success.
- Merge: `adf1552933d96b91cb56578fd0ef58704998613c`. Main validation and Pages: [39993705193](https://github.com/kircherlabs/embroidery-studio/actions/runs/39993705193), success.
- Live v0.18.0: 19 changed runtime assets match the deployed merge; the
  public-site multi-hoop browser workflow passes.
- Protected backup refs verified unchanged, including
  `backup-before-creative-update` (`99c0a78`) and
  `BACKUP-V0.17.0` (`535bce9`). No backup branch was modified.

## Remaining limitations and exact next steps

No critical regression is known after these checks. Automatic interior cuts
through satin/rails, connected lettering, fabric construction and unsupported
decorative fills remain deliberately blocked; whole objects and disconnected
contours can still be assigned intact. Manual source/rail revision is required
when a safe automatic cut is unavailable. This is standard separate-file
rehooping, not proprietary sliding/rotating/multi-position encoding.

No physical alignment, fabric-distortion or machine sew-out quality is claimed.
Some formats/machines normalize origin or center files on load; restore planned
placement using templates, sewn-bounds offsets and two dry-needle points. Review
actual seam stitches and test on scrap before production. Required registration
pauses retain existing VP3 restrictions; all other format safeguards remain.

For support, begin with [the user guide](MULTI_HOOP.md). Reproduce any reported
issue against the completed v0.18.0 workflow before changing the engine. No
unfinished implementation stage remains in this delivery.
