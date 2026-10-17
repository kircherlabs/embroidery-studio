import { object, bounds, translate } from "./model.js";
import { parseSVGPath, segmentPath, SVGPathError } from "./svg-path.js";
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
  "visibility",
  "preserveAspectRatio",
  "color",
]);
export function importSVG(text) {
  const ns = "http://www.w3.org/2000/svg";
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.localName !== "svg" ||
    (doc.documentElement.namespaceURI &&
      doc.documentElement.namespaceURI !== ns)
  )
    throw Error("This SVG could not be read.");
  let count = 0;
  const unsupported = new Set(),
    skipped = [];
  function clean(el) {
    if (
      (el.namespaceURI && el.namespaceURI !== ns) ||
      !allowedTags.has(el.localName)
    ) {
      if (!["title", "desc", "metadata"].includes(el.localName))
        unsupported.add(el.localName);
      return null;
    }
    if (["clip-path", "mask", "filter"].some((a) => el.hasAttribute(a)))
      unsupported.add("clipping / effects");
    if (++count > 3000)
      throw Error("SVG contains too many shapes. Simplify it first.");
    const node = document.createElementNS(ns, el.localName);
    for (const a of el.attributes)
      if (allowedAttrs.has(a.name) && !/url\s*\(/i.test(a.value))
        node.setAttribute(a.name, a.value);
    for (const key of [
      "fill",
      "stroke",
      "stroke-width",
      "fill-rule",
      "display",
      "visibility",
      "opacity",
      "fill-opacity",
      "stroke-opacity",
      "color",
    ]) {
      const v = el.style?.getPropertyValue(key);
      if (v && !/url\s*\(/i.test(v)) node.style.setProperty(key, v);
    }
    for (const child of el.children) {
      const n = clean(child);
      if (n) node.append(n);
    }
    return node;
  }
  // Geometry APIs are invoked on connected elements in a renderable SVG viewport.
  // Hide the outer host with opacity so source visibility/opacity remain inspectable.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:500px;height:500px;opacity:0;pointer-events:none;";
  const svg = clean(doc.documentElement),
    scratch = document.createElementNS(ns, "svg"),
    sampler = document.createElementNS(ns, "path");
  scratch.setAttribute("width", "1");
  scratch.setAttribute("height", "1");
  scratch.append(sampler);
  host.append(svg, scratch);
  document.body.append(host);
  const result = [],
    records = [],
    paint = document.createElement("canvas").getContext("2d");
  const finite = (p) => Number.isFinite(p.x) && Number.isFinite(p.y);
  const apply = (m, p) => ({
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  });
  const recoverable = (e) =>
    e instanceof SVGPathError ||
    (e instanceof DOMException &&
      ["InvalidStateError", "NotSupportedError", "InvalidAccessError"].includes(
        e.name,
      ));
  function warn(index, message) {
    skipped.push(`${index + 1}: ${message}`);
  }
  function rendered(el) {
    if (["hidden", "collapse"].includes(getComputedStyle(el).visibility))
      return false;
    for (let node = el; node !== host; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.display === "none" || Number(s.opacity) === 0) return false;
    }
    return true;
  }
  function color(value) {
    if (value === "none") return null;
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = value;
    paint.fillRect(0, 0, 1, 1);
    const rgba = paint.getImageData(0, 0, 1, 1).data;
    return rgba[3]
      ? "#" +
          [...rgba]
            .slice(0, 3)
            .map((n) => n.toString(16).padStart(2, "0"))
            .join("")
      : null;
  }
  function noncollinear(points) {
    const a = points[0],
      b = points.find((p) => Math.hypot(p.x - a.x, p.y - a.y) > 1e-9);
    return (
      b &&
      points.some(
        (p) =>
          Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >
          1e-10,
      )
    );
  }
  try {
    // Use screen CTMs directly: getCTM omits a root CSS transform, and inverting
    // the root CTM discards its transform and fails for singular matrices.
    // Final fitting removes only
    // uniform viewport scale/translation, retaining rotation, skew and reflection.
    const extents = [];
    for (const [index, el] of [
      ...svg.querySelectorAll("path,rect,circle,ellipse,polygon,polyline,line"),
    ].entries()) {
      if (!rendered(el)) continue;
      const style = getComputedStyle(el),
        fill = Number(style.fillOpacity) > 0 ? color(style.fill) : null,
        stroke = Number(style.strokeOpacity) > 0 ? color(style.stroke) : null;
      if (!fill && !stroke) continue;
      try {
        const m = el.getScreenCTM();
        if (!m || ![m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite)) {
          warn(index, "non-finite transform");
          continue;
        }
        const contours =
          el.localName === "path"
            ? parseSVGPath(el.getAttribute("d") || "")
            : null;
        // A move-only contour must not enlarge the sampling extent. Build the
        // measurement path from drawable contours while retaining their starts.
        let b;
        if (contours) {
          const drawable = contours.filter((c) =>
            c.segments.some(
              (s) =>
                s.type !== "L" ||
                s.start.x !== s.end.x ||
                s.start.y !== s.end.y,
            ),
          );
          if (!drawable.length) {
            warn(index, "empty or degenerate geometry");
            continue;
          }
          sampler.setAttribute(
            "d",
            drawable
              .map(
                (c) =>
                  `M${c.start.x} ${c.start.y} ` +
                  c.segments.map((s) => s.type + s.args.join(" ")).join(" "),
              )
              .join(" "),
          );
          b = sampler.getBBox();
        } else b = el.getBBox();
        if (!b.width && !b.height) {
          warn(index, "empty or degenerate geometry");
          continue;
        }
        const corners = [
          { x: b.x, y: b.y },
          { x: b.x + b.width, y: b.y },
          { x: b.x, y: b.y + b.height },
          { x: b.x + b.width, y: b.y + b.height },
        ].map((p) => apply(m, p));
        if (!corners.every(finite)) {
          warn(index, "non-finite bounds");
          continue;
        }
        const extent = bounds(corners);
        if (!extent.width && !extent.height) {
          warn(index, "collapsed transform");
          continue;
        }
        records.push({
          el,
          index,
          m,
          contours,
          fill,
          stroke,
          rule: style.fillRule,
        });
        extents.push(...corners);
      } catch (e) {
        if (!recoverable(e)) throw e;
        warn(index, e.message);
      }
    }
    const box = bounds(extents),
      fitScale = Math.min(75 / (box.width || 1), 75 / (box.height || 1));
    // Sample and simplify in approximately final millimeters, not arbitrary SVG
    // units. Exact segment endpoints are retained, including sharp corners.
    const tolerance = 0.005 / fitScale;
    let totalPoints = 0;
    function sample(geometry, m, start, end) {
      const length = geometry.getTotalLength();
      if (!Number.isFinite(length))
        throw new SVGPathError("non-finite path length");
      if (length <= 0) return null; // Do not call getPointAtLength on empty geometry.
      const stretch = Math.hypot(m.a, m.b, m.c, m.d),
        n = Math.max(
          4,
          Math.min(6000, Math.ceil((length * stretch * fitScale) / 0.1)),
        );
      if ((totalPoints += n + 1) > 500000)
        throw Error(
          "SVG sampling exceeds 500,000 points. Simplify the artwork first.",
        );
      const points = [];
      for (let i = 0; i <= n; i++) {
        const p = apply(
          m,
          i === 0 && start
            ? start
            : i === n && end
              ? end
              : geometry.getPointAtLength((length * i) / n),
        );
        if (!finite(p))
          throw new SVGPathError("non-finite sampled coordinates");
        if (
          !points.length ||
          Math.hypot(p.x - points.at(-1).x, p.y - points.at(-1).y) > 1e-9
        )
          points.push(p);
      }
      return points.length >= 2 ? points : null;
    }
    for (const { el, index, m, contours, fill, stroke, rule } of records) {
      const paths = [];
      try {
        if (contours) {
          for (const contour of contours) {
            const points = [];
            for (const segment of contour.segments) {
              let part;
              if (segment.type === "L") {
                if ((totalPoints += 2) > 500000)
                  throw Error(
                    "SVG sampling exceeds 500,000 points. Simplify the artwork first.",
                  );
                part = [apply(m, segment.start), apply(m, segment.end)];
              } else {
                sampler.setAttribute("d", segmentPath(segment));
                part = sample(sampler, m, segment.start, segment.end);
              }
              if (!part) continue;
              for (const p of part) {
                if (!finite(p))
                  throw new SVGPathError("non-finite sampled coordinates");
                if (
                  !points.length ||
                  Math.hypot(p.x - points.at(-1).x, p.y - points.at(-1).y) >
                    1e-9
                )
                  points.push(p);
              }
            }
            if (points.length >= 2)
              paths.push({
                points: simplify(points, tolerance),
                closed: contour.closed,
              });
          }
        } else {
          const points = sample(el, m);
          if (points)
            paths.push({
              points: simplify(points, tolerance),
              closed: !["line", "polyline"].includes(el.localName),
            });
        }
      } catch (e) {
        if (!recoverable(e)) throw e;
        warn(index, e.message);
        continue;
      }
      const fills = paths.filter((p) => noncollinear(p.points));
      if (fill && !["line", "polyline"].includes(el.localName) && fills.length)
        result.push(
          object(
            `SVG region ${result.length + 1}`,
            fills.map((p) => p.points.map((q) => ({ ...q }))),
            { color: fill, fillRule: rule, closed: true },
          ),
        );
      // A path can contain both open and closed contours. Keep their stroke
      // closure independent; a single global /z/ test would close open strokes.
      if (stroke)
        for (const closed of [false, true]) {
          const outlines = paths.filter((p) => p.closed === closed);
          if (outlines.length)
            result.push(
              object(
                `SVG outline ${result.length + 1}`,
                outlines.map((p) => p.points.map((q) => ({ ...q }))),
                { type: "run", color: stroke, closed, underlay: false },
              ),
            );
        }
      if (!paths.length || (!fills.length && !stroke))
        warn(index, "empty or degenerate geometry");
    }
  } finally {
    host.remove();
  }
  if (!result.length)
    throw Error(
      "No supported drawable SVG geometry found. Empty or unsupported elements were skipped.",
    );
  const fitted = fitObjects(result),
    messages = [];
  if (unsupported.size)
    messages.push(
      `SVG skipped unsupported content: ${[...unsupported].join(", ")}. Expand these in your vector editor first.`,
    );
  if (skipped.length)
    messages.push(
      `SVG skipped ${skipped.length} empty, degenerate or unreadable elements (${skipped.slice(0, 3).join("; ")}${skipped.length > 3 ? "; …" : ""}).`,
    );
  fitted.importWarnings = messages.join(" ") || null;
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
