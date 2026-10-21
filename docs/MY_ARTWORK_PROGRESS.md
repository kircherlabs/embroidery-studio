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

## F — locally verified; CI/publication pending

310 automated tests and all 10 native codec/format safety tests pass. Expanded
gallery recovery checks and existing Thread Library UX/header keyboard/mobile
checks pass. Reference asset deduplication retains destination metadata. Chrome
production-build storage/gallery/bulk/workflow tests all pass, including quota
retry, independent deletion, draft protection and actual touch save/insert.

CI includes all 38 previous browser suites plus bulk ownership, artwork storage,
gallery and cross-project suites (42 total). Release v0.15.0.
User guide: `docs/MY_ARTWORK.md`.

Next: commit F, push and open PR.
Merge only after CI passes; wait for Pages and verify public runtime assets and
isolated live workflows. Record publication evidence here. No intermediate
milestone has been deployed.

## Boundaries

- Local to this site/browser profile; export backups before clearing site data.
  Limits: 1,000 items / 64 MB, 32 MB per item, 72 MB import.
- External dependencies must be selected explicitly; errors name them.
- Source previews are lightweight approximations, not stitch simulations.
- Hidden/locked flags and saved manual sewing order are retained.
- Insertions do not change equipment, inventory or source entries.
- No engine/exporter changes; software tests do not claim physical sew-out.
