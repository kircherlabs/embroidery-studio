import { registerFill } from "./registry.js";
import { offsetRings } from "../operations.js";
import { distance, safeConnector } from "../geometry.js";
import { clipPath, quantizedPath } from "./paths.js";
function verify(paths, ctx, spacing) {
  const bins = new Map(),
    segments = [],
    vertices = new Map(),
    grid = Math.max(0.5, spacing * 2);
  const turn = (a, b, c) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (const [pathId, path] of paths.entries()) {
    for (let i = 0; i < path.length; i++) {
      const p = path[i],
        key = `${p.x.toFixed(5)},${p.y.toFixed(5)}`,
        prior = vertices.get(key);
      if (
        prior &&
        !(prior.pathId === pathId && prior.i === 0 && i === path.length - 1)
      ) {
        const error = Error(
          "Radial turns touch at machine resolution. Increase spacing or reduce ellipse elongation. Contour Fill is an alternative for tight geometry.",
        );
        error.details = {
          pathId,
          i,
          prior,
          p,
          around: path.slice(Math.max(0, i - 4), i + 4),
        };
        throw error;
      }
      vertices.set(key, { pathId, i });
    }
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        seen = new Set();
      for (
        let x = Math.floor(Math.min(a.x, b.x) / grid);
        x <= Math.floor(Math.max(a.x, b.x) / grid);
        x++
      )
        for (
          let y = Math.floor(Math.min(a.y, b.y) / grid);
          y <= Math.floor(Math.max(a.y, b.y) / grid);
          y++
        ) {
          const key = `${x},${y}`,
            list = bins.get(key) || [];
          for (const id of list) {
            if (seen.has(id)) continue;
            seen.add(id);
            ctx.budget.step();
            const e = segments[id];
            if (
              turn(a, b, e.a) * turn(a, b, e.b) < -1e-10 &&
              turn(e.a, e.b, a) * turn(e.a, e.b, b) < -1e-10
            )
              throw Error(
                "Radial paths cross at machine resolution. Increase spacing or use Contour Fill for this region.",
              );
          }
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key).push(segments.length);
        }
      segments.push({ a, b });
    }
  }
}
export function radialFill(ctx, from) {
  const { o, cfg, budget, box } = ctx,
    ratio = cfg.ratio,
    cx = cfg.centerX,
    cy = cfg.centerY,
    minAxis = Math.min(1, ratio),
    maxAxis = Math.max(1, ratio),
    dr = o.spacing / minAxis;
  const max =
    Math.max(
      ...[
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.minY },
        { x: box.maxX, y: box.maxY },
        { x: box.minX, y: box.maxY },
      ].map((p) => Math.hypot((p.x - cx) / ratio, p.y - cy)),
    ) + dr;
  const clipRings = offsetRings(
    { ...o, rings: ctx.localRings, fillRule: "nonzero" },
    -0.12,
  );
  if (!clipRings.length)
    throw Error(
      "This region is too narrow for radial paths at machine resolution. Enlarge it or choose a running outline.",
    );
  const position = (r, t) => ({
      x: cx + ratio * r * Math.cos(t),
      y: cy + r * Math.sin(t),
    }),
    hand = cfg.clockwise ? -1 : 1,
    components = [];
  const append = (source) => {
    const clipped = clipPath(source, clipRings, budget);
    // Join the two pieces separated only by the sampling seam of a closed ring.
    if (
      clipped.length > 1 &&
      distance(source[0], source.at(-1)) < 1e-8 &&
      distance(clipped[0][0], clipped.at(-1).at(-1)) < 1e-7
    ) {
      const first = clipped.shift();
      clipped[clipped.length - 1].push(...first.slice(1));
    }
    for (const part of clipped) {
      let p = quantizedPath(
        ctx.helpers.resample(part.map(ctx.world), o.length),
      );
      const safe = (path) =>
        path
          .slice(1)
          .every((b, i) =>
            safeConnector(path[i], b, ctx.rings, 0, [], "nonzero"),
          );
      if (!safe(p)) p = quantizedPath(part.map(ctx.world));
      if (p.length < 2) continue;
      if (!safe(p))
        throw Error(
          "Radial stitches cannot safely follow a tight clipped edge at machine resolution. Increase inset/spacing or choose Contour Fill.",
        );
      budget.add(p.length);
      // The conservative clipping clearance can split a curve that still fits in
      // the actual source region. Rejoin only a contained short chord within a
      // conservative 0.04 mm curvature-error bound. Never bridge a counter.
      const prior = components.at(-1)?.at(-1),
        d = prior ? distance(prior, p[0]) : Infinity,
        local = prior ? ctx.local(prior) : null,
        r = local ? Math.hypot((local.x - cx) / ratio, local.y - cy) : 0,
        curvatureRadius = (r * minAxis * minAxis) / (2 * maxAxis);
      const join =
        cfg.method === "spiral" &&
        prior &&
        (d < 1e-8 ||
          (d <= o.length &&
            (d * d) / (8 * Math.max(0.001, curvatureRadius)) <= 0.04 &&
            safeConnector(prior, p[0], ctx.rings, 0, [], "nonzero")));
      if (join) components.at(-1).push(...(d < 1e-8 ? p.slice(1) : p));
      else components.push(p);
    }
  };
  if (cfg.method === "ripple") {
    for (let r = dr / 2; r < max; r += dr) {
      const n = Math.max(
        16,
        Math.ceil(
          (2 * Math.PI) /
            Math.min(
              0.3,
              Math.sqrt(0.12 / (r * maxAxis)),
              o.length / (2 * r * maxAxis),
            ),
        ),
      );
      budget.step(n);
      budget.add(n);
      const ring = Array.from({ length: n + 1 }, (_, i) =>
        position(r, (hand * i * 2 * Math.PI) / n),
      );
      ring[n] = ring[0];
      append(ring);
    }
  } else {
    const path = [],
      start = Math.max(0.2, dr / 3),
      slope = dr / (2 * Math.PI);
    let t = 0;
    while (start + slope * t < max) {
      budget.step();
      budget.add();
      const r = start + slope * t;
      path.push(position(r, hand * t));
      t += Math.min(
        0.3,
        Math.sqrt(0.12 / (r * maxAxis)),
        o.length / (2 * Math.max(r * maxAxis, dr)),
      );
    }
    append(path);
  }
  if (!components.length)
    throw Error(
      "No radial paths reach this region at the selected spacing and center. Adjust the center/spacing or choose Contour Fill.",
    );
  verify(components, ctx, o.spacing);
  let at = from;
  const paths = components.map((p) => {
    const connect =
      cfg.method === "ripple" &&
      at &&
      distance(at, p[0]) <= Math.min(o.length, 2.1) &&
      safeConnector(at, p[0], ctx.rings, 0, [], "nonzero");
    const result = {
      p,
      phase: "top",
      noLock: true,
      ...(!connect ? { travel: "jump" } : {}),
    };
    at = p.at(-1);
    return result;
  });
  return {
    paths,
    stats: {
      method: cfg.method,
      components: components.length,
      ratio,
      minimumTurnSpacing: o.spacing,
      points: budget.count,
    },
    issues: [
      {
        severity: "info",
        code: "radial-coverage",
        message:
          cfg.method === "ripple"
            ? "Concentric rings/ellipses are clipped to the artwork. Safe nearby seams connect; other arcs use jumps."
            : "A monotonic Archimedean spiral is clipped to the artwork. Holes and concavities can split it into separate arcs with jump travel.",
        action:
          "Inspect the center, edge margins and travel in Stitch preview. Elliptical spacing is the minimum turn spacing; other directions may be wider. A small central core and narrow tips may remain open. No dense underlay or pull compensation is applied.",
      },
    ],
  };
}
registerFill("ripple", radialFill);
registerFill("spiral", radialFill);
