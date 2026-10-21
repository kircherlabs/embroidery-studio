# My Artwork and bulk thread ownership — progress

Base: v0.14.1 / main `8c6636b`. Branch: `feature/my-artwork-library`.
Protected backups, including BACKUP-V0.14.1, remain untouched.

## Completed milestones

| Milestone            | Commit    | Implementation and validation                                                                                                                                                                                                                    |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A — Thread ownership | `c521460` | Explicit Add/Remove for owned/unowned/mixed checks; count and Clear; retain metadata/catalog/project assignments. Ownership unit, bulk/starter/inventory browser tests pass.                                                                     |
| B — Reusable source  | `429dcb3` | Extraction/validation, dependencies, fresh IDs/reference remapping, linked transforms, groups, sewing order and physical size. Source/effects/rails/text tests pass.                                                                             |
| C — Persistence      | `1c8960b` | Separate IndexedDB, atomic writes, portable backup/import, corrupt-entry isolation and recovery. Record/storage browser tests pass, including quota rollback.                                                                                    |
| D — Gallery          | `eeb4113` | Companion modal, source SVG previews, search, 40-card pages, management, exact header placement. Thumbnail and 500-entry desktop/tablet/mobile tests pass.                                                                                       |
| E — Workflows        | `a51b275` | Context/keyboard/touch shared save, one-Undo cross-project insert, live lettering and full-size oversize warnings. Browser verifies source independence, project reload, physical thread snapshots and decoded PES needles/stops/extents/origin. |

Primary files: `src/artwork-{library,records,store,thumbnail,ui}.js`,
`src/thread-ownership.js`, existing app/arrange/thread-ui, index/workspace CSS.
New unit/browser suites accompany each module; shared realistic fixture contains
nested groups, holes, Smart Shapes, cubic handles, rails/rungs, live lettering on
a baseline, linked effects, construction steps and manual stitches.

## F — complete, merged and live

310 automated tests and all 10 native codec/format safety tests pass. Expanded
gallery recovery checks and existing Thread Library UX/header keyboard/mobile
checks pass. Reference asset deduplication retains destination metadata. Chrome
production-build storage/gallery/bulk/workflow tests all pass, including quota
retry, independent deletion, draft protection and actual touch save/insert.

CI includes all 38 previous browser suites plus bulk ownership, artwork storage,
gallery and cross-project suites (42 total). Release v0.15.0.
User guide: `docs/MY_ARTWORK.md`.

Release milestone: `3540008`; asynchronous gallery reload test correction:
`957eb5c`. All 310 automated, 10 native safety and 42 browser suites passed in
[PR CI](https://github.com/kircherlabs/embroidery-studio/actions/runs/39566011276).
[PR #26](https://github.com/kircherlabs/embroidery-studio/pull/26) merged at
`5b5c11d06c1c37c0bd2484c27e3886867e6850d8`.

[Main CI and Pages deployment](https://github.com/kircherlabs/embroidery-studio/actions/runs/39567649507)
passed all tests and deployed v0.15.0. On October 21, 2026, all 11 changed public
runtime files were compared with merged source and matched (normalized line
endings). The version footer reports v0.15.0.

Isolated live Edge/Chrome workflows passed bulk ownership, storage/backup/quota
recovery, the 500-entry desktop/mobile gallery, cross-project insertion, source
independence, touch, Undo/Redo, live fonts, saved projects, oversize warnings and
actual decoded PES needles/stops/extents/origin. Local gallery screenshots are
in ignored `test-results/my-artwork-{desktop,mobile}.png`.

All milestones A–F are complete. No intermediate milestone was deployed. All
protected backup references were checked unchanged, including BACKUP-V0.14.1
at `8c6636b` and backup-before-creative-update at `99c0a78`. No required follow-up
implementation remains for this assignment; future changes can start from main.

## Boundaries

- Local to this site/browser profile; export backups before clearing site data.
  Limits: 1,000 items / 64 MB, 32 MB per item, 72 MB import.
- External dependencies must be selected explicitly; errors name them.
- Source previews are lightweight approximations, not stitch simulations.
- Hidden/locked flags and saved manual sewing order are retained.
- Insertions do not change equipment, inventory or source entries.
- No engine/exporter changes; software tests do not claim physical sew-out.
