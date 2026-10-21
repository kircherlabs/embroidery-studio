import { sewingThreadKey } from "./thread-records.js";
import { getMachine } from "./equipment.js";
import { centerlineRails, paceRails, shortInnerTurns } from "./satin-rails.js";
import { strokeSatin } from "./stroke-satin.js";
import { manualSatin } from "./manual-satin.js";
import { designIssues } from "./design-issues.js";
import { quantizeColumnPaths } from "./column-routing.js";
import { bounds } from "./model.js";
import { inside, distance, safeConnector, simplifyPath } from "./geometry.js";
import { preparePlan } from "./planning.js";
import { routeFill } from "./fill-routing.js";
import { duplicateArtwork } from "./artwork-diagnostics.js";
import { generateFill } from "./fills/registry.js";
import "./fills/tatami.js";
import "./fills/contour.js";
import "./fills/cross.js";
import "./fills/meander.js";
import "./fills/emboss.js";
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
  const out = [{ ...p[0] }],
    stations = [0],
    vertices = [0];
  for (let i = 1; i < p.length; i++)
    vertices.push(vertices.at(-1) + distance(p[i - 1], p[i]));
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
      stations.push(vertices[i - 1] + at);
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
      if (distance(out.at(-1), b) > 1e-9) {
        out.push({ ...b });
        stations.push(vertices[i]);
      }
      carry = 0;
    }
  }
  // Long running stitches must not cut across a newly rounded bend. Keep the
  // length stations, adding only the source vertices needed for 0.1 mm fidelity
  // (.04 mm source simplification plus .06 mm chord refinement).
  const followed = [out[0]];
  let vertex = 1;
  for (let i = 1; i < out.length; i++) {
    while (vertex < p.length && vertices[vertex] <= stations[i - 1] + 1e-9)
      vertex++;
    const curve = [out[i - 1]];
    while (vertex < p.length && vertices[vertex] < stations[i] - 1e-9)
      curve.push(p[vertex++]);
    curve.push(out[i]);
    followed.push(...simplifyPath(curve, 0.06).slice(1));
  }
  return followed;
}
function subdivide(path, limit) {
  const out = path.length ? [path[0]] : [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      n = Math.ceil(distance(a, b) / limit);
    for (let j = 1; j <= n; j++)
      out.push(
        j === n
          ? { ...b }
          : {
              x: a.x + ((b.x - a.x) * j) / n,
              y: a.y + ((b.y - a.y) * j) / n,
            },
      );
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
  pattern = "quarter",
  maxSatin = null,
  counterClearance = maxSatin ? 0.08 : 0,
  textureOptions = null,
) {
  if (!rings.length) return [];
  const a = (angle * Math.PI) / 180,
    rs = rings.map((r) => r.map((p) => rotate(p, -a))),
    b = bounds(rs.flat()),
    rows = [];
  const first = textureOptions?.fixed
    ? Math.ceil((b.minY - spacing / 2) / spacing) * spacing + spacing / 2
    : b.minY + spacing / 2;
  let row = textureOptions?.fixed
    ? Math.round((first - spacing / 2) / spacing)
    : 0;
  for (let y = first; y < b.maxY; y += spacing, row++) {
    const cuts = [];
    for (const r of rs)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const p = r[j],
          q = r[i];
        if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y))
          cuts.push({
            x: p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y),
            w: q.y > p.y ? 1 : -1,
            hole: counterClearance > 0 && rs.indexOf(r) > 0,
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
            start +
            (counterClearance && cuts[startIndex].hole
              ? Math.min(counterClearance, (c.x - start) / 4)
              : -Math.min(
                  extension,
                  startIndex ? (start - cuts[startIndex - 1].x) / 3 : Infinity,
                )),
          x2 =
            c.x +
            (counterClearance && c.hole
              ? -Math.min(counterClearance, (c.x - start) / 4)
              : Math.min(
                  extension,
                  cuts[cutIndex + 1]
                    ? (cuts[cutIndex + 1].x - c.x) / 3
                    : Infinity,
                )),
          pts = [{ x: x1, y }],
          phase = textureOptions?.phase
            ? textureOptions.phase(row) * length
            : pattern === "aligned"
              ? 0
              : pattern === "half"
                ? ((row % 2) * length) / 2
                : ((row % 4) * length) / 4;
        for (
          let x = Math.ceil((x1 - phase) / length) * length + phase;
          !maxSatin && x < x2 - 0.08;
          x += length
        )
          if (x > x1 + 0.08) pts.push({ x, y });
        if (maxSatin && x2 - x1 > maxSatin) {
          const split = Math.min(maxSatin, length),
            phase =
              pattern === "aligned"
                ? 0
                : pattern === "half"
                  ? ((row % 2) * split) / 2
                  : ((row % 4) * split) / 4;
          // Cycle the stagger within one split length; the first float must
          // obey the same width limit as all following split stitches.
          const first = ((split / 2 + phase - 1e-9) % split) + 1e-9;
          for (let x = x1 + first; x < x2 - 0.1; x += split) pts.push({ x, y });
        }
        pts.push({ x: x2, y });
        if (textureOptions?.adjust) {
          const adjusted = textureOptions.adjust(pts, row);
          pts.splice(0, pts.length, ...adjusted);
        }
        const inset = Math.min(0.2, (c.x - start) / 4);
        pts.anchors = [
          { x: start + inset, y },
          { x: c.x - inset, y },
        ];
        pts.interval = [start, c.x];
        pts.scanline = row;
        segments.push(pts);
      }
    }
    if (row % 2) {
      segments.reverse();
      segments.forEach((s) => {
        s.reverse();
        s.anchors.reverse();
      });
    }
    for (const s of segments) {
      const r = s.map((p) => rotate(p, a));
      r.anchors = s.anchors.map((p) => rotate(p, a));
      r.scanline = s.scanline;
      r.interval = s.interval;
      rows.push(r);
    }
  }
  return rows;
}
export function satin(
  path,
  width,
  spacing,
  length,
  closed = false,
  cornerControl = false,
  minimum = 0.3,
) {
  const built = centerlineRails(path, width, spacing, closed);
  let sections = paceRails(built.sections, spacing, closed);
  if (!sections)
    throw Error(
      "Satin rails turn too abruptly. Split this path or reduce its width.",
    );
  if (cornerControl)
    sections = shortInnerTurns(sections, minimum, closed, spacing);
  const pts = sections.map((q, i) => (i % 2 ? q.b : q.a));
  const result = subdivide(
    closed && pts.length ? [...pts, pts[0]] : pts,
    length,
  );
  result.tightTurn = built.tight;
  return result;
}
function pathsFor(o, from, to) {
  if (o.fillSettings && !o.satinColumn && o.type === "fill") {
    try {
      const result = generateFill(
        o,
        { resample, fillRows, routeFill },
        from,
        to,
      );
      o.fillAnalysis = result;
      return result.paths;
    } catch (e) {
      o.fillError = e.message;
      return [];
    }
  }
  if (o.satinColumn && o.columnMode === "rails") {
    try {
      const result = manualSatin(o);
      o.manualRailAnalysis = result;
      return result.paths;
    } catch (e) {
      o.manualRailError = e.message;
      return [];
    }
  }
  if (o.satinColumn && o.columnMode === "stroke") {
    const result = strokeSatin(o, from);
    o.strokeAnalysis = result;
    if (result.paths) return result.paths;
    if (o.columnFallback === "manual") return [];
    const fallbackPaths = quantizeColumnPaths(
      pathsFor(
        { ...o, satinColumn: false, type: "fill", columnMode: undefined },
        from,
        to,
      ),
      o,
    );
    result.unsewn = !fallbackPaths.some((path) => path.p.length > 1);
    return fallbackPaths;
  }
  const paths = [];
  if (o.underlay) {
    if (o.type === "fill") {
      const spacing = Math.max(2, o.spacing * 5),
        stride = Math.ceil(spacing / Math.min(0.42, o.spacing));
      paths.push(
        ...routeFill(
          fillRows(
            o.rings,
            spacing / stride,
            o.angle + 90,
            3,
            0,
            o.fillRule,
            "quarter",
            null,
            o.satinColumn ? 0.08 : 0,
          ),
          o,
          from,
          "underlay",
          { stride },
        ),
      );
    } else
      for (const ring of o.rings)
        paths.push({ p: resample(ring, 2.5, o.closed), phase: "underlay" });
  }
  if (o.type === "fill")
    paths.push(
      ...routeFill(
        fillRows(
          o.rings,
          o.spacing,
          o.angle,
          o.length,
          o.compensation,
          o.fillRule,
          o.pattern,
          o.satinColumn ? o.maxSatin || 6 : null,
        ),
        o,
        paths.at(-1)?.p.at(-1) || from,
        "top",
        { connectFrom: paths.length > 0, to },
      ),
    );
  if (o.type === "run")
    for (const ring of o.rings) {
      let p = resample(ring, o.length, o.closed);
      if (o.cornerControl) {
        const minimum = o.minCornerStitch || 0.3,
          keep = new Set();
        for (let i = 0; i < ring.length; i++) {
          if (!o.closed && (i === 0 || i === ring.length - 1)) continue;
          const a = ring[(i + ring.length - 1) % ring.length],
            b = ring[i],
            c = ring[(i + 1) % ring.length],
            ab = distance(a, b),
            bc = distance(b, c);
          if (
            ab &&
            bc &&
            ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) /
              (ab * bc) >
              -0.85
          ) {
            const at = p.findIndex((q) => distance(q, b) < 1e-6);
            if (at >= 0) keep.add(at);
          }
        }
        p = p.filter(
          (q, i) =>
            keep.has(i) ||
            ![...keep].some(
              (j) => Math.abs(j - i) === 1 && distance(q, p[j]) < minimum,
            ),
        );
      }
      if (o.runStyle === "bean")
        p = p.flatMap((q, i) => (i ? [q, p[i - 1], q] : [q]));
      else if (o.runStyle === "triple")
        p = [...p, ...p.slice(0, -1).reverse(), ...p.slice(1)];
      paths.push({ p, phase: o.technique || "top" });
    }
  if (o.type === "satin")
    for (const ring of o.rings) {
      const p = satin(
        ring,
        o.width + o.compensation * 2,
        o.spacing,
        7,
        o.closed,
        o.cornerControl,
        o.minCornerStitch || 0.3,
      );
      if (p.tightTurn) o.satinTightTurn = true;
      paths.push({ p, phase: "top" });
    }
  return (o.satinColumn ? quantizeColumnPaths(paths, o) : paths).filter(
    ({ p }) =>
      new Set(p.map((q) => Math.round(q.x * 10) + "," + Math.round(q.y * 10)))
        .size > 1,
  );
}
export function generate(project) {
  const prepared = preparePlan(project),
    diagnostics = prepared.diagnostics;
  project = prepared.project;
  for (const o of project.objects)
    for (const op of o.operations || [])
      if (
        op.type === "column" &&
        op.columnMode === "stroke" &&
        op.enabled !== false &&
        prepared.units.some((u) => u.id === o.id && u.operationId === op.id) &&
        (op.satinGuides || []).some(
          (g) =>
            !inside(
              { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 },
              o.rings,
              o.fillRule,
            ),
        )
      )
        (diagnostics.operationIssues ||= []).push({
          severity: "warning",
          code: "satin-orphan-guide",
          objectId: o.id,
          objectName: o.name,
          operationId: op.id,
          operationName: op.name,
          message:
            "A direction guide is outside the current artwork. It does not influence satin stitches.",
          action:
            "Reposition or remove the guide after changing text, fonts or geometry.",
        });
  const events = [],
    warnings = [],
    machine = getMachine(project);
  let last = { x: 0, y: 0 },
    lastColor = null,
    lastThread = null,
    activeRegion = null,
    activeOperation = null,
    activeOperationName = null,
    activeUnit = null,
    threadTrimmed = true;
  const emit = (
    cmd,
    p,
    color,
    objectId,
    phase = "top",
    regionId = activeRegion,
    operationId = activeOperation,
  ) => {
    const source = regionId === activeRegion ? activeUnit : previousObject;
    const e = {
      cmd,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      color,
      objectId,
      phase,
      regionId,
      operationId,
      operationName:
        operationId === activeOperation
          ? activeOperationName
          : last.operationName,
      tieOff: activeUnit?.tieOff !== false,
      ...(source?.physicalThread ? { threadKey: sewingThreadKey(source) } : {}),
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
        o.satinColumn && ["stroke", "rails"].includes(o.columnMode)
          ? Math.min(o.maxSatin || 6, machine.maxStitch)
          : o.type === "satin" || o.satinColumn
            ? machine.maxStitch
            : o.length || machine.maxStitch,
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
        o.regionId,
        o.operationId,
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
    if (threadTrimmed || last.tieOff === false) return;
    const a = { ...last },
      b = events.at(-2);
    // An outgoing lock belongs to the region that was sewn, not the next object.
    o = {
      ...o,
      id: last.objectId,
      color: last.color,
      regionId: last.regionId,
      operationId: last.operationId,
    };
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
    emit(
      "trim",
      last,
      lastColor,
      last.objectId,
      "tie",
      last.regionId,
      last.operationId,
    );
  };
  let previousObject = null;
  for (const [regionIndex, unit] of prepared.units.entries()) {
    const o = { ...unit, regionId: `${unit.id}:${regionIndex}` };
    activeRegion = o.regionId;
    activeOperation = o.operationId || null;
    activeOperationName = o.operationName || null;
    activeUnit = o;
    if (o.type === "command") {
      if (o.command === "trim") lockEnd(previousObject || o);
      else trimAndLock(previousObject || o);
      emit(o.command, last, lastColor || o.color, o.id, o.command);
      continue;
    }
    if (o.type === "manual" && !o.commands.length) continue;
    const next = prepared.units[regionIndex + 1],
      to = next
        ? {
            x: (next.bounds.minX + next.bounds.maxX) / 2,
            y: (next.bounds.minY + next.bounds.maxY) / 2,
          }
        : null;
    if (
      o.satinColumn &&
      !["stroke", "rails"].includes(o.columnMode) &&
      Math.max(o.bounds.width, o.bounds.height) > (o.maxSatin || 6)
    ) {
      const wide = fillRows(
        o.rings,
        Math.max(0.5, o.spacing),
        o.angle,
        10000,
        0,
        o.fillRule,
      ).some((r) => distance(r[0], r.at(-1)) > (o.maxSatin || 6));
      if (wide)
        warnings.push(
          `${o.name}: satin spans wider than ${o.maxSatin || 6} mm use staggered split stitches. Adjust direction or divide branches for controlled turning.`,
        );
    }
    const paths = o.type === "manual" ? null : pathsFor(o, last, to);
    if (o.fillError)
      (diagnostics.operationIssues ||= []).push({
        severity: "error",
        code: "fill-generation",
        objectId: o.id,
        objectName: o.name,
        operationId: o.operationId,
        operationName: o.operationName,
        message: o.fillError,
        action:
          "Adjust the fill settings, simplify the region, or choose another fill method. No substitute stitches were generated.",
      });
    if (o.fillAnalysis) {
      (diagnostics.fills ||= []).push({
        objectId: o.id,
        operationId: o.operationId,
        ...o.fillAnalysis.stats,
      });
      for (const issue of o.fillAnalysis.issues || [])
        (diagnostics.operationIssues ||= []).push({
          ...issue,
          objectId: o.id,
          objectName: o.name,
          operationId: o.operationId,
          operationName: o.operationName,
        });
    }
    if (o.manualRailError)
      (diagnostics.operationIssues ||= []).push({
        severity: "error",
        code: "manual-satin-rails",
        objectId: o.id,
        objectName: o.name,
        operationId: o.operationId,
        operationName: o.operationName,
        message: o.manualRailError,
        action:
          "Edit the rails or direction guides, adjust the seam nodes, reduce width/compensation, or split this column. The manual action remains unsewn until repaired.",
      });
    if (o.manualRailAnalysis) {
      const a = o.manualRailAnalysis;
      if (a.minWidth < 0.8)
        (diagnostics.operationIssues ||= []).push({
          severity: "warning",
          code: "manual-satin-narrow",
          objectId: o.id,
          objectName: o.name,
          operationId: o.operationId,
          operationName: o.operationName,
          message: `This manual column narrows to ${a.minWidth.toFixed(2)} mm.`,
          action:
            "Review needle crowding and material coverage. Widen this terminal, reduce underlay, or use running stitches for very fine details. Test on the intended fabric.",
        });
      (diagnostics.satin ||= []).push({
        objectId: o.id,
        operationId: o.operationId,
        manual: true,
        wide: a.wide,
        minWidth: a.minWidth,
        maxWidth: a.maxWidth,
        strokes: [
          {
            id: 0,
            closed: a.closed,
            center: a.sections.map((q) => q.center),
            sections: a.sections,
          },
        ],
      });
      if (a.wide)
        (diagnostics.operationIssues ||= []).push({
          severity: "warning",
          code: "manual-satin-wide",
          objectId: o.id,
          objectName: o.name,
          operationId: o.operationId,
          operationName: o.operationName,
          message: `${a.wide} wide rail spans use staggered split stitches.`,
          action:
            "Review split penetrations; reduce width, split the artwork, or choose tatami for broad areas.",
        });
    }
    if (o.satinTightTurn)
      (diagnostics.operationIssues ||= []).push({
        severity: "warning",
        code: "tight-satin-turn",
        objectId: o.id,
        objectName: o.name,
        operationId: o.operationId,
        operationName: o.operationName,
        message:
          "This satin band is wider than the inside turn can accommodate. Outer coverage is retained with a pivot fan; the inner rail cannot keep its full offset.",
        action:
          "Increase the artwork corner radius, reduce Satin band width, or split this turn into separate regions. Review the inner penetrations with a sew-out.",
      });
    if (o.columnGridWarnings) warnings.push(...o.columnGridWarnings);
    if (o.strokeAnalysis) {
      const a = o.strokeAnalysis;
      (diagnostics.satin ||= []).push({
        objectId: o.id,
        operationId: o.operationId,
        regionId: o.regionId,
        coverage: a.coverage,
        overlap: a.overlap,
        grid: a.grid,
        wide: a.wide || 0,
        fallback: !!a.reason,
        reason: a.reason,
        strokes: (a.strokes || []).map((s) => ({
          id: s.id,
          closed: s.closed,
          center: s.points,
          sections: s.sections,
        })),
      });
      if (a.wide)
        warnings.push(
          `${o.name}: ${a.wide} wide satin floats use staggered split stitches; consider tatami for broad regions.`,
        );
      for (const message of a.warnings || [])
        warnings.push(`${o.name}: ${message}`);
      if (a.reason)
        (diagnostics.operationIssues ||= []).push({
          severity:
            o.columnFallback === "manual" || a.unsewn ? "error" : "warning",
          code: "satin-decomposition",
          objectId: o.id,
          objectName: o.name,
          operationId: o.operationId,
          operationName: o.operationName,
          message:
            a.reason +
            (a.unsewn
              ? " The tatami fallback also has no stitchable paths."
              : o.columnFallback === "manual"
                ? " No satin stitches were generated."
                : " This region uses an explicit tatami fallback."),
          action:
            "Inspect stroke structure, adjust direction guides, enlarge lettering or split this region manually. Directional columns remain available for deliberate manual digitizing.",
        });
    }
    if (paths && !paths.length) continue;
    if (lastThread !== sewingThreadKey(o)) {
      if (lastColor !== null) {
        trimAndLock(previousObject || o);
        emit("color", last, o.color, o.id);
      }
      lastColor = o.color;
      lastThread = sewingThreadKey(o);
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
    for (const { p, phase, continuous, travel, noLock } of paths) {
      if (!p.length) continue;
      const d = distance(last, p[0]);
      // Only connect nearby rows when the complete connector lies inside the fill.
      const safe =
        travel !== "jump" &&
        o.type === "fill" &&
        !first &&
        (continuous || d < 2.2) &&
        (continuous ||
          safeConnector(
            last,
            p[0],
            o.rings,
            o.polygon ? o.compensation + 0.02 : 0,
            o.polygon ? o.rings.slice(1) : [],
            o.fillRule,
          ));
      if (first || !safe) {
        const trimmed = events.length && d > 3;
        if (trimmed) trimAndLock(o);
        else if (d > 0.3 && !noLock) lockEnd(o);
        emit("jump", p[0], o.color, o.id, phase);
        // Positioning is not a needle penetration. Anchor at the destination
        // before sewing away from it; otherwise a codec must invent this step.
        emit("stitch", p[0], o.color, o.id, "anchor");
        if (o.tieIn !== false && (first || trimmed || (d > 0.3 && !noLock)))
          lock(p, o, "tie");
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
  stats.regions = prepared.units.filter((o) => o.type !== "command").length;
  diagnostics.duplicates = duplicateArtwork(project);
  if (diagnostics.duplicates.length)
    warnings.push(
      `${diagnostics.duplicates.length} source objects have coincident same-color geometry. Review duplicate objects before removing any: repeated passes may be intentional.`,
    );
  warnings.push(...(diagnostics.operationWarnings || []));
  if (diagnostics.operationColorFallback)
    warnings.push(
      "Source object order retained because batching multicolor operation stacks would add manual thread changes.",
    );
  if (stats.stops)
    warnings.push(
      `${stats.stops} machine stops require operator action. PES/PEC encode stops with repeated thread colors; confirm pauses and fabric clearance on your machine.`,
    );
  const dense = project.objects.filter(
    (o) =>
      o.visible !== false &&
      (o.operations || [o]).some(
        (op) =>
          op.enabled !== false &&
          ["fill", "column", "satin", "border"].includes(op.type) &&
          (op.type !== "fill" ||
            !(op.fillSettings ?? o.fillSettings) ||
            ["tatami", "emboss"].includes(
              (op.fillSettings ?? o.fillSettings).method,
            )) &&
          op.spacing < 0.25,
      ),
  );
  if (dense.length)
    warnings.push(
      `${dense.length} objects use spacing below 0.25 mm. Check thread weight, fabric, stabilizer and overlapping operations for excessive density.`,
    );
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
  // Locate hoop violations using machine movements only, never selection cages,
  // source guides, or reference artwork.
  if (!stats.fits) {
    const outside = new Map();
    for (const e of events) {
      if (
        !["stitch", "jump"].includes(e.cmd) ||
        !e.objectId ||
        (Math.abs(e.x) <= machine.width / 2 &&
          Math.abs(e.y) <= machine.height / 2)
      )
        continue;
      const key = `${e.objectId}:${e.operationId || ""}`;
      if (!outside.has(key)) outside.set(key, { e, count: 0 });
      outside.get(key).count++;
    }
    for (const { e, count } of outside.values()) {
      const o = project.objects.find((o) => o.id === e.objectId);
      (diagnostics.operationIssues ||= []).push({
        code: "outside-hoop",
        severity: "warning",
        objectId: e.objectId,
        objectName: o?.name,
        operationId: e.operationId,
        operationName: e.operationName,
        message: `${count} generated stitch or jump positions extend beyond the selected hoop.`,
        action:
          "Move or resize this artwork, or choose a larger supported hoop. Source guides and reference images are excluded.",
      });
    }
  }
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
    issues: designIssues(project, warnings, diagnostics),
    diagnostics,
    order: prepared.units.map((o) => ({
      objectId: o.id,
      color: o.color,
      index: o.index,
      operationId: o.operationId || null,
      operationName: o.operationName || null,
    })),
  };
}
export function analyze(events, machine) {
  let stitches = 0,
    jumps = 0,
    trims = 0,
    changes = 0,
    stops = 0,
    stitchLength = 0,
    maxLength = 0,
    shortStitches = 0,
    zeroLength = 0,
    anchorStitches = 0,
    travelStitches = 0,
    jumpMoves = 0,
    jumpDistance = 0,
    redundantStitches = 0,
    prev = { x: 0, y: 0 },
    sewn = null;
  const jumpBreakdown = {
    initial: 0,
    betweenObjects: 0,
    betweenRegions: 0,
    withinRegions: 0,
    unclassified: 0,
  };
  for (const e of events) {
    const d = distance(prev, e);
    if (e.cmd === "stitch") {
      stitches++;
      stitchLength += d;
      maxLength = Math.max(maxLength, d);
      if (d < 0.3) shortStitches++;
      if (e.phase === "anchor") anchorStitches++;
      if (e.phase === "travel" || e.phase === "underlay-travel")
        travelStitches++;
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
    if (e.cmd === "jump") {
      jumps++;
      jumpDistance += d;
      if (d > 0) jumpMoves++;
      const kind = !sewn
        ? "initial"
        : !e.objectId || !sewn.objectId
          ? "unclassified"
          : e.objectId !== sewn.objectId
            ? "betweenObjects"
            : e.regionId !== sewn.regionId
              ? "betweenRegions"
              : "withinRegions";
      jumpBreakdown[kind]++;
    }
    if (e.cmd === "stitch") sewn = e;
    if (e.cmd === "trim") trims++;
    if (e.cmd === "color") changes++;
    if (e.cmd === "stop") stops++;
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
    stops,
    colors: events.length ? changes + 1 : 0,
    uniqueColors: new Set(
      events
        .filter((e) => e.cmd === "stitch")
        .map((e) => e.threadKey || e.color),
    ).size,
    manualChanges: changes,
    shortStitches,
    zeroLength,
    anchorStitches,
    travelStitches,
    jumpBreakdown,
    jumpMoves,
    jumpDistance,
    redundantStitches,
    thread: stitchLength / 1000,
    bounds: b,
    fits,
    maxLength,
    minutes:
      stitches / machine.speed + changes * 0.5 + stops * 0.5 + trims * 0.025,
  };
}
