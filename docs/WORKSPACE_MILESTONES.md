# Professional workspace roadmap and implementation audit

## Current status — 0.12.6

| Milestone                    | Status   | Delivered / remaining                                                                                                           |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Drawing and editing      | Complete | Pencil, sculpting, cutting, joining and erasing.                                                                                |
| 2 — Manual satin             | Complete | Independent rails, rungs, variable width, seams and paired splitting.                                                           |
| 3A — Text along paths        | Complete | Editable curved/circular lettering and baselines.                                                                               |
| Rest of 3 — Advanced artwork | Complete | Reversible offsets/simplification, sewing-style sampling/transfer, linear/radial/mirrored repeats and optional linked geometry. |

Physical sew-outs of new satin and lettering remain necessary. See the release
sections below for software validation and known limitations.

## Initial audit

Baseline: main `0608066`, version 0.8.0. Protected backup
`backup-before-creative-update` exists and is not modified.

| Capability                                                              | Baseline              | Reuse / milestone                                                      |
| ----------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------- |
| Click-drag Bézier pen, anchors, tangent handles, double-click insertion | Implemented           | Extend Node; retain exact cubic splitting                              |
| Freehand pencil                                                         | Missing               | Milestone 1: bounded smoothing and editable curves                     |
| Drag curve segments                                                     | Missing               | Milestone 1: local Bézier sculpting                                    |
| Knife, split, endpoint joins, brush eraser                              | Missing               | Milestone 1: geometry operations with reversible, explicit conversions |
| Rectangle, ellipse, regular polygon, star, eyelet                       | Implemented           | Milestone 1: compact Shapes family; retain parameters                  |
| Boolean union/difference/intersection/xor and offsets                   | Implemented           | Reuse polygon-clipping and Clipper; preserve holes                     |
| References, hierarchy, groups, transformations, locks                   | Implemented           | Integrate new tools with existing selection/history                    |
| Automatic stroke satin and editable direction guides                    | Implemented           | Preserve; no automatic-font rewrite                                    |
| Two independent editable satin rails                                    | Missing               | Milestone 2, deferred from this release                                |
| Variable-width manual rail construction and closed-ring correspondence  | Missing               | Milestone 2, deferred; retain current Centerline/Border/Column         |
| Editable lettering and font changes                                     | Implemented           | Preserve                                                               |
| Text along editable paths                                               | Missing               | Milestone 3, deferred                                                  |
| Reversible fillet source, operation offsets                             | Implemented / partial | Milestone 3: additional nondestructive effects deferred                |
| Color palette and per-action parameters                                 | Implemented           | Milestone 3: eyedropper/style transfer deferred                        |
| Duplicate, copy/paste, mirror, align/distribute                         | Implemented           | Preserve; linked/linear/radial repetition deferred to Milestone 3      |
| Docked draw controls, resizable panels, navigation, Hints               | Implemented           | Extend existing controls rather than add floating panels               |

## Staged delivery

1. **Drawing/editing:** freehand to editable curves; local segment sculpting;
   knife/split, join/close/reverse and vector eraser; compact Shapes access.
   Validate geometry, operations, Undo/Redo, project files and PES in a complete
   browser workflow before deployment.
2. **Manual satin:** independently editable rails, correspondence/seams, existing
   direction-guide integration and true variable-width manufacturing. Do not ship
   a renamed centerline or placeholder rail tool with milestone 1.
3. **Advanced artwork:** live text on paths, additional nondestructive effects,
   style transfer and repetition, after rail and drawing foundations are stable.

Each completed milestone must remain usable independently. The first release does
not claim completion of milestones 2 or 3 or physical embroidery quality testing.
The graph travel optimizer, satin algorithms, operation model and PES/PEC exporter
remain in place.

## Milestone 1 delivered in 0.9.0

Pencil, segment sculpting in Node, symmetric handles, area/path Knife, area/line
Eraser, endpoint joins, closure/reversal and compact Shapes are implemented.
Controls remain docked above the canvas. See [the user and engineering guide](VECTOR_EDITING.md)
for algorithms, conversion rules, precision and limits. New tests supplement the
existing regression suites. At the 0.9.0 release, milestones 2 and 3 were deferred;
subsequent deliveries are described below.

## Milestone 2 delivered in 0.10.0

Two independent editable Bézier rails, variable-width correspondence, editable
rungs, closed bands/counters, seams, rail orientation, complete sewing reversal,
width adjustment, underlay, compensation and paired splitting are implemented.
Creation reuses existing paths without destroying the originals. Node editing,
transforms, history, projects, simulation and machine export share the same source.
See [Manual satin rails](MANUAL_SATIN.md) for controls, reconstruction and limits.
The baseline table above records the pre-milestone audit, not current availability.
At 0.10.0, milestone 3 remained deferred; its first delivery follows below.
Physical sew-outs remain required for the new satin.

## Milestone 3A delivered in 0.11.0

Editable text follows open Bézier curves or closed baselines. Font/content/spacing
changes, along/across positioning, reversal, baseline Node editing, transformations,
sewing actions and portable projects remain editable. Embedded baseline geometry
is excluded from sewing and hoop bounds. See [path lettering](TEXT_PATH.md).

At 0.11.0, additional nondestructive effects, style transfer and repetition remained.
They are delivered below; the initial audit above records historical availability.

## Milestone 3B delivered in 0.12.0 — milestone 3 complete

Properties provides source-preserving contour offsets and bounded simplification,
alongside existing reversible corner rounding. Arrange provides color-only sampling,
single-action settings transfer and confirmed full-setup replacement, plus linear,
radial and mirrored repeats. Optional linked vector/lettering instances share geometry
while keeping independent transforms and sewing actions. Source editing, unlinking,
copy/paste, deletion, project persistence, Undo/Redo and machine output are integrated.
See [Artwork tools](ARTWORK_TOOLS.md) for controls, construction ordering and limits.

The scoped roadmap's three milestones are complete. Linked manual satin rails and
general modifier stacks are not claimed; paired rails retain their dedicated source
tools and support independent repeats. Physical sew-outs remain necessary.
