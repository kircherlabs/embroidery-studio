import { sourceTransform } from "./smart-geometry.js";
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
  sourceTransform(o, [1, 0, 0, 1, dx, dy]);
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
  const ca = Math.cos(a),
    sa = Math.sin(a);
  sourceTransform(o, [
    ca * sx,
    sa * sx,
    -sa * sy,
    ca * sy,
    cx - cx * ca * sx + cy * sa * sy,
    cy - cx * sa * sx - cy * ca * sy,
  ]);
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
    // Spaced petals permit safe yellow/red batching. The original wider,
    // overlapping petals required alternating threads to preserve layering.
    const a = (i / 7) * Math.PI * 2;
    objects.push(
      object(
        `Petal ${i + 1}`,
        [
          ellipse(
            Math.cos(a) * 14,
            -19 + Math.sin(a) * 14,
            9,
            4,
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
  if (
    p.groups !== undefined &&
    (!Array.isArray(p.groups) || p.groups.length > 3000)
  )
    throw Error("Invalid artwork groups.");
  const groupMap = new Map((p.groups || []).map((g) => [g?.id, g]));
  if (
    (p.groups || []).some((g) => !g || !["svg", "group"].includes(g.kind)) ||
    p.objects.some((o) => o?.kind)
  )
    throw Error("Invalid artwork group membership.");
  const all = [...(p.groups || []), ...p.objects];
  if (p.sequencing !== undefined) {
    const s = p.sequencing,
      ids = new Set(p.objects.map((o) => o?.id));
    if (
      !s ||
      !["auto", "manual"].includes(s.mode) ||
      !["tree", "sequence"].includes(s.origin) ||
      !Array.isArray(s.order) ||
      s.order.length > 1000 ||
      new Set(s.order).size !== s.order.length ||
      s.order.some((id) => typeof id !== "string" || !ids.has(id))
    )
      throw Error("Invalid manual sewing order.");
  }
  if (new Set(all.map((n) => n?.id)).size !== all.length)
    throw Error("Duplicate artwork identifiers.");
  for (const n of all) {
    if (
      !n ||
      typeof n.id !== "string" ||
      n.id === "@project" ||
      typeof n.name !== "string" ||
      n.name.length > 200 ||
      ["visible", "locked", "sequenceLocked"].some(
        (k) => n[k] !== undefined && typeof n[k] !== "boolean",
      )
    )
      throw Error("Invalid artwork node.");
    if (n.imageSource !== undefined) {
      const image = n.imageSource;
      if (
        !n.kind ||
        !image ||
        typeof image.data !== "string" ||
        image.data.length > 2000000 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image.data) ||
        typeof image.name !== "string" ||
        image.name.length > 200 ||
        !Number.isInteger(image.width) ||
        !Number.isInteger(image.height) ||
        image.width < 1 ||
        image.width > 384 ||
        image.height < 1 ||
        image.height > 384
      )
        throw Error("Invalid tracing reference image.");
    }
    if (n.traceSettings !== undefined) {
      const t = n.traceSettings;
      if (
        !n.imageSource ||
        !t ||
        !Number.isInteger(t.colors) ||
        t.colors < 2 ||
        t.colors > 10 ||
        !Number.isFinite(t.width) ||
        t.width < 5 ||
        t.width > 200 ||
        !Number.isFinite(t.minArea) ||
        t.minArea < 0 ||
        t.minArea > 5 ||
        !Number.isFinite(t.simplify) ||
        t.simplify < 0 ||
        t.simplify > 0.5 ||
        !Number.isFinite(t.alpha) ||
        t.alpha < 0 ||
        t.alpha > 254 ||
        typeof t.smoothing !== "boolean" ||
        typeof t.removeBackground !== "boolean"
      )
        throw Error("Invalid tracing settings.");
    }
    if (n.kind && !["svg", "group"].includes(n.kind))
      throw Error("Invalid group type.");
    let at = n.parentId,
      seen = new Set([n.id]);
    while (at) {
      if (!groupMap.has(at) || seen.has(at) || seen.size > 64)
        throw Error("Invalid or cyclic artwork hierarchy.");
      seen.add(at);
      at = groupMap.get(at).parentId;
    }
    if (n.operations !== undefined) {
      if (
        n.kind ||
        n.type === "manual" ||
        !Array.isArray(n.operations) ||
        n.operations.length > 32
      )
        throw Error("Invalid embroidery operation stack.");
      if (new Set(n.operations.map((op) => op.id)).size !== n.operations.length)
        throw Error("Duplicate operation identifiers.");
      for (const op of n.operations) {
        if (
          !op ||
          typeof op.id !== "string" ||
          typeof op.name !== "string" ||
          op.name.length > 100 ||
          ![
            "fill",
            "column",
            "marker",
            "run",
            "bean",
            "triple",
            "satin",
            "border",
            "placement",
            "tackdown",
            "basting",
            "contour",
            "stop",
            "trim",
          ].includes(op.type) ||
          [
            "enabled",
            "underlay",
            "closed",
            "reverse",
            "tieIn",
            "tieOff",
            "outerOnly",
          ].some((k) => op[k] !== undefined && typeof op[k] !== "boolean") ||
          (op.color !== undefined && !/^#[0-9a-f]{6}$/i.test(op.color)) ||
          (op.pattern !== undefined &&
            !["quarter", "half", "aligned"].includes(op.pattern))
        )
          throw Error("Invalid embroidery operation.");
        for (const [k, min, max] of [
          ["spacing", 0.15, 5],
          ["length", 0.3, 7],
          ["width", 0.3, 7],
          ["angle", -360, 360],
          ["compensation", 0, 1],
          ["offset", -5, 5],
          ["startIndex", 0, 500000],
        ])
          if (
            op[k] !== undefined &&
            (!Number.isFinite(op[k]) || op[k] < min || op[k] > max)
          )
            throw Error(`Invalid operation ${k}.`);
      }
    }
  }
  if (p.planning) {
    if (
      typeof p.planning !== "object" ||
      ["optimizeColors", "skipSvgOutlines"].some(
        (k) =>
          p.planning[k] !== undefined && typeof p.planning[k] !== "boolean",
      ) ||
      (p.planning.smallDetail !== undefined &&
        (!Number.isFinite(p.planning.smallDetail) ||
          p.planning.smallDetail < 0 ||
          p.planning.smallDetail > 2))
    )
      throw Error("Invalid digitizing settings.");
  }
  let total = 0;
  for (const o of p.objects) {
    if (
      !o ||
      typeof o.id !== "string" ||
      typeof o.name !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(o.color) ||
      (o.pattern !== undefined &&
        !["quarter", "half", "aligned"].includes(o.pattern)) ||
      (o.sequenceLocked !== undefined &&
        typeof o.sequenceLocked !== "boolean") ||
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
    validateSource(o);
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

function validateSource(o) {
  const number = (v, a, b) => Number.isFinite(v) && v >= a && v <= b;
  const points = (rings) =>
    Array.isArray(rings) &&
    rings.length <= 5000 &&
    rings.every(
      (r) =>
        Array.isArray(r) &&
        r.length >= 2 &&
        r.length <= 50000 &&
        r.every((p) => number(p.x, -2000, 2000) && number(p.y, -2000, 2000)),
    ) &&
    rings.reduce((n, r) => n + r.length, 0) <= 100000;
  for (const key of ["shape", "textSource", "curve"])
    if (o[key]) {
      const m = o[key].frame;
      if (
        o.type === "manual" ||
        !Array.isArray(m) ||
        m.length !== 6 ||
        !m.every((v) => number(v, -10000, 10000)) ||
        Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-12
      )
        throw Error("Invalid editable source transform.");
    }
  if (o.shape) {
    const s = o.shape;
    if (
      !["rect", "ellipse", "regular", "star", "eyelet"].includes(s.kind) ||
      !number(s.width, 0.1, 500) ||
      !number(s.height, 0.1, 500) ||
      !number(s.radius, 0, 50) ||
      !Number.isInteger(s.sides) ||
      !number(s.sides, 3, 32) ||
      !number(s.innerRatio, 0.1, 0.9) ||
      !number(s.diameter, 1, 30) ||
      !number(s.band, 0.5, 5)
    )
      throw Error("Invalid smart shape.");
  }
  if (o.textSource) {
    const t = o.textSource;
    if (
      typeof t.content !== "string" ||
      !t.content.trim() ||
      t.content.length > 120 ||
      !["serif", "sans-serif", "monospace", "cursive"].includes(t.font) ||
      !number(t.height, 3, 80) ||
      !number(t.tracking, 0, 10) ||
      !number(t.lineSpacing, 1, 3) ||
      !["left", "center", "right"].includes(t.align)
    )
      throw Error("Invalid editable lettering.");
  }
  if (o.curve) {
    const c = o.curve;
    if (
      typeof c.closed !== "boolean" ||
      !Array.isArray(c.nodes) ||
      c.nodes.length < 2 ||
      c.nodes.length > 2000 ||
      c.nodes.some((n) =>
        [n, n.in, n.out]
          .filter(Boolean)
          .some((p) => !number(p.x, -2000, 2000) || !number(p.y, -2000, 2000)),
      )
    )
      throw Error("Invalid Bézier path.");
  }
  if (
    o.rounding &&
    (!number(o.rounding.radius, 0, 20) || !points(o.rounding.rings))
  )
    throw Error("Invalid rounding source.");
  for (const v of [o, ...(o.operations || [])]) {
    if (v.cornerControl !== undefined && typeof v.cornerControl !== "boolean")
      throw Error("Invalid corner control.");
    if (v.minCornerStitch !== undefined && !number(v.minCornerStitch, 0.2, 1))
      throw Error("Invalid corner stitch length.");
    if (v.maxSatin !== undefined && !number(v.maxSatin, 1, 6.5))
      throw Error("Invalid maximum satin span.");
  }
}
