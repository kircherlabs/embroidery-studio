export const VERSION = 1;
export const PALETTE = [
  "#e6ab43",
  "#e5765e",
  "#b74b59",
  "#536e55",
  "#8fa77d",
  "#303b53",
  "#6689a5",
  "#ad8aae",
  "#eee2c9",
  "#292c31",
];
export const MACHINES = {
  se700: {
    name: "Brother SE700",
    width: 100,
    height: 100,
    speed: 400,
    maxStitch: 7,
  },
  brother130: {
    name: "Brother · 130 × 180",
    width: 130,
    height: 180,
    speed: 600,
    maxStitch: 7,
  },
  generic200: {
    name: "Generic · 200 × 200",
    width: 200,
    height: 200,
    speed: 600,
    maxStitch: 7,
  },
};
export const uid = () =>
  globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
export function object(name, rings, props = {}) {
  return {
    id: uid(),
    name,
    rings,
    color: PALETTE[0],
    type: "fill",
    spacing: 0.42,
    length: 2.8,
    angle: -35,
    width: 2.5,
    underlay: true,
    compensation: 0.15,
    visible: true,
    ...props,
  };
}
export function bounds(points) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return points.length
    ? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
}
export const pointsOf = (o) =>
  o.type === "manual"
    ? o.commands.filter(
        (c) => !["trim", "color", "stop", "end"].includes(c.cmd),
      )
    : o.rings.flat();
export const objectBounds = (o) => bounds(pointsOf(o));
export const translate = (o, dx, dy) => {
  if (o.type === "manual")
    o.commands.forEach((p) => {
      p.x += dx;
      p.y += dy;
    });
  else
    o.rings.flat().forEach((p) => {
      p.x += dx;
      p.y += dy;
    });
};
export function transform(o, sx, sy, degrees = 0) {
  const b = objectBounds(o),
    cx = (b.minX + b.maxX) / 2,
    cy = (b.minY + b.maxY) / 2,
    a = (degrees * Math.PI) / 180;
  pointsOf(o).forEach((p) => {
    const x = (p.x - cx) * sx,
      y = (p.y - cy) * sy;
    p.x = cx + x * Math.cos(a) - y * Math.sin(a);
    p.y = cy + x * Math.sin(a) + y * Math.cos(a);
  });
}
export function ellipse(cx, cy, rx, ry, angle = 0, n = 64) {
  const a = (angle * Math.PI) / 180;
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2,
      x = rx * Math.cos(t),
      y = ry * Math.sin(t);
    return {
      x: cx + x * Math.cos(a) - y * Math.sin(a),
      y: cy + x * Math.sin(a) + y * Math.cos(a),
    };
  });
}
export function demo() {
  const objects = [];
  objects.push(
    object(
      "Stem",
      [
        [
          { x: -2, y: 29 },
          { x: 1, y: 9 },
          { x: -2, y: -15 },
        ],
      ],
      { type: "satin", width: 1.6, color: PALETTE[3], spacing: 0.4 },
    ),
  );
  [
    [-10, 16, -35],
    [10, 9, 35],
    [-10, 0, -25],
  ].forEach(([x, y, a], i) =>
    objects.push(
      object(`Leaf ${i + 1}`, [ellipse(x, y, 11, 4, a)], {
        color: PALETTE[3],
        angle: a,
        spacing: 0.44,
      }),
    ),
  );
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    objects.push(
      object(
        `Petal ${i + 1}`,
        [
          ellipse(
            Math.cos(a) * 11,
            -19 + Math.sin(a) * 11,
            10,
            5,
            (i / 7) * 360,
          ),
        ],
        {
          color: i % 2 ? PALETTE[1] : PALETTE[0],
          angle: (i / 7) * 360,
          spacing: 0.43,
        },
      ),
    );
  }
  objects.push(
    object("Flower center", [ellipse(0, -19, 5.7, 5.7)], {
      color: PALETTE[2],
      angle: 40,
      spacing: 0.4,
    }),
  );
  return {
    version: VERSION,
    name: "Wildflower study",
    machine: "se700",
    objects,
  };
}
export function validateProject(p) {
  if (
    !p ||
    p.version !== VERSION ||
    !Array.isArray(p.objects) ||
    p.objects.length > 1000 ||
    !MACHINES[p.machine]
  )
    throw Error("Unsupported or invalid studio project.");
  if (typeof p.name !== "string" || p.name.length > 200)
    throw Error("Invalid project name.");
  let total = 0;
  for (const o of p.objects) {
    if (
      !o ||
      typeof o.id !== "string" ||
      typeof o.name !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(o.color) ||
      !["fill", "run", "satin", "manual"].includes(o.type)
    )
      throw Error("Invalid object.");
    if (o.type === "manual") {
      if (
        !Array.isArray(o.commands) ||
        o.commands.some(
          (c) => !["stitch", "jump", "trim", "stop", "end"].includes(c.cmd),
        )
      )
        throw Error("Invalid stitch commands.");
    } else {
      if (
        !Array.isArray(o.rings) ||
        o.rings.some((r) => !Array.isArray(r) || r.length < 2)
      )
        throw Error("Invalid vector paths.");
      for (const [k, min, max] of [
        ["spacing", 0.15, 5],
        ["length", 0.3, 7],
        ["angle", -360, 360],
        ["width", 0.3, 7],
        ["compensation", 0, 1],
      ])
        if (!Number.isFinite(o[k]) || o[k] < min || o[k] > max)
          throw Error(`Invalid ${k} setting.`);
    }
    const pts = o.type === "manual" ? o.commands : o.rings.flat();
    total += pts.length;
    if (
      total > 500000 ||
      pts.some(
        (q) =>
          !Number.isFinite(q.x) ||
          !Number.isFinite(q.y) ||
          Math.abs(q.x) > 2000 ||
          Math.abs(q.y) > 2000,
      )
    )
      throw Error("Project geometry is too large or invalid.");
  }
  if (new Set(p.objects.map((o) => o.id)).size !== p.objects.length)
    throw Error("Duplicate object identifiers.");
  return p;
}
