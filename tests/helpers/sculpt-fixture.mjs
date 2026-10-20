import { object } from "../../src/model.js";
import { traceLabels } from "../../src/importers.js";
export const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
export const arc = (n) => [
  ...Array.from({ length: n }, (_, i) => ({
    x: -30 + (60 * i) / (n - 1),
    y: -12 - 3 * Math.cos(Math.PI * (-1 + (2 * i) / (n - 1))),
  })),
  { x: 30, y: 15 },
  { x: -30, y: 15 },
];
export function traceFixture() {
  const w = 360,
    h = 210,
    labels = new Int16Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const xx = x / 5 - 36,
        yy = y / 5 - 21;
      labels[y * w + x] =
        yy > -11 - 3 * Math.cos(xx / 25) &&
        yy < 13 &&
        Math.abs(xx) < 31 &&
        !((xx * xx) / 16 + (yy * yy) / 9 < 1)
          ? 1
          : 0;
    }
  return traceLabels(labels, w, h, 1, 0.2, { simplify: 0.08 }).map((r) =>
    r.map(({ x, y }) => ({ x: x - 36, y: y - 21 })),
  );
}
export function sculptFixtures() {
  return [
    ["long smooth", [arc(13)]],
    ["dense imported", [arc(401)]],
    ["fill with hole", [arc(31), rect(-3, -2, 6, 4).reverse()]],
    [
      "sharp narrow details",
      [
        [
          ...arc(25).slice(0, 25),
          { x: 30, y: 15 },
          { x: 7, y: 15 },
          { x: 7, y: 6 },
          { x: 6.8, y: 6 },
          { x: 6.8, y: 15 },
          { x: -30, y: 15 },
        ],
      ],
    ],
    ["pixel trace", traceFixture()],
  ].map(([name, rings]) =>
    object(name, rings, {
      type: "fill",
      closed: true,
      fillRule: "evenodd",
      color: "#e8a929",
      spacing: 0.42,
      angle: 45,
      underlay: false,
    }),
  );
}
export const project = (objects) => ({
  version: 1,
  name: "Sculpt regression",
  machine: "se700",
  objects,
  groups: [],
  planning: { smallDetail: 0, optimizeColors: true },
});
export function lineHit(ring, p, closed = true) {
  let best;
  for (let i = 0; i < ring.length - (closed ? 0 : 1); i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      x = b.x - a.x,
      y = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / (x * x + y * y || 1)),
    );
    const point = { x: a.x + t * x, y: a.y + t * y },
      distance = Math.hypot(point.x - p.x, point.y - p.y);
    if (!best || distance < best.distance)
      best = { ring: 0, index: i, t, point, distance };
  }
  return best;
}
export const pointDistance = (p, ring) => lineHit(ring, p).distance;
// Independent dense reference: evaluate the specified cosine displacement at
// <=.008 mm intervals only within reach, keeping all original corners.
export function intendedContour(ring, hit, delta, reach) {
  const lengths = ring.map((a, i) =>
    Math.hypot(
      a.x - ring[(i + 1) % ring.length].x,
      a.y - ring[(i + 1) % ring.length].y,
    ),
  );
  const total = lengths.reduce((a, b) => a + b, 0);
  const at =
    lengths.slice(0, hit.index).reduce((a, b) => a + b, 0) +
    Math.hypot(
      hit.point.x - ring[hit.index].x,
      hit.point.y - ring[hit.index].y,
    );
  const result = [];
  let offset = 0;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length],
      n = Math.max(1, Math.ceil(lengths[i] / 0.008));
    for (let j = 0; j < n; j++) {
      const s = offset + (lengths[i] * j) / n,
        raw = Math.abs(s - at),
        d = Math.min(raw, total - raw);
      if (j && d > reach + 0.02) continue;
      const weight = d < reach ? (1 + Math.cos((Math.PI * d) / reach)) / 2 : 0;
      result.push({
        x: a.x + ((b.x - a.x) * j) / n + delta.x * weight,
        y: a.y + ((b.y - a.y) * j) / n + delta.y * weight,
      });
    }
    offset += lengths[i];
  });
  return result;
}
export function deviation(a, b) {
  return Math.max(
    ...a.map((p) => pointDistance(p, b)),
    ...b.map((p) => pointDistance(p, a)),
  );
}
