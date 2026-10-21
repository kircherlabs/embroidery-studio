import { artworkBounds } from "./artwork-library.js";
import { simplifyPath } from "./geometry.js";
import { isVisible } from "./hierarchy.js";
export const artworkDimensions = (a) => {
  const b = artworkBounds(a);
  return `${b.width.toFixed(1)} × ${b.height.toFixed(1)} mm · ${a.objects.length} object${a.objects.length === 1 ? "" : "s"}`;
};
// Only validated source geometry enters this renderer. No exported stitches or stored SVG/HTML.
export function artworkThumbnail(a) {
  const b = artworkBounds(a),
    span = Math.max(b.width, b.height, 1),
    pad = span * 0.08;
  const paths = [];
  for (const o of a.objects) {
    if (!isVisible(a, o)) continue;
    if (o.type === "reference") {
      const asset = a.referenceAssets?.[o.reference.assetId];
      if (asset)
        paths.push(
          `<image href="${asset.data}" x="-0.5" y="-0.5" width="1" height="1" transform="matrix(${o.reference.frame.join(" ")})" opacity="${o.reference.opacity}" preserveAspectRatio="none"/>`,
        );
      continue;
    }
    let d = "";
    if (o.type === "manual") {
      let move = true;
      const stride = Math.max(1, Math.ceil(o.commands.length / 1500));
      for (let i = 0; i < o.commands.length; i++) {
        const c = o.commands[i];
        if (c.cmd !== "stitch") {
          move = true;
          continue;
        }
        if (i % stride && i !== o.commands.length - 1) continue;
        d += `${move ? "M" : "L"}${c.x},${c.y}`;
        move = false;
      }
    } else {
      for (const ring of o.rings) {
        const points =
          ring.length > 3000 ? simplifyPath(ring, span / 1000) : ring;
        d += points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join("");
        if (o.closed || o.type === "fill") d += "Z";
      }
    }
    if (!d) continue;
    const actions = o.operations?.filter(
        (op) => op.enabled !== false && !["stop", "trim"].includes(op.type),
      ),
      primary = actions?.[0],
      color = primary?.color || o.color;
    const fill =
      (o.closed || o.type === "fill") &&
      (actions
        ? actions.some((op) => ["fill", "column"].includes(op.type))
        : o.type === "fill");
    const border = actions?.find((op) =>
      ["border", "run", "satin", "bean", "triple"].includes(op.type),
    );
    paths.push(
      `<path d="${d}" fill="${fill ? color : "none"}" fill-rule="${o.fillRule === "nonzero" ? "nonzero" : "evenodd"}" stroke="#35483e" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><path d="${d}" fill="${fill ? color : "none"}" fill-rule="${o.fillRule === "nonzero" ? "nonzero" : "evenodd"}" stroke="${border?.color || color}" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`,
    );
  }
  return `<svg class="artwork-thumbnail" viewBox="${b.minX - pad} ${b.minY - pad} ${Math.max(b.width, 1) + pad * 2} ${Math.max(b.height, 1) + pad * 2}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${paths.join("")}</svg>`;
}
