import { registerFill } from "./registry.js";
import { quantize } from "./paths.js";
// A complete cell, not a percentage-area approximation. Boundary segments and
// diagonals must be inside; a small counter wholly enclosed by the cell excludes
// it too. Quantized machine diagonals are validated independently.
export function crossCells(ctx) {
  const { cfg, box, budget } = ctx,
    size = cfg.size,
    pitch = cfg.pitch,
    h = size / 2,
    rows = [];
  let omitted = 0;
  for (
    let row = Math.ceil((box.minY + h) / pitch);
    row * pitch <= box.maxY - h + 1e-9;
    row++
  ) {
    const cells = [];
    for (
      let col = Math.ceil((box.minX + h) / pitch);
      col * pitch <= box.maxX - h + 1e-9;
      col++
    ) {
      const x = col * pitch,
        y = row * pitch;
      budget.step(ctx.localRings.flat().length * 9);
      const p = [
          { x: x - h, y: y - h },
          { x: x + h, y: y - h },
          { x: x + h, y: y + h },
          { x: x - h, y: y + h },
        ],
        edges = [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
          [0, 2],
          [1, 3],
        ];
      if (
        !ctx.inside({ x, y }) ||
        !edges.every(([a, b]) => ctx.safe(p[a], p[b])) ||
        ctx.localRings.some((r) =>
          r.some(
            (v) =>
              v.x > x - h + 1e-8 &&
              v.x < x + h - 1e-8 &&
              v.y > y - h + 1e-8 &&
              v.y < y + h - 1e-8,
          ),
        )
      ) {
        omitted++;
        continue;
      }
      const q = p.map((v) => quantize(ctx.world(v))),
        local = q.map(ctx.local);
      if (
        ![
          [0, 2],
          [1, 3],
        ].every(([a, b]) => ctx.safe(local[a], local[b]))
      ) {
        omitted++;
        continue;
      }
      budget.add(4);
      cells.push(q);
    }
    if (row % 2) cells.reverse();
    if (cells.length) rows.push(cells);
  }
  return { cells: rows.flat(), omitted };
}
export function crossFill(ctx) {
  const { cells, omitted } = crossCells(ctx);
  if (!cells.length)
    throw Error(
      "No complete cross-stitch cells fit. Reduce cross size/pitch, adjust the pattern origin, or enlarge the region.",
    );
  // Never reverse an individual leg: the NE→SW diagonal is always sewn last.
  const paths = cells.flatMap((p) => [
    { p: [p[0], p[2]], phase: "cross-under", travel: "jump", noLock: true },
    { p: [p[1], p[3]], phase: "cross-top", travel: "jump", noLock: true },
  ]);
  return {
    paths,
    stats: {
      method: "cross",
      crosses: cells.length,
      omitted,
      points: ctx.budget.count,
    },
    issues: [
      {
        severity: "info",
        code: "cross-complete-cells",
        message: `${cells.length} complete crosses; partial edge cells are omitted${omitted ? ` (${omitted} grid cells excluded around boundaries/counters)` : ""}. The same diagonal is sewn on top of every cross.`,
        action:
          "Inspect the edge margin; change cell size, pitch or origin to adjust coverage. Travel between legs is not front-side stitching.",
      },
    ],
  };
}
registerFill("cross", crossFill);
