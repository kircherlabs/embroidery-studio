# Design toolbar — 0.12.2

The design tools use native 24 × 24 SVG icons in four compact groups above the
canvas. Dividers separate groups without permanent headings or descriptions.
Light and dark system preferences use the existing workspace colors, with an
accented active tool. Coarse pointers get 44 px tool targets; fine pointers get
40 px targets. On narrow windows, swipe/scroll horizontally or use the arrow
buttons. Shapes expands inline, preserving every existing shape tool.

The **Tools** button beside Objects, Properties and Sequence hides or restores
the icon row. Hidden tools reclaim their full height for the canvas. The choice
is stored in the existing device workspace preferences, independently of project
files, and survives reloads and tab changes. From Stitch preview, Tools opens
Design with the toolbar shown. Canvas maximization temporarily hides the icon
row; Restore returns its previous visibility. Reset workspace restores it.

The redundant workspace title, description and millimeter badge are removed.
Navigation guidance remains in Help, tooltips and the canvas's accessible
description. Select, Pan and shape dragging use no instruction banner. Necessary
Finish/Cancel and vector-editing controls remain docked outside the artwork,
even when tool icons are hidden; unfinished paths and active tools are retained.

| Group               | Visible tool name | Existing action / shortcut                                       |
| ------------------- | ----------------- | ---------------------------------------------------------------- |
| Selection & Editing | Select            | `select` · V                                                     |
|                     | Edit Points       | `node` · N; vector anchors and manual needle points              |
|                     | Pan               | `pan` · H; Space + drag remains available                        |
|                     | Vector Eraser     | `eraser`                                                         |
| Drawing & Geometry  | Pencil            | `pencil`                                                         |
|                     | Bézier Pen        | `pen`                                                            |
|                     | Shapes            | `shape-family`; Rectangle, Ellipse (E), Polygon, Star and Eyelet |
|                     | Knife             | `knife`                                                          |
| Embroidery          | Tatami Fill       | `polygon` · P; existing closed-region tool                       |
|                     | Running Stitch    | `run` · R                                                        |
|                     | Satin Line        | `satin` · S; existing centerline method                          |
|                     | Satin Rails       | `rails`; existing paired-rail construction                       |
|                     | Manual Stitch     | `manual`                                                         |
| Text                | Lettering         | `text-tool` · T; editable lettering dialog                       |

`src/tool-icons.js` is a presentation registry, not a new drawing engine. It maps
names, descriptions and SVGs to existing controls. Geometry, action handlers,
shortcuts, history, project schema, digitizing and exporters remain unchanged.
Drawing-style presets still configure compatible newly drawn closed shapes.

## Hints

- **Hints: Off** shows a tool's proper name and existing shortcut on hover/focus.
- **Hints: On** adds the tool's description. Other interface controls retain their
  existing detailed-help behavior; Off still suppresses their popups.
- On touch, hold a tool to reveal its name or detailed hint; ordinary taps still
  activate tools. A completed long press does not accidentally activate a tool.
- Tooltips use the existing body-level accessible help layer, clamped to the
  viewport, so toolbar scrolling cannot clip them. Leaving a tool dismisses its
  popup even if it retains focus. Escape, canvas interaction and scrolling dismiss
  popups. Arrow Left/Right and Home/End move keyboard focus within the tool row
  without moving selected artwork.

## Design and Stitch preview

Design automatically hides the sequence panel and its resize grip, reclaiming the
space for artwork. Stitch preview shows the generated sequence and playback; the
Sequence button opens that view from Design. Within preview it still toggles the
panel, which remains resizable. Returning to Design hides it again. Panel sizes,
sidebars and layout preferences remain independent; a page reload starts in Design
with the sequence hidden. Export still opens the actual decoded machine preview.

Browser coverage checks all 14 tool mappings and SVG bounds, Hints modes,
keyboard and touch behavior, theme contrast, narrow/landscape layouts, sequence
visibility and resizing, and unchanged source project data and needle commands.
The existing machine-file regression suite remains in place.
