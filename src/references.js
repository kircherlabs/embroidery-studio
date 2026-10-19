import { object, uid } from "./model.js";
import { mapPoint } from "./smart-geometry.js";

export const isReference = (o) => o.type === "reference";
export function addReference(p, asset) {
  const assets = (p.referenceAssets ||= {});
  const id =
    Object.keys(assets).find((id) => assets[id].data === asset.data) || uid();
  assets[id] ||= asset;
  const scale = 80 / Math.max(asset.width, asset.height),
    frame = [asset.width * scale, 0, 0, asset.height * scale, 0, 0];
  const rings = [
    [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ].map(([x, y]) => mapPoint({ x, y }, frame)),
  ];
  const o = object(asset.name, rings, {
    type: "reference",
    locked: true,
    reference: { assetId: id, frame, opacity: 0.5 },
  });
  p.objects.unshift(o);
  return o;
}
export function pruneReferenceAssets(p) {
  if (!p.referenceAssets) return;
  const used = new Set(
    p.objects.filter(isReference).map((o) => o.reference.assetId),
  );
  for (const id of Object.keys(p.referenceAssets))
    if (!used.has(id)) delete p.referenceAssets[id];
}
export function validateReferences(p) {
  const assets = p.referenceAssets;
  if (
    assets !== undefined &&
    (!assets ||
      typeof assets !== "object" ||
      Array.isArray(assets) ||
      Object.keys(assets).length > 100)
  )
    throw Error("Invalid reference image assets.");
  let size = 0;
  for (const [id, a] of Object.entries(assets || {})) {
    if (
      !id ||
      ["__proto__", "constructor", "prototype"].includes(id) ||
      !a ||
      typeof a.data !== "string" ||
      a.data.length > 28000000 ||
      !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
        a.data,
      ) ||
      typeof a.name !== "string" ||
      a.name.length > 200 ||
      ![a.width, a.height].every(
        (v) => Number.isInteger(v) && v >= 1 && v <= 12000,
      ) ||
      a.width * a.height > 50000000 ||
      (a.optimized !== undefined && typeof a.optimized !== "boolean")
    )
      throw Error(
        "Invalid embedded reference image. Use PNG, JPEG or WebP up to 50 megapixels.",
      );
    size += a.data.length;
    if (size > 64000000)
      throw Error(
        "Reference images exceed 64 MB of embedded data. Optimize images or use fewer references.",
      );
  }
  for (const o of p.objects.filter(isReference)) {
    const r = o.reference;
    if (
      !r ||
      !assets ||
      !Object.hasOwn(assets, r.assetId) ||
      !Array.isArray(r.frame) ||
      r.frame.length !== 6 ||
      !r.frame.every(Number.isFinite) ||
      Math.abs(r.frame[0] * r.frame[3] - r.frame[1] * r.frame[2]) < 1e-8 ||
      !Number.isFinite(r.opacity) ||
      r.opacity < 0 ||
      r.opacity > 1 ||
      o.operations !== undefined ||
      o.commands !== undefined ||
      o.shape ||
      o.curve ||
      o.textSource ||
      o.rings?.length !== 1 ||
      o.rings[0].length !== 4
    )
      throw Error("Invalid reference layer.");
    const corners = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ].map(([x, y]) => mapPoint({ x, y }, r.frame));
    if (
      corners.some(
        (c, i) =>
          Math.hypot(c.x - o.rings[0][i].x, c.y - o.rings[0][i].y) > 1e-5,
      )
    )
      throw Error("Reference frame and bounds disagree.");
  }
}
