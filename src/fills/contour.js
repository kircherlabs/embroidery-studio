import { registerFill } from "./registry.js";
import { offsetRings } from "../operations.js";
import {
  fillPolygons,
  points,
  polygonArea,
  distance,
  safeConnector,
} from "../geometry.js";
import { quantizedPath } from "./paths.js";

export function contourFill(ctx, from) {
  const { o, cfg, budget } = ctx,
    source = { ...o, rings: ctx.rings, fillRule: "nonzero" },
    levels = [];
  const max = Math.hypot(ctx.box.width, ctx.box.height) / 2;
  let prior = polygonArea(ctx.polygons),
    split = false;
  for (let inset = o.spacing / 2; inset <= max; inset += o.spacing) {
    budget.step(ctx.rings.flat().length);
    // Recompute each level from the original region. Repeated offsets would
    // compound rounding error and can alter narrow necks and counters.
    const rings = offsetRings(source, -inset);
    if (!rings.length) break;
    const polys = fillPolygons(rings, "nonzero");
    if (!polys?.length)
      throw Error(
        "Contour offset produced an ambiguous boundary. Simplify the outline or increase spacing.",
      );
    const area = polygonArea(polys);
    if (area >= prior - 0.000001)
      throw Error(
        "Contour offsets stopped progressing. Increase spacing or simplify the outline.",
      );
    prior = area;
    if (polys.length > ctx.polygons.length) split = true;
    const loops = [];
    for (const poly of polys)
      for (const ring of poly) {
        const sourcePath = points(ring),
          path = quantizedPath(
            ctx.helpers.resample(sourcePath, o.length, true),
          );
        budget.add(path.length);
        if (path.length < 3) continue;
        if (
          path
            .slice(1)
            .some(
              (p, i) => !safeConnector(path[i], p, ctx.rings, 0, [], "nonzero"),
            )
        )
          throw Error(
            "Contour stitches cannot safely follow this tight boundary at machine resolution. Increase spacing or simplify small details.",
          );
        loops.push(path);
      }
    if (loops.length) levels.push(loops);
  }
  if (!levels.length)
    throw Error(
      "No contour fits inside this region at the selected spacing. Reduce spacing or enlarge the artwork.",
    );
  if (cfg.direction === "inside-out") levels.reverse();
  const paths = [];
  let at = from;
  for (const loops of levels) {
    // Preserve level order; only choose the nearest seam within this level.
    while (loops.length) {
      budget.step(loops.reduce((n, p) => n + p.length, 0));
      let choice = 0,
        vertex = 0,
        cost = Infinity;
      loops.forEach((p, i) =>
        p.slice(0, -1).forEach((v, j) => {
          const d = at ? distance(at, v) : i + j;
          if (d < cost) {
            cost = d;
            choice = i;
            vertex = j;
          }
        }),
      );
      const loop = loops.splice(choice, 1)[0].slice(0, -1),
        p = [...loop.slice(vertex), ...loop.slice(0, vertex)];
      p.push({ ...p[0] });
      paths.push({
        p,
        phase: "top",
        connect: !!at && safeConnector(at, p[0], ctx.rings, 0, [], "nonzero"),
      });
      at = p.at(-1);
    }
  }
  return {
    paths,
    stats: {
      method: "contour",
      levels: levels.length,
      loops: paths.length,
      points: budget.count,
    },
    issues: [
      {
        severity: "info",
        code: "contour-core",
        message:
          "Contour loops stop where the next inset collapses. Narrow tips and the central core can have less coverage than Tatami.",
        action:
          "Inspect the remaining core and thin details. Reduce spacing or use Tatami when uniform area coverage is required.",
      },
      ...(split
        ? [
            {
              severity: "info",
              code: "contour-split",
              message:
                "Inset contours split at narrow necks; separate safe loops preserve each surviving region.",
              action:
                "Review travel and narrow-area coverage in Stitch preview.",
            },
          ]
        : []),
    ],
  };
}
registerFill("contour", contourFill);
