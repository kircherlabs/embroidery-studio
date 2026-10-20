import { threadColors } from "./operations.js";
import { applyTracePalette } from "./image-tracing.js";
import { bounds, uid } from "./model.js";
import { paletteMapping } from "./image-colors.js";
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const dataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(Error("Could not preserve image source."));
    r.readAsDataURL(blob);
  });
export async function traceDialog(file, ask, saved = null) {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 50000000) {
    bitmap.close();
    throw Error("Image exceeds 50 megapixels.");
  }
  const originalWidth = bitmap.width,
    originalHeight = bitmap.height;
  const preview = URL.createObjectURL(file),
    old = saved?.settings || {},
    number = (label, id, value, min, max, step = 1) =>
      `<label>${label}<input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`;
  const pending = ask(
    "Trace image to editable artwork",
    `
    <p>Keep artwork by default. Uncheck shades to merge them; <strong>Make transparent</strong> deliberately removes color areas.</p>
    ${saved ? '<label>Apply changes as<select id="trace-apply-mode"><option value="palette">Palette only · preserve edited geometry and sewing actions</option><option value="new">Create a revised trace · keep existing artwork</option><option value="replace">Replace this trace · confirmation required</option></select></label><p class="property-note" id="trace-apply-note">Palette-only changes recolor matching traced paints. Geometry, existing holes/background removal, individual color overrides, sewing settings and order are preserved. Use a revised trace for background, contour or source-storage changes and to consolidate merged boundaries. Revised artwork fits within the current bounds without stretching, retaining center and shared rotation; resize it on canvas afterward.</p>' : ""}
    <div class="trace-workflow"><div class="trace-compare"><figure><figcaption>Original image</figcaption><img id="trace-original" alt="Original artwork"></figure><figure><figcaption id="trace-caption">Proposed editable artwork</figcaption><canvas id="trace-preview" width="440" height="300"></canvas></figure></div>
    <div class="trace-options"><div class="trace-settings"><label>Color detection<select id="trace-mode"><option value="reduced">Reduced Colors</option><option value="detailed">Detailed Colors</option></select></label><label>Target palette<select id="trace-target"><option value="4">4 colors</option><option value="6">6 colors</option><option value="8" selected>8 colors</option><option value="12">12 colors</option><option value="custom">Custom / detailed</option></select></label>${number("Maximum detected colors · 1–128", "raster-colors", old.colors || 16, 1, 128)}${number("Artwork width · mm", "raster-width", old.width || 70, 5, 200)}<label>Processing resolution · longest edge<select id="trace-resolution">${[192, 384, 640, 1024].map((n) => `<option value="${n}" ${(old.resolution || 384) === n ? "selected" : ""}>${n} pixels</option>`).join("")}</select></label><label>Palette order<select id="trace-sort"><option value="area">Largest area first</option><option value="lightness">Light to dark</option><option value="hex">Hexadecimal</option></select></label></div>
    <details><summary>Geometry, transparency & source storage</summary><div class="trace-settings">${number("Minimum color-island area · mm²", "trace-area", old.minArea ?? 0.1, 0, 5, 0.05)}${number("Simplification tolerance · mm", "trace-simplify", old.simplify ?? 0.04, 0, 0.5, 0.01)}${number("Opacity threshold · 0–254", "trace-alpha", old.alpha ?? 100, 0, 254)}<label class="inline"><input id="trace-smooth" type="checkbox" ${old.smoothing ? "checked" : ""}>Smooth exposed edges</label></div><p class="property-note">Tiny color islands merge into touching colors; transparent holes stay open. Shared color edges are protected from smoothing to prevent seams. Area 0 keeps every island. Higher resolution and more colors can create many stitches.</p><label>Saved image source<select id="trace-storage"><option value="original">Preserve original bytes</option><option value="optimized">Optimize to 2048 px PNG · original bytes not stored</option></select></label><p class="property-note">${bitmap.width} × ${bitmap.height} original pixels · ${(file.size / 1048576).toFixed(2)} MB. Processing resolution changes the trace, not the stored original. Large sources may exceed browser autosave; save a project backup.</p></details>
    <details open><summary>Background · kept by default</summary><label class="inline"><input id="raster-bg" type="checkbox">Detect and remove background · review first</label><label>Manual background color · border-connected areas only<select id="trace-background-color"><option value="-1">Keep background</option></select></label><p id="trace-background-info" class="property-note"></p><div id="trace-background-review" hidden><p>Red highlights the proposed removal. Identically colored enclosed details are preserved. Detection can mistake a patch border for background.</p><button type="button" id="trace-background-confirm">Confirm background removal</button><button type="button" id="trace-background-cancel">Keep background</button></div></details>
    <label class="inline"><input id="trace-match-threads" type="checkbox">Review physical thread matches after importing · optional personal catalogs</label>
    <div class="trace-palette-heading"><strong id="trace-palette-count">Detecting colors…</strong><button type="button" id="trace-retain-all">Retain all</button><button type="button" id="trace-undo" disabled>Undo palette edit</button></div><div id="trace-palette" class="trace-palette" aria-label="Detected color palette"></div><p id="trace-status" class="trace-status" role="status" aria-live="polite"></p></div></div>`,
    saved ? "Apply image changes" : "Create vector regions",
  );
  const $ = (id) => document.getElementById(id),
    worker = new Worker(new URL("./trace-worker.js", import.meta.url), {
      type: "module",
    }),
    canvas = document.createElement("canvas"),
    history = [];
  $("dialog").classList.add("trace-dialog");
  if (saved) $("raster-width").closest("label").hidden = true;
  $("trace-original").src = preview;
  $("trace-mode").value = old.mode || "detailed";
  $("trace-target").value = [4, 6, 8, 12].includes(old.colors || 16)
    ? String(old.colors || 16)
    : "custom";
  let choices = structuredClone(old.choices || {}),
    approved = Number.isInteger(old.background) ? old.background : -1,
    proposal = null,
    last = null,
    settings = null,
    revision = 0,
    timer = null,
    inFlight = false,
    queued = false,
    imageKey = null,
    closed = false;
  $("raster-bg").checked = approved >= 0;
  const snapshot = () => {
    history.push({ choices: structuredClone(choices), approved });
    $("trace-undo").disabled = false;
  };
  const valid = () =>
    [
      "raster-colors",
      "raster-width",
      "trace-area",
      "trace-simplify",
      "trace-alpha",
    ].every((id) => $(id).checkValidity());
  const read = () => ({
    colors: Number($("raster-colors").value),
    width: Number($("raster-width").value),
    minArea: Number($("trace-area").value),
    simplify: Number($("trace-simplify").value),
    alpha: Number($("trace-alpha").value),
    smoothing: $("trace-smooth").checked,
    removeBackground:
      $("trace-apply-mode")?.value !== "palette" && approved >= 0,
    background:
      $("trace-apply-mode")?.value === "palette" ? -1 : (proposal ?? approved),
    choices: structuredClone(choices),
    resolution: Number($("trace-resolution").value),
    mode: $("trace-mode").value,
  });
  const schedule = () => {
    revision++;
    $("dialog-submit").disabled = true;
    clearTimeout(timer);
    timer = setTimeout(request, 120);
  };
  const request = () => {
    if (closed) return;
    if (!valid()) {
      $("trace-status").textContent =
        "Complete settings within the shown limits.";
      return;
    }
    if (inFlight) {
      queued = true;
      return;
    }
    queued = false;
    settings = read();
    const resolution = settings.resolution,
      key = String(resolution);
    let image;
    if (key !== imageKey) {
      const s = Math.min(1, resolution / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * s));
      canvas.height = Math.max(1, Math.round(bitmap.height * s));
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      image = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height);
      imageKey = key;
    }
    inFlight = true;
    $("trace-status").textContent = "Updating colors and vector preview…";
    worker.postMessage({
      id: revision,
      image,
      settings,
      proposal: proposal !== null,
    });
  };
  const draw = (data) => {
    const c = $("trace-preview"),
      g = c.getContext("2d"),
      paletteOnly = $("trace-apply-mode")?.value === "palette";
    let display = data.objects,
      width = settings.width,
      height = (data.height / data.width) * width,
      center = { x: 0, y: 0 };
    if (paletteOnly && saved?.artwork) {
      display = saved.artwork
        .map((o) => ({
          ...o,
          ...(o.physicalThread
            ? { physicalThread: structuredClone(o.physicalThread) }
            : {}),
          operations: o.operations?.map((op) => structuredClone(op)),
        }))
        .filter((o) => o.visible !== false);
      applyTracePalette(
        display.filter((o) => !o.paletteLocked),
        data.palette,
        choices,
        old.palette,
      );
      const b = bounds(
        display.flatMap((o) =>
          o.type === "manual"
            ? o.commands.filter((e) => ["stitch", "jump"].includes(e.cmd))
            : o.rings.flat(),
        ),
      );
      width = b.width;
      height = b.height;
      center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    }
    const scale = Math.min(
      (c.width - 16) / (width || 1),
      (c.height - 16) / (height || 1),
    );
    g.clearRect(0, 0, c.width, c.height);
    g.save();
    g.translate(c.width / 2, c.height / 2);
    g.scale(scale, scale);
    g.translate(-center.x, -center.y);
    for (const o of display) {
      if (o.type === "manual") {
        g.beginPath();
        for (const e of o.commands) {
          if (e.cmd === "jump") g.moveTo(e.x, e.y);
          else if (e.cmd === "stitch") g.lineTo(e.x, e.y);
        }
        g.strokeStyle = o.color;
        g.lineWidth = 1 / scale;
        g.stroke();
        continue;
      }
      g.beginPath();
      for (const r of o.rings) {
        r.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
      }
      g.fillStyle =
        o.operations?.find(
          (op) => op.enabled !== false && ["fill", "column"].includes(op.type),
        )?.color ||
        o.operations?.find((op) => op.enabled !== false)?.color ||
        o.color;
      g.fill("nonzero");
    }
    g.restore();
    if (data.proposedMask) {
      const mask = document.createElement("canvas");
      mask.width = data.width;
      mask.height = data.height;
      const ctx = mask.getContext("2d"),
        pixels = ctx.createImageData(data.width, data.height);
      for (let i = 0; i < data.proposedMask.length; i++)
        if (data.proposedMask[i]) {
          pixels.data[i * 4] = 235;
          pixels.data[i * 4 + 3] = 125;
        }
      ctx.putImageData(pixels, 0, 0);
      g.drawImage(
        mask,
        (c.width - width * scale) / 2,
        (c.height - height * scale) / 2,
        width * scale,
        height * scale,
      );
    }
  };
  const renderPalette = (data) => {
    const el = $("trace-palette"),
      focused = document.activeElement?.closest("[data-color]"),
      restore = focused
        ? { color: focused.dataset.color, action: focused.dataset.action }
        : null,
      scroll = el.scrollTop,
      mapping = paletteMapping(data.palette, choices),
      retained = data.palette.filter(
        (p) => choices[p.hex]?.keep !== false && !choices[p.hex]?.transparent,
      ),
      sort = $("trace-sort").value,
      rows = data.palette
        .map((p, i) => ({ ...p, i }))
        .sort((a, b) =>
          sort === "lightness"
            ? b.lab[0] - a.lab[0]
            : sort === "hex"
              ? a.hex.localeCompare(b.hex)
              : b.count - a.count || a.i - b.i,
        );
    el.innerHTML = rows
      .map((p) => {
        const choice = choices[p.hex] || {},
          target = mapping[p.i];
        return `<div class="trace-color ${choice.transparent ? "is-transparent" : ""}"><label><input type="checkbox" data-color="${p.i}" data-action="keep" ${choice.keep !== false && !choice.transparent ? "checked" : ""} ${choice.transparent ? "disabled" : ""} aria-label="Retain ${p.hex} as a separate color" data-help="Unchecked colors merge into a retained color. Their artwork is kept."><span class="trace-swatch" style="background:${p.hex}"></span><span>${p.hex}<small>${((p.count / data.opaque) * 100).toFixed(1)}% of opaque image</small></span></label><div>${choice.transparent ? "Transparent · area removed" : target === p.i ? "Retained" : `→ ${data.palette[target].hex}`} ${choice.keep === false && !choice.transparent ? `<select data-color="${p.i}" data-action="target" aria-label="Merge target for ${p.hex}"><option value="">Closest retained color</option>${retained.map((p) => `<option value="${p.hex}" ${choice.target === p.hex ? "selected" : ""}>${p.hex}</option>`).join("")}</select>` : ""}</div><button type="button" data-color="${p.i}" data-action="transparent" ${$("trace-apply-mode")?.value === "palette" ? "disabled" : ""} aria-pressed="${!!choice.transparent}" data-help="Deliberately remove ALL areas of this color, including foreground details. For border-only removal use Background.">${choice.transparent ? "Restore color" : "Make transparent"}</button></div>`;
      })
      .join("");
    el.scrollTop = scroll;
    if (restore)
      el.querySelector(
        `[data-color="${restore.color}"][data-action="${restore.action}"]`,
      )?.focus({ preventScroll: true });
    let threads = data.objects.length;
    if ($("trace-apply-mode")?.value === "palette" && saved?.artwork) {
      const display = saved.artwork.map((o) => ({
        ...o,
        operations: o.operations?.map((op) => ({ ...op })),
      }));
      applyTracePalette(
        display.filter((o) => !o.paletteLocked),
        data.palette,
        choices,
        old.palette,
      );
      threads = new Set(
        display.filter((o) => o.visible !== false).flatMap(threadColors),
      ).size;
    }
    $("trace-palette-count").textContent =
      `${data.palette.length} detected · ${new Set(mapping.filter((i) => i >= 0)).size} retained · ${threads} resulting thread colors`;
    $("trace-background-color").innerHTML =
      '<option value="-1">Keep background</option>' +
      data.palette
        .map((p, i) => `<option value="${i}">${p.hex}</option>`)
        .join("");
    $("trace-background-color").value = String(proposal ?? approved);
  };
  worker.onmessage = ({ data }) => {
    if (closed) return;
    inFlight = false;
    if (data.id === revision) {
      if (data.error) {
        last = null;
        $("trace-status").textContent = data.error;
        $("dialog-submit").disabled = true;
      } else {
        last = data;
        renderPalette(data);
        draw(data);
        $("trace-background-info").textContent =
          `Background confidence: ${data.background.confidence}. ${data.background.reason}`;
        $("trace-background-review").hidden = proposal === null;
        $("trace-caption").textContent =
          proposal !== null
            ? "Background proposal · red area will be removed"
            : $("trace-apply-mode")?.value === "palette"
              ? "Color-only preview · existing edited geometry"
              : "Proposed editable artwork";
        const paletteOnly = $("trace-apply-mode")?.value === "palette";
        $("trace-status").textContent =
          `${data.objects.length} colors · ${data.contours} contours · ${data.nodes.toLocaleString()} nodes · ${data.cleaned} tiny-island pixels reassigned. ${data.nodes > 50000 || data.contours > 1500 ? "Complex trace: consider fewer colors, lower resolution or a larger minimum island area. " : ""}${proposal !== null ? "Confirm or cancel background removal before importing. " : ""}${data.coverage ? "" : "No artwork remains; restore a color."}`;
        const invalidSource =
          Math.max(bitmap.width, bitmap.height) > 12000 &&
          $("trace-storage").value === "original";
        if (invalidSource)
          $("trace-status").textContent =
            "Original image edges exceed 12,000 px. Choose Optimize in source storage before importing.";
        if (paletteOnly)
          $("trace-status").textContent =
            `Palette only: ${saved?.artwork?.length || 0} existing objects retained. Geometry edits and sewing actions are preserved. Choose a revised trace to consolidate merged contours.`;
        $("dialog-submit").disabled =
          proposal !== null || invalidSource || !data.objects.length;
      }
    }
    if (queued) request();
  };
  worker.onerror = (e) => {
    inFlight = false;
    last = null;
    $("trace-status").textContent =
      "Tracing worker failed. Close and retry at a lower resolution.";
    $("dialog-submit").disabled = true;
  };
  const edit = (i, action, value) => {
    if (!last) return;
    const key = last.palette[i].hex,
      previous = structuredClone(choices),
      c = choices[key] || {};
    snapshot();
    choices[key] = {
      ...c,
      ...(action === "keep"
        ? { keep: value }
        : action === "target"
          ? { target: value }
          : { transparent: !c.transparent, keep: true }),
    };
    try {
      paletteMapping(last.palette, choices);
      schedule();
    } catch (e) {
      choices = previous;
      history.pop();
      $("trace-undo").disabled = !history.length;
      $("trace-status").textContent = e.message;
      renderPalette(last);
    }
  };
  $("trace-palette").onchange = (e) => {
    const el = e.target;
    if (el.dataset.color !== undefined)
      edit(
        Number(el.dataset.color),
        el.dataset.action,
        el.type === "checkbox" ? el.checked : el.value,
      );
  };
  $("trace-palette").onclick = (e) => {
    const el = e.target.closest('[data-action="transparent"]');
    if (el) edit(Number(el.dataset.color), "transparent");
  };
  $("trace-retain-all").onclick = () => {
    snapshot();
    choices = {};
    schedule();
  };
  $("trace-undo").onclick = () => {
    const old = history.pop();
    if (!old) return;
    choices = old.choices;
    approved = old.approved;
    proposal = null;
    $("raster-bg").checked = approved >= 0;
    $("trace-undo").disabled = !history.length;
    schedule();
  };
  $("trace-sort").onchange = () => {
    if (last) renderPalette(last);
  };
  $("trace-mode").onchange = () => {
    $("raster-colors").value = $("trace-mode").value === "detailed" ? 16 : 8;
    $("trace-target").value =
      $("trace-mode").value === "detailed" ? "custom" : "8";
    choices = {};
    approved = -1;
    proposal = null;
    $("raster-bg").checked = false;
    schedule();
  };
  $("trace-target").onchange = () => {
    if ($("trace-target").value !== "custom") {
      $("raster-colors").value = $("trace-target").value;
      choices = {};
      approved = -1;
      proposal = null;
      $("raster-bg").checked = false;
      schedule();
    }
  };
  $("raster-bg").onchange = () => {
    if ($("raster-bg").checked && last?.background.color >= 0)
      proposal = last.background.color;
    else {
      snapshot();
      approved = -1;
      proposal = null;
      $("raster-bg").checked = false;
    }
    schedule();
  };
  $("trace-background-color").onchange = () => {
    const v = Number($("trace-background-color").value);
    if (v < 0) {
      snapshot();
      approved = -1;
      proposal = null;
      $("raster-bg").checked = false;
    } else {
      proposal = v;
      $("raster-bg").checked = true;
    }
    schedule();
  };
  $("trace-background-confirm").onclick = () => {
    snapshot();
    approved = proposal;
    proposal = null;
    schedule();
  };
  $("trace-background-cancel").onclick = () => {
    proposal = null;
    approved = -1;
    $("raster-bg").checked = false;
    schedule();
  };
  for (const id of [
    "raster-colors",
    "raster-width",
    "trace-area",
    "trace-simplify",
    "trace-alpha",
    "trace-smooth",
    "trace-storage",
    "trace-resolution",
    "trace-apply-mode",
  ]) {
    if (!$(id)) continue;
    $(id).addEventListener("input", () => {
      if (["raster-colors", "trace-alpha", "trace-resolution"].includes(id)) {
        choices = {};
        approved = -1;
        proposal = null;
        $("raster-bg").checked = false;
      }
      schedule();
    });
  }
  const syncApply = () => {
    const paletteOnly = $("trace-apply-mode")?.value === "palette";
    for (const id of [
      "raster-width",
      "trace-area",
      "trace-simplify",
      "trace-alpha",
      "trace-smooth",
      "trace-storage",
      "raster-bg",
      "trace-background-color",
    ]) {
      $(id).disabled = paletteOnly;
    }
  };
  $("trace-apply-mode")?.addEventListener("change", () => {
    if ($("trace-apply-mode").value !== "palette") {
      approved = -1;
      proposal = null;
      $("raster-bg").checked = false;
    }
    syncApply();
  });
  syncApply();
  const content = $("dialog-content"),
    keys = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !e.target.matches("input:not([type=checkbox]),textarea")
      ) {
        e.preventDefault();
        $("trace-undo").click();
      }
      if (
        e.key === "Enter" &&
        !e.repeat &&
        !/TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)
      ) {
        e.preventDefault();
        if (!$("dialog-submit").disabled) $("dialog-submit").click();
      }
    };
  content.addEventListener("keydown", keys);
  $("dialog-submit").disabled = true;
  request();
  let ok;
  try {
    ok = await pending;
  } finally {
    closed = true;
    clearTimeout(timer);
    worker.terminate();
    $("dialog").classList.remove("trace-dialog");
    content.removeEventListener("keydown", keys);
    URL.revokeObjectURL(preview);
    $("dialog-submit").disabled = false;
  }
  if (!ok || !last) {
    bitmap.close();
    return null;
  }
  const applyMode = $("trace-apply-mode")?.value || "new",
    optimize = $("trace-storage").value === "optimized";
  let source;
  try {
    if (optimize) {
      const s = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * s));
      canvas.height = Math.max(1, Math.round(bitmap.height * s));
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      source = {
        data: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
        optimized: true,
      };
    } else
      source = {
        data: await dataURL(file),
        width: bitmap.width,
        height: bitmap.height,
        optimized: false,
      };
  } finally {
    bitmap.close();
  }
  source.originalWidth = saved?.originalWidth || originalWidth;
  source.originalHeight = saved?.originalHeight || originalHeight;
  source.originalBytes = saved?.originalBytes || file.size;
  source.name = (saved?.name || file.name || "Traced image").slice(0, 200);
  settings = {
    ...settings,
    background: applyMode === "palette" ? -1 : approved,
    removeBackground: applyMode !== "palette" && approved >= 0,
    choices: structuredClone(choices),
    palette: last.palette.map((p) => p.hex),
  };
  const result = last.objects,
    id = uid();
  result.forEach((o) => (o.parentId = id));
  result.groups = [
    {
      id,
      kind: "svg",
      name: source.name,
      visible: true,
      parentId: null,
      imageSource: source,
      traceSettings: settings,
    },
  ];
  result.matchThreads = $("trace-match-threads").checked;
  result.applyMode = applyMode;
  result.palette = last.palette;
  result.choices = choices;
  return result;
}
