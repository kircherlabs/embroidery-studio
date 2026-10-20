import {
  BRANDS,
  MACHINE_CATALOG,
  HOOPS,
  LEGACY_EQUIPMENT,
  SOURCES,
  fieldLabel,
  equipmentOf,
  machineOf,
  hoopOf,
  selectEquipment,
  loadEquipment,
  saveEquipment,
  validateCustom,
  FIELD_PRESETS,
} from "./equipment.js";
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const option = (v, n) => `<option value="${esc(v)}">${esc(n)}</option>`;
export function installEquipment(api) {
  let settings;
  try {
    settings = loadEquipment(localStorage);
  } catch (e) {
    settings = { version: 1, customMachines: [] };
    api.toast(
      "Equipment preferences could not be read. Saved data has not been replaced. Projects retain their equipment; save a project backup.",
    );
  }
  function persist(next) {
    try {
      if (next.default?.custom) {
        const latest = next.customMachines.find(
          (m) => m.id === next.default.machineId,
        );
        if (latest) {
          next.default.custom = structuredClone(latest);
          if (!latest.hoops.some((h) => h.id === next.default.hoopId))
            next.default.hoopId = latest.hoops[0].id;
        }
      }
      saveEquipment(localStorage, next);
      settings = next;
      return true;
    } catch (e) {
      api.toast("Could not save equipment preferences: " + e.message);
      return false;
    }
  }
  function models() {
    const all = [...Object.values(MACHINE_CATALOG), ...settings.customMachines];
    const m = machineOf(api.state.project);
    if (m && !all.some((x) => x.id === m.id)) all.push(m);
    return all;
  }
  function apply(id, hid) {
    const m = models().find((m) => m.id === id);
    if (!m) return;
    api.mutate(() =>
      selectEquipment(
        api.state.project,
        id,
        hid ||
          (m.id === equipmentOf(api.state.project).machineId
            ? equipmentOf(api.state.project).hoopId
            : null) ||
          (m.id === "generic"
            ? m.hoops[0]
            : typeof m.hoops[0] === "string"
              ? m.hoops[0]
              : m.hoops[0].id),
        m.verification === "user-provided" ? m : undefined,
      ),
    );
    api.fit();
  }
  $("equipment-center").onclick = () => api.command("center-design");
  $("equipment-view").onclick = () => api.fitDesign();
  $("machine-brand").innerHTML = Object.entries(BRANDS)
    .map(([id, n]) => option(id, n))
    .join("");
  $("machine-brand").onchange = () =>
    apply(models().find((m) => m.brand === $("machine-brand").value)?.id);
  $("machine").onchange = () => {
    const legacy = LEGACY_EQUIPMENT[$("machine").value];
    if (legacy) apply(...legacy);
    else apply($("machine").value);
  };
  $("machine-hoop").onchange = () =>
    apply(equipmentOf(api.state.project).machineId, $("machine-hoop").value);
  $("equipment-default").onclick = () => {
    const next = structuredClone(settings);
    next.default = structuredClone(equipmentOf(api.state.project));
    if (persist(next)) {
      api.toast("My Machine saved. New designs use this machine and hoop.");
      render();
    }
  };
  async function editor(existing, duplicate = false) {
    const selected = machineOf(api.state.project),
      h = hoopOf(api.state.project),
      base = existing ? structuredClone(existing) : null;
    const pending = api.ask(
      duplicate
        ? "Duplicate custom machine"
        : base
          ? "Edit custom machine"
          : "Custom machine & design field",
      `<p>These are your measurements, not manufacturer-verified compatibility. The field is the continuous sewing area, not the outside hoop size.</p><label>Profile name<input id="eq-name" required maxlength="160" value="${esc(base ? base.name + (duplicate ? " copy" : "") : "My embroidery machine")}"></label><label>Dimension preset<select id="eq-preset"><option value="">Custom dimensions</option>${FIELD_PRESETS.map(([w, h]) => option(w + "x" + h, `${w} × ${h} mm`)).join("")}</select></label><div class="field-pair"><label>Units<select id="eq-units">${option("mm", "Millimeters")}${option("in", "Inches")}</select></label><label>Field width<input id="eq-width" type="number" required min="5" max="1000" step="0.01" value="${base?.maxField.width || h.width}"></label><label>Field height<input id="eq-height" type="number" required min="5" max="1000" step="0.01" value="${base?.maxField.height || h.height}"></label></div><label>Preferred export format<select id="eq-format">${["pes", "pec", "dst", "exp", "jef", "vp3"].map((f) => option(f, f.toUpperCase())).join("")}</select></label><p class="property-note">Other formats remain available. Stitch planning uses a 7 mm application safety limit and an estimated sewing speed, not official machine specifications.</p><p id="eq-error" role="status"></p>`,
      "Save custom machine",
    );
    $("eq-format").value = base?.preferred || "pes";
    let unit = "mm";
    $("eq-units").onchange = () => {
      const next = $("eq-units").value,
        f = next === unit ? 1 : next === "in" ? 1 / 25.4 : 25.4;
      for (const id of ["eq-width", "eq-height"]) {
        const el = $(id);
        el.value = +(Number(el.value) * f).toFixed(4);
        el.min = next === "in" ? 5 / 25.4 : 5;
        el.max = next === "in" ? 1000 / 25.4 : 1000;
        el.step = "any";
      }
      unit = next;
    };
    $("eq-preset").onchange = () => {
      if (!$("eq-preset").value) return;
      const [w, h] = $("eq-preset").value.split("x").map(Number),
        f = unit === "in" ? 1 / 25.4 : 1;
      $("eq-width").value = +(w * f).toFixed(4);
      $("eq-height").value = +(h * f).toFixed(4);
    };
    let result;
    const submit = (e) => {
      if (e.submitter?.value !== "confirm") return;
      try {
        const f = unit === "in" ? 25.4 : 1,
          w = Number($("eq-width").value) * f,
          h = Number($("eq-height").value) * f,
          id = base && !duplicate ? base.id : "user-" + crypto.randomUUID(),
          oldHoops = base
            ? base.hoops.map((h, i) => ({
                ...h,
                id: duplicate ? id + "-hoop-" + i : h.id,
              }))
            : [];
        result = {
          id,
          brand: "generic",
          name: $("eq-name").value.trim(),
          verification: "user-provided",
          maxField: { width: w, height: h },
          formats: ["pes", "pec", "dst", "exp", "jef", "vp3"],
          preferred: $("eq-format").value,
          hoops: oldHoops.length
            ? oldHoops
            : [
                {
                  id: id + "-main",
                  name: "My hoop",
                  width: w,
                  height: h,
                  reposition: false,
                },
              ],
        };
        if (result.hoops.length === 1) {
          result.hoops[0].width = w;
          result.hoops[0].height = h;
        }
        validateCustom(result);
      } catch (err) {
        e.preventDefault();
        $("eq-error").textContent = err.message;
      }
    };
    $("dialog").querySelector("form").addEventListener("submit", submit);
    const ok = await pending;
    $("dialog").querySelector("form").removeEventListener("submit", submit);
    if (!ok || !result) return;
    const next = structuredClone(settings),
      index = next.customMachines.findIndex((x) => x.id === result.id);
    if (index < 0) next.customMachines.push(result);
    else next.customMachines[index] = result;
    if (persist(next)) {
      apply(result.id, result.hoops[0].id);
      render();
    }
  }
  $("equipment-new").onclick = () => editor();
  $("equipment-edit").onclick = () => editor(machineOf(api.state.project));
  $("equipment-copy").onclick = () =>
    editor(machineOf(api.state.project), true);
  $("equipment-delete").onclick = async () => {
    const m = machineOf(api.state.project);
    if (
      !(await api.ask(
        "Delete custom profile?",
        `<p>Remove ${esc(m.name)} from this device? Saved projects keep their own profile snapshot. This design will use a generic field; artwork is unchanged.</p>`,
        "Delete profile",
      ))
    )
      return;
    const next = structuredClone(settings);
    next.customMachines = next.customMachines.filter((x) => x.id !== m.id);
    if (next.default?.machineId === m.id) delete next.default;
    if (persist(next)) apply("generic", "field-100-100");
  };
  async function hoopEditor(edit = false) {
    const m = structuredClone(machineOf(api.state.project)),
      old = edit ? hoopOf(api.state.project) : null;
    if (m.verification !== "user-provided") return;
    const pending = api.ask(
      edit ? "Edit custom hoop" : "Save custom hoop",
      `<p>Continuous field within ${esc(m.name)}. No automatic split-hoop support.</p><label>Hoop name<input id="eq-hname" required maxlength="160" value="${esc(old?.name || "My hoop")}"></label><label>Width (mm)<input id="eq-hw" type="number" required min="5" max="${m.maxField.width}" step="0.1" value="${old?.width || m.maxField.width}"></label><label>Height (mm)<input id="eq-hh" type="number" required min="5" max="${m.maxField.height}" step="0.1" value="${old?.height || m.maxField.height}"></label>`,
      "Save hoop",
    );
    if (!(await pending)) return;
    const h = {
      id: old?.id || "hoop-" + crypto.randomUUID(),
      name: $("eq-hname").value.trim(),
      width: Number($("eq-hw").value),
      height: Number($("eq-hh").value),
      reposition: false,
    };
    if (old) m.hoops = m.hoops.map((x) => (x.id === old.id ? h : x));
    else m.hoops.push(h);
    try {
      validateCustom(m);
      const next = structuredClone(settings);
      next.customMachines = next.customMachines.filter((x) => x.id !== m.id);
      next.customMachines.push(m);
      if (persist(next)) apply(m.id, h.id);
    } catch (e) {
      api.toast(e.message);
    }
  }
  $("equipment-hoop-add").onclick = () => hoopEditor();
  $("equipment-hoop-edit").onclick = () => hoopEditor(true);
  $("equipment-hoop-delete").onclick = async () => {
    const m = structuredClone(machineOf(api.state.project)),
      e = equipmentOf(api.state.project);
    if (
      !(await api.ask(
        "Delete custom hoop?",
        `<p>Remove this hoop preset from ${esc(m.name)}? Existing saved projects retain their snapshot.</p>`,
        "Delete hoop",
      ))
    )
      return;
    m.hoops = m.hoops.filter((h) => h.id !== e.hoopId);
    const next = structuredClone(settings);
    next.customMachines = next.customMachines.filter((x) => x.id !== m.id);
    next.customMachines.push(m);
    if (persist(next)) apply(m.id, m.hoops[0].id);
  };
  function render() {
    const p = api.state.project,
      e = equipmentOf(p),
      m = machineOf(p),
      h = hoopOf(p);
    if (!m || !h) return;
    $("machine-brand").value = m.brand;
    const html =
      models()
        .map(
          (x) =>
            `<option value="${esc(x.id)}" ${x.brand !== m.brand ? "hidden" : ""}>${esc(x.model || x.name)}</option>`,
        )
        .join("") +
      ["brother130", "generic200"]
        .map((id) => `<option hidden value="${id}">Legacy ${id} field</option>`)
        .join("");
    if ($("machine").innerHTML !== html) $("machine").innerHTML = html;
    $("machine").value = e.machineId;
    const hoops =
      m.verification === "user-provided"
        ? m.hoops
        : m.hoops.map((id) => HOOPS[id]);
    const hh = hoops
      .map((x) => option(x.id, `${x.name} · ${fieldLabel(x)}`))
      .join("");
    if ($("machine-hoop").innerHTML !== hh) $("machine-hoop").innerHTML = hh;
    $("machine-hoop").value = e.hoopId;
    $("machine-summary").textContent = m.name;
    $("hoop-size").textContent = `${h.width} × ${h.height} mm`;
    $("equipment-notes").textContent =
      (m.brand === "generic"
        ? "User / generic design field; compatibility is not manufacturer-verified. "
        : "Manufacturer-documented field / selected hoop. Physical testing not confirmed for this profile. ") +
      (h.notes || "") +
      " Changing equipment never scales artwork. No automatic split-hoop workflow. Planning speed and 7 mm stitch limit are application estimates.";
    $("equipment-sources").innerHTML = (m.sources || [])
      .map(
        (id) =>
          `<a href="${esc(SOURCES[id].url)}" target="_blank" rel="noreferrer">${esc(SOURCES[id].title)} ↗</a>`,
      )
      .join("<br>");
    const custom = m.verification === "user-provided";
    for (const id of [
      "equipment-edit",
      "equipment-copy",
      "equipment-delete",
      "equipment-hoop-add",
      "equipment-hoop-edit",
    ])
      $(id).hidden = !custom;
    $("equipment-hoop-delete").hidden = !custom || m.hoops.length < 2;
    $("equipment-center").hidden = api.state.plan?.stats.fits !== false;
    $("equipment-view").hidden = api.state.plan?.stats.fits !== false;
    $("equipment-default").textContent =
      JSON.stringify(settings.default) === JSON.stringify(e)
        ? "My Machine ✓"
        : "Use as My Machine";
  }
  return {
    render,
    getSettings: () => structuredClone(settings),
    reload() {
      settings = loadEquipment(localStorage);
      render();
    },
    applyDefault(p) {
      if (settings.default) {
        p.machine = settings.default.machineId;
        p.equipment = structuredClone(settings.default);
      }
      return p;
    },
  };
}
