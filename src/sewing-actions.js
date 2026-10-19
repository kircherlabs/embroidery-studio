import { operationsOf, isSewing } from "./operations.js";
import { curveRings } from "./smart-geometry.js";
import { fillPolygons } from "./geometry.js";

export function closingRings(o) {
  const rings = o.curve ? curveRings({ ...o.curve, closed: true }) : o.rings;
  const polygons = fillPolygons(rings, o.fillRule);
  return polygons?.length ? rings : null;
}
const phase = (op) =>
  op.constructionStage || (op.type === "border" ? "finish" : "prepare");
export function orderedActions(o) {
  const ops = [...operationsOf(o)];
  return o.constructionArtworkIds?.length
    ? ops.sort(
        (a, b) => Number(phase(a) === "finish") - Number(phase(b) === "finish"),
      )
    : ops;
}
export function actionNeighbor(o, id, delta) {
  const ops = orderedActions(o),
    at = ops.findIndex((op) => op.id === id),
    next = ops[at + delta];
  return next &&
    (!o.constructionArtworkIds?.length || phase(ops[at]) === phase(next))
    ? next
    : null;
}
export function moveAction(o, id, delta) {
  const next = actionNeighbor(o, id, delta);
  if (!next) return;
  const a = o.operations.findIndex((op) => op.id === id),
    b = o.operations.findIndex((op) => op.id === next.id);
  [o.operations[a], o.operations[b]] = [o.operations[b], o.operations[a]];
}
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function actionCards(o, active, collapsedKey) {
  const ops = orderedActions(o);
  if (!ops.length)
    return '<p class="property-note">No sewing actions. Add one to embroider this artwork.</p>';
  return ops
    .map((op, i) => {
      const selected = active?.id === op.id,
        open = selected && collapsedKey !== `${o.id}:${op.id}`;
      return `<article class="sewing-action ${selected ? "selected" : ""} ${op.enabled === false ? "disabled" : ""}" data-action="${esc(op.id)}" style="--action-thread:${isSewing(op) ? op.color || o.color : "#71836a"}">
      <div class="operation-row ${selected ? "active" : ""} ${ops.length === 1 ? "single-action" : ""}">
      <input type="checkbox" data-op-enabled="${esc(op.id)}" aria-label="Enable ${esc(op.name)}" ${op.enabled !== false ? "checked" : ""}>
      <button data-operation="${esc(op.id)}" id="action-heading-${esc(op.id)}" aria-expanded="${open}" aria-controls="action-body-${esc(op.id)}">${i + 1}. ${esc(op.name)}${o.constructionArtworkIds?.length ? `<small>${phase(op) === "finish" ? "After artwork" : "Before artwork"}</small>` : ""}${op.enabled === false ? "<small>Disabled</small>" : ""}</button>
      ${ops.length > 1 ? `<button data-op-action="up" data-op-id="${esc(op.id)}" aria-label="Move ${esc(op.name)} earlier" ${actionNeighbor(o, op.id, -1) ? "" : "disabled"}>↑</button><button data-op-action="down" data-op-id="${esc(op.id)}" aria-label="Move ${esc(op.name)} later" ${actionNeighbor(o, op.id, 1) ? "" : "disabled"}>↓</button>` : ""}
      <button data-op-action="copy" data-op-id="${esc(op.id)}" aria-label="Duplicate ${esc(op.name)}" ${ops.length >= 32 ? "disabled" : ""}>⧉</button><button data-op-action="delete" data-op-id="${esc(op.id)}" aria-label="Delete ${esc(op.name)}">×</button>
      </div><div class="action-body" id="action-body-${esc(op.id)}" aria-labelledby="action-heading-${esc(op.id)}" ${open ? "" : "hidden"}></div></article>`;
    })
    .join("");
}
