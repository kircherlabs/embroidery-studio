# Equipment and physical threads — resumable progress

Starting point: stable main `34d6ab6` (v0.12.8, smart image import integrated).
Protected backups `backup-before-creative-update` and `BACKUP-V0.12.6` must remain untouched.

## Stage A — complete and verified (commit containing this entry)

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
CI now runs the equipment browser suite. No intermediate deployment has been made.
Remaining limitations: curated initial models/hoops only; unknown optional hoops,
physical outer dimensions, machine movement limits and reposition support are not
invented. Oval checks use the documented envelope with explicit template guidance.
Personal settings transfer UI is deferred to Stage E (project snapshots already travel).

## Stage B — next: machine-format evidence and export safety

Audit six existing writers (PES, PEC, JEF, EXP, DST, VP3) and independent round trips.
Research HUS/VIP capabilities; do not add extensions without a tested writer/reader.
Extend exact-model preferred formats only with model-specific documentation. Preserve
SE700 PEC origin correction. Keep writer tests, documented compatibility and hardware
stitch-out status distinct. Check field origins, movement splitting, stops, color limits,
thread metadata and trim loss for each format. Add UI warnings for real restrictions.

## Stages C–F — not implemented

- C: separate thread schema, local CSV/JSON/GPL import, validated mapping and compact
  brand/line/color picker; retain simple HEX controls and leading-zero/alphanumeric codes.
- D: perceptual matching, explicit substitutions and source design colors preserved;
  integrate with smart import without pretending to offer official conversions.
- E: inventory, owned-only matching, project requirements, shopping list, personal
  settings backup/restore, clear storage failure feedback.
- F: desktop/mobile integration, thousands-of-entries performance, full existing suites,
  machine decoding, documentation, clean release and GitHub Pages verification.

## Research and licensing boundary

Read `C:/Users/david/Desktop/ThreadResearch.zip` in place; did not extract or commit its
4,251 third-party color records. Its license audit and catalog report are research,
not permission to redistribute. No manufacturer RGB or conversion license was established.
Ship infrastructure and local user import until specific redistribution rights are secured.
Keep New brothread, Simthread and Brother distinct; physical identity is brand + line +
code, not screen RGB or a shared numbering system. The existing MIT PEC palette is
file-format data, never a physical thread catalog. Do not bundle the research archive,
unlicensed chart images, raw catalogs, PANTONE references or conversion tables.

## Resume rules

Read this file and inspect current branch/commit/status first. Stage A is validated; start Stage B from its commit. Record each stage's actual checks and commit in this
file. Never label later stages complete until implemented and tested. Keep source research
outside `src`, `vendor`, `assets` (the directories copied into public builds).
