import { OPERATION_TYPES } from "./operations.js";

export const METHOD_CATEGORIES = {
  run: "Running Stitch",
  fill: "Tatami Fill",
  satin: "Satin Stitching",
};
export const REINFORCEMENTS = {
  run: "Single pass",
  bean: "Bean stitch",
  triple: "Triple run",
};
export const SATIN_METHODS = {
  satin: "Satin Centerline",
  border: "Satin Border",
  column: "Satin Column",
};
export const CONSTRUCTION_METHODS = Object.fromEntries(
  ["placement", "tackdown", "basting", "contour", "marker", "stop", "trim"].map(
    (type) => [type, OPERATION_TYPES[type]],
  ),
);
export const METHOD_HELP = {
  run: "One line of stitches following the path. Sew along a line or shape outline.",
  bean: "Repeats each stitch segment locally to create a stronger-looking line. This changes this action, not the number of sewing actions.",
  triple:
    "Sews the whole path forward, backward, and forward again. This changes this action, not the number of sewing actions.",
  fill: "Fill an enclosed area with rows of stitching. Row spacing controls coverage density.",
  satin:
    "Sew a satin band along a drawn path. On closed artwork this follows each contour; it does not fill letter strokes.",
  border:
    "Sew a satin band around the edge of a closed shape, including counters unless Outer boundary only is enabled.",
  column:
    "Fill a narrow region with satin stitches crossing its width. Automatic stroke rails or existing manual direction controls define construction; unsuitable regions report their fallback.",
  placement:
    "Marks where a fabric piece or appliqué material should be positioned. Uses a running outline on a closed boundary.",
  tackdown:
    "Secures fabric before finishing embroidery. Uses a running outline with an editable inset; review tight or narrow boundaries.",
  basting:
    "Temporary stitches to stabilize or position material. Uses a long running outline with an editable outward offset.",
  contour:
    "Sew a running outline a specified distance inside or outside the artwork. Set Contour offset in Advanced: positive expands, negative insets.",
  marker:
    "Stitches a location cross. This is a reference mark; the machine does not cut or punch fabric.",
  stop: "Pause for operator action, such as positioning fabric. Rename this action to describe the task. PES uses repeated thread colors for stops.",
  trim: "Request a thread trim. This does not pause for fabric trimming; support depends on machine and format.",
};
export function methodCategory(type) {
  if (type in REINFORCEMENTS) return "run";
  if (type in SATIN_METHODS) return "satin";
  return type === "fill" ? "fill" : "construction";
}
const common = (items) =>
  items.length && items.every((x) => x === items[0]) ? items[0] : "";
export function methodOptions(
  items,
  selected,
  placeholder = "Mixed",
  blocked = () => false,
) {
  return `${selected in items ? "" : `<option value="" selected disabled>${placeholder}</option>`}${Object.entries(
    items,
  )
    .map(
      ([key, label]) =>
        `<option value="${key}" ${key === selected ? "selected" : ""} ${blocked(key) ? "disabled" : ""}>${label}</option>`,
    )
    .join("")}`;
}
// Presentation only: stored operation types and generator algorithms are unchanged.
export function methodPicker(
  types,
  { adding = false, pending = false, open = false, closed = false } = {},
) {
  const type = common(types),
    category = pending ? "satin" : common(types.map(methodCategory)),
    prefix = adding ? "add-" : "",
    categoryId = adding ? "add-operation" : "stitch-type";
  return `<label class="field">${adding ? "New sewing action" : "Stitch method"}<select id="${categoryId}" data-help="${category === "fill" ? METHOD_HELP.fill : category === "run" ? "Sew along a line or shape outline." : "Create smooth, closely spaced stitching along or across a shape."} Choose how this artwork is sewn: Running Stitch follows a line, Tatami Fill covers an area, and Satin Stitching offers three distinct constructions. ${adding ? "Adding creates one independent action." : "Changing a method updates this action, retaining its color and sewing position."}">${methodOptions(METHOD_CATEGORIES, category, category === "construction" ? "Advanced construction action" : "Mixed")}</select></label>
    <label class="field" id="${prefix}reinforcement-field" ${category === "run" ? "" : "hidden"}>Reinforcement<select id="${prefix}reinforcement" data-help="${METHOD_HELP[type in REINFORCEMENTS ? type : "run"]}">${methodOptions(REINFORCEMENTS, type)}</select></label>
    <div id="${prefix}satin-field" ${category === "satin" ? "" : "hidden"}><label class="field">Satin construction<select id="${prefix}satin-construction" aria-describedby="${prefix}satin-guidance" data-help="Choose deliberately: Centerline follows a drawn path, Border follows closed edges, and Column crosses a filled region's strokes. These retain different algorithms.">${methodOptions(SATIN_METHODS, pending ? "" : type, pending ? "Choose satin construction…" : "Mixed", (k) => adding && open && !closed && k !== "satin")}</select></label>
    <p class="property-note" id="${prefix}satin-guidance">${pending ? "Choose a construction to change this action. Current stitches are unchanged." : type === "satin" && closed ? "Centerline follows the contours of this closed artwork. Use Satin Column to span filled letter strokes." : type === "column" ? "Column spans a closed region. Inspect stroke construction and any fallback in Design Issues." : type in SATIN_METHODS ? METHOD_HELP[type] : "Choose the satin construction for this action."}${open ? " Border and Column need a closed area; Centerline can sew an open path." : ""}</p>${pending ? '<button id="cancel-satin-choice">Keep current method</button>' : ""}</div>`;
}
