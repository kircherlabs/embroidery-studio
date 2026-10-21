# Fill expansion — implementation assessment

Assessment date: October 21, 2026. Verified base: v0.15.0, main
`6a0dcd267580a8fff1ca38438f3fd2a720091a75`.

Status: research and read-only experiments complete; production implementation
awaits the approval requested in the pasted assignment. No engine, UI, writer or
project schema has been changed. The protected backup refs remain unchanged.

## Findings against the supplied research

Read the five requested starting documents, all six topic/license reports and
the texture, contour, cross, emboss and organic prototypes. The package targets
v0.9.0; its source line numbers, test counts and equipment assumptions are stale.
Its separation of Tatami penetration textures from path-based fill methods is
appropriate for current main.

Confirmed on current source:

- `fillRows()` still supports quarter, half and aligned; rows begin at rotated
  bounds plus half a row spacing. The along-row lattice is tied to rotated world
  coordinates. This is not a fully object-attached pattern frame.
- Object and operation `pattern` fields have separate three-value whitelists.
  Project `VERSION` is still strictly 1. Unknown extra fields are accepted: an
  experimental `fillSettings: {method: 'meander'}` passes today's validator and
  produces unchanged Tatami. New feature files therefore need explicit guarding
  against older applications silently sewing the wrong method.
- `routeFill()` is a scanline-span graph. Keep it for Tatami; do not disguise
  contour loops, meanders or cross tours as scanline rows.
- `fillPolygons()`, `offsetRings()` and `safeConnector()` already handle important
  geometry work. `safeConnector()` splits at contour intersections, making it
  stronger than the prototype's ten-point connector sampling.
- The app already debounces generation by 100 ms and rejects stale worker result
  IDs. It does not interrupt a synchronous in-flight generation or bound queued
  work before completion. A cancellation message alone cannot interrupt that
  synchronous worker handler.
- Equipment is now a separate catalog. `getMachine(project)` supplies a 7 mm
  application stitch cap; this is not evidence of an official limit for every
  manufacturer/model. Preserve existing equipment and export safety policies.
- The event emitter quantizes to 0.1 mm, handles machine-safe subdivision, removes
  redundant generated penetrations and enforces 250,000 commands. Intentional
  positioning anchors and tie stitches must be distinguished in quality metrics.
- My Artwork, physical-thread snapshots, style transfer and geometry effects are
  implemented. New fill settings must integrate with all of them.

### Measurements from unchanged main

Ten geometries × three legacy patterns × two angles × two spacings produced
120 cases. Every full event stream regenerated identically. Scratch snapshots
include full events, SHA-256 event/row hashes and input projects.

The table measures individual raw fill-row segments, with 3 mm stitch length,
0.42 mm row spacing, zero compensation and no underlay. These are not total
machine-command counts: final plans also include routing, anchors and ties.

| Geometry | Angle | Row segments | Below 0.3 mm | Below 0.5 mm | Shortest |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rectangle 30 × 20 mm | 35° | 551 | 10 | 24 | 0.088 mm |
| Circle, radius 12 mm | 0° | 414 | 8 | 18 | 0.082 mm |
| Five-point star | 0° | 266 | 14 | 29 | 0.080 mm |
| Letter-like B with counters | 35° | 344 | 16 | 30 | 0.081 mm |
| Image-traced contour with hole, 123 vertices | 35° | 1,405 | 30 | 51 | 0.067 mm |

The first four measurements reproduce the corresponding research numbers.
Adjacent 10 mm rectangles reproduce the 0.34 mm seam gap rather than 0.42 mm.
Twenty-millimeter rectangles give a different 0.26 mm gap; this is shape-relative
row positioning, not one universal seam error.

Node median generation times over five warmed runs, including underlay and
compensation: 40 × 25 mm rectangle 1.58 ms / 1,231 events; 100 × 100 mm rectangle
7.73 ms / 10,417 events; traced contour 6.12 ms / 2,093 events. These are local
baseline measurements, not promises for new generators or mobile devices.

Existing baseline: 310 Node tests and 10 Python codec/format tests pass. Browser
suites were not rerun for this read-only assessment; v0.15.0's 42-suite release
verification is recorded separately in MY_ARTWORK_PROGRESS.md.

## Research recommendations to correct

1. **Edge merging:** simply deleting an edge-adjacent penetration can make a
   stitch longer than the UI's configured maximum segment length. Today's final
   emitter may subdivide it again. Use opt-in, constrained local redistribution
   of edge intervals, preserving boundary endpoints and coverage. If a narrow
   span cannot satisfy a minimum length, retain it and report the limitation.
   Do not delete thin details or globally change legacy output.
2. **Containment:** testing points or a fixed number of probes is insufficient.
   Check complete sewn segments, including connectors and quantized chords,
   against explicit material polygons and counters. Retain deliberate configured
   compensation allowances; do not accept a percentage of stitches through holes.
3. **Cross stitch:** a 75% area sample can admit crosses outside a concave edge or
   through a small hole. Default to complete valid Xs whose actual diagonals are
   contained. The prototype's grid search also stays near world zero despite
   computing an unused shape center, so distant translated artwork can disappear.
   Its unconstrained Euler route does not enforce consistent top diagonals.
   Also, 2 mm cells give 0.25 crosses/mm², not the report's 0.5.
4. **Meander:** the organic prototype explores only one tree component; node and
   midpoint checks do not prove whole-edge clearance. Its tube radius/spacing
   must be collision-checked after union, smoothing and quantization. The grid
   result is a useful coverage scaffold but fails the requested organic look.
   Do not release a maze under a new stipple label. All five requested presets
   need actual geometric and visual distinctions.
5. **Emboss:** the prototype can collapse a narrow span to one point during
   short-stitch merging. Boundary motifs also cause documented stitch-count
   growth. Preserve span endpoints, prioritize feasible motif penetrations, bound
   clustering/count growth and report any reduced motif fidelity explicitly.
6. **Spiral/ripple:** discard the non-monotone nearest-point spiral blend. Never
   enable the research's `ignoreHoles` option: preserved counters are a requirement.
   Offer an explicit Contour alternative if Spiral is unsuitable, never an
   automatic silent method substitution or deletion of branching regions.
7. **Safety thresholds:** jump count, short-stitch share, coverage and minimum
   spacing in the reports are proposed heuristics, not hardware facts. There is
   no universal one-jump-per-component guarantee for complex geometry. Tune and
   explain quality warnings separately from hard export restrictions.
8. **Cancellation:** reject a whole over-budget generation with an actionable
   error; do not export a silently truncated path prefix. Successful outputs must
   stay deterministic regardless of machine speed or wall-clock timing.

## Architecture and parameter contract

Keep operation `type: 'fill'` and existing shared source geometry. Use a validated
optional `fillSettings` object with its own schema version, method, method-specific
parameters, texture, anchoring and seed. Legacy operations without it follow the
exact current code path. Retain `pattern` as the canonical source for existing
quarter/half/aligned settings; do not persist contradictory texture choices.
Derive effective parameters through one normalization/validation helper shared
by object-level legacy adapters and sewing operations.

Suggested modules under `src/fills/`:

| Module | Responsibility |
| --- | --- |
| schema.js | Pure metadata, bounded validation/defaults, feature detection; no engine imports |
| registry.js | Generator dispatch and contextual method capabilities |
| context.js / region.js | Explicit polygons, holes, bounds, coordinate frame, cost budgets |
| textures.js | General phase sequences, deterministic random variation and optional edge handling |
| paths.js / travel.js | Open-path clipping, length/quantization checks, safe component connections |
| diagnostics.js | Method-specific spacing, clustering, travel, topology and count metrics |
| contour.js, meander.js, cross.js, emboss.js, ripple.js, spiral.js | Independent stitch generators |

Generators return paths plus structured issues and metrics, not machine files.
Adapt to the engine's existing `{p, phase, connect}` path flow, then use the same
emitter, travel/trim policy, preview events and exporters. Do not require a second
simulation or writer. Avoid a `model → registry → engine → model` import cycle:
validation metadata must be independent of generator imports. Reuse existing
resampling through an injected context helper initially; do not rewrite it.

Extend these existing integration points:

- `engine.js`: `pathsFor()`, a trailing optional Tatami hook, generated issues.
  Keep underlay and top paths unchanged for legacy operations. Explicitly exclude
  Satin Column paths and all satin-wide/fallback `fillRows()` calls from new fill
  settings; inherited source settings must not leak into satin generation.
- `operations.js`: effective/default/make operations, settings allowlist,
  applicability and `operationObject()`. The existing `contour` operation is an
  **Offset outline**, not Contour Fill; preserve its identity and behavior.
- `model.js`: shared configuration validation and feature-aware project version.
- `planning.js`: retain source-order/construction dependencies, polygon/island
  normalization and IDs. Carry the original operation pattern frame into split
  units so islands do not independently restart a new texture.
- `method-ui.js`, `inspector.js`, `sewing-actions.js`, `styles.js`: contextual Fill
  method/texture controls in the existing action card; no competing style panels.
- `style-transfer.js`: explicitly extend its settings allowlist. Color-only
  transfer must not replace methods or pattern parameters.
- `smart-geometry.js`: update new pattern origin/orientation in `sourceTransform()`
  for transforms, mirroring, duplicates, linked instances and library placement.
- `digitize-worker.js`, `app.js`: retain ID checks/debounce; terminate and replace
  an obsolete in-flight worker or use genuinely yielding generation. Do not rely
  on a cancellation message arriving during a synchronous loop. Cache bounded
  pre-travel components only, with geometry/parameters/frame/schema in the key.
- `design-issues.js`: reuse per-object/per-action issue navigation and deduplication.
- `artwork-library.js`, `artwork-records.js`, storage/clipboard/project serialization:
  preserve fill settings and apply the same capability/version guards to fragments.

### Coordinates, compatibility and defaults

- Legacy anchoring, three patterns, underlay, density and routing stay byte-equal.
  Golden event hashes must fail on any changed command, position, order or phase.
- New patterns default to an object-attached origin/orientation. Translation,
  rotation and mirroring carry it with the artwork. Row spacing, stitch length
  and motif dimensions remain physical millimeters on resize; resize changes
  repeats rather than silently scaling density. An explicit global/canvas anchor
  lets neighboring regions share a lattice. Freeze and test this contract in A.
- Store integer seeds and bounded custom sequences; use order-independent hashing
  and floor-mod for negative indices. No saved functions or generated stitch caches.
- Proposed project format: accept existing v1 unchanged; emit guarded v2 only when
  new fill behavior is used. Validate required capabilities; unsupported readers
  must reject rather than silently downgrade. Apply equivalent guards to My
  Artwork records/backups. Reusing an old project stays v1 until it opts in.
- Keep dense Tatami underlay behavior. Open fills default to no dense underlay,
  with explicit supported stabilization options. Do not inherit irrelevant
  compensation/density controls and pretend they change an open-fill algorithm.
- Use the existing 0.1 mm output grid and application/machine constraints. Check
  sensitive geometry again after quantization. Count deterministic work/events
  before allocating large arrays; retain a final hard event cap.

## Proposed milestones and acceptance gates

| Order | Milestone | Required result before commit |
| --- | --- | --- |
| 1 | A — Baselines and architecture | Commit fixed-ID legacy fixtures/hashes first; add settings/version guards, frame contract, path adapter and bounded worker plumbing without changing legacy events. |
| 2 | B — Tatami presets | Real quarter/brick/aligned/twill/random/wave/third/fifth/progressive/chevron needle placements, deterministic generation, contextual picker previews. |
| 3 | C — Advanced Tatami | Custom sequences, seed/repeat/anchor/reset, opt-in edge improvement; measured short-stitch changes within coverage/length constraints. |
| 4 | D — Contour | Original-region offset levels and topology-aware loops; complete connector containment, holes/islands, collapse diagnostics and actual export. |
| 5 | F — Cross Stitch | Complete X cells, consistent top diagonal, safe row tours, translated/rotated grid, edge omission feedback and export. |
| 6 | E — Stipple/Meander | Classic, Fine, Open, Organic and Looping; collision/clearance/containment tests plus visual review. Prototype experiments are not a completed preset. |
| 7 | G — Embossed Tatami | Six requested original motif families expressed in real penetrations; bounded count/short-stitch growth and honest surface-texture terminology. |
| 8 | H — Ripple and Spiral | Circular/elliptical clipped arcs with adjustable center; one reliable noncrossing spiral with explicit suitability checks. Preserve every hole. |
| 9 | I — Integration/release | Full UI/mobile/performance/persistence/My Artwork/export regression, documentation and SE700-sized reference sew-out files; CI before publication. |

Cross is moved ahead of Meander to validate shared grid/segment/travel machinery
before the highest visual-quality risk. All requested families and presets remain
in scope. Integrate working UI, tests and diagnostics with each method, not only I.
No empty controls or unavailable presets count as implemented features.

## Required verification

- Preserve the 120 scratch baselines as compact checked-in fixtures/hashes in A;
  extend them with operation stacks, underlay/compensation on/off, winding variants,
  imported SVG, transformed and adjacent regions, and dense traced artwork.
  Current traced baseline has 123 vertices; add a realistic ≥300-vertex case.
- Every new method: all sewn segments and counter clearance, finite/quantized
  coordinates, configured/application length limits, source immutability, seed
  determinism, parameter effects, topology changes, safe travel and bounded cost.
  Test narrow/tiny regions and distant/negative coordinates. Account for deliberate
  X/loop intersections separately from unintended crossings.
- Tatami: exact phase/repeat sequences; new random seeds actually change coordinates;
  shared global lattice; edge quality versus unchanged legacy event streams.
- Method gates: contour split/collapse and complete connectors; meander organic
  appearance and nonlocal clearance; cross top-diagonal order; emboss motif
  penetrations/count growth; ripple/spiral clipping and seam/self-crossing checks.
- Browser: in-place method switching, contextual controls/reset, mixed selections,
  no duplicate sewing actions, rapid edits/stale worker cancellation, history,
  project reload, style transfer, groups/text/effects, My Artwork across projects,
  desktop/mobile and keyboard Hints. Thumbnails must come from actual generator
  paths; the simulator/export must share the authoritative full stitch plan.
- Decode representative PES/PEC and existing supported formats independently;
  compare needle coordinates/order, colors/pauses/trims, extents and corrected
  origin. Preserve current JEF/VP3 and multi-format ZIP restrictions.
- Benchmark Node and worker/browser runs, including 100 mm designs and complex
  traced regions. The package's timing/coverage/density targets are initial review
  budgets, not universal validity or physical-quality thresholds.
- Prepare editable ≤100 × 100 mm swatches with settings, counts and dimensions.
  Computational checks and reference files do not establish physical sew-out.

## Thread matching attachment — separate assessment

Current `thread-matching.js` uses cached D65 Lab and Delta E 1976, not CIEDE2000.
It already supports brand/line and owned-only filtering, five candidates,
deterministic identity ties, original design colors and portable thread snapshots.
The attached document is useful follow-up input, not a dependency for fill methods.

For a separate matching milestone: implement CIEDE2000 against the full published
reference pairs, then owned/preferred-line tie policy and explicit reviewed palette
assignment. Preserve leading-zero identities and locked/user selections. Never
re-match on reload or silently merge design colors to resolve a matching collision.
Official conversions require verified usable data; none should be invented from
equal spool numbers or the attachment's small comparison sample.

Correct one formula recommendation first: in CIEDE2000, increasing `kL` to 2
**reduces** the lightness penalty because it is in the denominator. A
lightness-preserving mode instead needs an explicit lightness-order constraint
or a correctly defined weighting objective. The assignment algorithm alone does
not impose a pairwise Delta E separation constraint. Do not change the existing
PEC palette mapping/writer as an incidental part of either fill or matching work.

## Primary references checked

- [Wilcom stippling settings](https://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Decorative/specialty/specialty-12.htm): running-stitch stippling, loop spacing and inset controls.
- [Clipper 6.4.2 offset documentation](https://www.angusj.com/delphi/clipper/documentation/Docs/Units/ClipperLib/Classes/ClipperOffset/_Body.htm): winding and non-self-intersection prerequisites. Use the already-vendored version, not an assumed Clipper2 API.
- [Gabriely/Rimon spanning-tree coverage paper](https://www.cs.cmu.edu/~motionplanning/papers/sbp_papers/integrated4/gabriely_spanning.pdf): a grid coverage construction; this does not prove organic embroidery appearance or fine-feature coverage.
- [Sharma/Wu/Dalal CIEDE2000 paper](https://hajim.rochester.edu/ece/sites/gsharma/papers/CIEDE2000CRNAFeb05.pdf) and [supplementary data page](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/): reference equations and implementation tests.

Reuse the repository's existing Clipper/polygon-clipping libraries and retain
their notices. Independently implement new algorithms; do not bundle third-party
pattern/tile assets or translate GPL stitch code. The research author's suggested
prototype license is not a substitute for explicit provenance if code is reused.

## Approval and next action

No repository-wide rewrite or new external library is currently necessary. The
substantive risks are organic meander quality, topology-safe spirals, emboss
clustering, and complete version guarding across projects/library fragments.
They are engineering gates with explicit diagnostics, not reasons to ship a
misleading approximation.

Approve the fill architecture and sequence above to begin A, then proceed through
verified milestone commits. Treat the matching attachment as a separately
approved follow-up so fill changes cannot silently alter existing spool matches.
