import { object, bounds, translate } from "./model.js";
export function simplify(points, tolerance = 0.12) {
  if (points.length < 4) return points;
  const sq = tolerance * tolerance;
  function step(start, end, out) {
    const a = points[start],
      b = points[end],
      dx = b.x - a.x,
      dy = b.y - a.y,
      l = dx * dx + dy * dy;
    let max = sq,
      index;
    for (let i = start + 1; i < end; i++) {
      const p = points[i],
        t = l
          ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l))
          : 0,
        d = (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index !== undefined) {
      step(start, index, out);
      out.push(points[index]);
      step(index, end, out);
    }
  }
  const out = [points[0]];
  step(0, points.length - 1, out);
  out.push(points.at(-1));
  return out;
}
export function fitObjects(objects, width = 75, height = 75) {
  const b = bounds(objects.flatMap((o) => o.rings.flat())),
    s = Math.min(width / (b.width || 1), height / (b.height || 1));
  for (const o of objects)
    for (const p of o.rings.flat()) {
      p.x = (p.x - (b.minX + b.maxX) / 2) * s;
      p.y = (p.y - (b.minY + b.maxY) / 2) * s;
    }
  return objects;
}
const allowedTags = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "line",
]);
const allowedAttrs = new Set([
  "d",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "width",
  "height",
  "rx",
  "ry",
  "r",
  "cx",
  "cy",
  "points",
  "viewBox",
  "transform",
  "fill",
  "fill-rule",
  "stroke",
  "stroke-width",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "display",
]);
export function importSVG(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.localName !== "svg"
  )
    throw Error("This SVG could not be read.");
  let count = 0,
    unsupported = new Set();
  function clean(el) {
    if (!allowedTags.has(el.localName)) {
      if (!["title", "desc", "metadata"].includes(el.localName))
        unsupported.add(el.localName);
      return null;
    }
    if (
      el.hasAttribute("clip-path") ||
      el.hasAttribute("mask") ||
      el.hasAttribute("filter")
    )
      unsupported.add("clipping / effects");
    if (++count > 3000)
      throw Error("SVG contains too many shapes. Simplify it first.");
    const node = document.createElementNS(
      "http://www.w3.org/2000/svg",
      el.localName,
    );
    for (const a of el.attributes)
      if (allowedAttrs.has(a.name) && !a.value.includes("url("))
        node.setAttribute(a.name, a.value);
    // Only retain paint attributes from inline CSS. Never mount source markup or URLs.
    for (const key of [
      "fill",
      "stroke",
      "stroke-width",
      "fill-rule",
      "display",
      "opacity",
      "fill-opacity",
      "stroke-opacity",
    ]) {
      const v = el.style?.getPropertyValue(key);
      if (v && !v.includes("url(")) node.style.setProperty(key, v);
    }
    for (const child of el.children) {
      const n = clean(child);
      if (n) node.append(n);
    }
    return node;
  }
  const svg = clean(doc.documentElement);
  svg.style.cssText +=
    ";position:fixed;left:-10000px;top:0;width:500px;height:500px;visibility:hidden;";
  document.body.append(svg);
  const result = [];
  try {
    const rootInverse = svg.getCTM().inverse();
    for (const el of svg.querySelectorAll(
      "path,rect,circle,ellipse,polygon,polyline,line",
    )) {
      const style = getComputedStyle(el);
      if (style.display === "none" || Number(style.opacity) === 0) continue;
      const m = rootInverse.multiply(el.getCTM());
      const apply = (p) => ({
        x: m.a * p.x + m.c * p.y + m.e,
        y: m.b * p.x + m.d * p.y + m.f,
      });
      let paths = [];
      if (el.localName === "path") {
        // Each moveto creates a separate contour; relative movetos after the first need
        // their predecessor's endpoint to retain the original coordinate system.
        const d = el.getAttribute("d") || "",
          parts = d.match(/[Mm][^Mm]*/g) || [];
        let previous = { x: 0, y: 0 };
        for (let part of parts) {
          if (part[0] === "m") {
            const match = part.match(/^m\s*([-+\d.eE]+)[\s,]+([-+\d.eE]+)/);
            if (!match) throw Error("Unsupported SVG path syntax.");
            const x = previous.x + Number(match[1]),
              y = previous.y + Number(match[2]);
            part = `M${x},${y}` + part.slice(match[0].length);
          }
          const path = document.createElementNS(svg.namespaceURI, "path");
          path.setAttribute("d", part);
          const length = path.getTotalLength();
          if (length > 1e6) throw Error("SVG path is too complex.");
          const n = Math.max(2, Math.min(6000, Math.ceil(length / 0.4)));
          const pts = Array.from({ length: n + 1 }, (_, i) =>
            path.getPointAtLength((length * i) / n),
          );
          previous = pts.at(-1);
          paths.push(pts.map(apply));
        }
      } else {
        const length = el.getTotalLength(),
          n = Math.max(2, Math.min(6000, Math.ceil(length / 0.4)));
        paths = [
          Array.from({ length: n + 1 }, (_, i) =>
            apply(el.getPointAtLength((length * i) / n)),
          ),
        ];
      }
      const closed =
        !["line", "polyline"].includes(el.localName) &&
        (el.localName !== "path" || /[zZ]/.test(el.getAttribute("d")));
      const fill = style.fill,
        stroke = style.stroke;
      function hex(value) {
        const c = document.createElement("canvas").getContext("2d");
        c.fillStyle = value;
        return c.fillStyle.startsWith("#") ? c.fillStyle : "#303b53";
      }
      if (
        fill !== "none" &&
        Number(style.fillOpacity) > 0 &&
        !["line", "polyline"].includes(el.localName)
      )
        result.push(
          object(
            `SVG region ${result.length + 1}`,
            paths.map((r) => simplify(r, 0.08)),
            { color: hex(fill), fillRule: style.fillRule, closed: true },
          ),
        );
      if (stroke !== "none" && Number(style.strokeOpacity) > 0)
        result.push(
          object(
            `SVG outline ${result.length + 1}`,
            paths.map((r) => simplify(r, 0.08)),
            { type: "run", color: hex(stroke), closed, underlay: false },
          ),
        );
    }
  } finally {
    svg.remove();
  }
  if (!result.length)
    throw Error(
      "No supported vector paths found. Convert text and complex effects to paths before importing.",
    );
  const fitted = fitObjects(result);
  fitted.importWarnings = unsupported.size
    ? `SVG skipped unsupported content: ${[...unsupported].join(", ")}. Expand these in your vector editor first.`
    : null;
  return fitted;
}
// Boundary tracing of quantized pixels; oriented loops retain holes and disconnected islands.
export function traceLabels(labels, w, h, label, scale = 1) {
  const edges = new Map();
  const key = (x, y) => y * (w + 1) + x;
  function edge(x, y, x2, y2, dir) {
    const k = key(x, y);
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push({ x: x2, y: y2, dir });
  }
  const is = (x, y) =>
    x >= 0 && x < w && y >= 0 && y < h && labels[y * w + x] === label;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (is(x, y)) {
        if (!is(x, y - 1)) edge(x, y, x + 1, y, 0);
        if (!is(x + 1, y)) edge(x + 1, y, x + 1, y + 1, 1);
        if (!is(x, y + 1)) edge(x + 1, y + 1, x, y + 1, 2);
        if (!is(x - 1, y)) edge(x, y + 1, x, y, 3);
      }
  const loops = [];
  while (edges.size) {
    const first = edges.keys().next().value,
      start = { x: first % (w + 1), y: Math.floor(first / (w + 1)) },
      loop = [start];
    let at = start,
      dir = 0,
      guard = 0;
    do {
      const k = key(at.x, at.y),
        candidates = edges.get(k);
      if (!candidates?.length) break;
      const rank = (d) => ({ 1: 0, 0: 1, 3: 2, 2: 3 })[(d - dir + 4) % 4];
      candidates.sort((a, b) => rank(a.dir) - rank(b.dir));
      const next = candidates.shift();
      if (!candidates.length) edges.delete(k);
      dir = next.dir;
      at = { x: next.x, y: next.y };
      loop.push(at);
      if (++guard > 200000) throw Error("Image contours are too complex.");
    } while (at.x !== start.x || at.y !== start.y);
    let area = 0;
    for (let i = 1; i < loop.length; i++)
      area += loop[i - 1].x * loop[i].y - loop[i].x * loop[i - 1].y;
    if (Math.abs(area) >= 4) {
      const points = loop
        .filter(
          (p, i) =>
            i === 0 ||
            i === loop.length - 1 ||
            (p.x - loop[i - 1].x) * (loop[i + 1].y - p.y) !==
              (p.y - loop[i - 1].y) * (loop[i + 1].x - p.x),
        )
        .map((p) => ({ x: p.x * scale, y: p.y * scale }));
      if (points.length >= 4) loops.push(simplify(points, scale * 0.35));
    }
  }
  return loops;
}
export function vectorizePixels(
  image,
  colors = 5,
  removeBackground = true,
  widthMM = 70,
) {
  const { data, width: w, height: h } = image,
    pixels = [];
  for (let i = 0; i < w * h; i++)
    if (data[i * 4 + 3] > 100)
      pixels.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  if (!pixels.length) throw Error("Image is empty.");
  // Deterministic farthest-point initialization avoids collapsing flat-color artwork.
  const palette = [pixels[Math.floor(pixels.length / 2)]];
  const dist = (p, q) =>
    (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  while (palette.length < colors) {
    let far = pixels[0],
      max = 0;
    for (let i = 0; i < pixels.length; i += 2) {
      const p = pixels[i],
        d = Math.min(...palette.map((q) => dist(p, q)));
      if (d > max) {
        max = d;
        far = p;
      }
    }
    if (max < 100) break;
    palette.push(far);
  }
  for (let iter = 0; iter < 7; iter++) {
    const sum = palette.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let j = 0;
      for (let k = 1; k < palette.length; k++)
        if (dist(p, palette[k]) < dist(p, palette[j])) j = k;
      for (let c = 0; c < 3; c++) sum[j][c] += p[c];
      sum[j][3]++;
    }
    for (let k = 0; k < palette.length; k++)
      if (sum[k][3]) palette[k] = sum[k].slice(0, 3).map((v) => v / sum[k][3]);
  }
  const labels = new Int16Array(w * h).fill(-1);
  for (let i = 0; i < labels.length; i++)
    if (data[i * 4 + 3] > 100) {
      const p = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
      let j = 0;
      for (let k = 1; k < palette.length; k++)
        if (dist(p, palette[k]) < dist(p, palette[j])) j = k;
      labels[i] = j;
    }
  const border = palette.map(() => 0);
  for (let x = 0; x < w; x++) {
    if (labels[x] >= 0) border[labels[x]]++;
    if (labels[(h - 1) * w + x] >= 0) border[labels[(h - 1) * w + x]]++;
  }
  for (let y = 0; y < h; y++) {
    if (labels[y * w] >= 0) border[labels[y * w]]++;
    if (labels[y * w + w - 1] >= 0) border[labels[y * w + w - 1]]++;
  }
  const background = removeBackground
      ? border.indexOf(Math.max(...border))
      : -2,
    result = [];
  palette.forEach((p, i) => {
    if (i === background) return;
    const rings = traceLabels(labels, w, h, i, widthMM / w);
    if (rings.length)
      result.push(
        object(`Image color ${i + 1}`, rings, {
          color:
            "#" +
            p.map((c) => Math.round(c).toString(16).padStart(2, "0")).join(""),
          fillRule: "nonzero",
        }),
      );
  });
  if (!result.length)
    throw Error(
      "No regions remain. Try keeping the background or using more colors.",
    );
  const b = bounds(result.flatMap((o) => o.rings.flat()));
  result.forEach((o) =>
    translate(o, -(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2),
  );
  return result;
}
export async function rasterObjects(file, colors, removeBackground, widthMM) {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 50000000) {
    bitmap.close();
    throw Error("Image exceeds 50 megapixels. Resize it before importing.");
  }
  const scale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height)),
    c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bitmap.width * scale));
  c.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return vectorizePixels(
    ctx.getImageData(0, 0, c.width, c.height),
    colors,
    removeBackground,
    widthMM,
  );
}
export function lettering(text, height, color, font = "serif") {
  if (!text.trim()) throw Error("Enter some lettering.");
  const c = document.createElement("canvas"),
    ctx = c.getContext("2d");
  ctx.font = `bold 110px ${font}`;
  c.width = Math.ceil(ctx.measureText(text).width + 24);
  c.height = 150;
  if (c.width > 2400) throw Error("Use a shorter phrase.");
  ctx.font = `bold 110px ${font}`;
  ctx.fillText(text, 12, 115);
  const d = ctx.getImageData(0, 0, c.width, c.height),
    labels = new Int16Array(c.width * c.height).fill(-1);
  for (let i = 0; i < labels.length; i++)
    if (d.data[i * 4 + 3] > 128) labels[i] = 0;
  const rings = traceLabels(labels, c.width, c.height, 0, 1);
  if (!rings.length) throw Error("No glyph outlines available.");
  const o = object(text, rings, { color, angle: 0, fillRule: "nonzero" });
  const b = bounds(rings.flat()),
    s = height / (b.height || 1);
  for (const p of rings.flat()) {
    p.x = (p.x - (b.minX + b.maxX) / 2) * s;
    p.y = (p.y - (b.minY + b.maxY) / 2) * s;
  }
  return o;
}
