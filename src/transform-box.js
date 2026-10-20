// Orientation metadata only. Geometry continues through the existing affine
// sourceTransform pipeline; this axis never transforms a point a second time.
export function localAxis(o) {
  if (o.localAxis) return o.localAxis;
  const m = (
    o.shape ||
    o.textSource ||
    o.curve ||
    o.reference ||
    o.satinRails?.a ||
    o.linkedGeometry ||
    o.effects
  )?.frame;
  const x = m?.[0] ?? 1,
    y = m?.[1] ?? 0,
    length = Math.hypot(x, y);
  return length > 1e-12 ? [x / length, y / length] : [1, 0];
}
export function updateLocalAxis(o, m) {
  const [a, b] = localAxis(o),
    x = m[0] * a + m[2] * b,
    y = m[1] * a + m[3] * b,
    l = Math.hypot(x, y);
  if (l < 1e-12) return;
  if (Math.abs(x / l - 1) < 1e-12 && Math.abs(y / l) < 1e-12)
    delete o.localAxis;
  else o.localAxis = [x / l, y / l];
}
export const boxPoint = (p, b) => ({
  x: p.x * b.u.x + p.y * b.v.x,
  y: p.x * b.u.y + p.y * b.v.y,
});
export const boxLocal = (p, b) => ({
  x: p.x * b.u.x + p.y * b.u.y,
  y: p.x * b.v.x + p.y * b.v.y,
});
export function selectionBox(objects, mode = "object") {
  const axes = objects.map(localAxis),
    first = axes[0] || [1, 0];
  const shared = axes.every(
    (a) => Math.abs(a[0] * first[1] - a[1] * first[0]) < 1e-7,
  );
  const local = mode !== "canvas" && shared,
    [x, y] = local ? first : [1, 0];
  const box = {
    u: { x, y },
    v: { x: -y, y: x },
    local,
    mixed: !shared,
    angle: (Math.atan2(y, x) * 180) / Math.PI,
  };
  const ps = objects
    .flatMap((o) =>
      o.type === "manual"
        ? o.commands.filter((c) => ["stitch", "jump"].includes(c.cmd))
        : o.rings.flat(),
    )
    .map((p) => boxLocal(p, box));
  box.minX = box.minY = ps.length ? Infinity : 0;
  box.maxX = box.maxY = ps.length ? -Infinity : 0;
  for (const p of ps) {
    box.minX = Math.min(box.minX, p.x);
    box.maxX = Math.max(box.maxX, p.x);
    box.minY = Math.min(box.minY, p.y);
    box.maxY = Math.max(box.maxY, p.y);
  }
  box.width = box.maxX - box.minX;
  box.height = box.maxY - box.minY;
  box.center = boxPoint(
    { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 },
    box,
  );
  return box;
}
export function boxHandles(b, scale) {
  const x = (b.minX + b.maxX) / 2,
    y = (b.minY + b.maxY) / 2;
  return [
    ["nw", b.minX, b.minY],
    ["n", x, b.minY],
    ["ne", b.maxX, b.minY],
    ["e", b.maxX, y],
    ["se", b.maxX, b.maxY],
    ["s", x, b.maxY],
    ["sw", b.minX, b.maxY],
    ["w", b.minX, y],
    ["rotate", x, b.minY - 22 / scale],
  ].map(([id, x, y]) => ({ id, ...boxPoint({ x, y }, b) }));
}
export function resizeBox(
  b,
  handle,
  target,
  { center = false, proportional = false } = {},
) {
  const h = boxLocal(handle, b),
    t = boxLocal(target, b),
    horizontal = /[we]/.test(handle.id),
    vertical = /[ns]/.test(handle.id);
  const pivot = center
    ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
    : {
        x: handle.id.includes("w")
          ? b.maxX
          : handle.id.includes("e")
            ? b.minX
            : (b.minX + b.maxX) / 2,
        y: handle.id.includes("n")
          ? b.maxY
          : handle.id.includes("s")
            ? b.minY
            : (b.minY + b.maxY) / 2,
      };
  let sx =
    horizontal && Math.abs(h.x - pivot.x) > 1e-9
      ? Math.max(0.02, (t.x - pivot.x) / (h.x - pivot.x))
      : 1;
  let sy =
    vertical && Math.abs(h.y - pivot.y) > 1e-9
      ? Math.max(0.02, (t.y - pivot.y) / (h.y - pivot.y))
      : 1;
  if (horizontal && vertical && proportional)
    sx = sy = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
  return { sx, sy, axes: b.angle, pivot: boxPoint(pivot, b) };
}
export function handleCursor(handle, b) {
  if (handle.id === "rotate") return "grab";
  const x = handle.id.includes("e") ? 1 : handle.id.includes("w") ? -1 : 0,
    y = handle.id.includes("s") ? 1 : handle.id.includes("n") ? -1 : 0;
  const angle = Math.atan2(b.u.y * x + b.v.y * y, b.u.x * x + b.v.x * y);
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][
    ((Math.round(angle / (Math.PI / 4)) % 4) + 4) % 4
  ];
}
