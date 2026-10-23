import {
  newLayout,
  suggestHoops,
  masterBounds,
  artworkForHooping,
} from "./multi-hoop-layout.js";
import { getMachine } from "./equipment.js";
import { uid } from "./model.js";
import { xml } from "./multi-hoop-templates.js";
const $ = (id) => document.getElementById(id);
export function installMultiHoop(api) {
  const { state, mutate, stage } = api;
  const panel = $("multi-hoop-controls");
  panel.innerHTML = `<div class="multi-heading"><strong>Multi-Hoop</strong><span>Standard rehooping · separate files</span><button id="multi-done">Done positioning</button><button id="multi-single">Use single hoop</button></div><div class="multi-row"><button id="multi-auto">Auto place fields</button><select id="multi-direction" aria-label="Add hoop direction"><option value="right">Right</option><option value="down">Below</option><option value="left">Left</option><option value="up">Above</option><option value="center">Design center</option></select><button id="multi-add">+ Add hoop</button><label>Overlap · mm<input id="multi-overlap" type="number" min="0" max="500" step="1"></label><label class="check"><input id="multi-registration" type="checkbox">Stitch registration marks</label></div><div class="multi-row"><label>Hooping<select id="multi-selected"></select></label><label>Center X · mm<input id="multi-x" type="number" step="0.1" min="-10000" max="10000"></label><label>Center Y · mm<input id="multi-y" type="number" step="0.1" min="-10000" max="10000"></label><button id="multi-up" aria-label="Sew hooping earlier">↑</button><button id="multi-down" aria-label="Sew hooping later">↓</button><button id="multi-remove">Remove</button><label>Stitch view<select id="multi-view"><option value="all">Assembled design</option><option value="selected">Selected hooping</option></select></label><button id="multi-preview">Stitch preview</button><button id="multi-export">Export hoopings…</button></div><details class="multi-advanced"><summary>Seams, assignments &amp; clearance</summary><div class="multi-row"><label>Split balance X · mm<input id="multi-seam-x" type="number" step="1" min="-500" max="500"></label><label>Split balance Y · mm<input id="multi-seam-y" type="number" step="1" min="-500" max="500"></label><label>Safety margin · mm<input id="multi-margin" type="number" step="0.5" min="0.5" max="20"></label><label>Whole artwork<select id="multi-object"></select></label><label>Assignment<select id="multi-assignment"></select></label></div><p class="property-note">Split balance moves the selected field’s ownership center without moving the physical hoop. Inspect regenerated stitches at joins. Overlap controls Auto place/Add only; it never duplicates embroidery. Margin reserves field clearance. Complete actions stay together; unsupported satin/rail or construction cuts require manual source editing.</p></details><p class="property-note" id="multi-summary" role="status"></p><div id="multi-issues"></div><p class="property-note">Drag numbered fields with Select; Alt bypasses 0.1 mm positioning. Done positioning restores normal artwork editing. Blue/green dashed outlines are actual fields; fine dashed lines are exclusive split domains. Red areas are uncovered source. Registration is temporary thread followed by a required operator pause. Templates and machine files are software-validated; physical rehooping needs a test sew-out.</p>`;
  let objectId = null;
  const selected = () =>
    state.project.multiHoop?.hoops.find(
      (h) => h.id === state.multiHoopSelected,
    );
  const edit = (fn) =>
    mutate(() => {
      const l = state.project.multiHoop;
      if (l) fn(l, selected());
    });
  const field = (id, value) => {
    if (document.activeElement !== $(id)) $(id).value = value;
  };
  function fit() {
    const m = getMachine(state.project),
      hs = state.project.multiHoop?.hoops || [],
      b = masterBounds(state.project);
    if (hs.length) {
      b.minX = Math.min(b.minX, ...hs.map((h) => h.x - m.width / 2));
      b.maxX = Math.max(b.maxX, ...hs.map((h) => h.x + m.width / 2));
      b.minY = Math.min(b.minY, ...hs.map((h) => h.y - m.height / 2));
      b.maxY = Math.max(b.maxY, ...hs.map((h) => h.y + m.height / 2));
      b.width = b.maxX - b.minX;
      b.height = b.maxY - b.minY;
    }
    stage.fitBounds(b);
  }
  function enter() {
    if (stage.draftEditing) {
      api.toast(
        "Finish or cancel the active drawing before positioning hoopings.",
      );
      return;
    }
    state.isolation = null;
    api.select([]);
    api.setTool("select");
    api.setMode("design");
    mutate(() => {
      state.project.multiHoop ||= newLayout(state.project);
      state.project.multiHoop.enabled = true;
      if (!state.project.multiHoop.hoops.length)
        state.project.multiHoop.hoops = suggestHoops(state.project);
    });
    state.multiHoopMode = true;
    render();
    fit();
    requestAnimationFrame(() => requestAnimationFrame(fit));
  }
  function finish() {
    state.multiHoopMode = false;
    render();
    stage.render();
  }
  $("multi-hoop-entry").onclick = enter;
  $("multi-done").onclick = finish;
  $("multi-single").onclick = () => {
    state.multiHoopMode = false;
    edit((l) => (l.enabled = false));
    state.multiHoopView = "all";
    render();
  };
  $("multi-auto").onclick = () => {
    edit((l) => {
      l.hoops = suggestHoops(state.project);
      l.assignments = {};
    });
    fit();
  };
  $("multi-add").onclick = () => {
    edit((l, h) => {
      if (l.hoops.length >= 64)
        throw Error(
          "Maximum 64 hooping regions; divide larger production manually.",
        );
      const m = getMachine(state.project),
        d = $("multi-direction").value,
        b = masterBounds(state.project),
        q = { id: uid(), x: h?.x || 0, y: h?.y || 0, seamX: 0, seamY: 0 };
      if (d === "center") {
        q.x = (b.minX + b.maxX) / 2;
        q.y = (b.minY + b.maxY) / 2;
      } else if (d === "left" || d === "right")
        q.x += (d === "left" ? -1 : 1) * (m.width - 2 * l.margin - l.overlap);
      else q.y += (d === "up" ? -1 : 1) * (m.height - 2 * l.margin - l.overlap);
      l.hoops.push(q);
      state.multiHoopSelected = q.id;
    });
    fit();
  };
  $("multi-selected").onchange = (e) => {
    state.multiHoopSelected = e.target.value;
    render();
    api.viewChanged();
  };
  for (const [id, key] of [
    ["multi-x", "x"],
    ["multi-y", "y"],
    ["multi-seam-x", "seamX"],
    ["multi-seam-y", "seamY"],
  ])
    $(id).onchange = (e) => {
      const v = Number(e.target.value),
        max = key.startsWith("seam") ? 500 : 10000;
      if (!Number.isFinite(v) || Math.abs(v) > max) {
        api.toast("Enter a valid position in millimeters.");
        render();
        return;
      }
      edit((l, h) => {
        if (h) h[key] = v;
      });
    };
  for (const [id, key, min, max] of [
    ["multi-overlap", "overlap", 0, 500],
    ["multi-margin", "margin", 0.5, 20],
  ])
    $(id).onchange = (e) => {
      const v = Number(e.target.value);
      if (!Number.isFinite(v) || v < min || v > max) {
        api.toast(`Use ${min}–${max} mm.`);
        render();
        return;
      }
      edit((l) => (l[key] = v));
    };
  $("multi-registration").onchange = (e) =>
    edit((l) => (l.registration = e.target.checked));
  $("multi-remove").onclick = () =>
    edit((l, h) => {
      if (!h) return;
      l.hoops = l.hoops.filter((q) => q !== h);
      for (const id of Object.keys(l.assignments || {}))
        if (l.assignments[id] === h.id) delete l.assignments[id];
    });
  const reorder = (d) =>
    edit((l, h) => {
      const i = l.hoops.indexOf(h),
        j = i + d;
      if (j >= 0 && j < l.hoops.length)
        [l.hoops[i], l.hoops[j]] = [l.hoops[j], l.hoops[i]];
    });
  $("multi-up").onclick = () => reorder(-1);
  $("multi-down").onclick = () => reorder(1);
  $("multi-view").onchange = (e) => {
    state.multiHoopView = e.target.value;
    api.viewChanged();
  };
  $("multi-preview").onclick = () => {
    api.setMode("preview");
    api.viewChanged();
    fit();
  };
  $("multi-export").onclick = () => api.exportPackage();
  $("multi-object").onchange = (e) => {
    objectId = e.target.value;
    render();
  };
  $("multi-assignment").onchange = (e) =>
    edit((l) => {
      l.assignments ||= {};
      if (e.target.value) l.assignments[objectId] = e.target.value;
      else delete l.assignments[objectId];
    });
  function render() {
    const l = state.project.multiHoop,
      active = !!l?.enabled;
    if (!active) state.multiHoopMode = false;
    const open = active && state.multiHoopMode;
    panel.hidden = !open;
    const card = $("machine-panel").closest("details");
    card.classList.toggle("multi-hoop-open", open);
    if (open) card.open = true;
    $("multi-hoop-badge").textContent = active
      ? `Multi-Hoop · ${l.hoops.length}`
      : "";
    $("multi-hoop-entry").textContent = active
      ? "Edit Multi-Hoop layout"
      : "Multi-Hoop…";
    if (!active) return;
    if (!selected()) state.multiHoopSelected = l.hoops[0]?.id || null;
    const h = selected(),
      bundle = state.multiHoopBundle;
    $("multi-selected").innerHTML = l.hoops
      .map((h, i) => {
        const s = bundle?.sections.find((s) => s.hoop.id === h.id);
        return `<option value="${xml(h.id)}">${i + 1} · ${s ? `${s.plan.stats.stitches.toLocaleString()} stitches${s.plan.stats.fits ? "" : " · exceeds field"}` : "regenerating…"}</option>`;
      })
      .join("");
    $("multi-selected").value = h?.id || "";
    field("multi-x", h?.x ?? 0);
    field("multi-y", h?.y ?? 0);
    field("multi-seam-x", h?.seamX || 0);
    field("multi-seam-y", h?.seamY || 0);
    field("multi-overlap", l.overlap);
    field("multi-margin", l.margin);
    $("multi-registration").checked = l.registration;
    $("multi-view").value = state.multiHoopView || "all";
    for (const id of [
      "multi-x",
      "multi-y",
      "multi-seam-x",
      "multi-seam-y",
      "multi-remove",
      "multi-up",
      "multi-down",
    ])
      $(id).disabled = !h;
    const objects = artworkForHooping(state.project);
    if (!objects.some((o) => o.id === objectId)) objectId = objects[0]?.id;
    $("multi-object").innerHTML = objects
      .map((o) => `<option value="${xml(o.id)}">${xml(o.name)}</option>`)
      .join("");
    $("multi-object").value = objectId || "";
    $("multi-assignment").innerHTML =
      '<option value="">Automatic / split if supported</option>' +
      l.hoops
        .map(
          (h, i) =>
            `<option value="${xml(h.id)}">Whole object → hooping ${i + 1}</option>`,
        )
        .join("");
    $("multi-assignment").value = l.assignments?.[objectId] || "";
    $("multi-summary").textContent = bundle
      ? `${l.hoops.length} fields · ${bundle.sections.filter((s) => s.plan.stats.stitches).length} sewing sections · ${bundle.splits.length} source partitions · ${bundle.problems.length} blocking issues. ${state.multiHoopView === "selected" ? "Sequence shows selected hooping." : "Sequence shows assembled hooping order."}`
      : state.generationError
        ? "Cannot regenerate: " + state.generationError
        : "Regenerating source sections…";
    $("multi-issues").replaceChildren();
    for (const issue of bundle?.problems || []) {
      const b = document.createElement("button");
      b.className = "multi-issue";
      b.textContent = issue.message;
      b.onclick = () => {
        if (issue.objectId) {
          finish();
          api.select(issue.objectId);
          stage.fitObjects(
            state.project.objects.filter((o) => o.id === issue.objectId),
          );
        } else if (issue.hoopId) {
          state.multiHoopSelected = issue.hoopId;
          render();
          stage.render();
        } else api.toast(issue.message);
      };
      $("multi-issues").append(b);
    }
    $("multi-export").disabled = !bundle || bundle.problems.length > 0;
  }
  return {
    enter,
    finish,
    render,
    fit,
    pick(p) {
      if (!state.multiHoopMode) return null;
      const hs = state.project.multiHoop.hoops,
        m = getMachine(state.project),
        k = stage.scale;
      const hits = hs
        .map((h, i) => ({
          h,
          i,
          dx: Math.abs(p.x - h.x),
          dy: Math.abs(p.y - h.y),
          label:
            p.x >= h.x - m.width / 2 &&
            p.x <= h.x - m.width / 2 + 30 / k &&
            p.y >= h.y - m.height / 2 &&
            p.y <= h.y - m.height / 2 + 30 / k,
        }))
        .filter(
          (q) => q.dx <= m.width / 2 + 5 / k && q.dy <= m.height / 2 + 5 / k,
        );
      hits.sort(
        (a, b) =>
          Number(b.label) - Number(a.label) ||
          Math.min(
            Math.abs(a.dx - m.width / 2),
            Math.abs(a.dy - m.height / 2),
          ) -
            Math.min(
              Math.abs(b.dx - m.width / 2),
              Math.abs(b.dy - m.height / 2),
            ) ||
          Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy),
      );
      const h = hits[0]?.h;
      if (h) {
        state.multiHoopSelected = h.id;
        render();
        api.viewChanged();
      }
      return h?.id || null;
    },
  };
}
