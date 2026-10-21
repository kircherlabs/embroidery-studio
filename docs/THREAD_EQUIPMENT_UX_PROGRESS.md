# Thread Library & Machine Selector UX Polish — v0.14.1

Base: stable main `61ab117` (v0.14.0). Branch: `feature/thread-equipment-ux`.
Implementation, local validation and full PR CI are complete. PR #25 is merged.
Validated feature head: `5334f990534a4b50af15b7ace5e3dbdbb9145f62`.
Runtime merge: `c28259de11b47f561b19b012af8ab378b550b04d`.
**v0.14.1 is published and verified live.** Current checkout: main.
Protected backup branches are untouched. This publication record changes documentation only.

## Implemented

- Default **Browse Threads** and optional **My Collection** segmented views use the
  same library and existing inventory. Switching views retains search/brand/line
  filters; no inventory setup is required.
- Responsive, paged swatch grid makes colors prominent, with text spool numbers,
  names, brand/line identity, owned quantity and favorite state. Full identities
  and source/accuracy metadata remain available in selected-thread details.
- **Add to My Collection / Remove from My Collection** is independent of assignment.
  Removing ownership sets quantity to zero, preserving catalog records, spool
  notes, favorites, size, remaining-length estimates and saved project assignments.
  Add reverses ownership with one spool; edit quantities through Collection details.
  Checked batch Add retains existing quantities. Catalog deletion is explicitly
  separate under Edit catalog record; full collection editing remains available.
- Assignment stays in a fixed dialog footer; one content scrolling area replaces
  the nested result scroller. Selected details sit beside desktop results and
  above mobile results. Light swatches have borders; selection has a distinct edge.
- Concise empty/no-match/no-selection/no-assignment states, clear-filter action,
  retained keyboard focus, existing Hints integration and touch-friendly controls.
- Library management stays discoverable in a collapsed disclosure near filters.
  Catalog imports, backups, defaults, corrections, matching, substitutions and
  project requirements/shopping lists remain accessible.
- The header now reads **Threads · New · Import / Open · Save project · Export**.
  Threads sits left of the file actions; Save and Export remain adjacent. DOM,
  keyboard and responsive visual order agree, with all five controls visible on mobile.
- CI caught a mobile equipment overflow assertion after a desktop-to-mobile
  resize. Added a viewport media fallback alongside the workspace container query
  so the mobile stack does not depend on container resize timing. The overflow
  assertion remains intact and now reports measured widths/columns on failure.
- Equipment search uses a full-width first row, followed by aligned Brand, Model
  and Hoop fields of equal height. Compact secondary actions and collapsible
  sources remain; narrow workspace widths stack fields cleanly.

## Files changed

`src/thread-ui.js`, `workspace.css`, `index.html`, four existing thread browser
suites, new `tests/thread-library-ux-browser.mjs`, `.github/workflows/pages.yml`,
`docs/THREAD_LIBRARY.md` and this report.
No thread identities, catalog data, matching math, persistence schemas, equipment
specifications, embroidery geometry, stitch generators, format writers or export
validation were changed.

## Verified locally

- All **302 JavaScript automated tests** pass.
- All **10 native codec/format tests** pass (including PES/PEC origin/dimensions).
- Nine relevant browser suites pass: new thread-library UX, starters, entry,
  inventory, matching, catalogs, equipment, ZIP packages and export safety.
- New browser coverage checks Browse/Collection, number/name/brand search,
  brand/line filters, empty/no-match states, keyboard Space/Enter and focus,
  ownership addition/removal/reversal, metadata and reload, catalog retention,
  per-action assignment and unchanged actual needle commands, Hints, touch,
  desktop/tablet/mobile overflow, fixed assignment footer and equipment alignment.
- Existing browser coverage retains custom entry, CSV/JSON/GPL imports, catalog
  loss, backup/restore/quota rollback, 5,000-record bounded paging and 64-color
  matching, custom equipment/hoops/defaults, save/reload/Undo, six actual format
  downloads/decoding and exact ZIP writer-byte checks. Existing assertions remain;
  interactions were updated for intentionally moved disclosures and toggle labels.
- Chrome and Edge isolated browser checks; production build and diff whitespace
  checks pass. CI now includes the new suite alongside all 37 previous browser
  suites. No physical sew-out is claimed or required for these UI-only changes.

## Screenshots

Local ignored `test-results/` contains baseline captures from `61ab117`:
`ux-before-threads-desktop.png`, `ux-before-threads-mobile.png`,
`ux-before-equipment-desktop.png`, `ux-before-equipment-mobile.png`.
Updated captures: `ux-after-threads-selected-desktop.png`,
`ux-after-threads-selected-mobile.png`, `ux-after-equipment-desktop.png`,
`ux-after-equipment-mobile.png`. The new browser suite regenerates updated images.

## Publication — complete

- [PR #25](https://github.com/kircherlabs/embroidery-studio/pull/25) merged the
  verified feature head `5334f99` into main runtime commit `c28259d`.
- [Final PR CI](https://github.com/kircherlabs/embroidery-studio/actions/runs/39554443044)
  passed all 302 JS tests, 10 native tests, 38 browser suites and the static build.
- [Main / Pages workflow](https://github.com/kircherlabs/embroidery-studio/actions/runs/39555425107)
  repeated the full checks successfully and deployed the release. Test job
  `119073966611` and deployment job `119077742468` both succeeded.
- The public `index.html`, `workspace.css` and `src/thread-ui.js` match the merged
  runtime source (line endings normalized); the page identifies v0.14.1.
- Three isolated live suites passed: thread-library UX (including header order,
  Hints, touch and collection/assignment separation), equipment (custom profiles,
  hoops, defaults, persistence and mobile), and threads (catalog imports,
  assignment, Undo/Redo, real exported PES coordinates, 5,000-record paging).
- Final desktop/mobile screenshots were captured from the published site. The
  user's open browser and its personal workspace were not modified. Local preview
  servers were stopped. All protected backup refs retain their original commits.

No implementation or deployment steps remain for this focused update. Evidence
is retained in ignored `test-results/ux-unit.log`, `ux-codec.log`, `ux-formats.log`,
`ux-live-assets.json`, `ux-live-thread-library-ux.log`, `ux-live-equipment.log`
and `ux-live-threads.log`.

Existing limitations remain: starter catalogs are partial and screen colors are
approximate; ownership is a personal setting rather than project Undo history.
No data migration or new manufacturer/physical compatibility claims were added.
