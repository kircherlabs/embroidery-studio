// Data-only validation. Do not import generators/model here (project import boundary).
export const FILL_CAPABILITY = "fills-1";
export const FILL_METHODS = {
  tatami: "Tatami",
  contour: "Contour Fill",
  meander: "Stipple / Meander",
  cross: "Cross Stitch",
  emboss: "Embossed Tatami",
  ripple: "Ripple Fill",
  spiral: "Spiral Fill",
};
export const TEXTURES = {
  quarter: "Classic · quarter stagger",
  half: "Brick · half offset",
  aligned: "Aligned / ribbed",
  twill: "Diagonal / twill",
  random: "Random / organic",
  wave: "Wave offset",
  third: "Third offset",
  fifth: "Fifth offset",
  progressive: "Progressive stagger",
  chevron: "Chevron / reversing stagger",
  custom: "Custom sequence",
};
export function unsupported(message) {
  const e = Error(message);
  e.code = "UNSUPPORTED_FEATURE";
  return e;
}
const common = { angle: [-360, 360], seed: [0, 2147483647], inset: [0, 10] };
const ranges = {
  tatami: {
    period: [2, 128],
    variation: [0, 0.15],
    amplitude: [0, 1],
    step: [-1, 1],
    edgeMinimum: [0, 1],
  },
  contour: {},
  meander: { pitch: [0.8, 20], curviness: [0, 1], variation: [0, 0.2] },
  cross: { size: [0.5, 10], pitch: [0.5, 20] },
  emboss: {
    scale: [1, 50],
    repeat: [1, 50],
    strength: [0, 1],
    motifAngle: [-360, 360],
    phaseX: [-1000, 1000],
    phaseY: [-1000, 1000],
  },
  ripple: { ratio: [0.2, 5], centerX: [-1000, 1000], centerY: [-1000, 1000] },
  spiral: { ratio: [0.2, 5], centerX: [-1000, 1000], centerY: [-1000, 1000] },
};
const enums = {
  anchor: ["object", "global"],
  texture: Object.keys(TEXTURES),
  direction: ["outside-in", "inside-out"],
  style: ["classic", "fine", "open", "organic", "looping"],
  motif: ["dots", "diamonds", "checker", "lattice", "diagonal", "waves"],
};
const extra = {
  tatami: ["texture", "sequence", "edgeOptimize"],
  contour: ["direction"],
  meander: ["style"],
  cross: [],
  emboss: ["motif"],
  ripple: ["clockwise"],
  spiral: ["clockwise"],
};
export function validateFillSettings(s) {
  if (
    !s ||
    typeof s !== "object" ||
    Array.isArray(s) ||
    s.version !== 1 ||
    !Object.hasOwn(FILL_METHODS, s.method)
  )
    throw unsupported(
      "Unsupported fill configuration. Open this artwork with a compatible Studio version.",
    );
  const numeric = { ...common, ...ranges[s.method] },
    allowed = new Set([
      "version",
      "method",
      "anchor",
      "frame",
      ...Object.keys(numeric),
      ...extra[s.method],
    ]);
  for (const [key, value] of Object.entries(s)) {
    if (!allowed.has(key))
      throw Error(`Unknown ${s.method} fill setting: ${key}.`);
    if (numeric[key]) {
      const [lo, hi] = numeric[key];
      if (
        !Number.isFinite(value) ||
        value < lo ||
        value > hi ||
        (["seed", "period"].includes(key) && !Number.isInteger(value))
      )
        throw Error(`Invalid fill ${key}; use ${lo}–${hi}.`);
    } else if (enums[key] && !enums[key].includes(value))
      throw Error(`Invalid fill ${key}.`);
  }
  if (
    s.frame !== undefined &&
    (!Array.isArray(s.frame) ||
      s.frame.length !== 6 ||
      s.frame.some((n) => !Number.isFinite(n) || Math.abs(n) > 10000) ||
      Math.abs(s.frame[0] * s.frame[3] - s.frame[1] * s.frame[2]) < 1e-10)
  )
    throw Error("Invalid fill pattern frame.");
  if (
    s.sequence !== undefined &&
    (!Array.isArray(s.sequence) ||
      s.sequence.length < 1 ||
      s.sequence.length > 32 ||
      s.sequence.some((n) => !Number.isFinite(n) || n < 0 || n >= 1))
  )
    throw Error("Use 1–32 custom offsets, each at least 0 and less than 1.");
  if (s.texture === "custom" && !s.sequence?.length)
    throw Error("Enter a custom stagger sequence.");
  for (const key of ["edgeOptimize", "clockwise"])
    if (s[key] !== undefined && typeof s[key] !== "boolean")
      throw Error(`Invalid fill ${key}.`);
  if (s.method === "cross" && (s.size ?? 2) > (s.pitch ?? 2))
    throw Error("Cross size cannot exceed grid spacing.");
  return s;
}
export const hasAdvancedFills = (p) =>
  (p.objects || []).some(
    (o) =>
      o &&
      (o.fillSettings !== undefined ||
        (Array.isArray(o.operations) &&
          o.operations.some((op) => op?.fillSettings !== undefined))),
  );
export function validateFillFeatures(p) {
  if (![1, 2].includes(p.version))
    throw unsupported(
      "Unsupported studio project version. Update Studio to open this design.",
    );
  const advanced = hasAdvancedFills(p);
  if (
    p.requires !== undefined &&
    (!Array.isArray(p.requires) ||
      p.requires.length > 8 ||
      p.requires.some((v) => v !== FILL_CAPABILITY))
  )
    throw unsupported(
      "This design requires features not supported by this Studio build.",
    );
  if (advanced && (p.version !== 2 || !p.requires?.includes(FILL_CAPABILITY)))
    throw Error(
      "Advanced fills require a version 2 project with the fills-1 capability.",
    );
  if (p.version === 2 && !p.requires?.includes(FILL_CAPABILITY))
    throw unsupported("Version 2 artwork must declare its fill capability.");
  for (const o of p.objects || []) {
    if (!o) continue;
    if (o.fillSettings !== undefined) {
      if (["manual", "reference"].includes(o.type))
        throw Error("Only vector artwork supports fill settings.");
      validateFillSettings(o.fillSettings);
    }
    for (const op of Array.isArray(o.operations) ? o.operations : [])
      if (op?.fillSettings !== undefined) {
        if (op.type !== "fill")
          throw Error("Fill settings belong to a fill sewing action.");
        validateFillSettings(op.fillSettings);
      }
  }
  return p;
}
// Called only for trusted edits/serialization, never to upgrade untrusted imports.
export function stampFillFeatures(p) {
  if (hasAdvancedFills(p)) {
    p.version = 2;
    p.requires = [FILL_CAPABILITY];
  } else if (p.version === 2) {
    p.version = 1;
    delete p.requires;
  }
  return p;
}
