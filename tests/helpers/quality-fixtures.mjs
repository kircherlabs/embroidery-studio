import { object, ellipse } from "../../src/model.js";
import { makeOperation } from "../../src/operations.js";
import { makeFillSettings } from "../../src/fills/context.js";
import { makeRailSource } from "../../src/manual-satin.js";
import { identity, railRings } from "../../src/smart-geometry.js";

export const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
export const project = (objects, qualitySafeguards = false) => ({
  version: 1,
  name: "Stitch quality reference",
  machine: "se700",
  objects,
  planning: { smallDetail: 0, qualitySafeguards },
});
const art = (id, rings, props = {}) =>
  object(id, rings, {
    id,
    color: "#b74b59",
    angle: 0,
    compensation: 0,
    ...props,
  });
export const fillCounter = () =>
  art("counter", [rect(-15, -10, 30, 20), rect(-5, -5, 10, 10)]);
export const manualRing = (outer = 3, inner = 2.6) => {
  const c = (radius) => ({
    closed: true,
    frame: identity(),
    nodes: ellipse(0, 0, radius, radius, 128),
  });
  const satinRails = makeRailSource(c(outer), c(inner));
  const o = art("manual-ring", railRings(satinRails), {
    satinRails,
    closed: true,
    fillRule: "evenodd",
  });
  o.operations = [
    {
      ...makeOperation("column", o),
      id: "rails",
      columnMode: "rails",
      railUnderlay: "center",
      compensation: 0,
    },
  ];
  return o;
};
export function qualityFixtures() {
  const typed = (type, id, rings, props = {}) => {
    const o = art(id, rings, props);
    o.operations = [{ ...makeOperation(type, o), id: "action", ...props }];
    return o;
  };
  const textured = (method) => {
    const o = fillCounter();
    o.id = method;
    o.fillSettings = makeFillSettings(method, o);
    return o;
  };
  return {
    tatamiCounter: project([fillCounter()]),
    adjacentFills: project([
      art("left", [rect(-20, -10, 20, 20)]),
      art("right", [rect(0, -10, 20, 20)], { color: "#6689a5" }),
    ]),
    narrowNeck: project([
      art("neck", [
        [
          { x: -15, y: -12 },
          { x: 15, y: -12 },
          { x: 15, y: 12 },
          { x: 3, y: 12 },
          { x: 3, y: -8 },
          { x: -3, y: -8 },
          { x: -3, y: 12 },
          { x: -15, y: 12 },
        ],
      ]),
    ]),
    satinCurve: project([
      art("curve", [ellipse(0, 0, 3, 3, 128)], {
        type: "satin",
        closed: true,
        width: 4,
        cornerControl: true,
      }),
    ]),
    satinCorner: project([
      art(
        "corner",
        [
          [
            { x: -10, y: 10 },
            { x: -10, y: -10 },
            { x: 10, y: -10 },
          ],
        ],
        { type: "satin", closed: false, width: 3, cornerControl: true },
      ),
    ]),
    satinBorder: project([
      typed("border", "border", [rect(-10, -8, 20, 16)], {
        width: 2,
        cornerControl: true,
      }),
    ]),
    automaticColumn: project([
      typed(
        "column",
        "column",
        [rect(-12, -8, 24, 16), rect(-10, -6, 20, 12)],
        { columnMode: "stroke", cornerControl: true },
      ),
    ]),
    manualNarrow: project([manualRing()]),
    manualWide: project([manualRing(7, 3)]),
    decorativeTatami: project([textured("tatami")]),
    embossedCounter: project([textured("emboss")]),
    intentionalRun: project([
      art(
        "run",
        [
          [
            { x: -20, y: 0 },
            { x: 20, y: 0 },
          ],
        ],
        { type: "run", underlay: false, runStyle: "bean", closed: false },
      ),
    ]),
  };
}
