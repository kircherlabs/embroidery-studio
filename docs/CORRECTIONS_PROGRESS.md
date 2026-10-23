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
3. Closed Shape: reversible edge/node/contour operations pending.

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
