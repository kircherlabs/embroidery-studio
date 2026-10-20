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
