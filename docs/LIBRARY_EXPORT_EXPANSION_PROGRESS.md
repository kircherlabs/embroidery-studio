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

D — complete and verified (C commit `2db86a6`).
Expanded from 7 to 42 documented brand/model profiles across seven brands, including
common discontinued Brother models, Janome MC400E/550E, Baby Lock Verve/Vesta/Meridian,
generation-qualified BERNINA B570/B590, Pfaff ambition 640, Viking Topaz 65 and Singer
SE9185. Model search works across brands without changing geometry. Included/optional
hoops are labeled only where established; custom profiles and all prior IDs survive.
Sources are recorded in equipment.js and the expansion coverage document. Exact input
format evidence is still pending for the new Pfaff, Viking and Singer profiles; their
formats remain empty rather than inferred by brand. Existing JEF/VP3 restrictions remain.
Files: equipment.js, equipment-ui.js, index.html, equipment unit/browser tests and docs.
Validation: 13 equipment/export unit tests; existing equipment and actual six-format
export-safety browser suites pass, including search, field changes, old/custom projects,
no automatic artwork changes, history, mobile and unsafe-export blocking. The old
SE700 single-hoop assertion now checks the exact two documented 100 mm hoop IDs.
E — implemented, focused validation passed (D commit `b7555ba`).
Export dialog includes “Export all formats as ZIP”. Each implemented, round-trip-tested
writer runs separately against one captured generated project plan. The existing
preflight, decoded-needle/pause and field checks apply independently. Users review
included formats, omissions and warnings before downloading; no files means no ZIP.
The archive preserves exact writer bytes, includes README and ordered thread CSV,
normalizes filenames, bounds retained machine bytes at 64 MB and never includes
reference images or personal inventory. Existing single-file export stays intact.
Files: export-package.js, app.js, vendor/fflate.js + MIT license, new package unit and
browser tests, CI and documentation. fflate 0.8.3 is pinned locally, SHA256
B7CA4450B19559A1D50EB381ADCEE94B82449674BE4CD17789D9BEBA7E6122A1.
Three unit cases validate actual six-format commands/bytes, archive extraction and
independent ZIP CRC checks, geometry with holes, names, failures and JEF/VP3 omissions.
Browser download passes every-entry byte comparison to observed unmodified writer
output, separate standalone PES equivalence, dimensions, colors/stops, review/cancel,
project preservation and mobile. Final unit rerun/build precede the E commit.

F: full regression/build/mobile QA, docs/version, PR/CI/merge/Pages and live verification.

Never mark partial stages complete. Record each stage's checks/commit and exact handoff here.
