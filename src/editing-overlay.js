import { movementSegments } from "./preview.js";

// Canvas-only aids, in CSS pixels. These never enter project or machine data.
// Every semantic stroke has a light halo; hue alone never carries visibility.
export const EDITING_STYLE = Object.freeze({
  halo: "#ffffff",
  ink: "#14232c",
  guide: "#81356d",
  railA: "#175db3",
  railB: "#81356d",
  snap: "#00676c",
  warning: "#b13e32",
  sourceWidth: 1.7,
  haloExtra: 3.4,
});

export function strokeEditingPath(
  ctx,
  build,
  scale,
  {
    color = EDITING_STYLE.ink,
    width = EDITING_STYLE.sourceWidth,
    dash = [],
    alpha = 1,
  } = {},
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(dash.map((v) => v / scale));
  ctx.beginPath();
  build(ctx);
  ctx.strokeStyle = EDITING_STYLE.halo;
  ctx.lineWidth = (width + EDITING_STYLE.haloExtra) / scale;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width / scale;
  ctx.stroke();
  ctx.restore();
}

export function editingHandle(
  ctx,
  p,
  scale,
  {
    shape = "square",
    radius = 3.5,
    color = EDITING_STYLE.ink,
    active = false,
  } = {},
) {
  const r = radius / scale;
  strokeEditingPath(
    ctx,
    (c) => {
      if (shape === "circle") c.arc(p.x, p.y, r, 0, Math.PI * 2);
      else if (shape === "diamond") {
        c.moveTo(p.x, p.y - r);
        c.lineTo(p.x + r, p.y);
        c.lineTo(p.x, p.y + r);
        c.lineTo(p.x - r, p.y);
        c.closePath();
      } else c.rect(p.x - r, p.y - r, r * 2, r * 2);
      c.fillStyle = active ? color : EDITING_STYLE.halo;
      c.fill();
    },
    scale,
    { color, width: 1.3 },
  );
}

// Source paint and sewing-action thread colors are deliberately independent.
export function sourceThread(o, activeOperationId) {
  const sewing =
    o.operations?.filter(
      (op) => op.enabled !== false && !["stop", "trim"].includes(op.type),
    ) || [];
  const op = sewing.find((op) => op.id === activeOperationId) || sewing[0] || o;
  return {
    color: op.color || o.color,
    type: op.type,
    width: op.width ?? o.width,
  };
}

export function sourceOutlinePaths(o) {
  if (o.type === "manual")
    return {
      rings: [...movementSegments(o.commands || [])]
        .filter(({ event }) => event.cmd === "stitch")
        .map(({ from, to }) => [from, to]),
      closed: false,
    };
  return {
    rings: o.rings || [],
    closed: ["fill", "reference"].includes(o.type) || !!o.closed,
  };
}

export function drawSourceOverlay(
  ctx,
  o,
  scale,
  { band = false, activeOperationId, multiple = false } = {},
) {
  const { rings, closed } = sourceOutlinePaths(o);
  const path = (c) => {
    for (const ring of rings) {
      if (!ring.length) continue;
      c.moveTo(ring[0].x, ring[0].y);
      for (let i = 1; i < ring.length; i++) c.lineTo(ring[i].x, ring[i].y);
      if (closed) c.closePath();
    }
  };
  const thread = sourceThread(o, activeOperationId);
  // A physical-width translucent band explains satin centerline width without
  // pretending it is a regenerated stitch plan. The crisp center path stays on top.
  if (band && thread.type === "satin" && o.type !== "fill" && !o.satinRails) {
    ctx.save();
    ctx.beginPath();
    path(ctx);
    ctx.lineWidth = thread.width;
    ctx.strokeStyle = thread.color;
    ctx.globalAlpha = 0.3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }
  strokeEditingPath(ctx, path, scale, {
    width: multiple ? 1.3 : EDITING_STYLE.sourceWidth,
  });
}
