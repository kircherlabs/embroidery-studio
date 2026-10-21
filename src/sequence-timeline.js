import { CLEANUP_COLORS, cleanupDescription } from "./manual-cleanup.js";
export function timelineWindow(total, start = 0, span = total) {
  span = Math.min(total, Math.max(Math.min(16, total), Math.round(span)));
  start = Math.max(0, Math.min(Math.max(0, total - span), Math.round(start)));
  return { start, span, end: start + span };
}
export function timelineMarkers(events, report) {
  const markers = [],
    cleanup = new Map((report?.candidates || []).map((c) => [c.endIndex, c]));
  let position = { x: 0, y: 0 };
  events.forEach((e, index) => {
    if (["jump", "trim", "color", "stop"].includes(e.cmd))
      markers.push({
        kind: e.cmd,
        index,
        event: e,
        length:
          e.cmd === "jump" ? Math.hypot(e.x - position.x, e.y - position.y) : 0,
      });
    if (cleanup.has(index))
      markers.push({ kind: "manual", index, candidate: cleanup.get(index) });
    if (["stitch", "jump"].includes(e.cmd)) position = e;
  });
  return markers;
}
const lane = { manual: 8, color: 21, stop: 21, trim: 32, jump: 43 };
export function clusterMarkers(markers, view, width, showManual = true) {
  const bins = new Map();
  for (const m of markers) {
    if (
      m.index < view.start ||
      m.index >= view.end ||
      (m.kind === "manual" && !showManual)
    )
      continue;
    const x =
      5 + ((m.index - view.start) / (view.span || 1)) * Math.max(1, width - 10);
    // Co-located color/stop markers share a cluster, so neither can hide the
    // other from pointer inspection; members keep their own type and index.
    const key = lane[m.kind] + ":" + Math.floor(x / 10);
    if (!bins.has(key))
      bins.set(key, { kind: m.kind, x, y: lane[m.kind], markers: [] });
    bins.get(key).markers.push(m);
  }
  return [...bins.values()];
}
export function installSequenceTimeline({ state, scrub, locate }) {
  const $ = (id) => document.getElementById(id),
    canvas = $("command-track"),
    tip = $("sequence-tooltip");
  let events = [],
    markers = [],
    groups = [],
    view = timelineWindow(0),
    report = null,
    selection = null,
    member = 0,
    page = 0;
  const describe = (m) =>
    m.kind === "manual"
      ? cleanupDescription(m.candidate, state.project.objects)
      : `${{ trim: report?.decoded && report?.format === "jef" ? "Inferred trim marker (JEF decoder)" : "Automatic trim command", jump: "Jump movement", color: "Thread / color change", stop: "Operator stop" }[m.kind]} · command ${m.index + 1} / ${events.length}${m.kind === "jump" ? ` · ${m.length.toFixed(1)} mm` : ""}${m.event?.operationName ? " · " + m.event.operationName : ""}${m.kind === "trim" ? ". Command/decoder marker shown, not proof of a physical cut." : ""}`;
  function cursor(n) {
    const index = Math.max(0, n - 1);
    const x =
      5 +
      ((index - view.start) / (view.span || 1)) *
        Math.max(1, canvas.clientWidth - 10);
    $("sequence-cursor").hidden =
      !events.length || index < view.start || index >= view.end;
    $("sequence-cursor").style.left = `${x}px`;
  }
  function choose(group, index = 0) {
    selection = group;
    member = (index + group.markers.length) % group.markers.length;
    const m = group.markers[member];
    if (m.kind === "manual") locate(m.candidate);
    else {
      state.cleanupSelected = null;
      scrub(m.index + 1);
    }
    $("sequence-detail").hidden = false;
    $("sequence-event-description").textContent =
      describe(m) +
      (group.markers.length > 1
        ? ` (${member + 1} of ${group.markers.length} nearby events; use ‹ / › or zoom.)`
        : "");
    $("sequence-overlap-prev").hidden = $("sequence-overlap-next").hidden =
      group.markers.length < 2;
  }
  function paint() {
    tip.hidden = true;
    const width = canvas.clientWidth;
    if (!width) return;
    const ratio = devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = 56 * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#192b24";
    ctx.fillRect(0, 0, width, 56);
    // One ordinary-stitch bin per screen pixel; significant events get separate lanes.
    const bins = new Uint32Array(Math.ceil(width));
    for (let i = view.start; i < view.end; i++)
      if (events[i]?.cmd === "stitch")
        bins[
          Math.min(
            bins.length - 1,
            Math.floor(
              5 + ((i - view.start) / (view.span || 1)) * (width - 10),
            ),
          )
        ]++;
    ctx.fillStyle = "#708b86";
    bins.forEach((count, x) => {
      if (count)
        ctx.fillRect(
          x,
          56 - Math.min(8, 2 + Math.log2(count + 1)),
          1,
          Math.min(8, 2 + Math.log2(count + 1)),
        );
    });
    groups = clusterMarkers(markers, view, width, state.showManualTrims);
    for (const g of groups) {
      const { x, y, kind } = g;
      ctx.strokeStyle = CLEANUP_COLORS[kind] || "#edf3e5";
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (kind === "manual") {
        const conditional = g.markers.every((m) => m.candidate.trimDependent);
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = conditional ? "#192b24" : CLEANUP_COLORS.manual;
        ctx.fill();
        ctx.strokeStyle = conditional ? CLEANUP_COLORS.manual : "#ffe8ce";
        ctx.stroke();
      } else if (kind === "trim") {
        ctx.moveTo(x - 3, y - 4);
        ctx.lineTo(x + 3, y + 4);
        ctx.moveTo(x + 3, y - 4);
        ctx.lineTo(x - 3, y + 4);
        ctx.stroke();
      } else if (kind === "stop") ctx.strokeRect(x - 3, y - 3, 6, 6);
      else if (kind === "color") {
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 3, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 3, y);
        ctx.closePath();
        ctx.stroke();
      } else ctx.fillRect(x - 2, y - 1, 4, 2);
      if (g.markers.length > 1) {
        ctx.fillStyle = "#edf3e5";
        ctx.fillRect(x - 2, y + 5, 4, 1);
      }
    }
    $("sequence-window-label").textContent = events.length
      ? `${view.start + 1}–${view.end} / ${events.length.toLocaleString()}`
      : "No commands";
    $("sequence-pan").hidden = view.span >= events.length;
    $("sequence-pan").max = Math.max(0, events.length - view.span);
    $("sequence-pan").value = view.start;
    $("sequence-zoom-out").disabled = view.span >= events.length;
    $("sequence-zoom-in").disabled = view.span <= Math.min(16, events.length);
    cursor(state.cursor);
  }
  function zoom(factor, anchor = Math.max(0, state.cursor - 1)) {
    const fraction = Math.max(
      0,
      Math.min(1, (anchor - view.start) / (view.span || 1)),
    );
    const span = view.span * factor;
    view = timelineWindow(events.length, anchor - fraction * span, span);
    paint();
  }
  function renderReport() {
    $("cleanup-count").textContent =
      `Potential manual trims: ${report?.candidates.length || 0}`;
    $("cleanup-assumptions").textContent =
      report?.assumptions || "No sequence available.";
    $("cleanup-breakdown").textContent = report
      ? `${report.untrimmed} without an effective trim · ${report.trimDependent} trim-dependent. Filled red = no effective trim; hollow/dashed red = inspect machine trim behavior.`
      : "";
    const list = $("cleanup-locations");
    list.replaceChildren();
    const all = report?.candidates || [],
      pages = Math.max(1, Math.ceil(all.length / 25));
    page = Math.min(page, pages - 1);
    if ($("cleanup-report").open)
      for (const c of all.slice(page * 25, page * 25 + 25)) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.cleanup = c.id;
        b.textContent = `${c.id + 1}. ${c.length.toFixed(1)} mm · command ${c.endIndex + 1}${c.trimDependent ? " · trim-dependent" : ""}`;
        b.setAttribute(
          "aria-label",
          cleanupDescription(c, state.project.objects),
        );
        b.onclick = () =>
          choose({
            markers: [{ kind: "manual", index: c.endIndex, candidate: c }],
          });
        list.append(b);
      }
    $("cleanup-pages").hidden = pages === 1;
    $("cleanup-page-label").textContent = `${page + 1} / ${pages}`;
    $("cleanup-prev").disabled = page === 0;
    $("cleanup-next").disabled = page === pages - 1;
  }
  $("cleanup-report").addEventListener("toggle", renderReport);
  $("cleanup-prev").onclick = () => {
    page--;
    renderReport();
  };
  $("cleanup-next").onclick = () => {
    page++;
    renderReport();
  };
  $("sequence-zoom-in").onclick = () => zoom(0.5);
  $("sequence-zoom-out").onclick = () => zoom(2);
  $("sequence-zoom-fit").onclick = () => {
    view = timelineWindow(events.length);
    paint();
  };
  $("sequence-pan").oninput = (e) => {
    view = timelineWindow(events.length, Number(e.target.value), view.span);
    paint();
  };
  $("sequence-overlap-prev").onclick = () =>
    selection && choose(selection, member - 1);
  $("sequence-overlap-next").onclick = () =>
    selection && choose(selection, member + 1);
  $("sequence-event-zoom").onclick = () =>
    selection && zoom(0.25, selection.markers[member].index);
  $("sequence-detail-close").onclick = () => {
    $("sequence-detail").hidden = true;
    canvas.focus();
  };
  const hit = (e) => {
    const b = canvas.getBoundingClientRect(),
      x = e.clientX - b.left,
      y = e.clientY - b.top;
    return groups
      .filter((g) => Math.abs(g.x - x) <= 7 && Math.abs(g.y - y) <= 7)
      .sort(
        (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
      )[0];
  };
  canvas.onpointermove = (e) => {
    const g = hit(e);
    tip.hidden = !g;
    if (g) {
      tip.textContent =
        describe(g.markers[0]) +
        (g.markers.length > 1
          ? ` ${g.markers.length} nearby events; click to inspect individually.`
          : "");
      tip.style.left = `${Math.max(8, Math.min(innerWidth - Math.min(340, innerWidth - 16) - 8, e.clientX - 80))}px`;
      tip.style.top = `${Math.max(8, e.clientY - tip.offsetHeight - 12)}px`;
    }
  };
  canvas.onpointerleave = () => (tip.hidden = true);
  canvas.onclick = (e) => {
    tip.hidden = true;
    const g = hit(e);
    if (g) choose(g, selection === g ? member + 1 : 0);
    else {
      state.cleanupSelected = null;
      const b = canvas.getBoundingClientRect();
      scrub(
        Math.min(
          events.length,
          Math.round(view.start + ((e.clientX - b.left) / b.width) * view.span),
        ),
      );
    }
  };
  canvas.onkeydown = (e) => {
    if (
      !["ArrowLeft", "ArrowRight", "+", "=", "-", "Home", "End"].includes(e.key)
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    tip.hidden = true;
    if (["+", "=", "-"].includes(e.key)) return zoom(e.key === "-" ? 2 : 0.5);
    const visible = markers.filter(
      (m) => m.kind !== "manual" || state.showManualTrims,
    );
    const current = selection?.markers[member];
    const at =
      current?.index + 1 === state.cursor ? visible.indexOf(current) : -1;
    const m =
      e.key === "Home"
        ? visible[0]
        : e.key === "End"
          ? visible.at(-1)
          : at >= 0
            ? visible[at + (e.key === "ArrowRight" ? 1 : -1)]
            : e.key === "ArrowRight"
              ? visible.find((m) => m.index >= state.cursor)
              : visible.findLast((m) => m.index < state.cursor - 1);
    if (m) {
      if (m.index < view.start || m.index >= view.end)
        view = timelineWindow(
          events.length,
          m.index - view.span / 2,
          view.span,
        );
      choose({ markers: [m] });
      paint();
    }
  };
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
      e.preventDefault();
      tip.hidden = true;
      if (e.shiftKey) {
        view = timelineWindow(
          events.length,
          view.start + (Math.sign(e.deltaY || e.deltaX) * view.span) / 4,
          view.span,
        );
        paint();
      } else {
        const b = canvas.getBoundingClientRect();
        zoom(
          e.deltaY < 0 ? 0.7 : 1.4,
          view.start + ((e.clientX - b.left) / b.width) * view.span,
        );
      }
    },
    { passive: false },
  );
  new ResizeObserver(paint).observe(canvas);
  document.addEventListener("scroll", () => (tip.hidden = true), true);
  return {
    update(nextReport) {
      const next = state.plan?.events || [];
      if (next !== events || nextReport !== report) {
        events = next;
        report = nextReport;
        markers = timelineMarkers(events, report);
        groups = [];
        view = timelineWindow(events.length);
        selection = null;
        page = 0;
        $("sequence-detail").hidden = true;
      }
      renderReport();
      paint();
    },
    cursor,
    paint,
    getView: () => ({
      ...view,
      groups: groups.map((g) => ({
        x: g.x,
        y: g.y,
        kind: g.kind,
        indices: g.markers.map((m) => m.index),
      })),
    }),
  };
}
