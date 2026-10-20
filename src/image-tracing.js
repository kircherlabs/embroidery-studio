import { sculptIntersections } from "./sculpt-contour.js";
import { signedArea, fillPolygons } from "./geometry.js";
import { remapLabels, lab, distance2 } from "./image-colors.js";
import { traceLabels, simplify } from "./importers.js";
import { object } from "./model.js";
// Merge small color islands into their largest touching neighbor. Unlike deleting
// an island, this cannot create a transparent pinhole in previously opaque art.
export function cleanIslands(labels, w, h, minimum) {
  if (minimum <= 1) return 0;
  const visited = new Uint8Array(labels.length);
  let changed = 0;
  for (let start = 0; start < labels.length; start++)
    if (labels[start] >= 0 && !visited[start]) {
      const color = labels[start],
        q = [start],
        neighbors = new Map();
      visited[start] = 1;
      for (let at = 0; at < q.length; at++) {
        const i = q[at],
          x = i % w;
        for (const j of [
          x ? i - 1 : -1,
          x < w - 1 ? i + 1 : -1,
          i >= w ? i - w : -1,
          i < w * (h - 1) ? i + w : -1,
        ])
          if (j >= 0) {
            if (labels[j] === color && !visited[j]) {
              visited[j] = 1;
              q.push(j);
            } else if (labels[j] >= 0 && labels[j] !== color)
              neighbors.set(labels[j], (neighbors.get(labels[j]) || 0) + 1);
          }
      }
      if (q.length < minimum && neighbors.size) {
        const next = [...neighbors].sort(
          (a, b) => b[1] - a[1] || a[0] - b[0],
        )[0][0];
        for (const i of q) labels[i] = next;
        changed += q.length;
      }
    }
  return changed;
}
function exposedContours(labels, w, h, color, scale, settings) {
  const original = traceLabels(labels, w, h, color, scale, {
    preservePixels: true,
    simplify: 0,
  });
  if (!settings.smoothing && !settings.simplify) return original;
  const at = (x, y) =>
      x < 0 || y < 0 || x >= w || y >= h ? -1 : labels[y * w + x],
    other = (v) => v >= 0 && v !== color;
  const modified = original.map((r) => {
    const ps = r.slice(0, -1),
      locked = ps.map(() => false);
    for (let i = 0; i < ps.length; i++) {
      const j = (i + 1) % ps.length,
        a = ps[i],
        b = ps[j],
        x0 = Math.round(a.x / scale),
        y0 = Math.round(a.y / scale),
        x1 = Math.round(b.x / scale),
        y1 = Math.round(b.y / scale);
      let shared = false;
      if (y0 === y1) {
        for (let x = Math.min(x0, x1); x < Math.max(x0, x1) && !shared; x++)
          shared = other(at(x, y0 - 1)) || other(at(x, y0));
      } else {
        for (let y = Math.min(y0, y1); y < Math.max(y0, y1) && !shared; y++)
          shared = other(at(x0 - 1, y)) || other(at(x0, y));
      }
      if (shared) locked[i] = locked[j] = true;
    }
    let out = [];
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i],
        b = ps[(i + 1) % ps.length];
      if (!settings.smoothing || locked[i])
        out.push({ ...a, locked: locked[i] });
      if (settings.smoothing && !locked[i] && !locked[(i + 1) % ps.length]) {
        const length = Math.hypot(b.x - a.x, b.y - a.y),
          t = Math.min(0.25, (scale * 0.35) / (length || 1));
        out.push(
          { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
          { x: b.x + (a.x - b.x) * t, y: b.y + (a.y - b.y) * t },
        );
      }
    }
    const first = out.findIndex((p) => p.locked);
    if (first < 0) {
      out.push({ ...out[0] });
      out = simplify(out, settings.simplify || 0);
    } else {
      const walk = [...out.slice(first), ...out.slice(0, first), out[first]],
        result = [];
      let chain = [walk[0]];
      for (const p of walk.slice(1)) {
        chain.push(p);
        if (p.locked) {
          result.push(...simplify(chain, settings.simplify || 0).slice(0, -1));
          chain = [p];
        }
      }
      out = [...result, { ...result[0] }];
    }
    const clean = out.map(({ x, y }) => ({ x, y }));
    return clean.length >= 4 && signedArea(clean) * signedArea(r) > 0
      ? clean
      : r;
  });
  // Reject new crossings/collapsed counters rather than trading valid geometry
  // for a requested smoothing tolerance. Exact raster boundaries remain available.
  try {
    if (
      (sculptIntersections(modified) && !sculptIntersections(original)) ||
      !fillPolygons(modified, "nonzero")
    )
      return original;
  } catch {
    return original;
  }
  return modified;
}
export function traceModel(model, settings) {
  const { labels, mapping } = remapLabels(
      model,
      settings.choices,
      settings.background ?? -1,
    ),
    scale = settings.width / model.width,
    cleaned = cleanIslands(
      labels,
      model.width,
      model.height,
      (settings.minArea || 0) / scale ** 2,
    ),
    objects = [];
  for (const i of [...new Set(labels)]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)) {
    let rings = exposedContours(
      labels,
      model.width,
      model.height,
      i,
      scale,
      settings,
    );
    for (const r of rings)
      for (const p of r) {
        p.x -= settings.width / 2;
        p.y -= (model.height * scale) / 2;
      }
    if (rings.length)
      objects.push(
        object(`Image color ${i + 1}`, rings, {
          color: model.palette[i].hex,
          fillRule: "nonzero",
          closed: true,
          traceColor: i,
          tracePaint: model.palette[i].hex,
        }),
      );
  }
  const nodes = objects.reduce((n, o) => n + o.rings.flat().length, 0),
    contours = objects.reduce((n, o) => n + o.rings.length, 0);
  if (nodes > 450000)
    throw Error(
      "Over 450,000 vector nodes. Lower resolution, merge colors, increase minimum island area or simplification.",
    );
  return {
    objects,
    mapping,
    labels,
    nodes,
    contours,
    cleaned,
    coverage: labels.reduce((n, c) => n + (c >= 0), 0),
  };
}
// Color-only revisions leave geometry, per-action overrides, source frames and
// manual sequence intact. Only colors still matching a traced paint are changed.
export function applyTracePalette(
  objects,
  palette,
  choices,
  previousPalette = palette.map((p) => p.hex),
) {
  const { mapping } = remapLabels(
      { palette, labels: new Int16Array(), width: 0, height: 0 },
      choices,
    ),
    changes = new Map();
  const retained = [...new Set(mapping.filter((i) => i >= 0))].map(
    (i) => palette[i],
  );
  for (const color of previousPalette) {
    const rgb = color
        .slice(1)
        .match(/../g)
        .map((v) => parseInt(v, 16)),
      p = lab(rgb);
    const exact = palette.findIndex((c) => c.hex === color);
    let target;
    if (exact >= 0 && mapping[exact] >= 0) target = palette[mapping[exact]];
    else
      target = retained.reduce((a, b) =>
        distance2(p, a.lab) <= distance2(p, b.lab) ? a : b,
      );
    if (color !== target.hex) changes.set(color, target.hex);
  }
  let changed = 0;
  for (const o of objects) {
    let touched = false;
    const next = changes.get(
      (o.physicalThread?.designColor || o.color)?.toLowerCase(),
    );
    if (next) {
      if (o.physicalThread) o.physicalThread.designColor = next;
      o.color = o.physicalThread?.thread.hex || next;
      touched = true;
    }
    for (const op of o.operations || []) {
      const c = changes.get(
        (op.physicalThread?.designColor || op.color)?.toLowerCase(),
      );
      if (c) {
        if (op.physicalThread) op.physicalThread.designColor = c;
        op.color = op.physicalThread?.thread.hex || c;
        touched = true;
      }
    }
    if (touched) changed++;
  }
  return changed;
}
