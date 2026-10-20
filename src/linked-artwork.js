import { identity, mapPoint, sourceTransform } from "./smart-geometry.js";

// Links share geometry only. Every instance keeps independent sewing actions.
export function linkArtwork(copy, source) {
  if (["manual", "reference"].includes(source.type) || source.satinRails)
    throw Error(
      "Linked repeats support ordinary vector artwork and lettering. Use independent copies for paired satin rails, references or manual stitches.",
    );
  copy.linkedGeometry = source.linkedGeometry
    ? structuredClone(source.linkedGeometry)
    : { sourceId: source.id, frame: identity() };
  for (const k of ["shape", "curve", "textSource", "rounding", "effects"])
    delete copy[k];
}
export function syncLinkedArtwork(project) {
  const map = new Map(project.objects.map((o) => [o.id, o]));
  let detached = 0;
  for (const o of project.objects) {
    const link = o.linkedGeometry;
    if (!link) continue;
    const source = map.get(link.sourceId);
    // Deleting an original deliberately freezes copies at their last geometry.
    if (!source) {
      delete o.linkedGeometry;
      detached++;
      continue;
    }
    if (
      source === o ||
      source.linkedGeometry ||
      source.satinRails ||
      ["manual", "reference"].includes(source.type)
    )
      throw Error(
        "A geometry link must point directly to ordinary source artwork, not another link or paired rail.",
      );
    if (!source.rings?.length)
      throw Error("The linked original has no geometry.");
    o.rings = source.rings.map((r) => r.map((p) => mapPoint(p, link.frame)));
    if (
      o.rings.some((r) =>
        r.some(
          (p) =>
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            Math.abs(p.x) > 2000 ||
            Math.abs(p.y) > 2000,
        ),
      )
    )
      throw Error(
        "Linked geometry exceeds the project coordinate limits. Reduce its source or instance transform.",
      );
    o.fillRule = source.fillRule || "evenodd";
    o.closed = source.closed === true || source.type === "fill";
    o.type = source.type;
  }
  return detached;
}
export function resolvedLinkedProject(project) {
  if (!project.objects.some((o) => o.linkedGeometry)) return project;
  const copy = structuredClone(project);
  syncLinkedArtwork(copy);
  return copy;
}
export function unlinkArtwork(project, o) {
  if (!o.linkedGeometry) return;
  const { sourceId, frame } = o.linkedGeometry,
    source = project.objects.find((n) => n.id === sourceId);
  syncLinkedArtwork(project);
  if (source) {
    const data = {};
    for (const k of ["shape", "curve", "textSource", "rounding", "effects"])
      if (source[k]) data[k] = structuredClone(source[k]);
    sourceTransform(data, frame);
    Object.assign(o, data);
  }
  delete o.linkedGeometry;
}
