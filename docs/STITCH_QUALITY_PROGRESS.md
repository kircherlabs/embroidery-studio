# Stitch quality audit — progress

Base: main `6c3a53b0aff43eac2d9006673d61b3e4d7e92113` (v0.18.3).
Branch: `fix/stitch-quality-audit`. No deployment until A/B/C pass.

## A — Travel and underlay routing: implemented and tested

Confirmed `routeFill` includes completed rows in its routing graph and shortcuts
by polygon containment, which does not establish future thread coverage. A
reproducible narrow-neck fill retraced 29.6 mm of completed top spans. Quality
routing excludes completed graph nodes and retains graph paths through remaining
rows instead of taking arbitrary long polygon shortcuts. It keeps every original
top span. Underlay already precedes Tatami/emboss top stitching; no global object
or sewing-action reordering was needed.

Initial milestone-A narrow-neck output (mm), before final entry refinement: completed-row retrace 29.6 -> 0; generated
running travel 128.70 -> 44.24; stitches 957 -> 933; jumps/trims 1/1 -> 3/3.
Counter fill travel 44.95 -> 35.50, jumps/trims 1/1 -> 2/2; retained local inset-tip
returns add 12 short stitches (18 -> 30). These are tradeoffs, not proof of physical
sew-out improvement. No universal concealment guarantee is made.

Compatibility: missing/false `planning.qualitySafeguards` retains exact historical
events. One checkbox in existing Digitizing & sequence opts older projects in;
new blank designs enable it. It is saved and undoable. Source geometry, custom
spacing/corner settings and export writers are untouched. Twelve frozen legacy
fixtures plus the existing 120 Tatami event/row snapshots remain byte-identical.

Files: fill-routing.js, planning.js, engine.js (runtime flag only), model.js
(validation), app.js/index.html/help.js (one existing-panel option), quality
fixtures/metrics/snapshots and stitch-quality unit/browser tests. Existing
travel-browser explicitly selects legacy mode to retain its original optimizer
limits, rather than weakening those assertions.

Validation: baseline 400 Node tests passed before edits; 14 focused routing,
legacy and quality tests passed. Chrome quality and travel workflows passed,
including actual generation, unchanged source, Undo/Redo, save/reopen, refresh,
new-project default, mobile controls and the original 13-jump SVG regression.

## Inputs audited

The first two supplied photos are identical. Photographs show visible connecting
threads, registration gaps and irregular narrow outlines; they cannot identify
command phases or distinguish jumps from running stitches by themselves.
The three supplied PES files decode successfully through the existing bridge:

| File                        | Stitches | Jumps | Encoded trims | Color changes | Nonzero stitches <0.3 mm |
| --------------------------- | -------: | ----: | ------------: | ------------: | -----------------------: |
| Nate-Overalls_Clifford2.pes |    19108 |    59 |            58 |             7 |                     3906 |
| Nate---Rocket2 (1).pes      |     9080 |    48 |            47 |             5 |                      656 |
| HayDave (1).pes             |     5660 |    54 |            53 |             0 |                      821 |

Short counts include construction/locks because PES does not preserve source
operation/phase labels. Zero-distance placements mostly coincide with movement
anchors; these counts alone do not justify deleting stitches. Trim commands are
encoded requests, not evidence that hardware executed each cut. Input files are
unchanged and are not bundled in the public repository. Local decoded events and
metrics are under ignored test-results/. No machine faults are inferred.

## B — Satin quality: implemented and tested

Confirmed two defects with failing tests before edits:

1. `manualSatin.walk` uses sparse equal-distance underlay chords. On a 2 mm
   outer-radius/0.4 mm band, they leave the curved band and the existing machine-
   grid validator splits them into six singleton paths. Generated output has six
   placements but zero actual underlay stitches. Quality mode retains the paced
   contour only when the old chord path is unsafe, using existing simplification
   within 10% of band width (capped at 0.05 mm, half the needle-grid step), then
   limits segment length to 2.5 mm. Existing grid validation still applies.
   This sample now has one path, 16 actual underlay stitches and one jump; all 61
   top satin stitches are identical. Total stitches 69 -> 82; trims remain 1.
2. `strokeSatin` calls whole-region `strokeTravel` after finishing each branch.
   Region containment does not conceal a return across completed satin. Quality
   mode keeps branch/sewing order and requests the existing jump/trim transition
   at the next branch. T travel 26.54 -> 0 mm, jumps/trims 1/1 -> 2/2, identical
   185 top stitches. H travel 45.02 -> 0 mm, jumps/trims 1/1 -> 3/3, identical
   293 top stitches. Existing locking, max-span splitting and writer logic remain.

No rail pairing, pacing, corner shortening, width/spacing, junction partitioning,
centerline or border algorithm was replaced. Explicit corner settings remain
unchanged. Extremely tight turns and fragmented automatic columns still require
existing warnings/manual adjustment; they are not silently smoothed or discarded.

Files: manual-satin.js, stroke-satin.js, quality test fixtures, satin-quality unit
suite, extended quality browser suite. Tested center/edge/both underlays, five
narrow/wide rings, T/H/L/I with corner control both on/off, existing centerline and
border output, contour containment, exact top needles/sections and legacy hashes.
38 focused satin/routing tests passed; Chrome quality, manual-rails and satin
workflows passed with independent PES decoding and desktop/mobile editing.

## C — Diagnostics and verification: implemented; release checks pending

Implemented diagnostic-only `stitch-quality.js`: long generated returns, fragmented
manual underlay, and conservative measured needle-clustering warnings. Locks,
anchors, manual commands and intentional running reinforcement are excluded.
Inspect stitch synchronizes selection/action, timeline/playback and actual canvas
needle marker. It leaves an unrelated Focus scope only when necessary to reveal
the explicitly requested target; ordinary/nested Focus interactions are unchanged.
Multi-Hoop quality warnings retain hoop labels and remapped assembled indices.

A final regression test found quality-mode entry at a middle row could add an
avoidable restart. The existing row graph now selects a chain end, and the chosen
entry row is sewn before advancing. New quality rectangles retain one start with
or without underlay; legacy routing stays byte-identical. Final narrow-neck result:
957 -> 934 stitches, running travel 128.70 -> 56.14 mm, completed-span retrace
29.6 -> 0 mm, jumps/trims 1/1 -> 2/2, same 185 underlay stitches. See
STITCH_QUALITY.md for the full table and all retained limitations.

Validation completed locally:

- 418 Node tests; 10 Python codec/format-safety tests.
- 48 additional actual encode/decode checks covering both modes of four quality
  fixtures across PES/PEC/DST/EXP/JEF/VP3, with independent PES needle/origin
  assertions. Existing format restrictions/writers are unchanged.
- Twelve frozen legacy quality streams plus existing 120 Tatami snapshots exact.
- My Artwork/save-reopen rail compatibility, nonrewritten manual commands,
  source immutability, and correct Multi-Hoop warning navigation/field safety.
- Chrome quality/travel/manual-rails/satin/Multi-Hoop/cleanup/fills/properties
  browser workflows passed, including real canvas marker pixels, mouse/touch,
  320/390/768 px layouts, Undo/Redo, saved settings and existing PES regressions.
- A realistic 11-object SVG retains all 2,340 required fill positions; quality
  jumps 13 -> 47, routing stitches 2,434 -> 2,080. One browser timing sample was
  943 ms legacy / 569 ms quality; this is an observation, not a speed guarantee.
- Diagnostic-only scan of 150,000 needles measured about 120–140 ms locally.
- Before/after command plots and the actual in-app marker were visually inspected.
  The three supplied PES streams were also rendered privately; no source phases
  or new physical-sewout verification can be recovered from those files.

`scripts/quality-reference-plans.mjs` generated six original PES reference samples,
editable projects, event JSON, SVG plots, metrics and instructions in ignored
`test-results/stitch-quality-reference.zip`. No supplied PES/photo data is bundled.
All reference pairs have matching source-geometry hashes. Physical comparisons
remain to be performed; small diagnostic satin samples retain narrow-band warnings.

## Exact next steps

Final Edge production quality/closed-curve checks passed, including Focus-scope
inspection and unchanged source. Commit milestone C,
push and open PR, require the complete existing CI (now 50 browser scripts), merge,
wait for Pages and verify live source hashes and quality behavior. Update this
record with exact commits/run IDs. Do not deploy if any critical regression remains.
Local source server: 5173; production server: 5174. No critical product regressions
are currently known. Existing severe corner/rail ambiguities remain documented
manual-adjustment cases rather than unverified automatic repairs.

Protected refs: BACKUP-V0.18.3 = 6c3a53b0aff43eac2d9006673d61b3e4d7e92113;
BACKUP-V0.18.0 = 8aed6698c00a3b34485f0a778511f78e0302c32f;
backup-before-creative-update = 99c0a78cd7ec7c026d32c44195ebea882f06c925.
