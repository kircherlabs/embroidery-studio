# Thread Library & Machine Selector UX Polish — v0.14.1

Base: stable main `61ab117` (v0.14.0). Branch: `feature/thread-equipment-ux`.
Implementation and local validation complete; PR CI, merge and Pages publication pending.
Protected backup branches are untouched.

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

## Remaining work / handoff

1. Complete full PR CI (302 JS + 10 native + 38 browser suites + static build).
2. Merge the verified head, wait for the existing Pages workflow, then compare
   published runtime assets and run isolated live browser workflows.
3. Record PR/deployment evidence here. Do not mark publication complete before
   verifying it. No additional feature expansion is part of this update.

Existing limitations remain: starter catalogs are partial and screen colors are
approximate; ownership is a personal setting rather than project Undo history.
No data migration or new manufacturer/physical compatibility claims were added.
