import { generate } from "../engine.js";
import { object } from "../model.js";
import { makeFillSettings } from "./context.js";
import { stampFillFeatures } from "./schema.js";
const cache = new Map(),
  n = (x) => Math.round(x * 100) / 100;
// Small, cached samples from the real generator. The browser never re-digitizes
// the user's design merely to render the method picker.
export function methodPreview(method) {
  if (cache.has(method)) return cache.get(method);
  const o = object(
    "Fill sample",
    [
      [
        { x: -12, y: -9 },
        { x: 12, y: -9 },
        { x: 12, y: 9 },
        { x: -12, y: 9 },
      ],
    ],
    {
      id: "fill-preview",
      closed: true,
      angle: 0,
      spacing: 1,
      length: 3,
      underlay: false,
      compensation: 0,
      tieIn: false,
      tieOff: false,
    },
  );
  o.fillSettings = makeFillSettings(
    method,
    o,
    method === "emboss" ? { strength: 1, scale: 4, repeat: 6 } : {},
  );
  const plan = generate(
    stampFillFeatures({
      version: 1,
      name: "Fill sample",
      machine: "se700",
      objects: [o],
    }),
  );
  const segments = [],
    needles = [];
  let at = null;
  for (const e of plan.events) {
    if (e.cmd === "jump") at = e;
    else if (e.cmd === "stitch") {
      if (at) segments.push(`M${n(at.x)},${n(at.y)}L${n(e.x)},${n(e.y)}`);
      if (["tatami", "emboss"].includes(method))
        needles.push(`<circle cx="${n(e.x)}" cy="${n(e.y)}" r=".14"/>`);
      at = e;
    }
  }
  const svg = `<svg viewBox="-13 -10 26 20" aria-hidden="true"><path d="${segments.join("")}" stroke="currentColor" stroke-width="${["tatami", "emboss"].includes(method) ? 0.06 : 0.14}" fill="none"/>${needles.length ? `<g fill="currentColor">${needles.join("")}</g>` : ""}</svg>`;
  cache.set(method, svg);
  return svg;
}
