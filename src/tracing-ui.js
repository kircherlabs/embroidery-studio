import { vectorizePixels } from "./importers.js";
import { bounds, uid } from "./model.js";
export async function traceDialog(file, ask, saved = null) {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 50000000) {
    bitmap.close();
    throw Error("Image exceeds 50 megapixels.");
  }
  const scale = Math.min(1, 384 / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height),
    source = {
      data: canvas.toDataURL("image/png"),
      name: saved?.name || file.name || "Traced image",
      width: canvas.width,
      height: canvas.height,
    };
  const number = (label, id, value, min, max, step = 1) =>
    `<label>${label}<input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`;
  const pending = ask(
    "Trace image to editable artwork",
    `<p>Reduce flat illustrations and logos to editable color regions. Adjust the preview before creating stitches. Source image is saved with the project.</p><div class="trace-compare"><figure><figcaption>Original reference</figcaption><img id="trace-original" alt="Original artwork"></figure><figure><figcaption>Editable vector preview</figcaption><canvas id="trace-preview" width="384" height="300"></canvas></figure></div><div class="trace-settings">${number("Thread colors", "raster-colors", saved?.settings?.colors || 5, 2, 10)}${number("Artwork width · mm", "raster-width", saved?.settings?.width || 70, 5, 200)}${number("Minimum island area · mm²", "trace-area", saved?.settings?.minArea ?? 0.1, 0, 5, 0.05)}${number("Simplification tolerance · mm", "trace-simplify", saved?.settings?.simplify ?? 0.08, 0, 0.5, 0.01)}${number("Opacity threshold · 0–254", "trace-alpha", saved?.settings?.alpha ?? 100, 0, 254)}<label class="inline"><input id="trace-smooth" type="checkbox" ${saved?.settings?.smoothing ? "checked" : ""}>Smooth edges</label></div><label class="inline"><input id="raster-bg" type="checkbox" ${saved?.settings?.removeBackground !== false ? "checked" : ""}>Remove dominant border color</label><p class="trace-status" id="trace-status" role="status"></p>`,
    "Create vector regions",
  );
  const $ = (id) => document.getElementById(id);
  $("trace-original").src = source.data;
  let result = null,
    settings = null,
    timer;
  const update = () => {
    clearTimeout(timer);
    try {
      if (
        ![
          "raster-colors",
          "raster-width",
          "trace-area",
          "trace-simplify",
          "trace-alpha",
        ].every((id) => $(id).checkValidity())
      )
        throw Error("Complete the tracing settings within the shown limits.");
      settings = {
        colors: Number($("raster-colors").value),
        width: Number($("raster-width").value),
        minArea: Number($("trace-area").value),
        simplify: Number($("trace-simplify").value),
        alpha: Number($("trace-alpha").value),
        smoothing: $("trace-smooth").checked,
        removeBackground: $("raster-bg").checked,
      };
      result = vectorizePixels(
        image,
        settings.colors,
        settings.removeBackground,
        settings.width,
        { ...settings, preservePixels: true },
      );
      const b = bounds(result.flatMap((o) => o.rings.flat())),
        c = $("trace-preview"),
        g = c.getContext("2d");
      g.clearRect(0, 0, c.width, c.height);
      const scale = Math.min(
        (c.width - 20) / (b.width || 1),
        (c.height - 20) / (b.height || 1),
      );
      g.save();
      g.translate(c.width / 2, c.height / 2);
      g.scale(scale, scale);
      for (const o of result) {
        g.beginPath();
        for (const r of o.rings) {
          r.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
          g.closePath();
        }
        g.fillStyle = o.color;
        g.fill("nonzero");
      }
      g.restore();
      $("trace-status").textContent =
        `${result.length} colors · ${result.reduce((n, o) => n + o.rings.length, 0)} contours · ${result.reduce((n, o) => n + o.rings.flat().length, 0)} nodes. Filtering is explicit; set area to 0 to preserve small islands.`;
      $("dialog-submit").disabled = false;
    } catch (e) {
      result = null;
      $("trace-status").textContent = e.message;
      $("dialog-submit").disabled = true;
    }
  };
  document.querySelectorAll("#dialog-content input").forEach((el) =>
    el.addEventListener("input", () => {
      clearTimeout(timer);
      $("dialog-submit").disabled = true;
      timer = setTimeout(update, 150);
    }),
  );
  update();
  const ok = await pending;
  clearTimeout(timer);
  if (ok) update();
  $("dialog-submit").disabled = false;
  if (!ok || !result) return null;
  const id = uid();
  for (const o of result) o.parentId = id;
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
  return result;
}
