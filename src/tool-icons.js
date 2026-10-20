// Presentation registry only: existing data-tool IDs and action handlers stay intact.
export const TOOL_GROUPS = [
  ["Selection & Editing", ["select", "node", "pan", "eraser"]],
  ["Drawing & Geometry", ["pencil", "pen", "shapes", "knife"]],
  ["Embroidery", ["polygon", "run", "satin", "rails", "manual"]],
  ["Text", ["lettering"]],
];
export const TOOL_INFO = {
  select: ["Select", "Select and move artwork.", "V"],
  node: ["Edit Points", "Edit vector anchors or manual needle points.", "N"],
  pan: ["Pan", "Drag to move the canvas view.", "H · Space + drag"],
  eraser: ["Vector Eraser", "Erase portions of vector paths."],
  pencil: ["Pencil", "Draw freehand lines."],
  pen: ["Bézier Pen", "Create cubic curves using click-and-drag anchors."],
  shapes: ["Shapes", "Create geometric shapes."],
  knife: ["Knife", "Cut or split vector paths."],
  polygon: ["Tatami Fill", "Draw closed regions for tatami stitching.", "P"],
  run: ["Running Stitch", "Draw open running-stitch contours.", "R"],
  satin: ["Satin Line", "Create satin columns from a centerline.", "S"],
  rails: ["Satin Rails", "Create satin columns using manually defined rails."],
  manual: ["Manual Stitch", "Place individual needle points."],
  lettering: ["Lettering", "Create editable vector lettering.", "T"],
  rect: [
    "Rectangle",
    "Drag a rectangle; adjust size and corner radius in Artwork.",
  ],
  regular: [
    "Polygon",
    "Drag a regular polygon; adjust sides and corner radius in Artwork.",
  ],
  star: [
    "Star",
    "Drag a star; adjust points, inner radius and corner rounding in Artwork.",
  ],
  eyelet: [
    "Eyelet",
    "Create stitched reinforcement for a future manually punched hole.",
  ],
  ellipse: [
    "Ellipse",
    "Drag an ellipse or circle; edit geometry and sewing actions in Properties.",
    "E",
  ],
};
const paths = {
  select: '<path d="M4 3v17l5-5 4 7 3-1.7-4-7.1 7-1.2Z"/>',
  node: '<path d="M4 18C4 7 19 16 20 5M4 18 5 7M20 5l-6-2"/><rect x="2.5" y="16.5" width="3" height="3"/><rect x="18.5" y="3.5" width="3" height="3"/><circle cx="5" cy="7" r="1.5"/><circle cx="14" cy="3" r="1.5"/>',
  pan: '<path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-4a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-7 7-3 0-5-1.6-6.5-4L3.8 13.5a1.6 1.6 0 0 1 2.6-1.8L8 14Z"/>',
  eraser:
    '<path d="m3 13 9-9a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-8 8H9l-6-5a2 2 0 0 1 0-3Z M7 9l10 10M13 21h8"/>',
  pencil:
    '<path d="m4 20 2-6L17 3a2 2 0 0 1 3 3L9 17Z M6 14l3 3M15 5l4 4M4 20l3-1"/>',
  pen: '<path d="M3 14C4 6 17 14 21 4M3 14 6 5M21 4h-7"/><circle cx="6" cy="5" r="1.5"/><circle cx="14" cy="4" r="1.5"/><rect x="19.5" y="2.5" width="3" height="3"/><path d="m8 18 4-7 4 7-2 4h-4ZM12 12v6"/><circle cx="12" cy="18" r=".7"/>',
  shapes:
    '<circle cx="7.5" cy="7.5" r="5"/><path d="M12 10h9v10h-9ZM2 21l5-9 5 9Z"/>',
  knife:
    '<path d="M4 18 16 3a2.4 2.4 0 0 1 4 3L9 17 4 20ZM5 16l4 1"/><path d="M3 22h18" stroke-dasharray="3 3"/>',
  polygon:
    '<path d="m3 7 10-4 8 5-2 12-13 1Z M4 11l8-7M5 15 16 5M6 19 19 7M9 21 21 10M13 21l7-7M17 20l2-2"/>',
  run: '<path d="M4 19C12 21 10 3 20 5" stroke-dasharray="3 2.8"/><circle cx="3" cy="19" r="1.6"/><circle cx="21" cy="5" r="1.6"/>',
  satin:
    '<path d="M2 16C8 16 15 5 22 7v5C15 10 9 21 2 21Z" fill="currentColor" stroke="none" opacity=".14"/><path d="m3 15 1 7m2-8 1 7m2-9 2 7m1-10 2 7m1-10 2 7m1-8 2 7m1-8 1 7"/><path d="M3 18.5C9 18 15 7 22 9.5" stroke-dasharray="1.5 2.3" stroke-width="1"/>',
  rails:
    '<path d="M2 9Q12 0 22 9M2 18q10-9 20 0M3 8.2v9M7 5.7v9M12 4.5v9M17 5.7v9M21 8.2v9"/>',
  manual:
    '<path d="m12 2-1.5 2v7L12 15l1.5-4V2ZM12 4v3"/><circle cx="12" cy="20" r="1.8" fill="currentColor"/><path d="M3 20h5m8 0h5M12 16v1m0 6v-1" stroke-dasharray="2 2"/>',
  lettering: '<path d="M3 21 10 3h4l7 18h-4l-1.8-5H8.8L7 21ZM10 12h4l-2-6Z"/>',
  rect: '<rect x="3" y="5" width="18" height="14" rx="2"/>',
  regular: '<path d="m12 2 9 5v10l-9 5-9-5V7Z"/>',
  star: '<path d="m12 2 3 6.5 7 1-5 5 1 7-6-3.5L6 21.5l1-7-5-5 7-1Z"/>',
  eyelet: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  previous: '<path d="m14 6-6 6 6 6"/>',
  next: '<path d="m10 6 6 6-6 6"/>',
};
export function toolIcon(key) {
  return `<svg class="tool-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[key] || ""}</svg>`;
}
export function installDesignToolbar() {
  const bar = document.querySelector(".drawing-tools"),
    family = document.getElementById("shape-family");
  for (const [key, [name, description, shortcut]] of Object.entries(
    TOOL_INFO,
  )) {
    const el =
      key === "shapes"
        ? family.querySelector("summary")
        : key === "lettering"
          ? document.getElementById("text-tool")
          : bar.querySelector(`[data-tool="${key}"]`);
    el.innerHTML = toolIcon(key);
    el.setAttribute("aria-label", name);
    if (el.dataset.tool)
      el.setAttribute("aria-pressed", String(el.dataset.tool === "select"));
    el.removeAttribute("title");
    el.dataset.toolName = name;
    el.dataset.toolDescription = description;
    el.dataset.help = description;
    if (shortcut) {
      el.dataset.toolShortcut = shortcut;
      el.setAttribute("aria-keyshortcuts", shortcut.split(" · ")[0]);
    }
  }
  const groups = TOOL_GROUPS.map(([name, keys]) => {
    const group = document.createElement("div");
    group.className = "tool-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", name);
    for (const key of keys)
      group.append(
        key === "shapes"
          ? family
          : key === "lettering"
            ? document.getElementById("text-tool")
            : bar.querySelector(`[data-tool="${key}"]`),
      );
    return group;
  });
  bar.replaceChildren(...groups);
  bar.setAttribute("aria-orientation", "horizontal");
  for (const [id, key, name] of [
    ["tools-prev", "previous", "Previous tools"],
    ["tools-next", "next", "More tools"],
  ]) {
    const button = document.getElementById(id);
    button.innerHTML = toolIcon(key);
    button.dataset.toolName = name;
    button.dataset.toolDescription = button.dataset.help =
      "Scroll the design toolbar to reveal more tools.";
  }
  bar.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const items = [
      ...bar.querySelectorAll("button:not(:disabled), summary"),
    ].filter((el) => el.getClientRects().length);
    const at = items.indexOf(document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const next =
      items[
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? items.length - 1
            : (at + (e.key === "ArrowRight" ? 1 : -1) + items.length) %
              items.length
      ];
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  bar.addEventListener(
    "wheel",
    (e) => {
      if (
        bar.scrollWidth > bar.clientWidth &&
        Math.abs(e.deltaY) > Math.abs(e.deltaX) &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        bar.scrollLeft +=
          e.deltaY *
          (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? bar.clientWidth : 1);
      }
    },
    { passive: false },
  );
}
