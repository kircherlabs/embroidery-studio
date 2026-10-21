# Editable fill reference swatches

These original Studio designs fit a Brother SE700 100 × 100 mm field. Open an
`.embstudio` file through Import / Open to inspect source geometry and settings;
the adjacent `.pes` contains the generated machine instructions. **None has been
physically sewn.** Software round-trip/independent needle-coordinate checks do not
verify fabric behavior or physical machine compatibility.

| File base | Contents |
| --- | --- |
| `tatami-textures` | Eleven texture tiles, including custom fractions. |
| `emboss-motifs` | Six motif tiles at 0.75 emphasis. |
| `meander-styles` | Classic, Fine, Open, Organic and Looping. |
| `tatami-reference` | 40 × 30 mm Quarter Tatami. |
| `contour-reference` | 40 × 30 mm Contour. |
| `meander-reference` | 40 × 30 mm Organic Meander. |
| `cross-reference` | 40 × 30 mm complete Cross Stitch cells. |
| `emboss-reference` | 40 × 30 mm Diamond surface texture. |
| `ripple-reference` | 40 × 30 mm clipped circular rings. |
| `spiral-reference` | 40 × 30 mm clipped Archimedean spiral. |

[manifest.json](manifest.json) records exact sewn bounds, stitches, jumps, trims,
every fill parameter and generated issues for each file. Dense samples use 0.42 mm
rows, 2.8 mm maximum segments, light underlay and 0.15 mm compensation. Open fills
have no dense underlay/compensation; their scale-specific values are in the manifest.
Colors are generic design colors, not a physical thread prescription.

Choose appropriate fabric, thread and stabilizer, check the hoop and decoded
preview, then sew a small sample. Compare appearance and needle buildup before
using a design in a product. Never treat a software preview as a sew-out result.

Reproduce the files with `PYTHON=/path/to/python node scripts/fill-reference-swatches.mjs`.
The script invokes the existing production writer through its test bridge. It
does not implement another exporter. Regression tests independently compare every
committed PES needle to the current project plan, including corrected dimensions.
