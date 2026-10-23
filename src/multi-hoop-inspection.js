import {
  effectiveOperation,
  operationsOf,
  operationLabel,
} from "./operations.js";
import { bounds } from "./model.js";

// Eligibility describes cutting through source interiors. Whole artwork and
// disconnected complete contours are considered before this check.
export function splitEligibility(o) {
  const actions = operationsOf(o)
    .filter((a) => a.enabled !== false)
    .map((a) => effectiveOperation(o, a));
  const blocked = (reason) => ({ kind: "unsupported", reason });
  if (o.type === "manual" || o.satinRails || o.constructionArtworkIds?.length)
    return blocked(
      "Manual needle commands, paired satin rails and linked construction must stay intact.",
    );
  if (!actions.length) return blocked("No enabled sewing actions.");
  if (
    actions.every(
      (a) =>
        a.type === "fill" &&
        ["tatami", "emboss"].includes(a.fillSettings?.method || "tatami") &&
        !(a.fillSettings?.inset > 0),
    )
  )
    return {
      kind: "fill",
      reason:
        "Closed source partition; shared fill phase and regenerated underlay. Inspect the butt seam.",
    };
  if (
    actions.every(
      (a) => ["run", "bean", "triple"].includes(a.type) && !a.offset,
    )
  )
    return {
      kind: "path",
      reason:
        "Source path fragments retain reinforcement; independent entry/exit ties are regenerated.",
    };
  const names = [...new Set(actions.map(operationLabel))].join(", ");
  return blocked(
    `${names} cannot be cut automatically: this construction or decorative fill stack would create artificial borders, reset a pattern, change offset/inset geometry or separate required controls. Keep complete contours together.`,
  );
}

export function seamInspections(bundle) {
  const out = [];
  for (const split of bundle.splits || []) {
    if (split.kind === "islands") continue;
    const parts = bundle.sections.flatMap((s) =>
      s.project.objects
        .filter((o) => o.id === split.objectId)
        .map((o) => ({
          s,
          b: bounds(
            o.rings
              .flat()
              .map((p) => ({ x: p.x + s.hoop.x, y: p.y + s.hoop.y })),
          ),
        })),
    );
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i],
          b = parts[j],
          minX = Math.max(a.b.minX, b.b.minX),
          maxX = Math.min(a.b.maxX, b.b.maxX),
          minY = Math.max(a.b.minY, b.b.minY),
          maxY = Math.min(a.b.maxY, b.b.maxY);
        if (minX > maxX + 0.002 || minY > maxY + 0.002) continue;
        out.push({
          objectId: split.objectId,
          hoopIds: [a.s.hoop.id, b.s.hoop.id],
          numbers: [a.s.number, b.s.number],
          bounds: {
            minX: minX - 6,
            maxX: maxX + 6,
            minY: minY - 6,
            maxY: maxY + 6,
            width: maxX - minX + 12,
            height: maxY - minY + 12,
          },
        });
      }
  }
  return out;
}
