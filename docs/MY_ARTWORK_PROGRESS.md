# My Artwork and bulk thread ownership — progress

Base: v0.14.1 / main `8c6636b`. Branch: `feature/my-artwork-library`.
Protected backups, including BACKUP-V0.14.1, must not be modified.

## A — complete, locally verified

Explicit bulk Add Selected / Remove Selected actions reflect checked ownership;
mixed selections offer Add Unowned and Remove Owned separately. Checked count,
Clear selection, keyboard operation and clearing stale checks on view/filter
changes are implemented. Removing ownership changes quantity only; catalog,
notes, favorite, spool length, physical-thread snapshots and project assignments
are retained. Existing positive quantities are never incremented by Add.

Files: thread-ownership.js, thread-ui.js, new ownership unit/bulk browser suites,
and adapted starter-browser interaction (the old add-only behavior is superseded).
Tests: ownership unit; bulk browser; starter browser; existing inventory browser,
including 5,000-record matching, backup/restore/quota rollback, export, persistence.
All pass. No intermediate deployment.

## Next

B: Extract and validate reusable source artwork, include/reject dependencies,
deep-clone and remap IDs/relationships, preserve ordering and physical dimensions.
C: IndexedDB records, corrupt-entry recovery and portable import/export.
D: Companion modal and thumbnails; My Artwork immediately before Threads.
E: Context Save and one-Undo insertion integration.
F: Full automated/browser/export regression, visual review, docs, PR and Pages.

## B — complete, locally verified

Source extraction uses existing hierarchy copying and project validation. External
linked originals, SVG fill dependencies and construction artwork require explicit
complete selection, with actionable feedback. Root parent scope is detached while
inherited visibility/locks/pins are retained. Insertion uses fresh node/action/asset
IDs, remaps internal references, preserves source/action settings and manual sewing
order, and centers at physical size without changing destination equipment.
Linked transforms are conjugated when both original and instance move, avoiding
extra translation. Inserts are prepared/validated in a draft before committing.
32 MB per element and bounded portable-data validation protect imports.

Files: artwork-library.js, source-preservation unit suite and shared realistic
fixture. Four new tests and 37 related effects/manual-satin/path-text tests pass.
Stored artwork is source data, not generated stitch replacement.

Next: C persistent records and backups. C–F are not implemented yet.
