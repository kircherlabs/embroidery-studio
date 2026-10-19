# Stitch methods and construction

Each expanded sewing-action card has one everyday **Stitch method** selector:

| Method          | Contextual choice | What the machine does                                                                                |
| --------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| Running Stitch  | Single pass       | Follows a line or outline once.                                                                      |
| Running Stitch  | Bean stitch       | Repeats individual stitch segments locally.                                                          |
| Running Stitch  | Triple run        | Follows the whole path forward, backward, then forward.                                              |
| Tatami Fill     | Fill settings     | Covers a closed region with spaced stitch rows.                                                      |
| Satin Stitching | Satin Centerline  | Sews a satin band along a drawn path. On closed artwork it follows each contour.                     |
| Satin Stitching | Satin Border      | Sews a satin band around closed boundaries.                                                          |
| Satin Stitching | Satin Column      | Crosses the width of narrow filled regions using existing stroke rails or manual direction controls. |

Switching from another category to Satin asks for an explicit construction choice.
Until that choice is made, the current stitches remain unchanged; **Keep current
method** cancels it. Filled lettering is never automatically interpreted as a
centerline. Closed lettering with a deliberate Centerline action displays a
reminder that it follows contours rather than filling letter strokes.

Changing reinforcement or satin construction edits the existing action. It keeps
its identity, color, sequence position and other applicable settings. It does not
add another action. **Add another sewing action** deliberately creates an extra
pass, such as a blue fill followed by a yellow satin border.

## Specialized construction

Expand **Advanced Construction** within an action to change its purpose. The same
section inside **Add another sewing action** adds an independent construction step.
Construction presets still provide appliqué, surrounding patch and other existing
workflows with geometry preflight and ordered shared-geometry actions.

- **Placement outline:** Marks where fabric should be positioned.
- **Tackdown outline:** Secures fabric before finishing; inspect its inset.
- **Basting outline:** Temporary positioning or stabilization; new actions retain
  the existing long-stitch and outward-offset defaults.
- **Offset outline:** Follows an expanded or inset closed boundary. Set
  **Advanced → Contour offset** in millimeters: positive expands, negative insets.
- **Location marker:** Stitches a reference cross; it does not cut or punch fabric.
- **Machine stop:** Pauses for an operator task. Rename it to explain that task.
- **Thread trim:** Requests a thread trim, subject to machine/format support.

Existing specialized actions remain specialized when loaded or inspected. Their
main selector shows **Advanced construction action**, and their actual purpose is
selected under Advanced Construction. Merely inspecting them changes no data.

## Compatibility, bulk editing and help

Open paths support running techniques and satin centerlines. Choosing a method
requiring an area offers the existing explicit **Close paths & use…** workflow,
only when the path can form a nonempty region. Adding an action does not silently
close artwork: incompatible closed-region choices are disabled when none of the
selected objects can use them, and compatibility counts explain partial additions.

Narrow-region suitability is still handled by Satin Column's existing rail
analysis, direction guides, fallback settings and Design Issues. No algorithm or
manual control was removed.

Groups and multiselections retain the explicit first-action/all-actions scope.
Mixed reinforcement and mixed satin constructions display **Mixed** within their
shared category. A change applies to the stated scope while retaining independent
action lists and colors. Existing bulk-all confirmation remains in place.

Turn **Hints** on for physical explanations through hover, keyboard focus or touch
hold. Important closure and construction guidance remains visible without Hints.

## Persistence and verification

The stored types remain `run`, `bean`, `triple`, `fill`, `satin`, `border`, `column`,
`placement`, `tackdown`, `basting`, `contour`, `marker`, `stop` and `trim`. There is no
project migration or engine alias. Sewing sequences, satin algorithms, travel
optimization and PES/PEC origin encoding are unchanged.

Tests verify every old type, exact Single/Bean/Triple needle sequences, construction
offsets, legacy stacks, mixed selections, method identity, Undo/Redo, Hints, project
files, mobile layout and independently decoded PES needles, colors and origin.
