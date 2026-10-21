# Equipment, thread library and export expansion — progress

Base: v0.13.0 / main `3a4f2f7`. Branch: `feature/library-equipment-packages`.
Protected backup branches are unchanged. Runtime changes are not deployed until release validation.

## A — complete and verified

Files: `src/thread-ui.js`, `workspace.css`, `tests/thread-entry-browser.mjs`, related existing thread browser tests.
Reproduced empty-library entry: brand/number/name/HEX with unknown product line was rejected
with “Every entry needs a brand and product line.” Fully specified mouse entry worked;
there is no evidence of a universal IndexedDB save defect. A saved brand/owned filter
could also hide a successful addition. The Enter dispatcher incorrectly routed inventory
and personal-settings actions through the matching branch because of ternary precedence.

Repairs: optional line uses explicit “Unspecified product line”; brand and text spool
number get specific inline errors; duplicates never silently overwrite; successful saves
reveal/select the result despite previous filters. Storage errors stay inline; retry works.
Enter selects the present enabled action. Primary discovery/actions remain visible;
management and specialist filters are expandable. Physical inventory remains optional.

Validation: 19 thread/matching/inventory unit tests pass. New isolated desktop/mobile
browser test passes entry, unknown line, leading zeros, distinct brands, duplicate/HEX
errors, simulated storage failure/retry, filtered success, Enter inventory save and reload.
Existing catalog, inventory and matching browser regressions also pass, including actual six-format exports. Production build and whitespace checks pass. CI includes the new entry suite.

## Remaining milestones

B — complete and verified (follows A commit `3303496`).
Files: thread-ui, thread-records, workspace CSS and thread-entry browser regression.
Large live swatch, HEX/RGB/picker synchronization and searchable copy-from-catalog color
are implemented. Unknown colors remain explicit label-only records and are excluded
from automatic visual matching until a user chooses a color. User selections carry
user-selected accuracy. Personal entries support edit/remove; identity fields remain
read-only during correction (use Add for another spool identity). Corrections update
owned snapshots without altering quantities; saved project assignments remain snapshots.
Catalog records override fallback inventory snapshots during browsing.
All 19 relevant unit tests and entry/catalog/inventory/matching browser suites pass,
including real exports, edit/remove, exact identity, corrected owned preview and reload.

C — starter catalogs complete and verified (B commit `09d5ecd`).
171 reviewed starter records across seven brands: New brothread 70, Brother 12,
Simthread 23, Madeira 12, Sulky 12, Robison-Anton 12, Isacord 30. Explicit subsets,
not complete catalogs; Floriani remains unpopulated. Sources and rights/data review
are in THREAD_STARTERS.md. Original Studio RGB estimates are explicitly approximate;
no research palette RGBs, chart graphics or conversion table is bundled.
Files: thread-starters.js, thread-records.js, thread-ui.js, new starter unit/browser
tests, fixture-scoping updates to existing thread browser suites and CI.
Built-ins stay separate from personal data. Stable IDs, personal corrections,
inventory fallback and project snapshots survive catalog updates. Optional built-in
browsing preference is saved and backed up. Legacy personal-catalog tests explicitly
isolate their synthetic fixtures; the new suite tests default populated browsing.
Validation: all 297 JS tests pass with bundled PYTHON, plus starter/entry/catalog/
inventory/matching browser suites, desktop/mobile screenshots and actual exports.
An initial full-test attempt omitted PYTHON and failed 19 native-export calls because
the system Python alias is unavailable; rerun with the bundled interpreter passed.
No tests were weakened. Full manufacturer coverage and measured/licensed RGB remain
future data work, not claimed complete.

D: expand exact-model/hoop evidence and searchable selection; preserve export guards.
E: locally packaged validated format bytes, review omissions, README/thread chart,
archive extraction and standalone-byte comparisons, browser download.
F: full regression/build/mobile QA, docs/version, PR/CI/merge/Pages and live verification.

Never mark partial stages complete. Record each stage's checks/commit and exact handoff here.
