# Multi-hoop, Sequence and Closed Shape corrections

Base: v0.18.0, main `8aed669`. Three independently tested commits required.
Protected backup branches must remain unchanged.

1. Multi-hoop: corrected the domain coordinate frame used by generated underlay.
   Added complete-result and join inspection controls and source/action eligibility.
   Tests cover two/three fields, 0/37/90-degree rows and three seam positions.
   Verified: 22 focused Node tests, real six-format encode/decode and complete
   Chrome Multi-Hoop workflow, including join/full-result controls. Workstream 1 complete.
2. Sequence: internal short pattern repositioning, external untrimmed connections
   and trim-dependent connections are separately reported. All remain inspectable;
   internal connections are not claimed hidden. Imported/decoded commands stay
   conservative. Hooping ranges/navigation and active playback labels implemented.
   Verified 12 unit tests and the complete cleanup browser/export regression;
   Multi-Hoop labels/navigation browser check passed. Workstream 2 complete.
3. Closed Shape: independent edge controls, reversible Corner/Smooth states,
   explicit Break Handles, retained Symmetric handles, per-contour smooth/restore,
   node styling, contextual mouse/touch actions and compound editable sources.
   Verified 7 new unit tests, legacy path/creative units, the new Chrome workflow
   (including independent PES needles), nested Focus, path editing and effects
   browser regressions. Workstream 3 complete. All regression, merge, Pages and
   public-site checks below are complete. No physical sew-out is claimed.

## Verified release — v0.18.1

All three workstreams are complete and published through
[PR #30](https://github.com/kircherlabs/embroidery-studio/pull/30).
Final source head: `722725121ed6e6e8952d115b9e969dfd6e5bcbc9`.
Deployed merge: `f21a375beefcb1185a1be251d5c462787c50d636`.

- [Exact-head PR CI](https://github.com/kircherlabs/embroidery-studio/actions/runs/40033921562)
  passed: 386 Node tests, 10 Python codec/format-safety tests, all 48 browser
  suites and the production build.
- [Main CI and Pages](https://github.com/kircherlabs/embroidery-studio/actions/runs/40035528339)
  repeated the full suite successfully and deployed the release.
- Local Chrome regression and production Edge checks passed. Desktop/mobile,
  mouse/touch, four-level nested Focus, project persistence, My Artwork and
  geometry/stitch-export regressions remain covered.
- Public-site verification on 2026-10-23 matched all 15 changed runtime assets
  by normalized SHA-256 to the deployed merge. Closed Shape, Multi-Hoop and
  cleanup browser suites then passed against the public site, including actual
  three-hoop/six-format downloads, independent PES needle decoding, print scale,
  curve restoration/history/reload, cleanup navigation and byte-identical PES.
- The live 250,000-command cleanup fixture measured approximately 49 ms for
  estimation and 21 ms for canvas rendering on the local test machine. These
  are measurements, not hardware-independent performance guarantees.
- Protected `BACKUP-V0.18.0` remains `8aed6698c00a3b34485f0a778511f78e0302c32f`;
  `backup-before-creative-update` remains
  `99c0a78cd7ec7c026d32c44195ebea882f06c925`. No backup branch was modified.

No implementation or deployment steps remain. Optional follow-up verification
requires the original sparse-view project or physical sew-out hardware, as
described below. User instructions: [Closed Shape editing](CLOSED_SHAPE_EDITING.md).
Local screenshots and live hash evidence are in ignored `test-results/`.

## Findings and validation notes

The original Tatami screenshot/project was not supplied with this corrective
request, so its exact sparse-view cause cannot be asserted. A coordinate-frame
mismatch in seam-limited underlay was confirmed and fixed. Top coverage remains
consistent in 18 two/three-field angle/seam cases. Join/full-result actions show
the complete generated sequence rather than a partial playback position.

A generated flower fixture reproduces the cleanup inflation: 139 jumps / 138
connections are now separately reported as 2 external estimates, 132 short internal
pattern connections and 4 trim-dependent connections. Internal does not mean
physically hidden; every connection remains inspectable. Genuine bridges across
holes and unknown/imported paths remain conservative. Exports are unchanged.
The collapsed summary also displays internal and trim-dependent counts; a low
external estimate must never imply those other connections are guaranteed hidden.

Closed contour snapshots remain in source-local coordinates. A regression also
caught preserved flat geometry being misread by the existing world-curve helper;
that helper now materializes world controls without stale local restoration data.
Whole-contour reversal restores nodes/handles and the original flat contour.

Linux CI caught a delayed native double-click retargeting another object. The
timing heuristic was replaced by native mousedown click-count context captured
before selection changes. The regression intentionally delays the second click;
the newly selected object must remain untouched. Navigation gestures are ignored.

## Interior split audit

Whole objects/action stacks and disconnected complete contours remain preferred,
regardless of names such as lettering. Eligibility is based on enabled actions.

| Method                                         | Interior-cut support                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Tatami, Embossed Tatami                        | Automatic on valid closed source with exclusive coverage and no inset; shared row/texture grid, regenerated underlay/ties |
| Running, Bean, Triple                          | Constrained to source paths without offsets; new ends get independent ties                                                |
| Satin Centerline, Border, Column, paired rails | Unsupported interior cuts; widths/rail correspondence/border construction must remain intact                              |
| Contour Fill, Meander, Cross, Ripple, Spiral   | Unsupported interior cuts; regenerating each region would reset pattern topology                                          |
| Placement, Tackdown, Basting, Offset outline   | Keep complete construction/offset geometry; artificial cut-edge sewing is unsafe                                          |
| Marker, manual needle data, stop/trim stacks   | Keep intact with related artwork; no finished-command clipping                                                            |

Insets are applied before fill generation and cannot be repeated independently on
new seam edges. Mixed stacks remain unsupported when any enabled action is unsafe.
No generator is changed to make an unsupported split appear successful.

## Changed files and independent commits

- Multi-Hoop (`428d721`): `src/fills/registry.js`,
  `src/multi-hoop-inspection.js`, `src/multi-hoop-split.js`,
  `src/multi-hoop-ui.js`, `tests/split-corrections.test.mjs`, and
  `tests/multi-hoop-browser.mjs`.
- Sequence (`0e08164`, visibility follow-up `c6b338d`):
  `src/manual-cleanup.js`, `src/sequence-timeline.js`, related stage/app
  integration and workspace styling, `tests/sequence-corrections.test.mjs`,
  and `tests/cleanup-browser.mjs`.
- Closed Shape (`635cb1c`, follow-ups `bd58362`, `8020751`, `7227251`):
  `src/closed-curve-editing.js`, `src/smart-geometry.js`,
  `src/path-editing.js`, `src/model.js`, `src/stage.js`, `src/creative-ui.js`,
  `src/app.js`, `index.html`, `tests/closed-curve-editing.test.mjs`, and
  `tests/closed-curve-browser.mjs`.
- Release/integration: `.github/workflows/pages.yml`, `package.json`,
  `workspace.css`, `README.md`, this progress record, and
  `docs/CLOSED_SHAPE_EDITING.md`.

## Remaining limits

Unsupported interior cuts remain blocked as listed above. Large or invalid
curves can exceed the existing 2,000-anchor/interactive-validation budgets and
are rejected without destructive conversion. Internal thread connections remain
estimates, not a promise that thread is physically hidden or automatically cut.
Original-project reproduction and physical alignment/sew-out verification need
the source project and actual hardware respectively; neither is claimed here.
