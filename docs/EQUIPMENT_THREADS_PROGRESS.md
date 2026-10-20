# Equipment and physical threads — resumable progress

Starting point: stable main `34d6ab6` (v0.12.8, smart image import integrated).
Protected backups `backup-before-creative-update` and `BACKUP-V0.12.6` must remain untouched.

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
CI now runs the equipment browser suite. No intermediate deployment has been made.
Remaining limitations: curated initial models/hoops only; unknown optional hoops,
physical outer dimensions, machine movement limits and reposition support are not
invented. Oval checks use the documented envelope with explicit template guidance.
Personal settings transfer UI is deferred to Stage E (project snapshots already travel).

## Stage B — complete and verified (commit containing this entry)

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

Read this file and inspect current branch/commit/status first. Stages A and B are validated; start C from the latest stage commit. Record each stage's actual checks and commit in this
file. Never label later stages complete until implemented and tested. Keep source research
outside `src`, `vendor`, `assets` (the directories copied into public builds).
