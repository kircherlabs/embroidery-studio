import { registerFill } from "./registry.js";
export const fraction = (n) => n - Math.floor(n);
export function hash01(seed, index) {
  let h = (seed ^ Math.imul(index, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sequences = {
  quarter: [0, 0.25, 0.5, 0.75],
  half: [0, 0.5],
  aligned: [0],
  third: [0, 1 / 3, 2 / 3],
  fifth: [0, 0.2, 0.4, 0.6, 0.8],
};
export function texturePhase(s, row) {
  const kind = s.texture || "quarter",
    period = s.period || 8;
  if (sequences[kind]) {
    const seq = sequences[kind];
    return seq[((row % seq.length) + seq.length) % seq.length];
  }
  if (kind === "twill") return fraction(row / period);
  if (kind === "progressive") return fraction(row * (s.step ?? 0.17));
  if (kind === "chevron") {
    const r = ((row % (period * 2)) + period * 2) % (period * 2);
    return (r < period ? r : period * 2 - 1 - r) / period;
  }
  if (kind === "wave")
    return fraction(
      0.5 + 0.5 * (s.amplitude ?? 0.5) * Math.sin((2 * Math.PI * row) / period),
    );
  if (kind === "random")
    return fraction(
      hash01(s.seed ?? 1, -1) +
        row * 0.3819660112501051 +
        (hash01(s.seed ?? 1, row) - 0.5) * 2 * (s.variation ?? 0.1),
    );
  if (kind === "custom") {
    const seq = s.sequence;
    return seq[((row % seq.length) + seq.length) % seq.length];
  }
  throw Error("Choose a supported Tatami texture.");
}
export function denseUnderlay(ctx, from) {
  const o = {
      ...ctx.o,
      rings: ctx.rings,
      polygon: ctx.polygons,
      fillRule: "nonzero",
    },
    spacing = Math.max(2, o.spacing * 5),
    stride = Math.ceil(spacing / Math.min(0.42, o.spacing));
  return o.underlay
    ? ctx.helpers.routeFill(
        ctx.helpers.fillRows(
          ctx.rings,
          spacing / stride,
          (Math.atan2(ctx.u.y, ctx.u.x) * 180) / Math.PI + 90,
          3,
          0,
          "nonzero",
          "quarter",
        ),
        o,
        from,
        "underlay",
        { stride },
      )
    : [];
}
export function mapRows(rows, world) {
  return rows.map((row) => {
    const p = row.map(world);
    p.anchors = row.anchors.map(world);
    p.scanline = row.scanline;
    p.interval = row.interval;
    return p;
  });
}
export function tatamiFill(ctx, from, to) {
  const { o, cfg, box, budget } = ctx;
  budget.step(
    Math.ceil(box.height / o.spacing + 2) * ctx.localRings.flat().length,
  );
  const rows = ctx.helpers.fillRows(
    ctx.localRings,
    o.spacing,
    0,
    o.length,
    o.compensation,
    "nonzero",
    o.pattern,
    null,
    0,
    { fixed: true, phase: (r) => texturePhase(cfg, r) },
  );
  budget.add(rows.reduce((n, r) => n + r.length, 0));
  const paths = denseUnderlay(ctx, from),
    view = {
      ...o,
      rings: ctx.rings,
      polygon: ctx.polygons,
      fillRule: "nonzero",
    };
  paths.push(
    ...ctx.helpers.routeFill(
      mapRows(rows, ctx.world),
      view,
      paths.at(-1)?.p.at(-1) || from,
      "top",
      { connectFrom: paths.length > 0, to },
    ),
  );
  const issues = [];
  let nearest = Infinity;
  for (
    let row = 0;
    row < Math.min(128, Math.ceil(box.height / o.spacing));
    row++
  ) {
    const a = texturePhase(cfg, row),
      b = texturePhase(cfg, row + 1),
      d = Math.abs(a - b);
    nearest = Math.min(
      nearest,
      Math.hypot(Math.min(d, 1 - d) * o.length, o.spacing),
    );
  }
  if (nearest < 0.5)
    issues.push({
      severity: "warning",
      code: "fill-aligned-penetrations",
      message:
        "This texture aligns nearby needle penetrations; dense settings can build up thread or perforate delicate fabric.",
      action:
        "Review row spacing, thread weight and fabric; try Classic or Brick for a more distributed pattern and test a swatch.",
    });
  return {
    paths,
    issues,
    stats: {
      method: "tatami",
      texture: cfg.texture,
      points: budget.count,
      nearestRowPenetration: nearest,
    },
  };
}
registerFill("tatami", tatamiFill);
