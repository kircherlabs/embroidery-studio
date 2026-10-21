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

## C — complete, locally verified

Separate versioned IndexedDB artwork records persist outside projects. Validated
backups preserve editable payloads; ID/name collisions create independent copies,
repeat imports skip duplicates. Invalid records are isolated and kept in storage;
raw recovery export and explicit invalid-entry cleanup are available to the UI.
Writes/imports are atomic, preserving prior records on quota or validation failure.
Limits: 1,000 entries / 64 MB library, 32 MB element, 72 MB import file.

Files: artwork-records.js, artwork-store.js, record unit and storage browser tests.
Tests pass backup round-trip, malformed entry isolation, duplicate/collision import,
rename/delete, real IndexedDB persistence, quota failure rollback and recovery.
Next: D companion interface/thumbnail rendering; then E workflow integration and F.
B and C are now complete; earlier Next lists are historical milestone checkpoints.

## D — complete, locally verified

My Artwork is immediately before Threads in the main header. The companion modal
reuses thread-library controls/theme/card styling and a single scrolling content
area with a fixed Insert footer. Source-only SVG previews preserve aspect ratio,
holes and assigned colors with contrast outlines; no stitch generation is used.
Search, 40-card pagination, selection, name editing, deletion confirmation,
backup preview/import and recovery management are wired to C's real store.
Gallery supports 500-record browser test without rendering every record at once.
Shared app integration supplies real selection/history APIs; context Save and
complete cross-project/history/export acceptance remain milestone E.

Files: artwork-ui.js, artwork-thumbnail.js, app/index/workspace CSS, new gallery
browser and thumbnail unit tests, extended exact-header-order regression.
Tests pass previews/counters/colors, empty/disabled states, gallery management,
real backup duplicate handling, escaping, keyboard focus, desktop/tablet/mobile.
Next: E context menu and full cross-project insertion verification. F remains.

## E — complete, locally verified

Objects right-click and Shift+F10 expose Save to My Artwork through the existing
shared context menu. The Objects edit dropdown provides the touch equivalent.
Both route to the same name/extract/save flow as the library's Save Selection.
External dependencies are named. Insertion is one project mutation/Undo step,
selects inserted roots, exits prior isolation and fits selection, preserving size
and normal oversized-hoop warnings. Unfinished drawings must finish/cancel before
insertion. Library management never modifies source/destination project copies.

Files: app.js, arrange.js, index.html, dependency/thumbnail refinements and new
artwork-workflow-browser.mjs. The real browser test passes source save unchanged,
linked guidance, nested cross-project insertion, all IDs, physical sizes, one
Undo/Redo, live font switching, independent library data, project save/reload,
multiselection, no inventory changes, full-size oversized insertion, and real PES
export: every decoded needle, pauses, independent extents and corrected origin.
Reference assets also pass portable-source/non-stitching unit regression.

Next: F full regression, mobile/visual polish, final docs, PR and deployment.
A–E are complete locally; F and publication remain pending.
