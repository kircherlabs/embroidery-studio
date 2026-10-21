import {
  TEXTURES,
  FILL_METHODS,
  validateFillSettings,
  MEANDER_PRESETS,
} from "./schema.js";
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
const textures = TEXTURES;
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
const placement = (fills) =>
  `<details class="fill-placement"><summary>Pattern placement</summary><label class="field">Pattern anchor<select id="fill-anchor">${options({ object: "Follow artwork", global: "Shared canvas grid" }, common(fills.map((o) => o.fillSettings?.anchor || "object")))}</select></label><div class="two-col">${num("Origin X · mm", "originX", common(fills.map((o) => o.fillSettings?.frame?.[4] ?? 0)), -10000, 10000)}${num("Origin Y · mm", "originY", common(fills.map((o) => o.fillSettings?.frame?.[5] ?? 0)), -10000, 10000)}</div><p class="property-note">Follow artwork carries the pattern when moving or turning. Shared canvas grid stays fixed. Pattern dimensions stay in millimeters when resizing artwork.</p></details>`;
export function texturePreview(kind) {
  const s = {
      ...FILL_DEFAULTS.tatami,
      texture: kind,
      seed: 1,
      sequence: [0, 0.4, 0.1, 0.65],
    },
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
          )}</div></details>${advanced ? num("Pattern direction · degrees", "angle", common(fills.map((o) => o.fillSettings?.angle ?? o.angle)), -360, 360, 1) : ""}<div class="two-col">${["twill", "chevron", "wave"].includes(texture) ? field(texture === "wave" ? "Wave period · rows" : "Repeat · rows", "period", 2, 128, 1) : ""}${texture === "wave" ? field("Wave amplitude", "amplitude", 0, 1, 0.05) : ""}${texture === "progressive" ? field("Offset per row · fraction", "step", -1, 1, 0.01) : ""}${texture === "random" ? num("Random seed", "seed", common(fills.map((o) => o.fillSettings?.seed ?? 1)), 0, 2147483647, 1) + field("Random variation", "variation", 0, 0.15, 0.01) : ""}</div>${texture === "custom" ? `<label class="field">Row offsets · fractions<input id="fill-sequence" value="${esc(common(fills.map((o) => (o.fillSettings?.sequence || []).join(", "))))}" placeholder="0, 0.4, 0.1, 0.65" data-help="One offset per row, repeating. Enter 1–32 comma-separated fractions from 0 up to, but not including, 1; each is a fraction of the maximum segment length."></label>` : ""}<details class="fill-advanced"><summary>Pattern placement &amp; edge quality</summary><label class="field">Pattern anchor<select id="fill-anchor">${options({ object: "Follow artwork", global: "Shared canvas grid" }, common(fills.map((o) => o.fillSettings?.anchor || "object")))}</select></label><p class="property-note">Follow artwork carries the pattern through moves and turns. Shared canvas grid stays fixed, allowing adjacent regions to share a lattice. Sizes remain in millimeters.</p><div class="two-col">${num("Origin X · mm", "originX", common(fills.map((o) => o.fillSettings?.frame?.[4] ?? makeFillSettings("tatami", o).frame[4])), -10000, 10000)}${num("Origin Y · mm", "originY", common(fills.map((o) => o.fillSettings?.frame?.[5] ?? makeFillSettings("tatami", o).frame[5])), -10000, 10000)}${field("Boundary inset · mm", "inset", 0, 10, 0.1)}</div><label class="check"><input id="fill-edge" type="checkbox" ${fills.every((o) => o.fillSettings?.edgeOptimize) ? "checked" : ""} ${fills.some((o) => o.fillSettings?.edgeOptimize) && !fills.every((o) => o.fillSettings?.edgeOptimize) ? 'data-mixed="true"' : ""}>Redistribute short edge intervals</label><p class="property-note">Repositions needle penetrations while preserving row endpoints and maximum segment length. Narrow spans retain coverage and may remain short. This does not change row density.</p>${field("Minimum interval · mm", "edgeMinimum", 0, 1, 0.05)}</details>`
      : method === "contour"
        ? `<label class="field">Sew contours<select id="fill-direction">${options({ "outside-in": "Outside to inside", "inside-out": "Inside to outside" }, common(fills.map((o) => o.fillSettings?.direction || "outside-in")))}</select></label>${num("Boundary inset · mm", "inset", common(fills.map((o) => o.fillSettings?.inset ?? 0)), 0, 10)}<p class="property-note">Running loops follow successive insets. Spacing is the distance between loops; maximum segment length controls needle placement along each loop. Narrow tips and the final core may remain less covered. This method uses no dense-fill underlay or pull compensation.</p>`
        : method === "cross"
          ? `<div class="two-col">${num("Cross size · mm", "size", common(fills.map((o) => o.fillSettings?.size ?? 2)), 0.5, 10)}${num("Grid pitch · mm", "pitch", common(fills.map((o) => o.fillSettings?.pitch ?? 2)), 0.5, 20)}</div>${num("Grid direction · degrees", "angle", common(fills.map((o) => o.fillSettings?.angle ?? 0)), -360, 360, 1)}${num("Boundary inset · mm", "inset", common(fills.map((o) => o.fillSettings?.inset ?? 0)), 0, 10)}<p class="property-note">Complete Xs only; edge cells and counters are kept clear. Pitch must be at least the cross size. Every cross has the same top diagonal. Maximum segment length may subdivide long diagonals. No dense-fill underlay or pull compensation is used.</p>`
          : `<p class="property-note">${esc(FILL_METHODS[method] || "Mixed fill methods")}</p>`
  }${method === "meander" ? `<label class="field">Meander style<select id="fill-style">${options({ classic: "Classic Meander", fine: "Fine Stipple", open: "Open Stipple", organic: "Organic Meander", looping: "Looping Meander" }, common(fills.map((o) => o.fillSettings?.style || "classic")))}</select></label><div class="two-col">${num("Pattern scale · mm", "pitch", common(fills.map((o) => o.fillSettings?.pitch ?? 3)), 0.8, 20)}${num("Line spacing · mm", "lineSpacing", common(fills.map((o) => o.fillSettings?.lineSpacing ?? 1.2)), 0.4, 10)}${num("Curviness", "curviness", common(fills.map((o) => o.fillSettings?.curviness ?? 0.7)), 0, 1, 0.05)}${num("Random seed", "seed", common(fills.map((o) => o.fillSettings?.seed ?? 1)), 0, 2147483647, 1)}</div>${num("Pattern direction · degrees", "angle", common(fills.map((o) => o.fillSettings?.angle ?? 0)), -360, 360, 1)}${num("Boundary inset · mm", "inset", common(fills.map((o) => o.fillSettings?.inset ?? 0)), 0, 10)}<p class="property-note">Curved running paths provide open coverage. Scale controls wandering extent; line spacing separates paired branches. Organic uses irregular Poisson stations. Looping adds checked decorative loops. Styles reset scale, spacing and curvature; Undo restores previous values. No dense underlay is applied.</p>` : ""}${method === "emboss" ? `<label class="field">Needle-placement motif<select id="fill-motif">${options({ dots: "Dots", diamonds: "Diamonds", checker: "Checkerboard", lattice: "Lattice", diagonal: "Diagonal bands", waves: "Waves" }, common(fills.map((o) => o.fillSettings?.motif || "diamonds")))}</select></label><div class="two-col">${num("Motif scale · mm", "scale", common(fills.map((o) => o.fillSettings?.scale ?? 4)), 1, 50)}${num("Repeat spacing · mm", "repeat", common(fills.map((o) => o.fillSettings?.repeat ?? 6)), 1, 50)}${num("Motif emphasis", "strength", common(fills.map((o) => o.fillSettings?.strength ?? 0.5)), 0, 1, 0.05)}${num("Motif angle · degrees", "motifAngle", common(fills.map((o) => o.fillSettings?.motifAngle ?? 0)), -360, 360, 1)}</div>${num("Fill direction · degrees", "angle", common(fills.map((o) => o.fillSettings?.angle ?? 0)), -360, 360, 1)}<p class="property-note">Real needle penetrations form a surface texture; this is not raised padding. Emphasis is the fraction of rows pinned to motif edges. Row density remains unchanged. Close marks may be reduced to avoid thread buildup. For line motifs, scale/repeat adjust slope and lattice proportions.</p><details><summary>Motif placement</summary><div class="two-col">${num("Motif offset X · mm", "phaseX", common(fills.map((o) => o.fillSettings?.phaseX ?? 0)), -1000, 1000)}${num("Motif offset Y · mm", "phaseY", common(fills.map((o) => o.fillSettings?.phaseY ?? 0)), -1000, 1000)}${num("Boundary inset · mm", "inset", common(fills.map((o) => o.fillSettings?.inset ?? 0)), 0, 10)}</div></details>` : ""}${["cross", "meander", "emboss"].includes(method) ? placement(fills) : ""}<p class="property-note">${advanced ? "Expanded fill settings are active; spacing and length stay in millimeters." : "Classic, Brick and Aligned retain the original Tatami behavior until expanded settings are used."}</p><button id="fill-reset" type="button">Reset fill to Classic</button><p id="fill-input-error" role="status" class="property-note"></p></section>`;
}
export function bindFillControls(api, objects, single) {
  const targets = objects.flatMap((o) =>
    operationTargets(o, api.state, single)
      .filter((op) => op.type === "fill")
      .map((op) => ({ o, op })),
  );
  if (!targets.length) return;
  const ensure = (op, o) =>
    op.fillSettings ||
    makeFillSettings(
      "tatami",
      { ...o, ...op },
      { texture: op.pattern || "quarter" },
    );
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
          op.name = draft.name;
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
      if (kind === "custom" && !op.fillSettings.sequence)
        op.fillSettings.sequence = [0, 0.4, 0.1, 0.65];
      if (legacy.includes(kind)) op.pattern = kind;
    });
  const pattern = document.getElementById("fill-pattern");
  if (pattern) pattern.onchange = (e) => choose(e.target.value);
  const method = document.getElementById("fill-method");
  if (method)
    method.onchange = () =>
      change((op, o) => {
        const previous = op.fillSettings;
        op.fillSettings = makeFillSettings(
          method.value,
          { ...o, ...op },
          previous
            ? {
                anchor: previous.anchor,
                frame: previous.frame,
                angle: previous.angle,
                seed: previous.seed,
                inset: previous.inset,
              }
            : {},
        );
        if (["Tatami fill", ...Object.values(FILL_METHODS)].includes(op.name))
          op.name = FILL_METHODS[method.value];
      });
  const direction = document.getElementById("fill-direction");
  if (direction)
    direction.onchange = () =>
      change((op) => {
        op.fillSettings = { ...op.fillSettings, direction: direction.value };
      });
  const motif = document.getElementById("fill-motif");
  if (motif)
    motif.onchange = () =>
      change((op) => {
        op.fillSettings = { ...op.fillSettings, motif: motif.value };
      });
  const style = document.getElementById("fill-style");
  if (style)
    style.onchange = () =>
      change((op) => {
        op.fillSettings = {
          ...op.fillSettings,
          ...MEANDER_PRESETS[style.value],
          style: style.value,
        };
      });
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
          const cfg = ensure(op, o),
            key = el.dataset.fillParam;
          if (key === "originX" || key === "originY") {
            cfg.frame = [...cfg.frame];
            cfg.frame[key === "originX" ? 4 : 5] = value;
          } else cfg[key] = value;
          op.fillSettings = cfg;
        });
      }),
  );
  const sequence = document.getElementById("fill-sequence");
  if (sequence)
    sequence.onchange = () =>
      change((op, o) => {
        const parts = sequence.value.split(",").map((v) => v.trim());
        if (parts.some((v) => !v))
          throw Error("Enter comma-separated row offset fractions.");
        op.fillSettings = {
          ...ensure(op, o),
          texture: "custom",
          sequence: parts.map(Number),
        };
      });
  const anchor = document.getElementById("fill-anchor");
  if (anchor)
    anchor.onchange = () =>
      change((op, o) => {
        const current = ensure(op, o),
          fresh = makeFillSettings(
            "tatami",
            { ...o, ...op },
            { anchor: anchor.value },
          );
        op.fillSettings = {
          ...current,
          anchor: fresh.anchor,
          frame: fresh.frame,
          angle: fresh.angle,
        };
      });
  const edge = document.getElementById("fill-edge");
  if (edge) {
    edge.indeterminate = edge.dataset.mixed === "true";
    edge.onchange = () =>
      change((op, o) => {
        op.fillSettings = { ...ensure(op, o), edgeOptimize: edge.checked };
      });
  }
  const reset = document.getElementById("fill-reset");
  if (reset)
    reset.onclick = () =>
      change((op) => {
        delete op.fillSettings;
        op.pattern = "quarter";
      });
}
