import {
  identity,
  curveRings,
  curveContours,
  inversePoint,
} from "./smart-geometry.js";
import { setNodeMode } from "./path-editing.js";
import { closedOutlinePreview } from "./outline-preview.js";
import { fillPolygons, signedArea, distance } from "./geometry.js";
export const closedCurveEditable = (o) =>
  !!o &&
  !["manual", "reference"].includes(o.type) &&
  (o.type === "fill" || o.closed || o.curve?.closed) &&
  !o.satinRails &&
  !o.textSource &&
  !o.effects &&
  !o.linkedGeometry;
const copy = structuredClone;
const state = (n) =>
  Object.fromEntries(
    ["mode", "in", "out", "broken"]
      .filter((k) => n[k] !== undefined)
      .map((k) => [k, copy(n[k])]),
  );
function restore(n, s) {
  for (const k of ["mode", "in", "out", "broken"]) {
    delete n[k];
    if (s[k] !== undefined) n[k] = copy(s[k]);
  }
}
function topology(rings, rule) {
  const p = fillPolygons(rings, rule);
  return p && [p.length, p.reduce((n, p) => n + p.length - 1, 0)];
}
function validate(before, after, rule) {
  if (after.reduce((n, r) => n + r.length * r.length, 0) > 8000000)
    throw Error(
      "Curve validation exceeds the interactive budget. Edit a smaller contour first.",
    );
  for (const r of after)
    if (
      Math.abs(signedArea(r)) < 0.00001 ||
      closedOutlinePreview(r).intersections.length
    )
      throw Error(
        "This curve would cross or collapse the outline. Move the nearby anchors first; the original geometry is unchanged.",
      );
  if (
    JSON.stringify(topology(before, rule)) !==
    JSON.stringify(topology(after, rule))
  )
    throw Error(
      "This curve would change a hole or join separate contours. Adjust the nearby anchors first.",
    );
}
function curveFrom(o) {
  if (o.curve) return copy(o.curve);
  if (o.rings.reduce((n, r) => n + r.length, 0) > 2000)
    throw Error(
      "This outline exceeds the existing 2,000 editable Bézier anchor budget. Simplify or split the source first; the original outline is unchanged.",
    );
  const contours = o.rings.map((r) => {
    const pts = copy(r);
    if (pts.length > 1 && distance(pts[0], pts.at(-1)) < 1e-10) pts.pop();
    return {
      nodes: pts.map((p) => ({ ...p, mode: "corner" })),
      closed: true,
      exactRing: copy(r),
    };
  });
  return {
    ...contours[0],
    frame: identity(),
    ...(contours.length > 1 ? { contours: contours.slice(1) } : {}),
  };
}
export function editClosedCurve(original, action, ring = 0, index = 0) {
  if (!closedCurveEditable(original))
    throw Error(
      "Choose an ordinary closed vector outline. Use dedicated rail, lettering or effect controls for this artwork.",
    );
  const o = copy(original),
    c = curveFrom(o),
    part = ring ? c.contours?.[ring - 1] : c;
  if (!part) throw Error("Select a valid contour first.");
  const n = part.nodes[index],
    count = part.nodes.length;
  if (count < 3) throw Error("A closed contour needs at least three anchors.");
  delete part.exactRing;
  if (action === "toggle-segment") {
    if (!n) throw Error("Select an edge first.");
    const b = part.nodes[(index + 1) % count];
    const curved = !!n.out || !!b.in;
    const save = {
      ...(n.out ? { out: copy(n.out) } : {}),
      ...(b.in ? { in: copy(b.in) } : {}),
    };
    n.edgeMemory ||= {};
    n.edgeMemory[curved ? "curved" : "straight"] = save;
    const target = n.edgeMemory[curved ? "straight" : "curved"];
    delete n.out;
    delete b.in;
    if (target) {
      if (target.out) n.out = copy(target.out);
      if (target.in) b.in = copy(target.in);
    } else if (!curved) {
      const dx = b.x - n.x,
        dy = b.y - n.y,
        k = (signedArea(part.nodes) >= 0 ? 1 : -1) * 0.12;
      n.out = { x: n.x + dx / 3 + dy * k, y: n.y + dy / 3 - dx * k };
      b.in = { x: n.x + (dx * 2) / 3 + dy * k, y: n.y + (dy * 2) / 3 - dx * k };
    }
    // Only the selected edge's controls change. Opposite handles stay exact.
    n.mode = b.mode = "corner";
  } else if (
    ["toggle-node", "smooth", "symmetric", "corner", "break"].includes(action)
  ) {
    if (!n) throw Error("Select an anchor first.");
    if (action === "toggle-node")
      action =
        n.mode === "smooth" || n.mode === "symmetric"
          ? "restore-corner"
          : "smooth";
    if (action === "restore-corner") {
      const s = n.cornerMemory || { mode: "corner" };
      restore(n, s);
      delete n.cornerMemory;
    } else if (action === "smooth" || action === "symmetric") {
      if (n.mode !== "smooth" && n.mode !== "symmetric")
        n.cornerMemory = state(n);
      setNodeMode(part, index, action);
      delete n.broken;
    } else {
      n.mode = "corner";
      if (action === "break") n.broken = true;
      else delete n.broken;
    }
  } else if (action === "toggle-whole") {
    if (part.wholeMemory) {
      part.nodes = part.wholeMemory.nodes;
      part.exactRing = part.wholeMemory.flat;
      delete part.wholeMemory;
    } else {
      part.wholeMemory = {
        nodes: copy(part.nodes),
        flat: original.rings[ring].map((p) =>
          inversePoint(p, c.frame || identity()),
        ),
      };
      const old = copy(part.nodes);
      for (let i = 0; i < count; i++) {
        const a = old[(i + count - 1) % count],
          n = part.nodes[i],
          b = old[(i + 1) % count],
          dx = b.x - a.x,
          dy = b.y - a.y,
          l = Math.hypot(dx, dy);
        if (!l) continue;
        const inn = Math.min(distance(a, n) / 3, l / 6),
          out = Math.min(distance(n, b) / 3, l / 6);
        n.in = { x: n.x - (dx / l) * inn, y: n.y - (dy / l) * inn };
        n.out = { x: n.x + (dx / l) * out, y: n.y + (dy / l) * out };
        n.mode = "smooth";
        delete n.broken;
      }
    }
  } else throw Error("Choose a node or segment operation.");
  o.curve = c;
  delete o.shape;
  delete o.rounding;
  const rings = curveRings(c);
  validate(original.rings, rings, original.fillRule || "evenodd");
  o.rings = rings;
  return o;
}
