# Fill geometry measurements

Local Windows Node 24.19.0, three warm measured runs after one warm-up, median.
No physical sew-out. Times depend on hardware and concurrent load; they are not
targets or guarantees. Reproduce with `node scripts/benchmark-fills.mjs`; raw JSON
is written to ignored `test-results/fill-benchmarks.json`.

All methods use 0.42 mm spacing, 2.8 mm maximum segments, no underlay/compensation.
Other settings are their documented defaults. The traced case has 123 scalloped
outer vertices plus a 24-vertex counter. Counts include jumps, locks and trims.

| Method | 96 mm square median ms | Events | Traced/counter median ms | Events |
| --- | ---: | ---: | ---: | ---: |
| Tatami | 11.39 | 8,289 | 6.83 | 5,523 |
| Contour | 10.57 | 8,189 | 64.78 | 8,194 |
| Meander | 65.52 | 4,050 | 33.85 | 2,590 |
| Cross | 13.74 | 13,260 | 19.09 | 8,107 |
| Emboss | 8.15 | 10,466 | 7.91 | 6,901 |
| Ripple | 65.04 | 9,645 | 46.40 | 6,511 |
| Spiral | 44.77 | 9,489 | 41.17 | 6,374 |

The initial unindexed radial clip exceeded its work budget on the traced case.
Indexed exact segment intersections and winding tests resolve it without sampling
away narrow holes or raising the budget. The initial parameter-order arc tour
trimmed 189 times in the square. Nearest clipped-arc routing/seam placement reduces
that to Ripple 9 and Spiral 7 trims; the traced case has 17 and 10 respectively.
Each arc's geometry is retained; independent clipped arcs may reverse for travel.
A single unclipped spiral retains its parametric order.

Cross uses jump travel between X legs; the square has 4,418 jumps but only one
trim. These movements avoid extra visible bars. Formats/machines differ in how
they execute jumps and trims; examine the actual file before sewing.

Other quality measurements:

- The immutable baseline covers 134 full legacy event/row streams. None changed.
- A 120-vertex 36 mm circle has 23 raw top-row intervals below 0.5 mm without edge
  correction and 0 with it; all 86 rows/endpoints remain. Source interval bounds
  have the final 0.1 mm machine-grid rounding tolerance.
- All five Meander styles fit the work budget on a 96 mm square. Full concurrent
  suite measurements ranged 50–881 ms; indexed Looping no longer exceeds budget.
- Six full-emphasis Emboss samples stay below twice ordinary Tatami's command
  count while preserving row coverage. Infeasible fine marks produce a warning.
- Every family round-trips through all six supported writers; PES needles are
  additionally checked by an independent decoder. This is software verification.

Generation fails as a whole with an actionable issue when complexity exceeds
the fixed work/point budget. A prefix is never silently returned as a complete fill.
