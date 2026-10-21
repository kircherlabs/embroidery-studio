import { TEXTURES, FILL_METHODS, validateFillSettings } from "./schema.js";
import { makeFillSettings, FILL_DEFAULTS } from "./context.js";
import { texturePhase } from "./tatami.js";
import { availableFillMethods } from "./registry.js";
import { fillRows } from "../engine.js";
import {
  materialize,
  operationTargets,
  effectiveOperation,
} from "../operations.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const legacy = ["quarter", "half", "aligned"];
const textures = Object.fromEntries(
  Object.entries(TEXTURES).filter(([id]) => id !== "custom"),
);
const common = (values) =>
  values.length && values.every((v) => v === values[0]) ? values[0] : "";
const options = (values, value) =>
  `${value === "" ? '<option value="" disabled selected>Mixed</option>' : ""}${Object.entries(
    values,
  )
    .map(
      ([id, name]) =>
        `<option value="${id}" ${id === value ? "selected" : ""}>${esc(name)}</option>`,
    )
    .join("")}`;
const num = (label, key, value, min, max, step = 0.1) =>
  `<label class="field"><span class="field-title">${label}</span><input id="fill-${key}" data-fill-param="${key}" type="number" value="${value ?? ""}" min="${min}" max="${max}" step="${step}" placeholder="Mixed"></label>`;
export function texturePreview(kind) {
  const s = { ...FILL_DEFAULTS.tatami, texture: kind, seed: 1 },
    ring = [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 22 },
      { x: 0, y: 22 },
    ];
  const rows = fillRows([ring], 2, 0, 8, 0, "evenodd", "quarter", null, 0, {
    fixed: true,
    phase: (r) => texturePhase(s, r),
  });
  return `<svg viewBox="-1 -1 50 24" aria-hidden="true">${rows.map((r) => `<path d="M${r.map((p) => `${p.x},${p.y}`).join("L")}" fill="none" stroke="currentColor" stroke-width=".25" opacity=".4"/>${r.map((p) => `<circle cx="${p.x}" cy="${p.y}" r=".65" fill="currentColor"/>`).join("")}`).join("")}</svg>`;
}
export function fillControls(control) {
  const fills = control.filter((o) => o.type === "fill");
  if (!fills.length) return "";
  const method = common(fills.map((o) => o.fillSettings?.method || "tatami")),
    texture = common(
      fills.map((o) => o.fillSettings?.texture || o.pattern || "quarter"),
    ),
    advanced = fills.some((o) => o.fillSettings),
    cfg = fills[0].fillSettings,
    methods = availableFillMethods();
  const field = (label, key, min, max, step) =>
    num(
      label,
      key,
      common(
        fills.map((o) => o.fillSettings?.[key] ?? FILL_DEFAULTS.tatami[key]),
      ),
      min,
      max,
      step,
    );
  return `<section class="fill-controls" aria-label="Fill settings">${Object.keys(methods).length > 1 ? `<label class="field">Fill method<select id="fill-method">${options(methods, method)}</select></label>` : ""}${fills.length !== control.length ? '<p class="property-note">Fill settings apply only to fill sewing actions; other methods stay unchanged.</p>' : ""}${
    method === "tatami"
      ? `<label class="field">Tatami texture<select id="fill-pattern">${options(textures, texture)}</select></label><details class="fill-pattern-picker"><summary>Browse texture samples</summary><div class="fill-textures">${Object.entries(
          textures,
        )
          .map(
            ([id, name]) =>
              `<button type="button" data-fill-texture="${id}" aria-pressed="${id === texture}" data-help="${esc(name)} changes actual needle placement across the fill rows.">${texturePreview(id)}<span>${esc(name)}</span></button>`,
          )
          .join(
            "",
          )}</div></details>${advanced ? num("Direction in artwork · degrees", "angle", common(fills.map((o) => o.fillSettings?.angle ?? o.angle)), -360, 360, 1) : ""}<div class="two-col">${["twill", "chevron", "wave"].includes(texture) ? field(texture === "wave" ? "Wave period · rows" : "Repeat · rows", "period", 2, 128, 1) : ""}${texture === "wave" ? field("Wave amplitude", "amplitude", 0, 1, 0.05) : ""}${texture === "progressive" ? field("Offset per row · fraction", "step", -1, 1, 0.01) : ""}${texture === "random" ? num("Random seed", "seed", common(fills.map((o) => o.fillSettings?.seed ?? 1)), 0, 2147483647, 1) + field("Random variation", "variation", 0, 0.15, 0.01) : ""}</div>`
      : `<p class="property-note">${esc(FILL_METHODS[method] || "Mixed fill methods")}</p>`
  }<p class="property-note">${advanced ? "Pattern placement follows the artwork; spacing and length stay in millimeters." : "Classic, Brick and Aligned retain the original Tatami behavior. Expanded textures use an artwork-attached grid."}</p><button id="fill-reset" type="button">Reset fill to Classic</button><p id="fill-input-error" role="status" class="property-note"></p></section>`;
}
export function bindFillControls(api, objects, single) {
  const targets = objects.flatMap((o) =>
    operationTargets(o, api.state, single)
      .filter((op) => op.type === "fill")
      .map((op) => ({ o, op })),
  );
  if (!targets.length) return;
  const change = (fn) => {
    try {
      const next = targets.map(({ o, op }) => {
        const effective = effectiveOperation(o, op),
          draft = structuredClone(effective);
        fn(draft, o);
        if (draft.fillSettings) validateFillSettings(draft.fillSettings);
        return { o, id: op.id, draft };
      });
      api.mutate(() => {
        for (const { o, id, draft } of next) {
          const ops = materialize(o),
            op = id === "base" ? ops[0] : ops.find((op) => op.id === id);
          if (!op) throw Error("Select the sewing action again.");
          op.pattern = draft.pattern || "quarter";
          if (draft.fillSettings)
            op.fillSettings = structuredClone(draft.fillSettings);
          else delete op.fillSettings;
        }
      });
    } catch (e) {
      document.getElementById("fill-input-error").textContent = e.message;
    }
  };
  const choose = (kind) =>
    change((op, o) => {
      if (!op.fillSettings && legacy.includes(kind)) {
        op.pattern = kind;
        return;
      }
      op.fillSettings = op.fillSettings
        ? { ...op.fillSettings, texture: kind }
        : makeFillSettings("tatami", { ...o, ...op }, { texture: kind });
      if (legacy.includes(kind)) op.pattern = kind;
    });
  const pattern = document.getElementById("fill-pattern");
  if (pattern) pattern.onchange = (e) => choose(e.target.value);
  document
    .querySelectorAll("[data-fill-texture]")
    .forEach((el) => (el.onclick = () => choose(el.dataset.fillTexture)));
  document.querySelectorAll("[data-fill-param]").forEach(
    (el) =>
      (el.onchange = () => {
        const value = Number(el.value);
        if (!el.value.trim() || !Number.isFinite(value)) {
          document.getElementById("fill-input-error").textContent =
            "Enter a finite fill value.";
          return;
        }
        change((op, o) => {
          op.fillSettings = op.fillSettings
            ? { ...op.fillSettings, [el.dataset.fillParam]: value }
            : makeFillSettings(
                "tatami",
                { ...o, ...op },
                { [el.dataset.fillParam]: value },
              );
        });
      }),
  );
  const reset = document.getElementById("fill-reset");
  if (reset)
    reset.onclick = () =>
      change((op) => {
        delete op.fillSettings;
        op.pattern = "quarter";
      });
}
