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
   browser regressions. Workstream 3 complete. Final full regression/CI, merge,
   Pages and live verification pending. No physical sew-out is claimed.

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
