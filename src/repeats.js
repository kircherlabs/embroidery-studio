import {
  copySelection,
  pasteSelection,
  leaves,
  isLocked,
  selectionBounds,
  transformSelection,
} from "./hierarchy.js";
import { sewingIds, isManualOrder } from "./sequencing.js";
import {
  linkArtwork,
  syncLinkedArtwork,
  unlinkArtwork,
} from "./linked-artwork.js";

export function repeatArtwork(p, ids, options = {}) {
  const {
    mode = "linear",
    count = 3,
    dx = 10,
    dy = 0,
    angle = 60,
    cx = 0,
    cy = 0,
    rotate = true,
  } = options;
  if (
    !["linear", "radial", "mirror-x", "mirror-y"].includes(mode) ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > 64 ||
    ![dx, dy, angle, cx, cy].every(Number.isFinite) ||
    Math.max(Math.abs(dx), Math.abs(dy), Math.abs(cx), Math.abs(cy)) > 500 ||
    Math.abs(angle) > 360
  )
    throw Error("Use 2–64 instances and finite, practical repeat dimensions.");
  const source = leaves(p, ids);
  if (!source.length) throw Error("Select artwork to repeat.");
  if (source.some((o) => isLocked(p, o)))
    throw Error("Unlock all selected descendants before repeating them.");
  if (
    options.linked &&
    source.some((o) => ["manual", "reference"].includes(o.type) || o.satinRails)
  )
    throw Error(
      "Use independent copies for paired satin rails, references or manual stitches.",
    );
  if (
    source.some((o) =>
      o.constructionArtworkIds?.some((id) => !source.some((n) => n.id === id)),
    )
  )
    throw Error(
      "Select the complete patch group, including its decorative artwork, to repeat a linked construction.",
    );
  const copies = (mode.startsWith("mirror") ? 2 : count) - 1;
  if (source.length * copies > 2000)
    throw Error(
      "This repeat would create more than 2,000 objects. Use fewer instances.",
    );
  // Work in a draft so validation failures leave the caller's project untouched.
  const draft = structuredClone(p),
    clipboard = copySelection(p, ids),
    order = sewingIds(p),
    blocks = [],
    added = [];
  const sourceOrder = order.filter((id) => source.some((o) => o.id === id)),
    b = selectionBounds(source),
    pivot = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  for (let i = 1; i <= copies; i++) {
    const idMap = new Map(),
      roots = pasteSelection(draft, clipboard, 0, idMap),
      objects = leaves(draft, roots);
    if (options.linked)
      for (const original of source)
        linkArtwork(
          objects.find((o) => o.id === idMap.get(original.id)),
          original,
        );
    else
      for (const original of source.filter(
        (o) =>
          o.linkedGeometry &&
          !source.some((n) => n.id === o.linkedGeometry.sourceId),
      ))
        unlinkArtwork(
          draft,
          objects.find((o) => o.id === idMap.get(original.id)),
        );
    // pasteSelection retains source leaf order within each copied subtree.
    blocks.push(sourceOrder.map((id) => idMap.get(id)).filter(Boolean));
    if (mode === "linear")
      transformSelection(objects, { dx: dx * i, dy: dy * i });
    else if (mode === "radial") {
      const a = (angle * i * Math.PI) / 180,
        x = pivot.x - cx,
        y = pivot.y - cy;
      transformSelection(objects, {
        angle: rotate ? angle * i : 0,
        pivot,
        dx: cx + x * Math.cos(a) - y * Math.sin(a) - pivot.x,
        dy: cy + x * Math.sin(a) + y * Math.cos(a) - pivot.y,
      });
    } else
      transformSelection(objects, {
        sx: mode === "mirror-x" ? -1 : 1,
        sy: mode === "mirror-y" ? -1 : 1,
        dx,
        dy,
        pivot,
      });
    added.push(...roots);
  }
  if (isManualOrder(p) && p.sequencing.origin !== "tree") {
    const after = Math.max(...sourceOrder.map((id) => order.indexOf(id))) + 1;
    draft.sequencing.order = [
      ...order.slice(0, after),
      ...blocks.flat(),
      ...order.slice(after),
    ];
  }
  syncLinkedArtwork(draft);
  Object.assign(p, draft);
  return added;
}
