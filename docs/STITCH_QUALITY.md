# Stitch quality and reliability — v0.19.0

This release corrects three reproduced construction/routing defects within the
existing generators. It does not replace rail pairing, fill textures, stitch
pacing, corner controls, operation order or machine writers.

## Using the option

Open **Objects → Digitizing & sequence → Stitch quality safeguards**.
It is enabled for new blank designs. Existing projects with no option, or with
it disabled, retain their historical stitch-event stream. Enabling/disabling is
one ordinary Undo/Redo edit and persists in project files and local autosave.
The master geometry, thread identities, spacing, density, compensation, corner
settings and intentional running/bean/triple paths remain unchanged.

The option avoids returns through completed fill rows and whole-region travel
after an automatic satin branch. Where concealment cannot be established, it
uses the existing jump/trim/lock rules. It can increase jump and trim counts.
These are encoded requests; physical cutting depends on the actual machine.
Use the existing Show Jumps and Show Manual Trims views to inspect connections.
No command-only PES import is automatically redigitized or repaired.

## Confirmed causes and corrections

- **Tatami/emboss routing:** `routeFill` allowed its graph search to traverse rows
  already sewn and simplified routes using polygon containment alone. A long
  connector could therefore remain above completed fill. Quality mode excludes
  completed rows and retains the existing graph route through unsewn rows. It
  starts at a row-chain end, and sews the selected entry row before advancing,
  avoiding an unnecessary restart on ordinary rectangular fills. Every original
  top-row needle position is retained; holes and texture phases are unchanged.
- **Automatic satin columns:** `strokeSatin` routed between branches over the
  whole region after finishing top stitches. A center walk is not hidden when
  its branch has already been sewn. Quality mode keeps branches and their
  existing sewing order intact, requesting a jump at the next branch instead.
  Direction guides, junction partitioning, short-inner-turn controls, split-wide-
  span handling and actual top needles are unchanged.
- **Manual curved satin underlay:** equal-distance 2.5 mm arc stations formed
  chords outside a narrow curved band. The machine-grid validator correctly
  broke them, but could leave only singleton placements and no sewn underlay.
  Only when those old chords are unsafe, quality mode retains the existing paced
  contour using the existing simplifier, then caps lengths at 2.5 mm. Deviation
  tolerance is 10% of band width, capped at 0.05 mm (half the studio needle-grid
  step); the original containment/grid validation remains authoritative. Center,
  edge and both-underlay settings are respected. No top-satin width or placement
  is adjusted to compensate for the defect.

## Measured reference results

The same source artwork and sewing settings are used for each pair. Values below
are actual generated commands, verified through the existing PES writer/decoder.
Running travel excludes underlay and intentional primary running stitches.

| Reference                                         |      Before |         Quality safeguards |
| ------------------------------------------------- | ----------: | -------------------------: |
| Narrow-neck fill: retraced completed top span     |     29.6 mm |                       0 mm |
| Narrow-neck fill: total running travel            |   128.70 mm |                   56.14 mm |
| Narrow-neck fill: stitches / jumps / trims        | 957 / 1 / 1 |                934 / 2 / 2 |
| T-shaped automatic satin: return travel           |    26.54 mm |                       0 mm |
| T-shaped automatic satin: top needles             |         185 | 185, identical coordinates |
| T-shaped automatic satin: jumps / trims           |       1 / 1 |                      2 / 2 |
| Narrow curved manual satin: sewn underlay needles |           0 |                         16 |
| Narrow curved manual satin: top needles           |          61 |  61, identical coordinates |
| Narrow curved manual satin: jumps                 |           6 |                          1 |

Tradeoffs are visible: some counter fills retain short inset-tip returns; one
counter fixture goes from 18 to 31 non-lock stitches shorter than 0.3 mm while
reducing running travel from 44.95 to 35.91 mm. A realistic 11-object SVG retains
all 2,340 required fill positions, with jumps increasing from 13 to 47 and routing
stitch count decreasing from 2,434 to 2,080. This conservative option prioritizes
avoiding sewn returns over minimizing jump count; it is not a universal optimizer
or a physical guarantee that every connection is hidden.

## Focused diagnostics

Design Issues can report long returns through completed fill/satin, fragmented
curved underlay and concentrated needle visits. **Inspect stitch** selects the
artwork/action and synchronizes the existing timeline, playback position and
visible needle marker. Multi-Hoop warnings keep their hoop number and correct
assembled event offset. Existing warning navigation remains available otherwise.

Needle clustering uses counts on the studio's 0.1 mm grid and in 1 mm squares.
A warning requires at least eight visits to one grid position, or a combination
of high local count (24), repeated points/short stitches and sufficient frequency.
These are conservative inspection heuristics, not manufacturer or fabric limits.
Intentional run/bean/triple actions, manual commands, locks and anchors are not
classified as construction faults. No stitches are deleted by diagnostics.

Existing tight-turn, narrow/wide rail, overlap/fallback and unsewable-grid warnings
remain. Extremely tight corners, ambiguous rail correspondence and fragmented
stroke extraction still need source adjustment/direction guides. No experimental
corner reshaping, global density increase, border widening or pull-compensation
change was made. These retained limits are deliberate regression protection.

## Supplied sew-outs and machine files

The first two photographs are identical; the set shows connecting thread, fill/
outline registration gaps and rough narrow outlines. Photos cannot identify
command type, intended stitch phase or an individual software cause by themselves.
All three supplied PES files decode successfully. They contain 19,108 / 9,080 /
5,660 stitches respectively, with 59 / 48 / 54 jumps and 58 / 47 / 53 encoded trims.
Many short stitches and repeated placements are present, but source phases are
not retained in PES; ties, anchors and intentional construction cannot be reliably
separated from those counts. The files were not rewritten or bundled publicly.
No fault in tension, threading, stabilization or maintenance is inferred.
The reproduced fixes are plausible software contributors, not a claim to have
explained every defect in the photographs. No new physical sew-out was performed.

## Reference package and repeatable checks

Run from the repository root, with the configured Python runtime:

```
node scripts/quality-reference-plans.mjs
```

This creates `test-results/stitch-quality-reference.zip`: six original diagnostic
PES files, six editable `.embstudio` sources, actual command JSON/SVG plots, a
comparison report and instructions. It uses no supplied artwork or photos.
The source geometry hashes match within each pair; PES files fit the SE700's
100 × 100 mm field and retain the corrected origin. SVG plots are zoomed views,
not actual-size alignment templates. Physical results remain to be evaluated.

Legacy event snapshots, satin needle/angle/spacing equality, contour containment,
all six supported format round trips, independent PES coordinates/origin, My
Artwork, saved projects, Multi-Hoop and browser workflows are covered by tests.
See [progress and release evidence](STITCH_QUALITY_PROGRESS.md) for exact checks,
commits, unresolved limits and deployment status.
