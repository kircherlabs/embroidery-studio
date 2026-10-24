# Selected Bézier handle pair — v0.18.3

Starting main: `4efd8d95475812072c0d0d941f480adf0a3313bc` (v0.18.2).
Branch: `fix/selected-bezier-handles`. Publishing checks pending.

## Implemented

- A selected anchor exposes only its incoming/outgoing handles. A selected edge
  exposes only its start outgoing and end incoming handles, including closing
  edges. Other anchors remain selectable; no tangent controls appear before a
  node or edge is chosen. Switching scope immediately replaces the pair.
- `src/node-controls.js` supplies the shared scope for rendering, pointer hits and
  handle double-click suppression. Segment-handle drags retain edge selection.
  Whole-contour smoothing does not implicitly select an anchor. Switching rails
  resets the selected edge as well as the node. No persistent geometry changes
  are made by showing/hiding controls.
- Updated `src/stage.js`, `src/app.js`, seven browser suites, new scope unit tests,
  editing instructions, README and version labels. Existing source/handle data,
  sewing actions, exports and Focus Mode interactions remain unchanged.

## Validation

- 400 Node tests and 10 Python codec/format-safety tests passed.
- Chrome: node UI (real canvas pixels and hidden-hit rejection), closed curves,
  Focus Mode, path editing, sculpting, manual rails, geometry contrast,
  text-on-path, tool-context, creative and manual-artwork suites passed.
- Final Edge production build: node UI and closed-curve suites passed. Full
  GitHub CI and deployment verification pending.
- Visually inspected the selected-edge screenshot: only that edge's two tangent
  handles appear; other anchors and artwork stay legible. Mouse/touch, handle
  dragging, Undo/Redo, save/reopen and independently decoded PES are exercised.
- Initial export unit run lacked the configured Python executable; rerunning
  with the bundled runtime passed. Browser fixtures now select the relevant
  anchor before trying to drag its newly scoped handle.

## Exact next steps

Run final production checks; commit and open a PR. Require the complete existing
GitHub CI workflow, merge, wait for Pages, verify deployed runtime hashes and live
selected-handle browser behavior. Record release evidence here. Protected backup
branches remain unchanged. No unresolved product regressions are known.

---

# Active node controls and point editing — verified v0.18.2 release

Starting main: `4031d017ca995269a7c4844109293a114c934b51` (live v0.18.1).
Implementation branch: `fix/active-node-controls`; source commit
`d00bbf83a6d2aa262ff2104b2414ea7850044667`.
[PR #31](https://github.com/kircherlabs/embroidery-studio/pull/31) merged as
`0976945a691217f7deab80f978c8477cf4844a71` after exact-head CI passed.
Main CI, Pages and live verification all passed. This release is published.

## Implemented source

- Shared `Stage.nodeTarget()` eligibility drives rendered controls, pointer hits,
  insertion, explicit actions and the runtime active-object indicator. Only one
  directly selected, visible, unlocked object inside the focused scope is active.
  Group/multiselection and tool/selection changes hide controls and reset local
  editing state; stored geometry and handles are retained.
- Removed Node / edge action dropdown and duplicate Properties actions. The
  existing dock has four 24-pixel SVG icons: Corner, Smooth, Break Handles and
  Add & Remove Points, with names, detailed Hints and shortcuts 1/2/3/4.
  Ordinary double-clicks still toggle node/edge/contour shapes. Ctrl/Command-
  double-click (also Shift-double-click) inserts a precise anchor. The existing
  canvas context menu supplies touch/keyboard alternatives; contour selection
  and equal-length Symmetric controls remain in Properties.
- Path Repair separates Split/Close/Reverse from Join Paths, spaces the join
  settings and action, wraps on narrow layouts and uses readable light-dock
  button styling. Disabled controls have legible text and dashed borders instead
  of 35% opacity. The persistent Closed Shape hint is concise.
- Point tool toggles on/off without project-state changes. Active source edges
  and anchors receive contrasting hover marks; mouse/touch clicks add/remove
  anchors on release. Drag/cancel/pinch do not commit. Curved insertion uses exact
  subdivision; removal recovers split cubics or uses a guarded local fit. Closed
  topology/holes and minimum anchor counts are checked. Unrelated geometry,
  sewing actions and physical-thread metadata remain intact.
- Direct point editing applies to ordinary closed/open vectors. Dedicated
  manual-rail, live-lettering and manual-needle workflows remain available.
  The existing 2,000-anchor curve budget still applies. General curved removal
  uses a sampled two-way 0.25 mm physical-distance limit and rejects larger changes.

## Files

- UI: `index.html`, `workspace.css`, `src/node-tools.js`, `src/app.js`,
  `src/creative-ui.js`, `src/help.js`, `src/arrange.js`.
- Editing: `src/stage.js`, `src/point-editing.js`, `src/path-editing.js`,
  `src/closed-curve-editing.js` (shared topology validator export).
- Tests: `tests/point-editing.test.mjs`, `tests/node-ui-browser.mjs`,
  `tests/closed-curve-browser.mjs`, `.github/workflows/pages.yml`.
- Instructions: `docs/CLOSED_SHAPE_EDITING.md`, this handoff.

## Verified locally

- Full 395-test Node run passed, including all nine new point/active-target tests.
- Ten Python codec/format-safety tests, production build and JS syntax checks
  passed. Logs: ignored `test-results/node-ui-units.log` and
  `test-results/node-ui-browser-regressions.log`.
- Chrome suites passed: node UI, Closed Shape curves, four-level nested Focus,
  path editing, sculpt, manual rails, geometry contrast, toolbar and tool context.
  Existing export checks independently decoded actual PES needles; selection and
  handle visibility never changed artwork or needle commands.
- The final production build passed node UI in Edge; Closed Shape/independent
  PES decoding also passed in Edge. Expanded mobile Path Repair uses one scroll
  area so its action rows remain reachable without nested scrolling.
- The new browser test measures actual purple guide pixels on the canvas across
  active-object changes, multiselection, exit, groups and focused child editing.
  It checks all four icons, Hints Off/On, enabled/disabled/active contrast >=4.5:1,
  point add/remove/history, Ctrl-double-click and touch at 320/390/768 widths.
  Desktop/mobile/hover screenshots are in ignored `test-results/`.
- Source tests cover exact subdivision at several parameters, exact split recovery,
  general fit/rejection, physical edge-hit accuracy, holes, minimum nodes, open
  paths, transforms, serialization, actual stitch generation, unrelated objects
  and thread data, focus/group eligibility and real Stage release/cancel/pinch.
- Visual inspection caught a transient pale active button during the inherited
  background transition. Node buttons now switch states immediately and keep
  dark active/hover backgrounds. Contrast assertions pass for these states.
- One added group test initially mapped a pointer before opening the node dock.
  Recomputing current canvas coordinates fixed the fixture; the unchanged
  child-only handle-pixel assertions then passed. No product workaround was needed.
- Approval review's earlier usage-limit failure was resolved after the user
  restored availability. The approved server and browser launches succeeded.
- Protected `BACKUP-V0.18.0` remains `8aed6698c00a3b34485f0a778511f78e0302c32f`;
  `backup-before-creative-update` remains
  `99c0a78cd7ec7c026d32c44195ebea882f06c925`. Neither was modified.

## Final release evidence

- [PR #31](https://github.com/kircherlabs/embroidery-studio/pull/31) merged the
  source commit above without additional runtime changes.
- [Exact-head PR CI](https://github.com/kircherlabs/embroidery-studio/actions/runs/40057261915)
  passed 395 Node tests, ten Python codec/safety checks, all 49 browser scripts and
  production build. No geometry or visibility assertions were weakened.
- [Main CI/Pages](https://github.com/kircherlabs/embroidery-studio/actions/runs/40058232293)
  repeated all tests successfully and deployed the tested merge.
- Public-site checks on 2026-10-24 UTC matched all 11 changed runtime assets by
  normalized SHA-256 to `0976945a691217f7deab80f978c8477cf4844a71` and verified
  the v0.18.2 footer. Evidence: ignored
  `test-results/live-node-ui-verification.json`.
- Both node UI and Closed Shape browser suites then passed against the published
  studio in isolated Chrome sessions: actual handle pixels and hit scope,
  selection/group/Focus transitions, readable enabled/disabled/active controls,
  Hints, direct point editing/history, Ctrl-double-click, touch/responsive layouts,
  exact curve restoration, save/reopen, regenerated stitches and independently
  decoded PES needles. The user's existing browser tab was not modified.

No implementation or deployment steps remain. Source geometry and machine-file
algorithms were not changed merely to control handle visibility. Point editing's
ordinary-vector scope, 0.25 mm sampled removal guard and existing source budgets
are documented above and in [editing instructions](CLOSED_SHAPE_EDITING.md).
Protected backup branches remain unchanged. Task-owned preview servers are stopped.
