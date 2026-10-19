import { curveRings, identity, railWalk, railRings } from "./smart-geometry.js";
import { cubic, curveInterval, worldCurve } from "./path-editing.js";
import {
  distance,
  signedArea,
  fillPolygons,
  safeConnector,
} from "./geometry.js";
import { paceRails, shortInnerTurns } from "./satin-rails.js";
import { quantizeColumnPaths } from "./column-routing.js";
const mix = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const controls = (c, i) => {
  const a = c.nodes[i],
    b = c.nodes[(i + 1) % c.nodes.length];
  return [a, a.out || a, b.in || b, b];
};
const closedPoints = (r) =>
  distance(r[0], r.at(-1)) < 1e-7 ? r.slice(0, -1) : r;

export function makeRailSource(a, b) {
  a = worldCurve({ curve: a });
  b = worldCurve({ curve: b });
  if (a.closed !== b.closed)
    throw Error("Use two open rails, or two closed rails forming one ring.");
  const source = { a, b, seamA: 0, seamB: 0, reverseB: false };
  if (a.closed) {
    const box = (nodes) => {
        const xs = nodes.map((n) => n.x),
          ys = nodes.map((n) => n.y);
        return {
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs) || 1,
          h: Math.max(...ys) - Math.min(...ys) || 1,
        };
      },
      aa = box(a.nodes),
      bb = box(b.nodes),
      start = {
        x: (a.nodes[0].x - aa.x) / aa.w,
        y: (a.nodes[0].y - aa.y) / aa.h,
      };
    let best = Infinity;
    b.nodes.forEach((n, i) => {
      const d = distance(start, {
        x: (n.x - bb.x) / bb.w,
        y: (n.y - bb.y) / bb.h,
      });
      if (d < best) {
        best = d;
        source.seamB = i;
      }
    });
    source.reverseB =
      signedArea(curveRings(a)[0]) * signedArea(curveRings(b)[0]) < 0;
  } else
    source.reverseB =
      distance(a.nodes[0], b.nodes.at(-1)) +
        distance(a.nodes.at(-1), b.nodes[0]) <
      distance(a.nodes[0], b.nodes[0]) +
        distance(a.nodes.at(-1), b.nodes.at(-1));
  validateBand(source);
  return source;
}
function validateBand(source) {
  const rings = railRings(source),
    polygons = fillPolygons(rings, "evenodd");
  if (
    !polygons ||
    polygons.length !== 1 ||
    (source.a.closed && polygons[0].length !== 2)
  )
    throw Error(
      "The two rails must form one non-crossing band. Closed rails need one nested opening. Repair crossings or split branches into separate columns.",
    );
  if (
    !source.a.closed &&
    distance(source.a.nodes[0], source.a.nodes.at(-1)) < 1e-8
  )
    throw Error(
      "Use closed rails for a complete ring, or split it into open sections.",
    );
  return { rings, polygon: polygons, fillRule: "evenodd" };
}

// Keep both arc distance and cubic parameter, including nonlinear straight cubics.
function measure(c) {
  c = worldCurve({ curve: c });
  if (c.closed) c.nodes.push(structuredClone(c.nodes[0]));
  c.closed = false;
  const samples = [{ p: c.nodes[0], at: 0, s: 0 }];
  const sample = (ps, index, lo = 0, hi = 1, depth = 0) => {
    const p0 = cubic(ps, lo),
      p1 = cubic(ps, hi),
      q1 = cubic(ps, lo + (hi - lo) / 3),
      q2 = cubic(ps, lo + (2 * (hi - lo)) / 3);
    if (
      depth >= 14 ||
      Math.max(
        distance(q1, mix(p0, p1, 1 / 3)),
        distance(q2, mix(p0, p1, 2 / 3)),
      ) < 0.005
    ) {
      samples.push({
        p: p1,
        at: index + hi,
        s: samples.at(-1).s + distance(samples.at(-1).p, p1),
      });
      return;
    }
    const m = (lo + hi) / 2;
    sample(ps, index, lo, m, depth + 1);
    sample(ps, index, m, hi, depth + 1);
  };
  for (let i = 0; i < c.nodes.length - 1; i++) sample(controls(c, i), i);
  if (samples.length > 50000)
    throw Error(
      "These rails are too complex. Simplify them or split the column.",
    );
  const length = samples.at(-1).s;
  if (length < 0.1) throw Error("Each rail needs at least 0.1 mm of length.");
  const at = (t) => {
    const s = Math.max(0, Math.min(1, t)) * length;
    let lo = 1,
      hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].s < s) lo = mid + 1;
      else hi = mid;
    }
    const a = samples[lo - 1],
      b = samples[lo],
      u = (s - a.s) / (b.s - a.s || 1),
      param = a.at + (b.at - a.at) * u;
    const index = Math.min(c.nodes.length - 2, Math.floor(param));
    return { p: cubic(controls(c, index), param - index), param };
  };
  return { c, samples, length, at };
}
function intersections(rail, a, b) {
  const hits = [],
    v = sub(b, a);
  for (let i = 1; i < rail.samples.length; i++) {
    const p = rail.samples[i - 1],
      q = rail.samples[i],
      w = sub(q.p, p.p),
      den = cross(v, w);
    if (Math.abs(den) < 1e-10) continue;
    const t = cross(sub(p.p, a), w) / den,
      u = cross(sub(p.p, a), v) / den;
    if (t >= -1e-7 && t <= 1 + 1e-7 && u >= -1e-7 && u <= 1 + 1e-7)
      hits.push(
        (p.s + (q.s - p.s) * Math.max(0, Math.min(1, u))) / rail.length,
      );
  }
  hits.sort((a, b) => a - b);
  return hits.filter((v, i) => !i || v - hits[i - 1] > 1e-5);
}
export function railLayout(source, guides = []) {
  const band = validateBand(source),
    a = measure(railWalk(source, "a")),
    b = measure(railWalk(source, "b")),
    anchors = [{ a: 0, b: 0 }];
  for (const [i, g] of guides.entries()) {
    const aa = intersections(a, g.a, g.b),
      bb = intersections(b, g.a, g.b);
    if (aa.length !== 1 || bb.length !== 1)
      throw Error(
        `Direction guide ${i + 1} must cross each rail exactly once. Shorten or move the guide across the band.`,
      );
    if (aa[0] < 1e-5 || bb[0] < 1e-5 || aa[0] > 1 - 1e-5 || bb[0] > 1 - 1e-5)
      throw Error(
        `Move direction guide ${i + 1} away from the seam/end caps; use seam controls for the starting pair.`,
      );
    anchors.push({ a: aa[0], b: bb[0] });
  }
  anchors.push({ a: 1, b: 1 });
  anchors.sort((x, y) => x.a - y.a);
  for (let i = 1; i < anchors.length; i++)
    if (
      anchors[i].a - anchors[i - 1].a < 1e-5 ||
      anchors[i].b - anchors[i - 1].b < 1e-5
    )
      throw Error(
        "Direction guides cross or disagree with the rail seams. Reorder the seam nodes, reverse rail B, or move the guides.",
      );
  const sections = [];
  for (let i = 1; i < anchors.length; i++) {
    const p = anchors[i - 1],
      q = anchors[i],
      n = Math.max(
        1,
        Math.ceil(
          Math.max((q.a - p.a) * a.length, (q.b - p.b) * b.length) / 0.08,
        ),
      );
    if (sections.length + n > 20000)
      throw Error(
        "This column is too long for bounded satin reconstruction. Split it.",
      );
    for (let j = 0; j < n; j++) {
      const t = j / n,
        u = p.a + (q.a - p.a) * t,
        v = p.b + (q.b - p.b) * t,
        pa = a.at(u).p,
        pb = b.at(v).p;
      sections.push({
        a: pa,
        b: pb,
        center: mix(pa, pb, 0.5),
        width: distance(pa, pb),
        u,
        v,
      });
    }
  }
  const pa = a.at(1).p,
    pb = b.at(1).p;
  if (!source.a.closed)
    sections.push({
      a: pa,
      b: pb,
      center: mix(pa, pb, 0.5),
      width: distance(pa, pb),
      u: 1,
      v: 1,
    });
  return { ...band, a, b, anchors, sections, closed: source.a.closed };
}
function ringFootprint(sections, closed) {
  const a = sections.map((q) => q.a),
    b = sections.map((q) => q.b);
  const rings = closed
    ? [closedPoints(a), closedPoints(b)]
    : [[...a, ...b.reverse()]];
  const polygon = fillPolygons(rings, "evenodd");
  if (!polygon || polygon.length !== 1 || (closed && polygon[0].length !== 2))
    throw Error(
      "Width adjustment or compensation collapses/crosses this band. Reduce it or edit the rails.",
    );
  // Keep the actual sampled rails for containment. Boolean validation uses a
  // 0.001 mm grid; rounding near a nearly tangent terminal can move its boundary
  // across a legal span. Quantization checks the full-precision band separately.
  if (closed)
    rings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  return { rings, polygon, fillRule: "evenodd" };
}
export function manualSatin(o) {
  if (!o.satinRails)
    throw Error(
      "This manual satin action needs two editable rails. Create them with Manual satin rails.",
    );
  const layout = railLayout(o.satinRails, o.satinGuides || []),
    scale = o.railScale ?? 1,
    comp = o.compensation || 0;
  let sections = layout.sections.map((q) => {
    if (q.width < 0.1)
      throw Error(
        "The rails meet or become narrower than 0.1 mm. Separate them or split the column at this terminal.",
      );
    const k = (q.width * scale + 2 * comp) / q.width;
    return {
      ...q,
      a: mix(q.center, q.a, k),
      b: mix(q.center, q.b, k),
      width: q.width * k,
    };
  });
  const footprint = ringFootprint(sections, layout.closed);
  // Validate deliberate correspondence before smoothing/quantization. Never sew
  // across a counter simply because the two points have similar arc fractions.
  for (const q of sections)
    if (
      !safeConnector(
        mix(q.a, q.b, 0.002 / q.width),
        mix(q.b, q.a, 0.002 / q.width),
        footprint.rings,
        0.002,
        footprint.rings.slice(1),
        "evenodd",
      )
    )
      throw Error(
        "A rail span leaves the band or crosses its opening. Add direction guides, adjust seams, or split this turn into separate columns.",
      );
  sections = paceRails(sections, o.spacing || 0.42, layout.closed);
  if (!sections)
    throw Error(
      "This column needs too many stitches. Increase spacing or split it.",
    );
  if (o.reverse) sections.reverse();
  const original = sections;
  if (o.cornerControl)
    sections = shortInnerTurns(
      sections,
      o.minCornerStitch || 0.3,
      layout.closed,
      o.spacing || 0.42,
    );
  const paths = [],
    safe = (a, b) =>
      safeConnector(
        a,
        b,
        footprint.rings,
        0.01,
        footprint.rings.slice(1),
        "evenodd",
      );
  const append = (p, phase) => {
    if (p.length < 2) return;
    const last = paths.at(-1)?.p.at(-1);
    paths.push({ p, phase, continuous: !!last && safe(last, p[0]) });
  };
  const walk = (ps) => {
    const c = measure({ nodes: ps, closed: layout.closed, frame: identity() }),
      n = Math.max(1, Math.ceil(c.length / 2.5));
    return Array.from({ length: n + 1 }, (_, i) => c.at(i / n).p);
  };
  if (o.underlay) {
    const kind = o.railUnderlay || "center";
    if (kind === "center" || kind === "both")
      append(walk(original.map((q) => q.center)), "underlay");
    if (kind === "edge" || kind === "both")
      for (const side of ["a", "b"])
        append(
          walk(original.map((q) => mix(q[side], q.center, 0.2))),
          "underlay",
        );
  }
  let wide = 0;
  const needle = [];
  const targets = sections.map((q, i) => (i % 2 ? q.b : q.a));
  if (layout.closed && targets.length) targets.push(targets[0]);
  for (const [i, target] of targets.entries()) {
    if (needle.length) {
      const a = needle.at(-1),
        span = distance(a, target),
        max = o.maxSatin || 6;
      if (span > max) {
        wide++;
        const limit = Math.min(max, o.length || 2.8),
          first = Math.max(
            0.3,
            ((limit / 2 + ((i % 4) * limit) / 4 - 1e-9) % limit) + 1e-9,
          );
        for (let s = first; s < span - 0.08; s += limit)
          needle.push(mix(a, target, s / span));
      }
    }
    needle.push(target);
  }
  append(needle, "satin-rails");
  const grid = { ...o, ...footprint, compensation: 0 },
    quantized = quantizeColumnPaths(paths, grid);
  o.columnGridWarnings = grid.columnGridWarnings;
  return {
    paths: quantized,
    sections: original,
    closed: layout.closed,
    wide,
    anchors: layout.anchors,
    minWidth: Math.min(...original.map((q) => q.width)),
    maxWidth: Math.max(...original.map((q) => q.width)),
  };
}

// Split both rails at the same correspondence, preserving exact cubic subcurves.
// Arc-to-parameter lookup has the same .005 mm subdivision tolerance as generation.
export function splitRailSource(source, guides, fraction) {
  if (!Number.isFinite(fraction) || fraction <= 0.01 || fraction >= 0.99)
    throw Error("Choose a split between 1% and 99% of rail A.");
  const layout = railLayout(source, guides),
    anchor = layout.anchors.findIndex((q) => q.a >= fraction),
    p = layout.anchors[anchor - 1],
    q = layout.anchors[anchor],
    v = p.b + ((q.b - p.b) * (fraction - p.a)) / (q.a - p.a);
  const stopA = layout.a.at(fraction).param,
    stopB = layout.b.at(v).param;
  return [
    [0, stopA, 0, stopB],
    [stopA, layout.a.c.nodes.length - 1, stopB, layout.b.c.nodes.length - 1],
  ].map(([a0, a1, b0, b1]) => {
    const next = {
      a: curveInterval(layout.a.c, a0, a1),
      b: curveInterval(layout.b.c, b0, b1),
      seamA: 0,
      seamB: 0,
      reverseB: false,
    };
    validateBand(next);
    return next;
  });
}
