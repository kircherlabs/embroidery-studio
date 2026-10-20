# Active geometry contrast — 0.12.4

The canvas uses a shared white halo and dark foreground to identify editable
geometry over light, dark, same-color and mixed artwork. These are screen-space
editing aids, independent of thread colors and project data. No new setting is
needed. Stitch preview continues to render generated embroidery in its actual
thread colors.

## Cause and rendering changes

Source artwork paint (`o.color`) and sewing-action thread colors are separate.
The canvas suppressed selected stitches during moves, rotations, resizes and node
drags, then showed the original source paint, which could still be the default
gold even when its operation sewed blue. That fallback had no contrasting
perimeter. The same editing flag also increased unselected source-fill opacity,
making surrounding artwork more distracting.

Active previews now use the enabled sewing action's thread color beneath the
contrast outline. Unselected source-fill opacity stays at its usual value.
Sculpting, corner-radius drags and satin direction-guide editing also suppress
stale selected stitches while their source/control geometry changes. Stitch
regeneration remains deferred until the edit finishes.

`src/editing-overlay.js` defines the shared tokens and canvas helpers. Each path
is built once, then stroked with a 5.1 CSS-pixel halo and 1.7 pixel dark center
(slightly narrower for multiselection). Geometry guides use the same halo with
different foreground hues, dashes and marker silhouettes. Widths are divided by
the canvas's physical scale; the existing device-pixel transform keeps the aids
consistent across zoom and high-DPI displays. Satin and eraser washes retain
their physical millimeter width; these are source-width aids, not simulated
needle penetrations or compensated stitch boundaries.

## Rendering audit

| Workflow                                             | Treatment                                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Selecting paths, filled shapes and lettering         | Actual source perimeter, including holes, drawn above stitches; no outline around every internal fill stitch.               |
| Move, rotate, resize, numeric transforms and mirrors | Same source perimeter follows current world geometry; unchanged transformation math and hit targets.                        |
| Groups and multiselection                            | Thin child perimeters and one dashed selection frame; unselected artwork receives no new outline.                           |
| Node, Bézier and sculpt editing                      | Source perimeter plus square anchors, circular tangents and dashed plum control lines.                                      |
| Smart-shape corner-radius handle                     | Haloed diamond at the original control position.                                                                            |
| Pencil, Pen, Closed Shape, running and manual drafts | Haloed source paths and point markers; Closed Shape closure stays dashed and unfilled, and crossings retain red X warnings. |
| Shape creation / marquee                             | Existing extent guides, with contrasting dashed boundaries.                                                                 |
| Knife and vector eraser                              | Haloed cut/brush center paths; eraser coverage remains a translucent physical-width wash.                                   |
| Cutting, joining and Boolean results                 | The shared selection renderer follows their resulting editable contours.                                                    |
| Manual satin rails                                   | A: solid blue and circular seam; B: dashed plum and diamond seam. Both remain haloed during manipulation.                   |
| Satin structure and direction guides                 | Haloed blue center/short-dash rungs; plum dashed manual guides with diamond handles.                                        |
| Editable text and text on paths                      | Glyph perimeters and counters; dashed plum baseline with the existing transformed curve controls.                           |
| Geometry effects / offsets                           | Current evaluated contours, including holes, rather than a stale original or cached stitch plan.                            |
| References                                           | Image appearance is unchanged; unlocked selected reference frames get the same outline.                                     |
| Manual stitches                                      | Only actual sewing segments; jumps, trims, stops and color metadata do not become false connectors.                         |
| Alignment guides                                     | Dashed teal, haloed, without changing snapping behavior.                                                                    |

Normal source/thread rendering, operation identities/settings, source coordinates,
saved projects, history, sequencing and machine codecs remain unchanged. The
overlay does not write any artwork property. Existing explicit structure/guide
inspection remains available; these display aids are never machine instructions.
Cancel restores the previous geometry and clears the drag preview. Deselecting
removes active boundaries; completing a drag updates the selected contour while
the normal generation worker rebuilds stitches.

## Validation

The supplied PNGs were inspected. They contain screenshots, not an editable
project, so the browser fixture reconstructs the tilted warm-colored Cuban-flag
scenario with a gold source path and a blue sewing operation.

`tests/geometry-contrast-browser.mjs` inspects actual canvas pixels around the
source geometry, requiring both a dark silhouette and a light halo. It covers
same-color black/white/yellow/blue/red overlaps, multiple backgrounds, transforms,
curves, holes, groups, rails, guides, glyphs, baselines, effects, all draft tools,
zoom, both application themes and a device-pixel-ratio-2 touch viewport. It also
checks no generation-worker messages are sent per pointer move, exact source
restoration on cancel/Undo, and independent PES decoding. The unselected and
selected exports must be byte-identical.

Unit tests check path coincidence and screen widths, restored canvas state,
source/thread separation, holes, manual jump handling and unchanged generated
commands. Existing editor, path, rail, text, effect, reference/mirror and export
regressions remain in the deployment suite. Screenshots and pixel reports are
written to ignored `test-results/geometry-contrast-*` artifacts.
