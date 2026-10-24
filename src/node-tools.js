// Presentation only. All actions go through Stage's active node-editing target.
export const NODE_ACTIONS = {
  points: [
    "Add & Remove Points",
    "4",
    "Toggle point editing. Click or tap an edge to add an anchor; click an anchor to remove it when the path remains valid. Curved edges are subdivided without changing their appearance. Click this tool again for ordinary node editing. Ctrl/Command-double-click an edge also inserts an anchor.",
    '<path d="m4 20 16-16M4 5h6M7 2v6m8 12h7"/><circle cx="12" cy="12" r="2.5"/>',
  ],
  corner: [
    "Change to Corner",
    "1",
    "Make the selected vertex a corner with independent incoming and outgoing directions. Existing handles stay in place. Double-click a closed-shape vertex to toggle Corner / Smooth; Undo restores the edit.",
    '<path d="m4 19 8-14 8 14"/><rect x="10" y="3" width="4" height="4"/><circle cx="4" cy="19" r="1.5"/><circle cx="20" cy="19" r="1.5"/>',
  ],
  smooth: [
    "Change to Smooth",
    "2",
    "Align incoming and outgoing handles into one continuous tangent, keeping independent handle lengths. Reconnects broken handles. Double-click the vertex again to restore its saved corner state.",
    '<path d="M3 19Q5 6 12 6t9 13M4 6h16"/><circle cx="12" cy="6" r="2.2" fill="currentColor"/><rect x="2" y="4" width="3" height="3"/><rect x="19" y="4" width="3" height="3"/>',
  ],
  break: [
    "Break Handles",
    "3",
    "Unlink both handles so either can move independently. Keep both curves and handle positions unchanged. Change to Smooth reconnects their tangent. This is separate from double-clicking a vertex.",
    '<path d="M3 20Q2 7 12 12 22 7 21 20M12 12 6 4m6 8 7-8"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><rect x="3" y="2" width="4" height="4" transform="rotate(-20 5 4)"/><rect x="17" y="2" width="4" height="4" transform="rotate(20 19 4)"/>',
  ],
};
export const CONTOUR_HELP =
  "Double-click empty filled interior to smooth or restore the active contour. Anchor positions and saved handles are retained; holes and other contours stay separate. Invalid geometry is rejected. The canvas context menu provides the same action for touch or keyboard use.";
export const EDGE_HELP =
  "Double-click a closed-shape edge to toggle Straight / Curved. Only that edge's endpoint handles change; neighboring edges stay intact. Repeated toggles retain the edited curve.";
export const INSERT_HELP =
  "Ctrl/Command-double-click an edge to insert an anchor without changing its curve (Shift-double-click also works). Add & Remove Points provides direct click/tap editing. Keyboard users can select an edge and open the canvas menu with Shift+F10.";
export function installNodeTools() {
  for (const [key, [name, shortcut, help, path]] of Object.entries(
    NODE_ACTIONS,
  )) {
    const el = document.getElementById(`node-${key}`);
    el.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
    el.dataset.toolName = name;
    el.dataset.toolShortcut = shortcut;
    el.dataset.help = help;
    el.setAttribute("aria-keyshortcuts", shortcut);
  }
}
