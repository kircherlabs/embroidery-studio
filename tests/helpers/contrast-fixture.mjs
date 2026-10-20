import { object } from "../../src/model.js";
import { makeOperation } from "../../src/operations.js";
import { curveRings, identity } from "../../src/smart-geometry.js";
export const rectangle = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
export function contrastLine(color = "#303e64") {
  const curve = {
    frame: identity(),
    closed: false,
    nodes: [
      { x: -26, y: -5, out: { x: -14, y: -12 } },
      { x: 0, y: -8, in: { x: -8, y: -12 }, out: { x: 12, y: -7 } },
      { x: 27, y: 8, in: { x: 20, y: 1 } },
    ],
  };
  const o = object("Satin centerline", curveRings(curve), {
    id: "line",
    type: "satin",
    color: "#e6ab43",
    curve,
    closed: false,
    width: 4,
    underlay: false,
  });
  o.operations = [
    {
      ...makeOperation("satin", o),
      id: "blue-satin",
      color,
      width: 4,
      underlay: false,
    },
  ];
  return o;
}
export function contrastProject(backgrounds = ["#e6ab43"], color = "#303e64") {
  return {
    version: 1,
    name: "Geometry contrast",
    machine: "se700",
    groups: [],
    planning: { smallDetail: 0, optimizeColors: true },
    objects: [
      ...backgrounds.map((c, i) =>
        object(
          "Background " + i,
          [
            rectangle(
              -40 + (i * 80) / backgrounds.length,
              -27,
              -40 + ((i + 1) * 80) / backgrounds.length,
              27,
            ),
          ],
          { id: "bg" + i, color: c, underlay: false, spacing: 0.5, angle: 35 },
        ),
      ),
      contrastLine(color),
    ],
  };
}
// Reconstructs the supplied screenshot's tilted, warm-colored flag and blue
// centerline scenario. No source project was provided with those screenshots.
export function cubanContrastProject() {
  const p = contrastProject();
  p.name = "Cuban flag contrast regression";
  const triangle = object(
    "Flag triangle",
    [
      [
        { x: -40, y: -27 },
        { x: -10, y: 0 },
        { x: -40, y: 27 },
      ],
    ],
    { id: "triangle", color: "#b74b59", underlay: false, spacing: 0.5 },
  );
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = (i * Math.PI) / 5 - Math.PI / 2,
      r = i % 2 ? 2.5 : 6;
    return { x: -31 + Math.cos(a) * r, y: Math.sin(a) * r };
  });
  p.objects.splice(
    1,
    0,
    object("Upper stripe", [rectangle(-40, -17, 40, -7)], {
      id: "stripe1",
      color: "#f1c26a",
      underlay: false,
    }),
    object("Lower stripe", [rectangle(-40, 7, 40, 17)], {
      id: "stripe2",
      color: "#f1c26a",
      underlay: false,
    }),
    triangle,
    object("Flag star", [star], {
      id: "star",
      color: "#fff4d7",
      underlay: false,
    }),
  );
  const a = (17 * Math.PI) / 180;
  for (const o of p.objects.filter((o) => o.id !== "line"))
    for (const ring of o.rings)
      for (const q of ring) {
        const x = q.x,
          y = q.y;
        q.x = x * Math.cos(a) - y * Math.sin(a);
        q.y = x * Math.sin(a) + y * Math.cos(a);
      }
  return p;
}
