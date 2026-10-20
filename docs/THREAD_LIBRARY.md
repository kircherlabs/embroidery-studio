# Personal thread catalogs

**Threads** opens a separate compact library. In Properties, **Choose physical
thread…** assigns to the selected sewing action or the displayed bulk scope.
HEX and existing swatch controls remain available without configuring a catalog.

The initial library contains brand identifiers, not licensed color charts. New
brothread, Simthread and Brother remain separate. No third-party physical RGB
catalog or conversion table is shipped. The supplied research archive stays outside
the repository and public build. Import data you are entitled to use locally;
uploading a chart does not grant the app redistribution rights.

## Import

- CSV: preview column mappings for brand, product line, text number/SKU, color
  name, optional HEX, material, weight and semicolon-separated spool sizes.
- JSON: an array, or `{ "records": [...] }`, with the same named fields. Numbers
  must be strings to preserve leading zeros and alphanumeric codes.
- GPL: RGB palette rows. Supply brand/line context; unnumbered entries remain
  palette swatches. Explicitly opt into extracting a leading code from labels.
  A palette label alone does not verify a physical spool product.

Example schema only (synthetic, not a manufacturer catalog):

```json
{"records":[{"brandName":"My Brand","lineName":"My line","number":"001",
"colorName":"My blue approximation","hex":"#123456","material":null,"weight":null}]}
```

Every entry keeps stable identity, brand/line names and IDs, text spool number,
color name, optional HEX, optional material/weight/spool sizes, catalog version,
source, license/attribution and color-accuracy classification. Unknown values stay
unknown. Imports are labeled **user-imported** even if the file claims verification.
Explicit duplicate replacement is optional; otherwise existing identities are kept.
Preview changes before importing. Enter previews/applies the current action;
Escape closes without changing artwork. Space operates checkboxes normally.

Catalog inputs have a 24 MB / 50,000-entry application guard. Search by name/number,
filter by brand/line/material/weight and sort by number or digital color. Only 50
results render per page. A default brand/line is optional. Removing a selected local
line requires confirmation and leaves source files and saved projects intact.

## Assignment and storage

A physical assignment is a snapshot on its sewing action. It retains the original
design color independently from the chosen product and its approximate screen color.
Switching products preserves that original color. **Restore design color** removes
the assignment; choosing a custom HEX intentionally clears it. A product without HEX
retains the design's visual color. None of these actions alter geometry or stitch
settings. Project Undo/Redo and save/reopen preserve the assignment.

Catalogs and preferences use IndexedDB `embroidery-personal-v1`, separate from project
files and machine preferences. Only assigned product snapshots travel with a project,
so a missing catalog does not lose brand, line, spool number or visual fallback.
Storage failures are reported and do not silently replace existing data.
Personal catalog import/deletion is not project Undo; preview and confirmation protect
those local-library actions. Personal settings backup/restore follows in Stage E.

The build guard rejects known research archives and unreviewed catalog assets in
runtime directories. It is an engineering safeguard, not a determination of legal rights.
No licensed manufacturer data pack has yet been approved for bundling.

Validation includes leading zeros and distinct brands, CSV/JSON/GPL mapping, duplicate
handling, unknown HEX, independent actions, source-color restoration, catalog loss,
history/reload, real PES needle/origin checks, 5,000-entry paging/search and mobile layout.
Physical color matches and sew-outs remain unverified.

## Reviewed matching and substitution

In **Threads → Match design colors…**, choose a personal brand/line and review
nearest colors and up to five alternatives. Suggestions use the existing D65
CIELAB implementation and Delta E 1976. Values are digital approximations, not
measured physical-thread matches or official conversion tables. Unknown HEX
entries are available for manual assignment, but excluded from algorithmic matching.
A large difference receives inline review guidance. Nothing is applied until confirmed.

Original design colors are the default matching reference. Choose **Current thread
approximation · substitute** to compare a current spool with another catalog.
Automatic choices are stored as `algorithmic`; explicitly selected alternatives
are `user`. Original design colors survive repeated substitutions, Undo/Redo,
project reload and missing catalogs. Restore design color removes the assignment.
Custom HEX/style-color edits deliberately clear the affected spool assignment.
Palette-only image revisions update the preserved design colors while keeping
explicit physical spool choices; previews clone metadata and never mutate the project.

Image tracing offers **Review physical thread matches after importing**. This
opens the same optional reviewed workflow for imported/revised regions and keeps
the source image, vector geometry and sewing actions editable.

Sewing planning distinguishes spool IDs even when their HEX values coincide.
Different spools require actual thread-change pauses. PES/PEC encodes identical
RGB entries as repeated-color stops: change spools according to the project list
at those pauses. Export guidance explains this; decoded needles and pause order
are verified before download. Physical identity is retained in the project; machine
files may carry only approximate RGB/palette entries. No official cross-brand
conversion data is bundled or claimed.

## My thread collection and project requirements

In **Threads**, check spool rows and choose **Mark checked owned** for quick bulk
entry. This sets previously missing quantities to one and keeps existing quantities;
it never increments them accidentally. Select a spool and use **Collection details…**
for whole-spool quantity, optional size and remaining-metres estimate, notes and
favorite status. Removing a collection entry does not remove catalog or project data.
A manual thread entry can be recorded in the collection even without a digital HEX.

The Collection filter supports all, owned, not owned and favorites. **Use brand / line
as default** also remembers an owned-only collection preference. Owned snapshots
remain available if their source catalog is removed. **Match design colors…** and
**Project threads… → Match editable project actions using owned threads…** offer
strict owned-only matching; unknown HEX cannot participate and there is no silent
fallback to unowned spools. Review large differences before applying substitutions.

**Project threads…** derives requirements from generated sewing commands, including
actual order, thread changes and construction stops. Hidden/disabled/reference
artwork does not add requirements. It shows exact physical IDs, owned/missing stock,
color-block positions and approximate owned alternatives. Unassigned custom colors
are identified without inventing product numbers. The shopping list requests one
spool for each missing physical color and can be selected/copied or exported as CSV.
CSV fields are quoted, leading zeros retained as text in the file, and formula-like
values prefixed for spreadsheet safety. No prices, stock availability or retailer
links are fabricated. There is no automatic stock deduction or unvalidated thread-use
estimate. Collection edits are local preferences, separate from project Undo.

## Portable personal settings

**Threads → Backup / restore…** exports catalogs, collection snapshots, thread
preferences, custom machine/hoop profiles, My Machine and per-machine format choices.
Projects are saved separately. Restoring previews counts and merges stable IDs,
keeping existing duplicates by default; an explicit checkbox replaces matching
entries/preferences. Quantities are never summed. Unrelated entries remain.
Malformed data is rejected before writing. Because IndexedDB and localStorage do
not share transactions, both old stores are retained and rolled back on a write
failure, with explicit feedback if even rollback fails. Keep a backup outside browser
storage. Backups remain personal data and do not establish catalog redistribution rights.
The importer validates a versioned schema and accepts backup files up to 64 MB.
