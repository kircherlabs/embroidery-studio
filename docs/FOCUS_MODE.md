# Focus Mode presentation — 0.12.6

This is a presentation change. Isolation, hit testing, selection, keyboard
shortcuts, nesting and exit handlers retain their existing implementation.

## Visual changes

- The existing exit button stays beside the selection count in Objects. Its label
  is **Exit Focus Mode**, with a compact focus/return icon, green fill, dark text,
  visible keyboard ring, hover/pressed states and a 44 px touch target.
- A thin, noninteractive frame identifies the focused canvas without consuming
  canvas space. It is a CSS editing aid, never part of geometry or stitch data.
- The focused tree row has an accent edge; descendants retain normal styling.
  Dotted ancestor edges identify the route to nested focus. Unrelated rows have
  muted, readable names and subdued thread swatches. Eye controls, lock controls,
  manual-hidden strikethrough and all interaction targets remain independent.
- Existing Hints explain entry, deeper focus and full exit. Outside-row selection
  hints explain that selecting unrelated artwork leaves the current focus.
  With Hints Off, the exit button does not show a hover hint. Keyboard focus and
  the existing touch-and-hold help gesture are supported.

## Verified existing behavior

In Select, double-clicking grouped artwork focuses the outermost group. Each
subsequent double-click inside follows one level down the ancestry chain. An
ungrouped object can be focused directly. Double-clicking an already focused leaf
keeps that scope. The exit button clears isolation immediately, returning to the
full workspace; it does not step up one level. Esc normally clears isolation too,
but the existing satin-direction-guide tool consumes the first Esc to leave that
tool. Selecting artwork outside a scope also clears isolation, as before.

Manual visibility still controls whether an object is displayed and sewn.
Focus only filters the workspace view. No project visibility fields or embroidery
settings are changed to represent focus. Existing focus entry/exit does not create
history or regenerate stitches, and focus is not saved into the project.

## Files and validation

| File                                           | Change                                                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/focus-ui.js`                              | Pure presentation classification: target, descendant, ancestor, outside.                                                                                                                                  |
| `src/app.js`                                   | Add row/body classes and accessible view-context descriptions during existing panel rendering.                                                                                                            |
| `index.html`, `styles.css`                     | Existing button label/icon, states, row treatment and canvas frame.                                                                                                                                       |
| `src/help.js`                                  | Existing Hints content; no changes to Hints event handling or preferences.                                                                                                                                |
| `tests/focus-ui.test.mjs`                      | Nested classification independent of hidden/locked state; no mutations.                                                                                                                                   |
| `tests/focus-browser.mjs`                      | Real nested canvas double-clicks, both exits, outside selection, editing/history, manual visibility, saved-project contents, full stitch-plan comparison, desktop/mobile and Hints Off/On/keyboard/touch. |
| `.github/workflows/pages.yml`                  | Include the Focus browser regression in deployment CI.                                                                                                                                                    |
| `package.json`, `docs/WORKSPACE_MILESTONES.md` | Release metadata.                                                                                                                                                                                         |

Browser screenshots are written to ignored `test-results/focus-nested-desktop.png`
and `test-results/focus-mobile.png`. Tests verify unchanged canvas dimensions and
that the frame cannot intercept pointer input. Existing editor, workspace, Hints
and geometry-contrast regressions run alongside the new coverage. No engine,
exporter, hierarchy, source geometry or Stage interaction code is modified.
