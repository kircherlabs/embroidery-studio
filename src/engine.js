import { bounds, MACHINES } from "./model.js";
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rotate = (p, a) => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
export function inside(p, rings, rule = "evenodd") {
  let winding = 0;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j],
        b = ring[i];
      if ((a.y <= p.y && b.y > p.y) || (b.y <= p.y && a.y > p.y)) {
        const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (x > p.x) winding += rule === "nonzero" ? (b.y > a.y ? 1 : -1) : 1;
      }
    }
  return rule === "nonzero" ? winding !== 0 : winding % 2 === 1;
}
function insideExpanded(p, rings, rule, padding) {
  if (inside(p, rings, rule)) return true;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j],
        b = r[i],
        l = distance(a, b) ** 2,
        t = l
          ? Math.max(
              0,
              Math.min(
                1,
                ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l,
              ),
            )
          : 0;
      if (
        distance(p, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) <=
        padding
      )
        return true;
    }
  return false;
}
export function resample(path, maxLength, closed = false) {
  if (!path.length) return [];
  const out = [{ ...path[0] }],
    p = closed ? [...path, path[0]] : path;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1],
      b = p[i],
      n = Math.ceil(distance(a, b) / maxLength);
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
      start = null;
    const segments = [];
    for (const c of cuts) {
      const was = rule === "nonzero" ? winding !== 0 : winding % 2 !== 0;
      winding += rule === "nonzero" ? c.w : 1;
      const now = rule === "nonzero" ? winding !== 0 : winding % 2 !== 0;
      if (!was && now) start = c.x;
      else if (was && !now && c.x - start > 0.05) {
        const x1 = start - compensation,
          x2 = c.x + compensation,
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
  return resample(pts, length);
}
export function generate(project) {
  const events = [],
    warnings = [],
    machine = MACHINES[project.machine];
  let last = { x: 0, y: 0 },
    lastColor = null;
  const emit = (cmd, p, color, objectId, phase = "top") => {
    const e = {
      cmd,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      color,
      objectId,
      phase,
    };
    events.push(e);
    last = e;
    if (events.length > 250000)
      throw Error(
        "Design exceeds 250,000 commands. Increase spacing or simplify artwork.",
      );
  };
  const sew = (p, o, phase) => {
    const d = distance(last, p),
      limit =
        Math.min(
          o.type === "satin"
            ? machine.maxStitch
            : o.length || machine.maxStitch,
          machine.maxStitch,
        ) - 0.12,
      n = Math.ceil(d / limit),
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
  for (const o of project.objects.filter((o) => o.visible !== false)) {
    if (o.type === "manual" && !o.commands.length) continue;
    if (lastColor !== o.color) {
      if (lastColor !== null) {
        emit("trim", last, lastColor, o.id);
        emit("color", last, o.color, o.id);
      }
      lastColor = o.color;
    }
    if (o.type === "manual") {
      for (let index = 0; index < o.commands.length; index++) {
        const c = o.commands[index],
          start = events.length;
        if (c.cmd === "end") continue;
        if (c.cmd === "stitch") sew(c, { ...o, length: 7 }, "manual");
        else emit(c.cmd, c, o.color, o.id, "manual");
        for (let j = start; j < events.length; j++)
          events[j].sourceIndex = index;
      }
      continue;
    }
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
    let first = true;
    for (const { p, phase } of paths) {
      if (!p.length) continue;
      const d = distance(last, p[0]);
      // Only connect nearby rows when the complete connector lies inside the fill.
      const safe =
        o.type === "fill" &&
        d < 2.2 &&
        Array.from({ length: 17 }, (_, i) => ({
          x: last.x + ((p[0].x - last.x) * i) / 16,
          y: last.y + ((p[0].y - last.y) * i) / 16,
        })).every((q) =>
          insideExpanded(q, o.rings, o.fillRule, o.compensation + 0.08),
        );
      if (first || !safe) {
        if (events.length && d > 3) emit("trim", last, o.color, o.id, phase);
        emit("jump", p[0], o.color, o.id, phase);
        if (first) lock(p, o, phase);
      } else sew(p[0], o, phase);
      for (let i = 1; i < p.length; i++) sew(p[i], o, phase);
      first = false;
    }
    if (!first && events.length > 1) {
      const a = { ...last },
        b = events.at(-2),
        d = distance(a, b);
      if (d > 0.1) {
        sew(
          {
            x: a.x + (b.x - a.x) * Math.min(0.5 / d, 1),
            y: a.y + (b.y - a.y) * Math.min(0.5 / d, 1),
          },
          o,
          "tie",
        );
        sew(a, o, "tie");
      }
    }
  }
  if (events.length) {
    emit("trim", last, lastColor, null);
    emit("end", last, lastColor, null);
  }
  const stats = analyze(events, machine);
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
  return { events, stats, warnings };
}
export function analyze(events, machine) {
  let stitches = 0,
    jumps = 0,
    trims = 0,
    changes = 0,
    stitchLength = 0,
    maxLength = 0,
    prev = { x: 0, y: 0 };
  for (const e of events) {
    const d = distance(prev, e);
    if (e.cmd === "stitch") {
      stitches++;
      stitchLength += d;
      maxLength = Math.max(maxLength, d);
    }
    if (e.cmd === "jump") jumps++;
    if (e.cmd === "trim") trims++;
    if (e.cmd === "color") changes++;
    prev = e;
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
    thread: stitchLength / 1000,
    bounds: b,
    fits,
    maxLength,
    minutes: stitches / machine.speed + changes * 0.5 + trims * 0.025,
  };
}
