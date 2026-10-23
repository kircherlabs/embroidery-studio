import { safeConnector } from "./geometry.js";
import { operationsOf, effectiveOperation } from "./operations.js";
// Read-only diagnostics. Never infer travel or trimming from stitch length alone.
export const CLEANUP_COLORS = {
  jump: "#82aacf",
  trim: "#e7b784",
  manual: "#ff7266",
};
const point = (e) => ({ x: e.x, y: e.y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function estimateCleanup(events, options = {}) {
  const candidates = [];
  const objects = new Map((options.objects || []).map((o) => [o.id, o]));
  let position = { x: 0, y: 0 },
    needle = null,
    jumps = null,
    trim = null,
    stopped = false,
    exposed = null;
  const add = (run, to, resumeIndex, kind) => {
    if (!run || !needle) return;
    const length =
      kind === "travel" ? run.movementLength : distance(run.from, to);
    if (length < 0.05) return; // Below half the existing machine coordinate quantum.
    const source = objects.get(to.objectId),
      ops = source ? operationsOf(source) : [],
      action =
        ops.find((a) => a.id === to.operationId) ||
        (ops.length === 1 ? ops[0] : null),
      cfg = action && effectiveOperation(source, action);
    // Keep these real thread connections inspectable, but distinguish the
    // generator's short within-region pattern repositioning from cleanup across
    // separate regions. This is NOT a claim that a connector is physically hidden.
    const internal =
      kind === "jump" &&
      !options.decoded &&
      !source?.machineSourceFormat &&
      source &&
      cfg &&
      ["fill", "column", "border"].includes(cfg.type) &&
      run.from.objectId === to.objectId &&
      run.from.operationId === to.operationId &&
      length <= Math.min(cfg.length || 2.5, 2.2) &&
      safeConnector(
        run.from,
        to,
        source.rings,
        0,
        [],
        source.fillRule || "evenodd",
      );
    const importedFormat = objects.get(to.objectId)?.machineSourceFormat;
    const sourceFormat = [
      "pes",
      "pec",
      "dst",
      "exp",
      "jef",
      "vp3",
      "xxx",
    ].includes(importedFormat)
      ? importedFormat
      : undefined;
    const format = options.format || sourceFormat || "unknown";
    // JEF's reader interpolates trims at 3 mm by default; these are not encoded
    // trim instructions. DST's trim convention is a sequence of jumps.
    const encoding =
      format === "jef"
        ? options.decoded
          ? "inferred"
          : "omitted"
        : format === "dst"
          ? "jump-encoded"
          : options.decoded
            ? "decoded"
            : ["pes", "pec", "exp", "vp3"].includes(format)
              ? "represented"
              : "unknown";
    if (trim !== null && options.trimBehavior === "effective") return;
    const trimDependent =
      trim !== null && !["omitted", "inferred"].includes(encoding);
    const reason =
      kind === "travel"
        ? "Explicitly identified exposed travel stitching; inspect before cutting sewn thread."
        : trim === null
          ? "No trim command separates the sewn anchors."
          : encoding === "omitted"
            ? "A trim was requested, but this JEF writer omits explicit trims."
            : encoding === "inferred"
              ? "The JEF decoder inferred a trim from jump travel; this is not proof of an encoded cut."
              : "A trim command is present; inspect only if the machine leaves this connection uncut.";
    candidates.push({
      id: candidates.length,
      kind,
      startIndex: run.startIndex,
      endIndex: run.endIndex,
      resumeIndex,
      from: point(run.from),
      to: point(to),
      ...(kind === "travel" ? { points: run.points.map(point) } : {}),
      length,
      movementLength: run.movementLength,
      jumpCommands: run.count,
      color: run.from.color,
      fromObjectId: run.from.objectId,
      toObjectId: to.objectId,
      fromRegionId: run.from.regionId,
      toRegionId: to.regionId,
      operationName: to.operationName,
      trimIndex: trim,
      trimDependent,
      internal: !!internal,
      encoding,
      format,
      sourceFormat,
      stopped,
      reason:
        (internal
          ? "Short internal pattern connection within this source region; not included in the external cleanup estimate. It may remain visible: inspect actual thread before cutting. "
          : "") +
        reason +
        (stopped ? " A stop alone does not cut the thread." : ""),
    });
  };
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.hoopStart) {
      position = point(e.hoopStart);
      needle = jumps = exposed = null;
      trim = null;
      stopped = false;
    }
    if (["color", "end"].includes(e.cmd)) {
      if (exposed) add(exposed, position, i, "travel");
      needle = jumps = exposed = null;
      trim = null;
      stopped = false;
      continue; // A new thread is not a connected bridge to the previous color.
    }
    if (e.cmd === "trim") {
      trim = i;
      continue;
    }
    if (e.cmd === "stop") {
      stopped = true;
      continue;
    }
    if (!["jump", "stitch"].includes(e.cmd)) continue;
    if (e.cmd === "jump") {
      if (exposed) {
        add(exposed, position, i, "travel");
        exposed = null;
      }
      if (needle) {
        jumps ||= {
          from: needle,
          startIndex: i,
          endIndex: i,
          count: 0,
          movementLength: 0,
        };
        jumps.count++;
        jumps.endIndex = i;
        jumps.movementLength += distance(position, e);
      }
    } else {
      if (jumps) {
        add(jumps, e, i, "jump");
        jumps = null;
      }
      const visible =
        e.phase === "exposed-travel" || e.travelVisibility === "exposed";
      if (visible && needle) {
        exposed ||= {
          from: needle,
          points: [needle],
          startIndex: i,
          endIndex: i,
          count: 0,
          movementLength: 0,
        };
        exposed.endIndex = i;
        exposed.points.push(e);
        exposed.movementLength += distance(position, e);
      } else if (exposed) {
        add(exposed, position, i, "travel");
        exposed = null;
      }
      needle = e;
      if (!exposed) {
        trim = null;
        stopped = false;
      }
    }
    position = e;
  }
  if (exposed) add(exposed, position, events.length - 1, "travel");
  return {
    candidates,
    format: options.format || "unknown",
    decoded: !!options.decoded,
    untrimmed: candidates.filter((c) => !c.trimDependent).length,
    trimDependent: candidates.filter((c) => c.trimDependent).length,
    internal: candidates.filter((c) => c.internal && !c.trimDependent).length,
    estimated: candidates.filter((c) => !c.internal && !c.trimDependent).length,
    assumptions: `${options.decoded ? "Decoded commands" : "Generated plan"} · ${(options.format || "unknown format").toUpperCase()}. Red locations are estimates, not guaranteed cuts. Trim requests/encoded commands do not prove physical execution.${options.format === "jef" ? " This JEF writer omits explicit trims; the decoder can infer trim markers from jumps." : options.format === "dst" ? " DST trims use jump sequences; interpretation depends on the machine." : ""}${options.machine === "se700" ? " SE700: the manual documents cutting at color completion when auto-cut is enabled; Studio cannot read that setting or verify same-color jump cuts." : " Machine trim settings are not available to Studio."} Color changes start a new thread; stops alone do not cut it. Known internal fill travel and ordinary sewing are excluded. Imported stitches cannot reveal hidden travel or later coverage. Initial/final thread tails are not counted.`,
  };
}

export function cleanupDescription(c, objects = []) {
  const names = new Map(objects.map((o) => [o.id, o.name]));
  const related = [names.get(c.fromObjectId), names.get(c.toObjectId)].filter(
    Boolean,
  );
  return `${c.internal ? "Internal pattern connection" : "Estimated manual cleanup"} · command ${c.endIndex + 1} · ${c.length.toFixed(1)} mm · ${c.color || "thread"}${related.length ? " · " + [...new Set(related)].join(" → ") : ""}${c.operationName ? " · " + c.operationName : ""}. ${c.reason} ${c.jumpCommands ? `${c.jumpCommands} jump command${c.jumpCommands === 1 ? "" : "s"}, ${c.movementLength.toFixed(1)} mm movement.` : "Travel stitching."} Trim: ${c.trimIndex === null ? "none" : `command ${c.trimIndex + 1}, ${c.encoding} in ${c.format.toUpperCase()}`}.${c.sourceFormat ? ` Imported ${c.sourceFormat.toUpperCase()} source; decoder trim interpretations may be approximate.` : ""}`;
}

export function drawCleanupOverlay(
  ctx,
  report,
  { scale, end, selected, included = () => true },
) {
  if (!report) return;
  ctx.save();
  const groups = new Map(),
    seen = new Set();
  let active = null;
  for (const c of report.candidates) {
    if (c.internal && c.id !== selected) continue;
    if (c.endIndex >= end || !included(c)) continue;
    if (c.id === selected) {
      active = c;
      continue;
    }
    const style = `${c.kind}:${c.trimDependent}`;
    // Exact coincident overlays need only one visual stroke. Counts and timeline
    // members remain intact; the selected occurrence is always drawn separately.
    if (!c.points) {
      const ends = [`${c.from.x},${c.from.y}`, `${c.to.x},${c.to.y}`].sort();
      const key = `${style}:${ends.join(":")}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    if (!groups.has(style)) groups.set(style, []);
    groups.get(style).push(c);
  }
  const draw = (items, strong = false) => {
    const c = items[0];
    ctx.setLineDash(
      c.kind === "travel"
        ? [2 / scale, 2 / scale]
        : c.trimDependent
          ? [5 / scale, 3 / scale]
          : [],
    );
    ctx.beginPath();
    for (const item of items) {
      ctx.moveTo(item.from.x, item.from.y);
      for (const p of item.points?.slice(1) || [item.to]) ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "#fff9ed";
    ctx.lineWidth = (strong ? 5 : 3) / scale;
    ctx.stroke();
    ctx.strokeStyle = "#c93636";
    ctx.lineWidth = (strong ? 2.6 : 1.5) / scale;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const item of items) {
      let x = (item.from.x + item.to.x) / 2,
        y = (item.from.y + item.to.y) / 2;
      if (item.points) {
        let remaining = item.length / 2;
        for (let i = 1; i < item.points.length; i++) {
          const a = item.points[i - 1],
            b = item.points[i],
            d = distance(a, b);
          if (remaining <= d && d) {
            x = a.x + ((b.x - a.x) * remaining) / d;
            y = a.y + ((b.y - a.y) * remaining) / d;
            break;
          }
          remaining -= d;
        }
      }
      const r = (strong ? 5 : 3.5) / scale;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = c.trimDependent ? "#fff9ed" : "#c93636";
    ctx.fill();
    ctx.strokeStyle = "#c93636";
    ctx.lineWidth = 1.5 / scale;
    ctx.stroke();
  };
  for (const items of groups.values()) draw(items);
  if (active) draw([active], true);
  ctx.restore();
}
