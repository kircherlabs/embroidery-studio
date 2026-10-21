# Equipment and physical threads — resumable progress

Starting point: stable main `34d6ab6` (v0.12.8, smart image import integrated).
Protected backups `backup-before-creative-update`, `BACKUP-V0.12.6` and
`BACKUP-V0.12.8` remain untouched.

Release status: **v0.13.0 merged and live**. Stages A–F's software implementation,
integration and publication are verified. Stage C's licensed preloaded manufacturer
catalogs and documented conversion datasets remain **not completed**; personal catalog
imports are available. No new physical hardware sew-out is claimed. Historical stage
validation below records each milestone; see the publication checkpoint for final checks.

## Stage A — complete and verified (`5f99fd9`)

Implemented:
- `src/equipment.js`: versioned manufacturer/model/hoop reference data, evidence URLs,
  nullable unknown specifications, generic fields, custom profiles and local defaults.
- `src/equipment-ui.js`, `index.html`, `workspace.css`, `src/help.js`: existing expandable
  Machine & hoop strip now has Brand → Model → Hoop, inch/mm custom creation,
  custom profile and hoop editing/deletion, duplication, and My Machine defaults.
- `src/model.js`: project version 1 remains readable. Legacy `se700`, `brother130`,
  `generic200` resolve safely without changing stored artwork. Custom equipment
  travels in a versioned project snapshot; no dependency on local catalog availability.
- `src/app.js`, `src/stage.js`, `src/creative.js`, `src/construction*.js`,
  `src/artwork-tools-ui.js`, `src/engine.js`: resolve the selected field consistently.
  Changes only supply field/planning parameters; no stitch-generation algorithm rewrite.
- `tests/equipment.test.mjs`, `tests/equipment-browser.mjs`: old/new projects, filtered
  hoops, actual generated bounds, no automatic artwork changes, custom inches,
  CRUD, defaults, history, portable snapshots and mobile layout.

Catalog scope: initial documented models from seven brands; not an exhaustive product
database. Unknown speed, movement specifications and multi-position support are not
invented. Existing planning defaults are explicitly application estimates. Outer physical
hoop dimensions are unknown, separate from design fields. No split-hoop workflow.
BERNINA Large Oval is explicitly a rectangular field envelope: inspect the template
near corners. No unverified multi-position/oversize hoop is offered as a single pass.

Validation: 269 automated tests (six new equipment tests), four Python codec tests,
and all 30 browser suites passed. Logs: `test-results/equipment-units-final.log`,
`equipment-codec.log`, `equipment-full-*.log`, `equipment-final-browser.log`.
Production build passed. Existing Python-dependent tests used the bundled interpreter
via PYTHON; initial failures from a missing system Python were environment failures,
resolved without changing or weakening tests. Desktop/mobile screenshots are local
`test-results/equipment-desktop.png` and `equipment-mobile.png`.

Additional files: `src/export-preferences.js` honors the custom profile's preferred
format and keeps model-format uncertainty distinct from verified field data;
`README.md`, `docs/MACHINE_PROFILES.md` explain controls, evidence and migration.
CI now runs the equipment browser suite. No intermediate deployment was made during A.
Remaining limitations: curated initial models/hoops only; unknown optional hoops,
physical outer dimensions, machine movement limits and reposition support are not
invented. Oval checks use the documented envelope with explicit template guidance.
Personal settings transfer UI was completed in Stage E (project snapshots also travel).

## Stage B — complete and verified (`fd985c1`)

Files: `src/export-safety.js`, `src/app.js`, `src/codec.py`, `src/format-worker.js`,
`src/vp3_compat.py`, `src/equipment.js`, `workspace.css`, `THIRD_PARTY_NOTICES.md`,
`tests/export-safety.test.mjs`, `tests/test_format_safety.py`,
`tests/export-safety-browser.mjs`.

Audit findings and corrections:
- Existing six writers remain PES, PEC, DST, EXP, JEF, VP3. HUS/VIP/PHC have no
  writers in the pinned dependency; do not offer them as implemented exports.
- VP3 drops standalone STOP; block those exports rather than silently dropping
  construction requirements. DST/EXP encode STOP as a color pause; explain this.
- JEF writer only knows legacy hoop header codes and falls back to 110 × 110
  for dimensions reaching 200 mm. Guard those exports; RE28b full-field export is
  not verified. Explain legacy code selection and missing explicit JEF trims.
- PEC/PES and VP3 byte-sized palette block counts are checked; PEC origin guard
  remains intact. Surface fixed-palette colors, missing palettes and oval limits.
- Validate actual decoded needles and pause order before download. No preview-only
  workaround. Keep project data and original sewing actions unchanged.
- Correct VP3 reader absolute starts on X=0, Y=0, and origin between color blocks;
  adapted MIT reader with attribution. Vendor archive and writer bytes unchanged.
- Janome MC500E now defaults to documented JEF; B 500 SDT to EXP, with documented
  alternative formats. Jade 35 format evidence still needs a readable primary
  manual; its field profile does not imply a verified export format.

Validation: 275 automated JS tests, four original Python codec tests plus six new
native format-safety tests passed. Real browser downloads of all six formats pass
with every decoded needle checked, independently decoded PES extents, blocked
unsafe STOP/header cases, model defaults, mobile warnings and untouched projects.
Equipment, smart import (including 64-color PES), PES, sewing-action and reference
browser regressions also pass. Production build passed.
Logs: `test-results/format-safety-*.log`. Conversion notices remain in Design Issues
following download. CI includes both new safety suites. No intermediate deployment.

Remaining limitations are explicit in `docs/EXPORT_COMPATIBILITY.md`: no full-field
RE28b JEF, standalone STOP in VP3, HUS/VIP/PHC writers, official Jade format evidence
or additional hardware sew-outs. Do not bypass guards to claim these are supported.
The initial export fixture incorrectly put COLOR commands inside a manual object;
corrected the test to valid separate manual color objects and added local validation.
Import helpers now await actual confirmation instead of conditionally racing it.

Original Stage B validation plan:

Audit six existing writers (PES, PEC, JEF, EXP, DST, VP3) and independent round trips.
Research HUS/VIP capabilities; do not add extensions without a tested writer/reader.
Extend exact-model preferred formats only with model-specific documentation. Preserve
SE700 PEC origin correction. Keep writer tests, documented compatibility and hardware
stitch-out status distinct. Check field origins, movement splitting, stops, color limits,
thread metadata and trim loss for each format. Add UI warnings for real restrictions.

## Stage C — local catalog infrastructure complete and verified (`56e474f`)

Added `src/thread-records.js`, `src/thread-catalogs.js`, `src/thread-store.js`,
`src/thread-assignment.js`, `src/thread-ui.js`. Local IndexedDB storage, CSV/JSON/GPL
mapping/preview, distinct brand+line+text-number identity, optional HEX, provenance,
paged picker, default brand/line and snapshot assignment/restore are implemented.
Changes integrate with `src/app.js`, `src/inspector.js`, `src/model.js`, `src/styles.js`,
`index.html`, `workspace.css`. Nine new thread tests and one public-asset policy test pass.
No manufacturer RGB datasets or Claude research rows are bundled. Brand names are
identifiers only; importing data cannot elevate it to manufacturer-verified status.

Validation: all 285 automated tests pass (`test-results/threads-final-units.log`).
Thread browser suite covers CSV/JSON/GPL, leading-zero / distinct-brand records,
per-action assignment, generated colors, Undo/Redo, save/reload, missing catalog
snapshots, restore design color, manual unknown HEX, defaults, actual assigned-thread
PES dimensions and every decoded needle, keyboard modal isolation and mobile.
5,000-entry preview + save measured 108 ms locally; only 50 rows render per page
(`test-results/thread-catalog-performance.json`; not a universal timing guarantee).
Workspace, toolbar, sewing-action, reference/manual-artwork and six-format export
browser regressions also pass (`test-results/threads-*.log`). Build passed.

`docs/THREAD_LIBRARY.md` explains controls, schema, storage and licensing. CI runs
threads-browser. `scripts/thread-asset-policy.mjs`, `scripts/build.mjs`, and
`tests/thread-assets.test.mjs` reject known research files, GPL palettes and physical
catalog CSV/JSON in public runtime assets. `THIRD_PARTY_NOTICES.md` distinguishes
personal product data from the MIT PEC machine palette. Catalogs use IndexedDB;
project snapshots do not depend on installed catalogs. Nothing from ThreadResearch.zip
was extracted or bundled. Public manufacturer color packs remain unapproved, NOT done.

Remaining C limitations: no licensed preloaded brand palettes; user-imported values
remain approximate/unverified. Personal settings backup and inventory were completed
in E; reviewed CIELAB matching, substitution and smart-import handoff were completed
in D. No official conversion dataset is bundled. No intermediate deployment was made.

## Stage D — reviewed perceptual matching complete and verified (`143b467`)

Added `src/thread-matching.js`, `src/thread-matching-ui.js`,
`tests/thread-matching.test.mjs`, `tests/thread-matching-browser.mjs`.
Integrated matching into thread-ui, tracing-ui and app; optional tracing handoff
works for initial imports, palette-only changes and revised traces. Review original
colors or current spool approximations; brand/line filters, nearest-five alternatives,
explicit keep, large-difference guidance and honest algorithmic/user labels.
Original design colors survive repeated substitutions and catalog loss.

Audited styles/style-transfer/image-tracing: custom HEX and copied style colors clear
stale assignments, simple method presets retain applicable choices, palette revisions
update designColor without changing an explicitly assigned spool. Preview clones
metadata to avoid mutating projects before approval.

Planning/engine retain physical spool identities independently of RGB, without
changing needle algorithms or travel optimization. Same-RGB distinct spools produce
required thread changes. export-safety verifies their actual PES/PEC repeated-color
operator stops and explains them; six actual writers preserve all needle positions
and the required pause. No machine writer or origin metadata was changed in D.

Validation: 289 automated tests pass (`test-results/matching-final-units.log`).
Matching browser tests pass: per-action scope, alternatives/substitution, original
palette, Undo/Redo, reload, strict no-fallback owned filter, six actual same-RGB-spool
exports with every needle/pause, smart-import handoff, mobile layout and Escape.
Catalog, smart-import (including 64 colors and independent PES decode) and six-format
export browser regressions pass (`matching-*-regression.log`). Build passed.
Mobile screenshot: `test-results/thread-matching-mobile.png`. CI includes the new suite.
Docs: `docs/THREAD_LIBRARY.md`. No catalog/conversion dataset was redistributed.

Limitations: physical matches need sew-outs; no official/third-party conversion tables
are claimed or bundled without verified provenance/rights. Inventory, shopping and
backup UI were completed in E; the matching filter handles an empty collection
strictly rather than silently choosing unowned threads. F's release checks and
publication are verified below. No intermediate deployment was made.

## Stage E — personal inventory and portable settings complete and verified (`282526d`)

Added `src/thread-inventory-ui.js`, `src/thread-requirements.js`,
`src/personal-settings.js`, `tests/thread-inventory.test.mjs`,
`tests/thread-inventory-browser.mjs`. Integrated thread-records/thread-ui/matching-ui,
equipment-ui reload, app settings callback and responsive workspace CSS.
Collection: bulk mark-owned without adding to existing quantities; quantity, optional
spool size/remaining metres, notes/favorites, all/owned/not-owned/favorite filters,
default owned-only preference, snapshot fallback after catalog removal. No automatic
stock deduction. Strict owned-only matching excludes missing-HEX records and never
falls back to unowned catalogs.

Project requirements use actual generated commands and block order, distinguishing
physical identities, unassigned paints, owned/missing spools and approximate owned
alternatives. Copy/select/export a missing-spool CSV with exact codes, desired quantity
one per missing color, escaped text and spreadsheet-formula protection. No invented
prices, retailer links or thread-consumption claims. Corrected outgoing-lock thread
metadata to stay with the previously sewn region; no needle coordinates changed.

Personal JSON backup/restore covers local catalogs, stock, preferences, custom
machines/hoops, My Machine and per-model formats. Validate before writes, preview
counts, keep duplicates by default / explicitly replace, never sum quantities,
idempotent merge, rollback both stores on a failed write, report rollback failure.
Loading/closing dialogs cannot apply stale backup previews. Current project stays intact.

Validation: all 294 automated tests pass (`inventory-final-units.log`). Browser suites
for inventory, catalog, matching (all six real formats) and equipment pass
(`inventory-*-regression.log`). They cover bulk/individual entry, owned matching and
original colors, Undo, no export decrement, catalog loss, shopping CSV, notes/favorites,
validated restore/reimport, current-project retention, synthetic quota rollback,
5,000 catalog entries with only 50 DOM rows, 64-source-color matching and mobile.
Latest local matching measurement: 52.7 ms (`inventory-performance.json`), not a timing
guarantee. Desktop requirements/mobile collection screenshots are in test-results.
Build passed. CI includes inventory browser tests. README and THREAD_LIBRARY updated.

Remaining limits: collection quantities/remaining metres are user estimates; no stock
usage accounting, no manufacturer conversion dataset or licensed preloaded color packs.
Personal preference edits are separate from project Undo. F completed full regression,
release documentation/version, merge/push and GitHub Pages verification below.
Backups remain untouched.

## Stage F — release validation and publication complete

Release version: **0.13.0**. All 295 JavaScript tests, 10 native Python codec/format
tests and all 34 browser suites pass, plus production build / public-asset policy
and whitespace checks. Logs: `equipment-threads-final-units.log`,
`equipment-threads-release-codec.log`, `equipment-threads-release-formats.log`,
`equipment-threads-release-browsers.json`, `release-*-browser.log` under test-results.
A final added regression verifies mixed physical/unassigned same-HEX assignments in
both directions. The matching browser now exports 18 same-color identity fixtures
across the six writers; each decoded needle and operator pause is checked. The final
matching and export-safety suites passed again after that localized validation fix.
No existing test was weakened. Satin fonts/rails/guides, Tatami, drawing/node/sculpt,
hierarchy/focus/transforms, references, tracing, recipes, sewing actions, travel,
old projects, Undo/Redo and PES origin regressions all pass.

Screenshots reviewed: desktop project requirements, mobile collection and matching;
all controls stay within the dialog, with limited paged catalog DOM. CI runs all new
suites. No unrelated stitch-generation algorithm or machine writer was rewritten.
The VP3 reader repair and export safety restrictions are documented separately.

Production-build browser workflows passed for equipment, catalogs, matching and
inventory. Additional Chrome production-build checks passed for equipment, smart
import and inventory. GitHub's full PR and main checks and the public deployment
were then verified as recorded below.

Remaining product limitations (not hidden completed features): licensed preloaded
manufacturer color packs and official conversion tables are NOT approved/bundled;
users import personal catalogs or enter spool labels. Digital/physical matching stays
approximate. More documented models/hoops can be added to the sourced schema later.
JEF designs reaching 200 mm lack a verified writer hoop header and are blocked; VP3
standalone stops are blocked. No new physical hardware sew-out claims. See the
machine and export compatibility docs for exact model/format evidence and limits.
Protected backup branches remain unchanged, including newly observed BACKUP-V0.12.8
at the original v0.12.8 main commit.

### Publication checkpoint — verified v0.13.0

- Release commit `10cef2a` and test lifecycle fixes `3814915` / `d52c96d` were merged
  through [PR #23](https://github.com/kircherlabs/embroidery-studio/pull/23).
- Final [PR CI run 39497840024](https://github.com/kircherlabs/embroidery-studio/actions/runs/39497840024)
  passed all 295 JS tests, 10 native Python tests, 34 browser suites and the build.
- Merge commit `b3fbbebbad09448ede8992064ddc95d310ff632e` passed the same full
  [main workflow and Pages deployment](https://github.com/kircherlabs/embroidery-studio/actions/runs/39499380098).
- [Public application](https://kircherlabs.github.io/embroidery-studio/) reports v0.13.0.
  All 34 changed runtime-source/version checks match the merged release, after
  normalizing line endings (`test-results/equipment-threads-live-sources.json`).
- All four final browser suites passed against the public URL in fresh isolated
  profiles: equipment, thread catalogs, matching and inventory. Logs are
  `test-results/live-equipment.log`, `live-threads.log`, `live-thread-matching.log`
  and `live-thread-inventory.log`. These include actual export/download and decoded
  machine-command checks; they do not alter the user's open browser workspace.

Linux CI exposed two browser-test lifecycle races: equipment tests read the prior
plan before the asynchronous project transaction committed, and smart-import tests
could start another upload before the previous handler reset its input. Tests now
wait for those actual completion signals. All original geometry, dimensions,
history, PNG/JPEG, 12/24/32/64-color, persistence and decoded-needle assertions remain.
Both final CI runs passed; no runtime workaround or weakened assertion was used.

Protected branch tips were checked after merge and remain:
`backup-before-creative-update` = `99c0a78cd7ec7c026d32c44195ebea882f06c925`,
`BACKUP-V0.12.6` = `c13460ed95fc18fa38714b8b0547b6ae4c89cec8`,
`BACKUP-V0.12.8` = `34d6ab6e7225cc2ebe7d47e70c20d14f524051fb`.

This publication record is a documentation-only follow-up to the validated runtime
merge. Documentation is excluded from public build assets; no runtime, test or
workflow change is included in this follow-up.

## Research and licensing boundary

Read `C:/Users/david/Desktop/ThreadResearch.zip` in place; did not extract or commit its
4,251 third-party color records. Its license audit and catalog report are research,
not permission to redistribute. No manufacturer RGB or conversion license was established.
Ship infrastructure and local user import until specific redistribution rights are secured.
Keep New brothread, Simthread and Brother distinct; physical identity is brand + line +
code, not screen RGB or a shared numbering system. The existing MIT PEC palette is
file-format data, never a physical thread catalog. Do not bundle the research archive,
unlicensed chart images, raw catalogs, PANTONE references or conversion tables.

## Exact next work and resume rules

Read this file and inspect current branch/commit/status first. The A–F software
implementation and v0.13.0 publication are complete; do not repeat those milestones.
Outstanding work, in order of required evidence:

1. Secure and record redistribution rights and manufacturer provenance before adding
   preloaded physical thread catalogs or conversion datasets. Never copy the research
   rows into production merely to fill a brand selector. Personal imports remain usable.
2. Extend the exact-model/hoop catalog only with reliable model-specific specifications;
   obtain primary format evidence for Jade 35. Do not infer compatibility by brand.
3. Investigate and test JEF hoop header support before enabling designs reaching
   200 mm; retain the existing guard. Keep VP3 standalone STOP exports blocked until
   a writer capable of preserving them is implemented and decoded successfully.
4. Perform documented physical sew-outs for additional model/format combinations and
   thread matches before elevating hardware or color-accuracy verification claims.

Record each future stage's files, checks, unresolved limitations and commit here.
Keep source research outside `src`, `vendor`, `assets` (the directories copied into
public builds). No unresolved critical software regression remains in this release;
the licensing, source-evidence and physical-validation limits above remain explicit.
