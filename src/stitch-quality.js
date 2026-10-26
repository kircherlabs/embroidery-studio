// Diagnostic only. Never filter commands or reinterpret intentional running,
// manual needle data, locks or anchors as construction faults.
const key = (e) => JSON.stringify([e.objectId ?? e.id, e.operationId]);
export const QUALITY_ISSUES = new Set([
  "fill-return",
  "satin-return",
  "satin-underlay-chords",
  "needle-crowding",
]);
export function stitchQuality(events, units, routing = []) {
  const sources = new Map(units.map((o) => [key(o), o])),
    groups = new Map(),
    issues = [];
  const base = (o) => ({
    objectId: o.id,
    objectName: o.name,
    operationId: o.operationId ?? null,
    operationName: o.operationName,
    severity: "warning",
  });
  for (const r of routing) {
    const k = key(r) + r.kind;
    let g = groups.get(k);
    if (!g) {
      g = { ...r, length: 0 };
      groups.set(k, g);
    }
    g.length += r.length;
  }
  for (const g of groups.values()) {
    const o = sources.get(key(g));
    if (!o) continue;
    issues.push({
      ...base(o),
      code: g.kind,
      eventIndex: g.eventIndex,
      message: `${g.length.toFixed(1)} mm of routing may remain visible because the connection returns through completed ${g.kind === "fill-return" ? "fill rows" : "satin branches"}.`,
      action:
        "Inspect this connection in Stitch preview. Enable Stitch quality safeguards to use separate movements when future coverage cannot be established; review jump threads and trim behavior before sewing.",
    });
  }
  groups.clear();
  let last = null;
  const underlayLocations = new Map();
  for (let index = 0; index < events.length; index++) {
    const e = events[index],
      o = sources.get(key(e));
    if (e.phase === "underlay" && !underlayLocations.has(key(e)))
      underlayLocations.set(key(e), index);
    if (
      e.cmd === "stitch" &&
      o &&
      (o.type === "fill" || o.type === "satin") &&
      !["tie", "anchor", "travel", "underlay-travel", "manual"].includes(
        e.phase,
      )
    ) {
      const k = key(e);
      let g = groups.get(k);
      if (!g) {
        g = {
          o,
          count: 0,
          short: 0,
          visits: new Map(),
          cells: new Map(),
          peak: 0,
          repeat: 0,
          eventIndex: index,
        };
        groups.set(k, g);
      }
      g.count++;
      const needle = `${Math.round(e.x * 10)},${Math.round(e.y * 10)}`;
      const visits = (g.visits.get(needle) || 0) + 1;
      g.visits.set(needle, visits);
      const cell = `${Math.floor(e.x)},${Math.floor(e.y)}`;
      const count = (g.cells.get(cell) || 0) + 1;
      g.cells.set(cell, count);
      g.peak = Math.max(g.peak, count);
      if (visits > g.repeat) {
        g.repeat = visits;
        g.eventIndex = index;
      }
      if (
        last &&
        last.objectId === e.objectId &&
        last.operationId === e.operationId
      ) {
        const d = Math.hypot(e.x - last.x, e.y - last.y);
        if (d > 1e-8 && d < 0.3 - 1e-8) g.short++;
      }
    }
    if (e.cmd === "stitch" || e.cmd === "jump") last = e;
  }
  const summaries = [];
  for (const o of sources.values()) {
    const n = o.manualRailAnalysis?.underlayBreaks;
    if (n > 0)
      issues.push({
        ...base(o),
        code: "satin-underlay-chords",
        eventIndex: underlayLocations.get(key(o)),
        message: `Curved satin underlay required ${n} extra path breaks after machine-grid validation. It may have gaps in support.`,
        action:
          "Inspect the underlay in Stitch preview. Enable Stitch quality safeguards to retain its curved contour; review the rails or choose center-only underlay for extremely narrow bands.",
      });
  }
  for (const g of groups.values()) {
    summaries.push({
      objectId: g.o.id,
      operationId: g.o.operationId,
      needles: g.count,
      short: g.short,
      maxVisits: g.repeat,
      peakPerSquareMm: g.peak,
    });
    // Conservative inspection thresholds, not universal material/needle limits.
    if (
      g.repeat >= 8 ||
      (g.peak >= 24 &&
        (g.repeat >= 4 || (g.short >= 12 && g.short / g.count > 0.1)))
    )
      issues.push({
        ...base(g.o),
        code: "needle-crowding",
        eventIndex: g.eventIndex,
        message: `Needle clustering: up to ${g.repeat} visits to one 0.1 mm grid position and ${g.peak} penetrations in a 1 mm square; ${g.short} non-lock stitches are shorter than 0.3 mm.`,
        action:
          "Inspect the highlighted turn or overlap. Use existing corner controls, enlarge a tight radius, split a difficult junction, or use running stitches for very fine detail. These are inspection estimates, not machine or fabric limits.",
      });
  }
  return { issues, summaries };
}
