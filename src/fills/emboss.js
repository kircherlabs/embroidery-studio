import { registerFill } from "./registry.js";
import { fraction, denseUnderlay, mapRows } from "./tatami.js";
import { redistributeRow } from "./edges.js";
export function motifSegments(cfg, box, budget) {
  const angle = (cfg.motifAngle * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    local = (p) => ({
      x: (p.x - cfg.phaseX) * c + (p.y - cfg.phaseY) * s,
      y: -(p.x - cfg.phaseX) * s + (p.y - cfg.phaseY) * c,
    }),
    world = (p) => ({
      x: cfg.phaseX + p.x * c - p.y * s,
      y: cfg.phaseY + p.x * s + p.y * c,
    });
  const corners = [
      { x: box.minX, y: box.minY },
      { x: box.maxX, y: box.minY },
      { x: box.maxX, y: box.maxY },
      { x: box.minX, y: box.maxY },
    ].map(local),
    b = {
      minX: Math.min(...corners.map((p) => p.x)) - cfg.scale,
      maxX: Math.max(...corners.map((p) => p.x)) + cfg.scale,
      minY: Math.min(...corners.map((p) => p.y)) - cfg.scale,
      maxY: Math.max(...corners.map((p) => p.y)) + cfg.scale,
    },
    out = [];
  const add = (path) => {
    budget.step(path.length);
    for (let i = 1; i < path.length; i++)
      out.push([world(path[i - 1]), world(path[i])]);
  };
  const { motif, scale, repeat } = cfg;
  if (motif === "diagonal" || motif === "lattice") {
    const slopes =
      motif === "lattice"
        ? [repeat / scale, -repeat / scale]
        : [repeat / scale];
    for (const slope of slopes) {
      const min = Math.min(b.minX - slope * b.minY, b.minX - slope * b.maxY),
        max = Math.max(b.maxX - slope * b.minY, b.maxX - slope * b.maxY);
      for (let k = Math.floor(min / repeat); k <= Math.ceil(max / repeat); k++)
        add([
          { x: k * repeat + slope * b.minY, y: b.minY },
          { x: k * repeat + slope * b.maxY, y: b.maxY },
        ]);
    }
  } else if (motif === "waves") {
    for (
      let k = Math.floor((b.minX - scale) / repeat);
      k <= Math.ceil((b.maxX + scale) / repeat);
      k++
    ) {
      const path = [],
        step = Math.min(0.5, repeat / 24);
      for (let y = b.minY; y <= b.maxY + step; y += step)
        path.push({
          x: k * repeat + (scale / 4) * Math.sin((2 * Math.PI * y) / repeat),
          y,
        });
      add(path);
    }
  } else {
    for (
      let row = Math.floor(b.minY / repeat);
      row <= Math.ceil(b.maxY / repeat);
      row++
    )
      for (
        let col = Math.floor(b.minX / repeat);
        col <= Math.ceil(b.maxX / repeat);
        col++
      ) {
        if (motif === "checker" && (row + col) % 2) continue;
        const x = col * repeat,
          y = row * repeat,
          r = scale / 2;
        let path;
        if (motif === "dots") {
          const n = Math.max(24, Math.ceil(Math.PI * Math.sqrt(r / 0.02)));
          path = Array.from({ length: n + 1 }, (_, i) => ({
            x: x + r * Math.cos((i * 2 * Math.PI) / n),
            y: y + r * Math.sin((i * 2 * Math.PI) / n),
          }));
        } else if (motif === "diamonds")
          path = [
            { x, y: y - r },
            { x: x + r, y },
            { x, y: y + r },
            { x: x - r, y },
            { x, y: y - r },
          ];
        else
          path = [
            { x: x - r, y: y - r },
            { x: x + r, y: y - r },
            { x: x + r, y: y + r },
            { x: x - r, y: y + r },
            { x: x - r, y: y - r },
          ];
        add(path);
      }
  }
  return out;
}
export function embossFill(ctx, from, to) {
  const { o, cfg, budget } = ctx,
    marks = new Map();
  let reduced = 0;
  if (cfg.strength > 0)
    for (const [a, b] of motifSegments(cfg, ctx.box, budget)) {
      if (Math.abs(a.y - b.y) < 1e-10) continue;
      const first = Math.ceil((Math.min(a.y, b.y) - o.spacing / 2) / o.spacing),
        last = Math.ceil((Math.max(a.y, b.y) - o.spacing / 2) / o.spacing) - 1;
      for (let row = first; row <= last; row++) {
        budget.step();
        const y = row * o.spacing + o.spacing / 2,
          x = a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
        if (!marks.has(row)) marks.set(row, []);
        marks.get(row).push(x);
      }
    }
  const minimum = Math.min(0.5, o.length),
    rows = ctx.helpers.fillRows(
      ctx.localRings,
      o.spacing,
      0,
      o.length,
      o.compensation,
      "nonzero",
      "quarter",
      null,
      0,
      {
        fixed: true,
        phase: (r) => (((r % 4) + 4) % 4) / 4,
        adjust: (row, index) => {
          // Emphasis is the evenly distributed fraction of rows pinned to the motif.
          // It changes real penetrations without changing the row spacing/density.
          if (
            cfg.strength === 0 ||
            fraction(index * cfg.strength + 0.001) >= cfg.strength
          )
            return row;
          const start = row[0],
            end = row.at(-1),
            cuts = [start.x];
          for (const x of (marks.get(index) || [])
            .filter((x) => x > start.x + 1e-8 && x < end.x - 1e-8)
            .sort((a, b) => a - b)) {
            if (x - cuts.at(-1) < minimum || end.x - x < minimum) {
              reduced++;
              continue;
            }
            cuts.push(x);
          }
          cuts.push(end.x);
          const out = [start];
          for (let i = 1; i < cuts.length; i++) {
            const low = cuts[i - 1],
              high = cuts[i],
              part = [
                { x: low, y: start.y },
                ...row.filter((p) => p.x > low + 1e-8 && p.x < high - 1e-8),
                { x: high, y: start.y },
              ],
              adjusted = redistributeRow(part, minimum, o.length);
            out.push(...adjusted.points.slice(1));
          }
          return out;
        },
      },
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
  return {
    paths,
    stats: {
      method: "emboss",
      motif: cfg.motif,
      reducedMotifMarks: reduced,
      points: budget.count,
    },
    issues: [
      {
        severity: "info",
        code: "emboss-surface",
        message:
          "Embossed Tatami forms surface texture by concentrating needle penetrations along motif boundaries. It is not raised padding or a separate sewn overlay.",
        action:
          "Inspect needle buildup and test a swatch for the selected thread, fabric and stabilizer.",
      },
      ...(reduced
        ? [
            {
              severity: "warning",
              code: "emboss-reduced-detail",
              message: `${reduced} close motif marks were not retained to avoid crowded penetrations. All fill rows and boundary endpoints remain sewn.`,
              action:
                "Increase motif size/repeat, reduce emphasis or choose wider artwork. Fine motif detail may not be resolved at this stitch scale.",
            },
          ]
        : []),
    ],
  };
}
registerFill("emboss", embossFill);
