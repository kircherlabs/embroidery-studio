# My Artwork and thread collection

## Reuse editable artwork

Open **My Artwork**, immediately before **Threads** in the main header. Select
artwork and choose **Save Selection**, or right-click an Objects row and choose
**Save to My Artwork**. The Objects **Edit selection** menu offers the same action
on touch devices. Give the element a name; saving leaves the project unchanged.

The library stores source artwork: contours and holes, curve handles, Smart
Shapes, editable lettering and baselines, satin rails/guides, effects, nested
groups, sewing actions, colors and physical-thread snapshots. Select all related
objects when saving linked instances, text baselines or construction artwork.
Missing dependencies are identified rather than silently discarded.

Search the thumbnail gallery, select a card and choose **Insert Selected**.
Insertion centers an independent copy at its original millimeter size, creates
fresh IDs, remaps internal relationships and selects the inserted artwork. It is
one Undo/Redo step. Existing hidden/locked states and manual sewing order are
preserved. Oversized artwork stays full size and uses normal hoop-fit warnings.
Finish or cancel an unfinished drawing before inserting.

Editing an inserted copy never edits the saved element or other copies. Save a
new library element explicitly to retain a revision. Inserting physical-thread
assignments does not change personal ownership. Reference image assets, if saved,
remain non-stitching artwork.

## Storage and backups

The versioned `embroidery-artwork-v1` IndexedDB database is separate from project
files and available across projects on this browser/site. It is local to this
browser profile; clearing site data removes it. Use **Library management → Export
Library** for a portable JSON backup of actual editable source data. Import
Library previews valid additions, skips repeated items and resolves name/ID
collisions without replacing existing entries. Previews are regenerated from
source geometry, without generating stitches.

Library management also offers rename and confirmed deletion. Deleting a saved
element does not delete previously inserted copies. Unreadable entries are
isolated; recovery export and confirmed cleanup retain valid records. Storage
failures report an error and preserve existing data.

Limits are 1,000 elements / 64 MB per library, 32 MB per element and 72 MB per
backup import. Gallery pages contain at most 40 cards. Reference images can use
substantial storage. A library backup is separate from a project save and from
thread inventory backups. No account or clipboard access is required.

## Bulk thread ownership

Checkboxes select threads for a batch; selecting a card still opens its details.
The checked count and **Clear selection** distinguish selection from ownership.

- Unowned checked threads: **Add Selected to My Collection**.
- Owned checked threads: **Remove Selected from My Collection**.
- Mixed selection: **Add Unowned** and **Remove Owned** are separate actions.

Successful actions clear the checks and immediately refresh My Collection.
Switching views or filters also clears hidden selections. Adding does not
increment already-owned quantities. Removing sets quantity to zero while keeping
notes, favorites and other inventory details, catalog entries, project thread
assignments and sewing instructions intact.

Software tests cover editable reuse, history, storage, browser interaction and
decoded PES geometry. These changes do not establish physical machine sew-out
verification.
