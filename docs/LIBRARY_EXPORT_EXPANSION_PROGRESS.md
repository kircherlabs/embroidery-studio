# Equipment, thread library and export expansion — progress

Base: v0.13.0 / main `3a4f2f7`. Implementation branch:
`feature/library-equipment-packages`, merged through PR #24.
**v0.14.0 is merged and live.** Current branch: main; validated runtime commit:
`299fa6b5c2153e75eb38e50b6e692181fa27cd83`. Final feature head: `6c8c4bd`.
This publication record is a documentation-only follow-up to that runtime commit.
All protected backup branches remain unchanged.

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

## B — complete and verified

Commit `09d5ecd` (A: `3303496`).
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

## C — starter catalogs complete and verified

Commit `2db86a6`.
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

## D — complete and verified

Commit `b7555ba`.
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

## E — complete and verified

Commit `8564083`.
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
Four unit cases validate actual six-format commands/bytes, archive extraction and
independent ZIP CRC checks, geometry with holes, names, failures and JEF/VP3 omissions.
Browser download passes every-entry byte comparison to observed unmodified writer
output, separate standalone PES equivalence, dimensions, colors/stops, review/cancel,
project preservation and mobile. Final unit rerun and production build passed before commit.

## F — complete, published and verified

- Release: **v0.14.0**; [PR #24](https://github.com/kircherlabs/embroidery-studio/pull/24)
  merged as `299fa6b5c2153e75eb38e50b6e692181fa27cd83`.
- All **302 JS tests**, **10 native codec/format tests** and **37 browser suites**
  passed locally and in the final [PR CI run](https://github.com/kircherlabs/embroidery-studio/actions/runs/39532648107).
- The same full [main workflow and Pages deployment](https://github.com/kircherlabs/embroidery-studio/actions/runs/39533713469)
  passed. Both test-build (`119005336963`) and deploy (`119008601961`) succeeded.
- [Public app](https://kircherlabs.github.io/embroidery-studio/) reports v0.14.0.
  All **12 published runtime/version/license source checks** match the merged release,
  normalizing line endings. Report: `test-results/library-expansion-live-sources.json`.
- All four final browser suites passed on the public URL in isolated profiles:
  thread-starters, thread-entry, equipment and export-package. Actual ZIP downloads,
  every writer's original bytes, standalone PES equivalence, decoded dimensions,
  stops/JEF omissions, reload, canonical IDs and mobile layout were checked.
  Logs: `test-results/expansion-live-*.log`. The user's open workspace was not touched.
- Additional production-build Chrome desktop/mobile workflows passed for starter
  catalogs, entry, equipment and ZIP packaging. Reviewed screenshots:
  `thread-starters-*`, `library-entry-*`, `export-package-*` under test-results.

Release preparation `33cd19c`, direct selected ownership `5de8b2d`, same-color physical
spool ZIP regression `e73c9b5`, and canonical line-identity repair `6c8c4bd` are integrated.
Mark selected owned needs no separate checkbox; checkboxes still support bulk marking,
and repeated marking never increments quantities. Personal color corrections retain
original source references. Existing displayed product-line names resolve canonical
IDs; ambiguous same-name lines are explained rather than silently merged. Line
suggestions are limited to 100, with exact typed names resolved against the full library.
Starter, entry, inventory and legacy catalog suites passed again after those refinements.

Files completed in F: package/footer version, README, current and historical equipment/
thread documentation, thread-ui refinements and starter/package browser regression
coverage. No stitch-generation algorithm or machine writer was rewritten. The final
ZIP regression verifies both physical spool numbers and pauses across all six actual
writers when the two products share a digital color. Independent ZIP CRC, exact stored
bytes and original PES origin/dimension regressions pass. No tests were weakened.

### Protected branch checkpoints

- `backup-before-creative-update`: `99c0a78cd7ec7c026d32c44195ebea882f06c925`
- `BACKUP-V0.12.6`: `c13460ed95fc18fa38714b8b0547b6ae4c89cec8`
- `BACKUP-V0.12.8`: `34d6ab6e7225cc2ebe7d47e70c20d14f524051fb`
- `BACKUP-V0.13.0`: `3a4f2f71e0a4a2d0341ce7a5cdaaeb81f1060508`

Remaining coverage: starters are deliberately partial, Floriani is not populated,
Madeira/Sulky/Robison-Anton subset color names are not asserted where only identifiers
were established. Swatches are Studio estimates, not manufacturer measurements or
licensed catalog RGBs. Exact format evidence remains pending for new field-only Pfaff,
Viking and Singer profiles; no full 50–100-model or universal hoop coverage is claimed.
Existing JEF large-field and VP3 STOP limits remain, with no new hardware sew-outs.
ZIP does not add preview images or EXP companion palette files; README/CSV preserve
color instructions. These are explicit limitations, not hidden completed features.

## Exact next work / resume

A–F's delivered software package and publication are verified; do not repeat completed
milestones. Read current branch/status and this report before making further changes.
Future work should expand reviewed starter coverage (including Floriani), improve
color references with documented/licensed measurements where available, and research
more exact models, optional hoops and input-format manuals. Keep factual identifiers
separate from chart graphics and proprietary RGB datasets. Research JEF modern hoop
headers and VP3 standalone STOP preservation before relaxing existing guards. Perform
recorded physical sew-outs before elevating machine/color verification claims.

No unresolved critical software regression remains in this release. Known coverage and
hardware limitations above remain explicit. The final documentation-only publication
commit does not change runtime, tests or workflow assets; no additional deployment is
needed for that record. Never modify or delete protected backup branches.
