import { bounds, MACHINES } from "./model.js";
import { inside, distance, safeConnector, simplifyPath } from "./geometry.js";
import { preparePlan } from "./planning.js";
export { inside, distance } from "./geometry.js";
const rotate = (p, a) => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
// Needle spacing follows arc length, not the number of SVG flattening vertices.
export function resample(path, maxLength, closed = false) {
  if (!path.length) return [];
  const clean = path.filter((p, i) => !i || distance(p, path[i - 1]) > 1e-9);
  if (closed && distance(clean[0], clean.at(-1)) > 1e-9)
    clean.push({ ...clean[0] });
  const p = simplifyPath(clean, Math.min(0.04, maxLength / 8));
  if (p.length < 2) return p;
  const out = [{ ...p[0] }];
  let carry = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1],
      b = p[i],
      d = distance(a, b);
    if (!d) continue;
    let at = maxLength - carry;
    while (at < d - 1e-9) {
      out.push({
        x: a.x + ((b.x - a.x) * at) / d,
        y: a.y + ((b.y - a.y) * at) / d,
      });
      at += maxLength;
    }
    carry = (carry + d) % maxLength;
    const c = p[i + 1];
    const corner =
      c &&
      ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) /
        (d * (distance(b, c) || 1)) >
        -0.85;
    if (i === p.length - 1 || corner) {
      if (distance(out.at(-1), b) > 1e-9) out.push({ ...b });
      carry = 0;
    }
  }
  return out;
}
function subdivide(path, limit) {
  const out = path.length ? [path[0]] : [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      n = Math.ceil(distance(a, b) / limit);
    for (let j = 1; j <= n; j++)
      out.push({
        x: a.x + ((b.x - a.x) * j) / n,
        y: a.y + ((b.y - a.y) * j) / n,
      });
  }
  return out;
}

// Intersect rotated scanlines with every contour. Winding rules preserve counters and holes.
export function fillRows(
  rings,
  spacing,
  angle,
  length,
  compensation = 0,
  rule = "evenodd",
) {
  if (!rings.length) return [];
  const a = (angle * Math.PI) / 180,
    rs = rings.map((r) => r.map((p) => rotate(p, -a))),
    b = bounds(rs.flat()),
    rows = [];
  let row = 0;
  for (let y = b.minY + spacing / 2; y < b.maxY; y += spacing, row++) {
    const cuts = [];
    for (const r of rs)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const p = r[j],
          q = r[i];
        if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y))
          cuts.push({
            x: p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y),
            w: q.y > p.y ? 1 : -1,
          });
      }
    cuts.sort((p, q) => p.x - q.x);
    let winding = 0,
      start = null,
      startIndex = 0;
    const segments = [];
    for (let cutIndex = 0; cutIndex < cuts.length; cutIndex++) {
      const c = cuts[cutIndex];
      const was = rule === "nonzero" ? winding !== 0 : winding % 2 !== 0;
      winding += rule === "nonzero" ? c.w : 1;
      const now = rule === "nonzero" ? winding !== 0 : winding % 2 !== 0;
      if (!was && now) {
        start = c.x;
        startIndex = cutIndex;
      } else if (was && !now && c.x - start > 0.05) {
        // Compensation must not turn a microscopic span into a full-width speck.
        const extension = Math.min(compensation, (c.x - start) * 0.15),
          x1 =
            start -
            Math.min(
              extension,
              startIndex ? (start - cuts[startIndex - 1].x) / 3 : Infinity,
            ),
          x2 =
            c.x +
            Math.min(
              extension,
              cuts[cutIndex + 1] ? (cuts[cutIndex + 1].x - c.x) / 3 : Infinity,
            ),
          pts = [{ x: x1, y }],
          phase = ((row % 4) * length) / 4;
        for (
          let x = Math.ceil((x1 - phase) / length) * length + phase;
          x < x2 - 0.08;
          x += length
        )
          if (x > x1 + 0.08) pts.push({ x, y });
        pts.push({ x: x2, y });
        segments.push(pts);
      }
    }
    if (row % 2) {
      segments.reverse();
      segments.forEach((s) => s.reverse());
    }
    for (const s of segments) rows.push(s.map((p) => rotate(p, a)));
  }
  return rows;
}
export function satin(path, width, spacing, length) {
  const center = resample(path, spacing / 2);
  if (center.length < 2) return [];
  const pts = [];
  for (let i = 0; i < center.length; i++) {
    const p = center[i],
      a = center[Math.max(0, i - 1)],
      b = center[Math.min(center.length - 1, i + 1)],
      d = distance(a, b) || 1,
      sign = i % 2 ? 1 : -1;
    pts.push({
      x: p.x - ((((b.y - a.y) / d) * width) / 2) * sign,
      y: p.y + ((((b.x - a.x) / d) * width) / 2) * sign,
    });
  }
  return subdivide(pts, length);
}
function pathsFor(o) {
  const paths = [];
  if (o.underlay) {
    if (o.type === "fill")
      for (const row of fillRows(
        o.rings,
        Math.max(2, o.spacing * 5),
        o.angle + 90,
        3,
        0,
        o.fillRule,
      ))
        paths.push({ p: row, phase: "underlay" });
    else
      for (const ring of o.rings)
        paths.push({ p: resample(ring, 2.5, o.closed), phase: "underlay" });
  }
  if (o.type === "fill")
    for (const row of fillRows(
      o.rings,
      o.spacing,
      o.angle,
      o.length,
      o.compensation,
      o.fillRule,
    ))
      paths.push({ p: row, phase: "top" });
  if (o.type === "run")
    for (const ring of o.rings)
      paths.push({ p: resample(ring, o.length, o.closed), phase: "top" });
  if (o.type === "satin")
    for (const ring of o.rings)
      paths.push({
        p: satin(
          o.closed ? [...ring, ring[0]] : ring,
          o.width + o.compensation * 2,
          o.spacing,
          7,
        ),
        phase: "top",
      });
  return paths.filter(
    ({ p }) =>
      new Set(p.map((q) => Math.round(q.x * 10) + "," + Math.round(q.y * 10)))
        .size > 1,
  );
}
export function generate(project) {
  const prepared = preparePlan(project),
    diagnostics = prepared.diagnostics;
  const events = [],
    warnings = [],
    machine = MACHINES[project.machine];
  let last = { x: 0, y: 0 },
    lastColor = null,
    threadTrimmed = true;
  const emit = (cmd, p, color, objectId, phase = "top") => {
    const e = {
      cmd,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      color,
      objectId,
      phase,
    };
    if (
      cmd === "stitch" &&
      phase !== "manual" &&
      phase !== "anchor" &&
      e.x === last.x &&
      e.y === last.y
    ) {
      diagnostics.zeroLengthRemoved = (diagnostics.zeroLengthRemoved || 0) + 1;
      return;
    }
    if (cmd === "trim" && threadTrimmed) return;
    events.push(e);
    last = e;
    if (cmd === "stitch") threadTrimmed = false;
    if (cmd === "trim") threadTrimmed = true;
    if (events.length > 250000)
      throw Error(
        "Design exceeds 250,000 commands. Increase spacing or simplify artwork.",
      );
  };
  const sew = (p, o, phase) => {
    const d = distance(last, p),
      limit = Math.min(
        o.type === "satin" ? machine.maxStitch : o.length || machine.maxStitch,
        machine.maxStitch - 0.15,
      ),
      n = Math.max(
        1,
        Math.ceil((d - 0.14) / limit),
        Math.ceil(d / (machine.maxStitch - 0.14)),
      ),
      from = { ...last };
    for (let j = 1; j <= n; j++)
      emit(
        "stitch",
        {
          x: from.x + ((p.x - from.x) * j) / n,
          y: from.y + ((p.y - from.y) * j) / n,
        },
        o.color,
        o.id,
        phase,
      );
  };
  const lock = (path, o, phase) => {
    if (path.length < 2) return;
    const a = path[0],
      b = path[1],
      d = distance(a, b);
    if (d < 0.2) return;
    const q = {
      x: a.x + (b.x - a.x) * Math.min(0.7 / d, 1),
      y: a.y + (b.y - a.y) * Math.min(0.7 / d, 1),
    };
    sew(q, o, phase);
    sew(a, o, phase);
  };
  const lockEnd = (o) => {
    if (threadTrimmed) return;
    const a = { ...last },
      b = events.at(-2);
    if (events.at(-1)?.cmd === "stitch" && b && distance(a, b) >= 0.3) {
      const d = distance(a, b),
        t = Math.min(0.5 / d, 1);
      sew({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, o, "tie");
      sew(a, o, "tie");
    }
  };
  const trimAndLock = (o) => {
    if (threadTrimmed) return;
    lockEnd(o);
    emit("trim", last, lastColor, o.id, "tie");
  };
  let previousObject = null;
  for (const o of prepared.units) {
    if (o.type === "manual" && !o.commands.length) continue;
    const paths = o.type === "manual" ? null : pathsFor(o);
    if (paths && !paths.length) continue;
    if (lastColor !== o.color) {
      if (lastColor !== null) {
        trimAndLock(previousObject || o);
        emit("color", last, o.color, o.id);
      }
      lastColor = o.color;
    }
    previousObject = o;
    if (o.type === "manual") {
      let positioned = false;
      for (let index = 0; index < o.commands.length; index++) {
        const c = o.commands[index],
          start = events.length;
        if (c.cmd === "end") continue;
        if (c.cmd === "stitch") {
          if (!positioned) emit("jump", c, o.color, o.id, "manual");
          sew(c, { ...o, length: 7 }, "manual");
          positioned = true;
        } else if (c.cmd === "jump") {
          emit(c.cmd, c, o.color, o.id, "manual");
          positioned = true;
        } else emit(c.cmd, last, o.color, o.id, "manual");
        for (let j = start; j < events.length; j++)
          events[j].sourceIndex = index;
      }
      continue;
    }
    let first = true;
    for (const { p, phase } of paths) {
      if (!p.length) continue;
      const d = distance(last, p[0]);
      // Only connect nearby rows when the complete connector lies inside the fill.
      const safe =
        o.type === "fill" &&
        d < 2.2 &&
        safeConnector(
          last,
          p[0],
          o.rings,
          o.polygon ? o.compensation + 0.02 : 0,
          o.polygon ? o.rings.slice(1) : [],
          o.fillRule,
        );
      if (first || !safe) {
        const trimmed = events.length && d > 3;
        if (trimmed) trimAndLock(o);
        else if (d > 0.3) lockEnd(o);
        emit("jump", p[0], o.color, o.id, phase);
        // Positioning is not a needle penetration. Anchor at the destination
        // before sewing away from it; otherwise a codec must invent this step.
        emit("stitch", p[0], o.color, o.id, "anchor");
        if (first || trimmed || d > 0.3) lock(p, o, "tie");
      } else sew(p[0], o, phase);
      for (let i = 1; i < p.length; i++) sew(p[i], o, phase);
      first = false;
    }
  }
  if (events.length) {
    trimAndLock(previousObject);
    emit("end", last, lastColor, null);
  }
  const stats = analyze(events, machine);
  stats.sourceColorBlocks = diagnostics.sourceColorBlocks;
  stats.regions = prepared.units.length;
  if (diagnostics.skippedDetails)
    warnings.push(
      `${diagnostics.skippedDetails} disconnected islands below ${prepared.options.smallDetail} mm are omitted from stitches; artwork and holes are preserved. Set Small islands to 0 to retain them.`,
    );
  if (diagnostics.skippedOutlines)
    warnings.push(
      `${diagnostics.skippedOutlineContours} matching same-color SVG outline contours are omitted from ${diagnostics.skippedOutlines} outline objects. Turn off Skip duplicate outlines to sew them.`,
    );
  if (diagnostics.topologyFallbacks)
    warnings.push(
      `${diagnostics.topologyFallbacks} complex fill objects retain conservative source-order routing.`,
    );
  if (diagnostics.optimizationLimited)
    warnings.push(
      "More than 2,000 sewing regions: source order retained to keep planning bounded. Increase the small-island threshold or simplify the artwork to enable color optimization.",
    );
  if (diagnostics.overlapPairs)
    warnings.push(
      `${diagnostics.overlapPairs} overlapping or compensated boundary pairs retain layer order. Overlapping fills are not automatically cut away; underlay and construction may require them.`,
    );
  if (!stats.fits)
    warnings.push(
      "Stitches extend beyond the selected hoop. Move or resize the design before export.",
    );
  for (const o of project.objects.filter(
    (o) => o.visible !== false && o.type === "satin",
  ))
    if (o.width + o.compensation * 2 > 7)
      warnings.push(
        `${o.name}: wide satin is split into stitches of 7 mm or less.`,
      );
  return {
    events,
    stats,
    warnings,
    diagnostics,
    order: prepared.units.map((o) => ({
      objectId: o.id,
      color: o.color,
      index: o.index,
    })),
  };
}
export function analyze(events, machine) {
  let stitches = 0,
    jumps = 0,
    trims = 0,
    changes = 0,
    stitchLength = 0,
    maxLength = 0,
    shortStitches = 0,
    zeroLength = 0,
    anchorStitches = 0,
    redundantStitches = 0,
    prev = { x: 0, y: 0 };
  for (const e of events) {
    const d = distance(prev, e);
    if (e.cmd === "stitch") {
      stitches++;
      stitchLength += d;
      maxLength = Math.max(maxLength, d);
      if (d < 0.3) shortStitches++;
      if (e.phase === "anchor") anchorStitches++;
      if (d === 0) {
        zeroLength++;
        if (
          e.phase !== "anchor" &&
          e.phase !== "manual" &&
          e.phase !== "machine"
        )
          redundantStitches++;
      }
    }
    if (e.cmd === "jump") jumps++;
    if (e.cmd === "trim") trims++;
    if (e.cmd === "color") changes++;
    if (e.cmd === "stitch" || e.cmd === "jump") prev = e;
  }
  const b = bounds(events.filter((e) => ["stitch", "jump"].includes(e.cmd))),
    fits =
      b.minX >= -machine.width / 2 &&
      b.maxX <= machine.width / 2 &&
      b.minY >= -machine.height / 2 &&
      b.maxY <= machine.height / 2;
  return {
    stitches,
    jumps,
    trims,
    changes,
    colors: events.length ? changes + 1 : 0,
    uniqueColors: new Set(
      events.filter((e) => e.cmd === "stitch").map((e) => e.color),
    ).size,
    manualChanges: changes,
    shortStitches,
    zeroLength,
    anchorStitches,
    redundantStitches,
    thread: stitchLength / 1000,
    bounds: b,
    fits,
    maxLength,
    minutes: stitches / machine.speed + changes * 0.5 + trims * 0.025,
  };
}
