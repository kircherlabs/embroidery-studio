// Deterministic CIELAB clustering and palette remapping, shared by worker/tests.
export const MAX_TRACE_COLORS = 128;
export const hex = (rgb) =>
  "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
export function lab(rgb) {
  const [r, g, b] = rgb.map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116),
    x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047),
    y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b),
    z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export const distance2 = (a, b) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const nearest = (p, colors) => {
  let at = 0,
    d = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const q = distance2(p, colors[i]);
    if (q < d) {
      at = i;
      d = q;
    }
  }
  return at;
};
const keyAt = (d, i) =>
  ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
export function detectColors(image, count = 8, alpha = 100) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_TRACE_COLORS)
    throw Error(`Choose 1–${MAX_TRACE_COLORS} detected colors.`);
  const { width, height, data } = image,
    hist = new Map();
  if (width * height > 1048576)
    throw Error(
      "Trace resolution exceeds one megapixel. Reduce processing resolution.",
    );
  for (let i = 0; i < data.length; i += 4)
    if (data[i + 3] > alpha) {
      const key = keyAt(data, i),
        h = hist.get(key) || { key, rgb: [0, 0, 0], n: 0 };
      for (let k = 0; k < 3; k++) h.rgb[k] += data[i + k];
      h.n++;
      hist.set(key, h);
    }
  if (!hist.size)
    throw Error("No opaque artwork remains at this opacity threshold.");
  const bins = [...hist.values()].sort((a, b) => b.n - a.n || a.key - b.key);
  for (const b of bins) {
    b.rgb = b.rgb.map((v) => v / b.n);
    b.lab = lab(b.rgb);
  }
  // Histogram bounds work without dropping rare occupied bins. Cache each bin's
  // nearest seed distance so farthest initialization is O(bins × colors).
  const training = bins,
    centers = [training[0].lab.slice()],
    nearestSeed = new Float64Array(training.length).fill(Infinity);
  while (centers.length < Math.min(count, training.length)) {
    let best = -1,
      score = 0;
    const newest = centers.at(-1);
    for (let i = 0; i < training.length; i++) {
      nearestSeed[i] = Math.min(
        nearestSeed[i],
        distance2(training[i].lab, newest),
      );
      if (nearestSeed[i] > score) {
        score = nearestSeed[i];
        best = i;
      }
    }
    if (score < 0.09) break;
    centers.push(training[best].lab.slice());
  }
  for (let iter = 0; iter < 7; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const b of training) {
      const a = sums[nearest(b.lab, centers)];
      for (let k = 0; k < 3; k++) a[k] += b.lab[k] * b.n;
      a[3] += b.n;
    }
    sums.forEach((a, i) => {
      if (a[3]) centers[i] = a.slice(0, 3).map((v) => v / a[3]);
    });
  }
  const groups = centers.map(() => ({ rgb: [0, 0, 0], n: 0 }));
  for (const b of bins) {
    b.cluster = nearest(b.lab, centers);
    const g = groups[b.cluster];
    for (let k = 0; k < 3; k++) g.rgb[k] += b.rgb[k] * b.n;
    g.n += b.n;
  }
  const palette = groups
      .map((g, index) => ({ ...g, index }))
      .filter((g) => g.n)
      .map((g) => ({ ...g, rgb: g.rgb.map((v) => Math.round(v / g.n)) }))
      .sort((a, b) => b.n - a.n || hex(a.rgb).localeCompare(hex(b.rgb))),
    remap = new Map(palette.map((g, i) => [g.index, i])),
    lookup = new Map(bins.map((b) => [b.key, remap.get(b.cluster)])),
    labels = new Int16Array(width * height).fill(-1);
  for (let i = 0; i < labels.length; i++)
    if (data[i * 4 + 3] > alpha) labels[i] = lookup.get(keyAt(data, i * 4));
  const colors = palette.map((p) => ({
    rgb: p.rgb,
    hex: hex(p.rgb),
    lab: lab(p.rgb),
    count: p.n,
  }));
  const model = {
    width,
    height,
    labels,
    palette: colors,
    opaque: colors.reduce((n, c) => n + c.count, 0),
    histogramBins: bins.length,
  };
  model.background = backgroundCandidate(model);
  return model;
}
export function borderMask(model, color) {
  const { width: w, height: h, labels } = model,
    mask = new Uint8Array(labels.length),
    queue = new Int32Array(labels.length);
  let tail = 0;
  const add = (i) => {
    if (i >= 0 && !mask[i] && labels[i] === color) {
      mask[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    add(y * w);
    add(y * w + w - 1);
  }
  for (let at = 0; at < tail; at++) {
    const i = queue[at],
      x = i % w;
    if (x) add(i - 1);
    if (x < w - 1) add(i + 1);
    if (i >= w) add(i - w);
    if (i < w * (h - 1)) add(i + w);
  }
  return { mask, count: tail };
}
export function backgroundCandidate(model) {
  const { width: w, height: h, labels, palette } = model,
    border = new Uint32Array(palette.length);
  let opaque = 0;
  const edge = (i) => {
    if (labels[i] >= 0) {
      border[labels[i]]++;
      opaque++;
    }
  };
  for (let x = 0; x < w; x++) {
    edge(x);
    if (h > 1) edge((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    edge(y * w);
    if (w > 1) edge(y * w + w - 1);
  }
  if (!opaque)
    return {
      color: -1,
      confidence: "none",
      count: 0,
      reason:
        "Image borders are already transparent. No background removal is proposed.",
    };
  const color = border.indexOf(Math.max(...border)),
    fraction = border[color] / opaque,
    corners = [0, w - 1, (h - 1) * w, w * h - 1].filter(
      (i) => labels[i] === color,
    ).length,
    { count } = borderMask(model, color),
    confidence =
      fraction >= 0.75 && corners >= 3 && count / model.opaque > 0.15
        ? "high"
        : fraction >= 0.45 && corners >= 2
          ? "medium"
          : "low";
  return {
    color,
    count,
    confidence,
    fraction,
    reason: `${Math.round(fraction * 100)}% of opaque border samples; ${corners}/4 corners; ${Math.round((count / model.opaque) * 100)}% connected area. This may be intentional artwork—review before removing.`,
  };
}
export function paletteMapping(palette, choices = {}) {
  const enabled = palette
    .map((p, i) => ({ p, i }))
    .filter(
      ({ p }) => choices[p.hex]?.keep !== false && !choices[p.hex]?.transparent,
    );
  if (!enabled.length)
    throw Error(
      "Keep at least one color. Unchecking merges; Make transparent removes artwork.",
    );
  const map = palette.map((p, i) => {
    const choice = choices[p.hex] || {};
    if (choice.transparent) return -1;
    if (choice.keep !== false) return i;
    const target = enabled.find((e) => e.p.hex === choice.target);
    return target
      ? target.i
      : enabled[
          nearest(
            p.lab,
            enabled.map((e) => e.p.lab),
          )
        ].i;
  });
  return map;
}
export function remapLabels(model, choices = {}, background = -1) {
  const mapping = paletteMapping(model.palette, choices),
    removed = background >= 0 ? borderMask(model, background).mask : null,
    labels = Int16Array.from(model.labels, (c, i) =>
      c < 0 || removed?.[i] ? -1 : mapping[c],
    );
  return { labels, mapping };
}
