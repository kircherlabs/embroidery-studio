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

Measured narrow-neck output (mm): completed-row retrace 29.6 -> 0; generated
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

| File | Stitches | Jumps | Encoded trims | Colors changes | Nonzero stitches <0.3 mm |
|---|---:|---:|---:|---:|---:|
| Nate-Overalls_Clifford2.pes | 19108 | 59 | 58 | 7 | 3906 |
| Nate---Rocket2 (1).pes | 9080 | 48 | 47 | 5 | 656 |
| HayDave (1).pes | 5660 | 54 | 53 | 0 | 821 |

Short counts include construction/locks because PES does not preserve source
operation/phase labels. Zero-distance placements mostly coincide with movement
anchors; these counts alone do not justify deleting stitches. Trim commands are
encoded requests, not evidence that hardware executed each cut. Input files are
unchanged and are not bundled in the public repository. Local decoded events and
metrics are under ignored test-results/. No machine faults are inferred.

## B — Satin quality: next

Confirmed manual-satin underlay uses sparse equal-distance chords that can leave
a narrow curved band. The grid validator then repairs endpoints or breaks paths:
a 2 mm outer-radius/0.4 mm band creates 6 underlay paths and 6 jumps. Reproduce in
a failing test, then reuse contour simplification and subdivision to preserve
underlay curvature while leaving actual top satin and explicit corner settings
unchanged. Audit automatic-column inter-stroke routing over completed branches.

## C — Diagnostics / final verification: pending

Add focused, locatable diagnostics from proven construction cases; report tight
turn/crowding risks rather than inventing broad satin replacements. Add before/
after editable reference designs and stitch metrics, six-format decoding,
Multi-Hoop/project/library compatibility and browser regressions. Run complete CI,
commit validated milestones, then merge/deploy and verify live assets.

Protected refs: BACKUP-V0.18.3 = 6c3a53b0aff43eac2d9006673d61b3e4d7e92113;
BACKUP-V0.18.0 = 8aed6698c00a3b34485f0a778511f78e0302c32f;
backup-before-creative-update = 99c0a78cd7ec7c026d32c44195ebea882f06c925.
