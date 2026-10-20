import { sculptContour } from "./sculpt-contour.js";
import {
  distance,
  simplifyPath,
  fillPolygons,
  clipping,
  inside,
} from "./geometry.js";
import {
  identity,
  mapPoint,
  curveRings,
  detachSource,
} from "./smart-geometry.js";
import { uid, bounds } from "./model.js";
import { operationsOf, requiresClosed } from "./operations.js";
import Clipper from "../vendor/clipper.js";
const mix = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const dot = (a, b) => a.x * b.x + a.y * b.y;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a, b) => a.x * b.y - a.y * b.x;
export const cubic = (ps, t) => {
  const [a, p, q, b] = ps,
    k = 1 - t;
  return {
    x: k ** 3 * a.x + 3 * k * k * t * p.x + 3 * k * t * t * q.x + t ** 3 * b.x,
    y: k ** 3 * a.y + 3 * k * k * t * p.y + 3 * k * t * t * q.y + t ** 3 * b.y,
  };
};
const controls = (c, i) => {
  const a = c.nodes[i],
    b = c.nodes[(i + 1) % c.nodes.length];
  return [a, a.out || a, b.in || b, b];
};
function divide(ps, t) {
  const [a, p, q, b] = ps,
    ap = mix(a, p, t),
    pq = mix(p, q, t),
    qb = mix(q, b, t),
    l = mix(ap, pq, t),
    r = mix(pq, qb, t),
    m = mix(l, r, t);
  return [
    [a, ap, l, m],
    [m, r, qb, b],
  ];
}
const segmentDistance = (p, a, b) => {
  const v = sub(b, a),
    t = Math.max(0, Math.min(1, dot(sub(p, a), v) / (dot(v, v) || 1)));
  return distance(p, mix(a, b, t));
};
export function worldCurve(o, ring = 0) {
  if (o.curve) {
    const c = structuredClone(o.curve),
      m = c.frame || identity();
    c.nodes = c.nodes.map((n) => ({
      ...mapPoint(n, m),
      ...(n.in ? { in: mapPoint(n.in, m) } : {}),
      ...(n.out ? { out: mapPoint(n.out, m) } : {}),
      ...(n.mode ? { mode: n.mode } : {}),
    }));
    c.frame = identity();
    return c;
  }
  return {
    nodes: o.rings[ring].map((p) => ({ ...p })),
    closed: o.closed === true || o.type === "fill",
    frame: identity(),
  };
}
export function nearestSegment(o, p) {
  let best = null;
  for (let ring = 0; ring < (o.curve ? 1 : o.rings.length); ring++) {
    const c = worldCurve(o, ring);
    for (let i = 0; i < c.nodes.length - (c.closed ? 0 : 1); i++) {
      const ps = controls(c, i);
      let sample = 0,
        d = Infinity;
      for (let k = 0; k <= 24; k++) {
        const v = distance(p, cubic(ps, k / 24));
        if (v < d) {
          d = v;
          sample = k / 24;
        }
      }
      let lo = Math.max(0, sample - 1 / 24),
        hi = Math.min(1, sample + 1 / 24);
      for (let k = 0; k < 20; k++) {
        const a = lo + (hi - lo) / 3,
          b = hi - (hi - lo) / 3;
        if (distance(p, cubic(ps, a)) < distance(p, cubic(ps, b))) hi = b;
        else lo = a;
      }
      const t = (lo + hi) / 2,
        q = cubic(ps, t);
      d = distance(p, q);
      if (!best || d < best.distance)
        best = { ring, index: i, t, point: q, distance: d };
    }
  }
  return best;
}
export function setNodeMode(c, i, mode) {
  const n = c.nodes[i];
  n.mode = mode;
  if (mode === "corner") {
    delete n.in;
    delete n.out;
    return;
  }
  const a =
      c.nodes[
        c.closed
          ? (i + c.nodes.length - 1) % c.nodes.length
          : Math.max(0, i - 1)
      ],
    b =
      c.nodes[
        c.closed
          ? (i + 1) % c.nodes.length
          : Math.min(c.nodes.length - 1, i + 1)
      ],
    v =
      n.out && distance(n, n.out) > 1e-8
        ? sub(n.out, n)
        : n.in && distance(n, n.in) > 1e-8
          ? sub(n, n.in)
          : sub(b, a),
    d = Math.hypot(v.x, v.y) || 1;
  const out =
      n.out && distance(n, n.out) > 1e-8
        ? distance(n, n.out)
        : distance(n, b) > 1e-8
          ? distance(n, b) / 3
          : n.in
            ? distance(n, n.in)
            : distance(a, n) / 3,
    inn =
      mode === "symmetric"
        ? out
        : n.in
          ? distance(n, n.in)
          : distance(a, n) / 3;
  n.out = { x: n.x + (v.x / d) * out, y: n.y + (v.y / d) * out };
  n.in = { x: n.x - (v.x / d) * inn, y: n.y - (v.y / d) * inn };
}
export function alignHandle(n, key) {
  if (!["smooth", "symmetric"].includes(n.mode)) return;
  const other = key === "out" ? "in" : "out",
    v = sub(n[key], n),
    d = Math.hypot(v.x, v.y);
  if (!d) return;
  const length =
    n.mode === "symmetric" ? d : n[other] ? distance(n, n[other]) : d;
  n[other] = { x: n.x - (v.x / d) * length, y: n.y - (v.y / d) * length };
}
export function sculptCurve(c, index, t, delta) {
  const a = c.nodes[index],
    b = c.nodes[(index + 1) % c.nodes.length],
    u = 3 * (1 - t) ** 2 * t,
    v = 3 * (1 - t) * t * t,
    den = u * u + v * v;
  if (den < 1e-8)
    throw Error("Drag the middle of a segment, or move its anchor with Node.");
  a.out = {
    x: (a.out || a).x + (delta.x * u) / den,
    y: (a.out || a).y + (delta.y * u) / den,
  };
  b.in = {
    x: (b.in || b).x + (delta.x * v) / den,
    y: (b.in || b).y + (delta.y * v) / den,
  };
  alignHandle(a, "out");
  alignHandle(b, "in");
}
export function sculptArtwork(o, hit, delta, radius = 2) {
  if (o.curve) {
    sculptCurve(o.curve, hit.index, hit.t, delta);
    o.rings = curveRings(o.curve);
    return;
  }
  const result = sculptContour(
    o.rings[hit.ring],
    hit,
    delta,
    radius,
    o.closed === true || o.type === "fill",
    o.rings.filter((_, i) => i !== hit.ring),
  );
  if (result === o.rings[hit.ring]) return;
  detachSource(o);
  o.rings[hit.ring] = result;
}
export function pencilCurve(points, tolerance = 0.15, closed = false) {
  if (!Number.isFinite(tolerance) || tolerance < 0.02 || tolerance > 1)
    throw Error("Choose smoothing between 0.02 and 1 mm.");
  let clean = points.filter((p, i) => !i || distance(p, points[i - 1]) > 0.005);
  if (clean.length < 2) throw Error("Draw a longer pencil stroke.");
  if (closed) {
    if (clean.length < 3)
      throw Error("A closed stroke needs at least three points.");
    if (distance(clean[0], clean.at(-1)) > 0.005) clean.push(clean[0]);
  }
  const fitted = simplifyPath(clean, tolerance / 2);
  if (closed && distance(fitted[0], fitted.at(-1)) < 0.005) fitted.pop();
  if (fitted.length > 1800)
    throw Error(
      "This stroke needs too many nodes. Increase smoothing or divide it into shorter paths.",
    );
  if (closed && fitted.length < 3)
    throw Error("This stroke is too small to form a closed area.");
  const nodes = fitted.map((p, i) => {
    const a =
        fitted[
          closed ? (i + fitted.length - 1) % fitted.length : Math.max(0, i - 1)
        ],
      b =
        fitted[
          closed ? (i + 1) % fitted.length : Math.min(fitted.length - 1, i + 1)
        ],
      v = sub(b, a),
      d = Math.hypot(v.x, v.y) || 1;
    return {
      ...p,
      mode: "smooth",
      in: {
        x: p.x - ((v.x / d) * distance(a, p)) / 3,
        y: p.y - ((v.y / d) * distance(a, p)) / 3,
      },
      out: {
        x: p.x + ((v.x / d) * distance(p, b)) / 3,
        y: p.y + ((v.y / d) * distance(p, b)) / 3,
      },
    };
  });
  const c = { nodes, closed, frame: identity() };
  // Bound handle overshoot against the captured trace, not just the simplified anchors.
  for (let i = 0; i < nodes.length - (closed ? 0 : 1); i++) {
    const a = nodes[i],
      b = nodes[(i + 1) % nodes.length],
      trace = clean.slice(
        clean.indexOf(fitted[i]),
        closed && i === nodes.length - 1
          ? clean.length
          : clean.indexOf(fitted[i + 1]) + 1,
      );
    for (let attempt = 0; attempt < 8; attempt++) {
      const ps = controls(c, i),
        bad = Array.from({ length: 15 }, (_, j) =>
          cubic(ps, (j + 1) / 16),
        ).some(
          (q) =>
            !trace
              .slice(1)
              .some((v, k) => segmentDistance(q, trace[k], v) <= tolerance),
        );
      if (!bad) break;
      a.out = mix(a, a.out, 0.5);
      b.in = mix(b, b.in, 0.5);
      a.mode = b.mode = "corner";
    }
  }
  return c;
}
function editable(o) {
  if (o.linkedGeometry)
    throw Error(
      "Edit the linked original, or unlink this copy before editing its geometry.",
    );
  if (o.effects)
    throw Error(
      "Remove effects to edit the original, or Bake to paths before cutting, joining or reshaping the result.",
    );
  if (o.satinRails)
    throw Error(
      "Edit the individual satin rails, or use Split into two columns in Artwork. Generic vector cutting would discard rail correspondence.",
    );
  if (o.locked) throw Error("Unlock this artwork before editing its geometry.");
  if (["reference", "manual"].includes(o.type))
    throw Error(
      "Select vector artwork; this tool does not erase references or needle commands.",
    );
  if (o.constructionArtworkIds?.length)
    throw Error(
      "A linked patch boundary has manufacturing dependencies. Duplicate it as ordinary artwork before dividing it.",
    );
}
function piece(o, rings, closed, curve, index, allowOpen) {
  const n = structuredClone(o);
  detachSource(n);
  n.id = index ? uid() : o.id;
  n.name = o.name.slice(0, 180) + (index ? ` · piece ${index + 1}` : "");
  n.rings = rings;
  n.closed = closed;
  n.fillRule = "evenodd";
  n.type = closed ? (o.type === "fill" ? "fill" : o.type) : "run";
  if (curve) n.curve = curve;
  const ops = operationsOf(o);
  if (!closed && ops.some((op) => requiresClosed(op.type)) && !allowOpen)
    throw Error(
      "An open result cannot use fill, border or fabric-boundary actions. Enable Convert open pieces to Running, or use Split area.",
    );
  if (o.operations || (!closed && ops.some((op) => requiresClosed(op.type))))
    n.operations = ops.map((op) => ({
      ...structuredClone(op),
      id: index || op.id === "base" ? uid() : op.id,
      ...(!closed && requiresClosed(op.type)
        ? {
            type: "run",
            name: "Running outline",
            offset: 0,
            closed: false,
            underlay: false,
          }
        : {}),
      ...(!closed ? { closed: false } : {}),
    }));
  return n;
}
export function replaceArtwork(p, o, pieces) {
  const at = p.objects.findIndex((v) => v.id === o.id);
  if (at < 0) throw Error("The source artwork is no longer in this project.");
  p.objects.splice(at, 1, ...pieces);
  if (p.sequencing?.mode === "manual")
    p.sequencing.order = p.sequencing.order.flatMap((id) =>
      id === o.id ? pieces.map((n) => n.id) : [id],
    );
  for (const boundary of p.objects)
    if (boundary.constructionArtworkIds?.includes(o.id))
      boundary.constructionArtworkIds = boundary.constructionArtworkIds.flatMap(
        (id) => (id === o.id ? pieces.map((n) => n.id) : [id]),
      );
  return pieces.map((n) => n.id);
}
const ringsOf = (poly) =>
  poly.map((r) => r.slice(0, -1).map(([x, y]) => ({ x, y })));
export function splitArea(o, a, b) {
  editable(o);
  if (!(o.closed || o.type === "fill"))
    throw Error(
      "Split area needs a closed region. Use path splitting for open lines.",
    );
  const polys = fillPolygons(o.rings, o.fillRule);
  if (!polys?.length)
    throw Error(
      "Repair overlapping or invalid contours before splitting this area.",
    );
  const v = sub(b, a),
    length = Math.hypot(v.x, v.y);
  if (length < 0.1)
    throw Error("Drag a cutting line completely across the region.");
  const u = { x: v.x / length, y: v.y / length },
    n = { x: -u.y, y: u.x };
  let minimum = Infinity,
    maximum = -Infinity;
  for (const ring of o.rings)
    for (const p of ring) {
      const projection = dot(sub(p, a), u);
      minimum = Math.min(minimum, projection);
      maximum = Math.max(maximum, projection);
    }
  if (minimum < -0.05 || maximum > length + 0.05)
    throw Error(
      "Extend the knife line beyond both sides of the artwork; partial cuts do not divide an area.",
    );
  const size =
    Math.max(
      bounds(o.rings.flat()).width,
      bounds(o.rings.flat()).height,
      length,
    ) *
      4 +
    10;
  const half = (sign) => [
    [
      [a.x - u.x * size, a.y - u.y * size],
      [a.x + u.x * size, a.y + u.y * size],
      [
        a.x + u.x * size + n.x * size * sign,
        a.y + u.y * size + n.y * size * sign,
      ],
      [
        a.x - u.x * size + n.x * size * sign,
        a.y - u.y * size + n.y * size * sign,
      ],
      [a.x - u.x * size, a.y - u.y * size],
    ],
  ];
  const left = clipping.intersection(polys, half(1)),
    right = clipping.intersection(polys, half(-1));
  if (!left.length || !right.length)
    throw Error("The knife did not cross a stitchable area. Nothing changed.");
  return [...left, ...right].map((poly, i) =>
    piece(o, ringsOf(poly), true, null, i, false),
  );
}
function openCurve(o) {
  const c = worldCurve(o);
  if (c.closed) c.nodes.push(structuredClone(c.nodes[0]));
  c.closed = false;
  return c;
}
export function curveInterval(c, start, end) {
  const nodes = [];
  for (let i = Math.floor(start); i < Math.ceil(end); i++) {
    const lo = Math.max(0, start - i),
      hi = Math.min(1, end - i);
    if (hi - lo < 1e-7) continue;
    let ps = controls(c, i);
    if (hi < 1) ps = divide(ps, hi)[0];
    if (lo > 0) ps = divide(ps, lo / hi)[1];
    const [a, p, q, b] = ps;
    if (!nodes.length) nodes.push({ ...a });
    nodes.at(-1).out = { ...p };
    nodes.push({ ...b, in: { ...q } });
  }
  delete nodes[0].in;
  delete nodes.at(-1).out;
  return { nodes, closed: false, frame: identity() };
}
const between = curveInterval;
export function splitPath(o, hit, allowOpen = false) {
  editable(o);
  if (o.rings.length !== 1)
    throw Error(
      "Select a single contour for path splitting. Use Split area to divide filled artwork with holes.",
    );
  let c = worldCurve(o),
    at = hit.index + hit.t;
  if (c.closed) {
    if (hit.t < 1e-6 || hit.t > 1 - 1e-6) {
      const start = (hit.index + (hit.t > 0.5 ? 1 : 0)) % c.nodes.length;
      const nodes = [...c.nodes.slice(start), ...c.nodes.slice(0, start)].map(
        (n) => structuredClone(n),
      );
      nodes.push(structuredClone(nodes[0]));
      delete nodes[0].in;
      delete nodes.at(-1).out;
      c = { nodes, closed: false, frame: identity() };
      return [piece(o, curveRings(c), false, c, 0, allowOpen)];
    }
    const ps = controls(c, hit.index),
      [l, r] = divide(ps, hit.t),
      nodes = [];
    nodes.push({ ...r[0], out: r[1] });
    const b = c.nodes[(hit.index + 1) % c.nodes.length];
    nodes.push({ ...b, in: r[2] });
    for (let k = 2; k <= c.nodes.length; k++)
      nodes.push(structuredClone(c.nodes[(hit.index + k) % c.nodes.length]));
    nodes.at(-1).out = l[1];
    nodes.push({ ...l[3], in: l[2] });
    c = { nodes, closed: false, frame: identity() };
    return [piece(o, curveRings(c), false, c, 0, allowOpen)];
  }
  if (at < 1e-5 || at > c.nodes.length - 1 - 1e-5)
    throw Error(
      "This is already an endpoint. Choose an interior point to split.",
    );
  return [
    [0, at],
    [at, c.nodes.length - 1],
  ].map(([lo, hi], i) => {
    const curve = between(c, lo, hi);
    return piece(o, curveRings(curve), false, curve, i, allowOpen);
  });
}
export function cutPathByLine(o, a, b, allowOpen = false) {
  editable(o);
  if (o.rings.length !== 1)
    throw Error(
      "Cut one path contour at a time, or use Split regions for filled artwork.",
    );
  const c = openCurve(o),
    end = c.nodes.length - 1,
    cuts = [];
  for (let i = 0; i < end; i++) {
    const flat = flatten(controls(c, i));
    for (let j = 1; j < flat.length; j++) {
      const t = intersections(flat[j - 1].p, flat[j].p, a, b);
      if (t !== null)
        cuts.push(i + flat[j - 1].t + (flat[j].t - flat[j - 1].t) * t);
    }
  }
  cuts.sort((a, b) => a - b);
  const unique = cuts.filter(
    (t, i) => t > 1e-5 && t < end - 1e-5 && (!i || t - cuts[i - 1] > 1e-5),
  );
  if (!unique.length) throw Error("The knife did not cross this path.");
  if ((o.closed || o.type === "fill") && unique.length === 1)
    return splitPath(
      o,
      { index: Math.floor(unique[0]), t: unique[0] % 1 },
      allowOpen,
    );
  const curves = [];
  if (o.closed || o.type === "fill") {
    for (let i = 1; i < unique.length; i++)
      curves.push(between(c, unique[i - 1], unique[i]));
    const tail = between(c, unique.at(-1), end),
      head = between(c, 0, unique[0]);
    tail.nodes.at(-1).out = head.nodes[0].out;
    tail.nodes.push(...head.nodes.slice(1));
    curves.push(tail);
  } else {
    const stops = [0, ...unique, end];
    for (let i = 1; i < stops.length; i++)
      curves.push(between(c, stops[i - 1], stops[i]));
  }
  return curves.map((curve, i) =>
    piece(o, curveRings(curve), false, curve, i, allowOpen),
  );
}
export function brushRegion(points, width) {
  if (!points.length) return [];
  if (points.length === 1)
    return [
      [
        [
          ...Array.from({ length: 40 }, (_, i) => [
            points[0].x + (width / 2) * Math.cos((i * Math.PI) / 20),
            points[0].y + (width / 2) * Math.sin((i * Math.PI) / 20),
          ]),
          [points[0].x + width / 2, points[0].y],
        ],
      ],
    ];
  const offset = new Clipper.ClipperOffset(2, 10),
    result = [];
  offset.AddPath(
    points.map((p) => ({
      X: Math.round(p.x * 1000),
      Y: Math.round(p.y * 1000),
    })),
    Clipper.JoinType.jtRound,
    Clipper.EndType.etOpenRound,
  );
  offset.Execute(result, width * 500);
  const rings = result.map((r) =>
    r.map((p) => ({ x: p.X / 1000, y: p.Y / 1000 })),
  );
  return fillPolygons(rings, "evenodd") || [];
}
function flatten(ps, t0 = 0, t1 = 1, depth = 0) {
  // Bound parameter interpolation too: collinear cubic handles can still have
  // nonlinear speed, so chord flatness alone gives incorrect cut parameters.
  if (
    depth > 12 ||
    Math.max(
      distance(ps[1], mix(ps[0], ps[3], 1 / 3)),
      distance(ps[2], mix(ps[0], ps[3], 2 / 3)),
    ) < 0.005
  )
    return [
      { t: t0, p: ps[0] },
      { t: t1, p: ps[3] },
    ];
  const [a, b] = divide(ps, 0.5),
    mid = (t0 + t1) / 2;
  return [
    ...flatten(a, t0, mid, depth + 1).slice(0, -1),
    ...flatten(b, mid, t1, depth + 1),
  ];
}
function intersections(a, b, c, d) {
  const v = sub(b, a),
    w = sub(d, c),
    den = cross(v, w);
  if (Math.abs(den) < 1e-10) return null;
  const t = cross(sub(c, a), w) / den,
    u = cross(sub(c, a), v) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
export function eraseArtwork(o, points, width, area = true, allowOpen = false) {
  editable(o);
  const brush = brushRegion(points, width);
  if (!brush.length) throw Error("Draw a longer eraser stroke.");
  if (area) {
    if (!(o.closed || o.type === "fill"))
      throw Error(
        "Area erasing needs closed artwork. Choose Erase line segments for an open path.",
      );
    const poly = fillPolygons(o.rings, o.fillRule);
    if (!poly?.length)
      throw Error("Repair invalid contours before erasing an area.");
    if (!clipping.intersection(poly, brush).length) return null;
    return clipping
      .difference(poly, brush)
      .map((p, i) => piece(o, ringsOf(p), true, null, i, false));
  }
  if (o.rings.length !== 1)
    throw Error(
      "Erase one line contour at a time, or choose Erase area for a filled region with counters.",
    );
  const c = openCurve(o),
    end = c.nodes.length - 1,
    cuts = [0, end],
    brushRings = brush.flatMap((poly) =>
      poly.map((r) => r.map(([x, y]) => ({ x, y }))),
    );
  for (let i = 0; i < end; i++) {
    const ps = controls(c, i),
      flat = flatten(ps);
    for (let j = 1; j < flat.length; j++)
      for (const ring of brushRings)
        for (let k = 1; k < ring.length; k++) {
          const t = intersections(
            flat[j - 1].p,
            flat[j].p,
            ring[k - 1],
            ring[k],
          );
          if (t !== null)
            cuts.push(i + flat[j - 1].t + (flat[j].t - flat[j - 1].t) * t);
        }
  }
  cuts.sort((a, b) => a - b);
  const unique = cuts.filter((t, i) => !i || t - cuts[i - 1] > 1e-6),
    keep = [];
  let removed = false;
  for (let i = 1; i < unique.length; i++) {
    const a = unique[i - 1],
      b = unique[i],
      s = (a + b) / 2,
      p = cubic(
        controls(c, Math.min(end - 1, Math.floor(s))),
        s - Math.floor(s),
      );
    if (inside(p, brushRings, "evenodd")) {
      removed = true;
      continue;
    }
    if (keep.length && Math.abs(keep.at(-1)[1] - a) < 1e-6) keep.at(-1)[1] = b;
    else keep.push([a, b]);
  }
  if (!removed) return null;
  const intervals = keep.filter(([a, b]) => b - a > 1e-5),
    curves = intervals.map(([a, b]) => between(c, a, b));
  // The source seam is not a real break: retain one continuous surviving arc.
  if (
    (o.closed || o.type === "fill") &&
    curves.length > 1 &&
    intervals[0][0] < 1e-6 &&
    Math.abs(intervals.at(-1)[1] - end) < 1e-6
  ) {
    const tail = curves.pop(),
      head = curves.shift();
    tail.nodes.at(-1).out = head.nodes[0].out;
    tail.nodes.push(...head.nodes.slice(1));
    curves.unshift(tail);
  }
  return curves.map((curve, i) =>
    piece(o, curveRings(curve), false, curve, i, allowOpen),
  );
}
function reverseCurve(c) {
  c.nodes.reverse();
  for (const n of c.nodes) {
    const a = n.in,
      b = n.out;
    if (b) n.in = b;
    else delete n.in;
    if (a) n.out = a;
    else delete n.out;
  }
  return c;
}
export function reverseArtwork(o) {
  editable(o);
  if (o.curve) {
    reverseCurve(o.curve);
    o.rings = curveRings(o.curve);
  } else {
    detachSource(o);
    o.rings.forEach((r) => r.reverse());
  }
}
export function closeArtwork(o) {
  editable(o);
  if (o.curve) {
    o.curve.closed = true;
    o.rings = curveRings(o.curve);
  }
  o.closed = true;
  for (const op of o.operations || [])
    if (["run", "bean", "triple", "satin"].includes(op.type)) op.closed = true;
}
export function joinPaths(a, b, maxGap = 1, useFirst = false) {
  editable(a);
  editable(b);
  if (!Number.isFinite(maxGap) || maxGap < 0 || maxGap > 50)
    throw Error("Choose a join gap between 0 and 50 mm.");
  if (
    a.closed ||
    b.closed ||
    a.type === "fill" ||
    b.type === "fill" ||
    a.rings.length !== 1 ||
    b.rings.length !== 1
  )
    throw Error(
      "Join needs two open, single-contour paths. Filled regions can be combined with Union.",
    );
  const settings = (o) =>
    JSON.stringify(operationsOf(o).map(({ id, name, ...rest }) => rest));
  if (settings(a) !== settings(b) && !useFirst)
    throw Error(
      "These paths have different sewing actions. Enable Use first path's sewing actions to join deliberately.",
    );
  let ca = worldCurve(a),
    cb = worldCurve(b),
    choice = [];
  for (const ra of [false, true])
    for (const rb of [false, true])
      choice.push({
        ra,
        rb,
        d: distance(
          ca.nodes[ra ? 0 : ca.nodes.length - 1],
          cb.nodes[rb ? cb.nodes.length - 1 : 0],
        ),
      });
  choice.sort((a, b) => a.d - b.d);
  const q = choice[0];
  if (q.d > maxGap)
    throw Error(
      `The nearest endpoints are ${q.d.toFixed(2)} mm apart. Move them closer or increase Join gap deliberately.`,
    );
  if (q.ra) reverseCurve(ca);
  if (q.rb) reverseCurve(cb);
  if (q.d < 0.01) {
    const last = ca.nodes.at(-1),
      first = cb.nodes[0];
    last.out = first.out;
    cb.nodes.shift();
  } else {
    delete ca.nodes.at(-1).out;
    delete cb.nodes[0].in;
  }
  ca.nodes.push(...cb.nodes);
  return piece(a, curveRings(ca), false, ca, 0, true);
}
