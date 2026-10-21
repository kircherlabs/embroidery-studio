import { object, validateProject } from "../../src/model.js";
import { smartShape } from "../../src/creative.js";
import { identity, curveRings, railRings } from "../../src/smart-geometry.js";
import { makeOperation } from "../../src/operations.js";
import { makeRailSource } from "../../src/manual-satin.js";
import { regeneratePathText } from "../../src/text-path.js";
import { setArtworkEffects } from "../../src/artwork-effects.js";
import { linkArtwork, syncLinkedArtwork } from "../../src/linked-artwork.js";
import { assignThread, threadTargets } from "../../src/thread-assignment.js";
import { builtinThreads } from "../../src/thread-records.js";
export const square = (r) => [
  { x: -r, y: -r },
  { x: r, y: -r },
  { x: r, y: r },
  { x: -r, y: r },
];
export function artworkFixture() {
  const hole = object("Fill with hole", [square(12), square(5)], {
    fillRule: "evenodd",
    closed: true,
    underlay: false,
  });
  hole.operations = [
    makeOperation("fill", hole),
    { ...makeOperation("border", hole), color: "#ff0055" },
  ];
  assignThread(
    threadTargets([hole], { activeOperationId: hole.operations[0].id }, true),
    builtinThreads()[0],
  );
  const shape = smartShape("star", 30, 28),
    curve = {
      closed: false,
      frame: identity(),
      nodes: [
        { x: -20, y: 20, out: { x: -10, y: 5 }, mode: "smooth" },
        { x: 20, y: 20, in: { x: 10, y: 35 }, mode: "smooth" },
      ],
    };
  const pen = object("Bezier", curveRings(curve), {
    type: "satin",
    curve,
    closed: false,
  });
  pen.operations = ["run", "bean", "triple", "satin"].map((t) =>
    makeOperation(t, pen),
  );
  const rail = (y) => ({
      nodes: [
        { x: -15, y },
        { x: 15, y: y + 2 },
      ],
      closed: false,
      frame: identity(),
    }),
    satinRails = makeRailSource(rail(-22), rail(-18));
  const satin = object("Rails", railRings(satinRails), {
    satinRails,
    closed: true,
  });
  satin.operations = [
    {
      ...makeOperation("column", satin),
      columnMode: "rails",
      satinGuides: [{ a: { x: 0, y: -21 }, b: { x: 0, y: -17 } }],
    },
  ];
  const text = object("Live lettering", [square(2)], {
    textSource: {
      content: "O",
      font: "serif",
      height: 6,
      tracking: 0,
      lineSpacing: 1.2,
      align: "left",
      frame: identity(),
      glyphs: [{ advance: 5, rings: [square(2), square(1)] }],
      path: {
        curve: {
          nodes: [
            { x: -10, y: 0 },
            { x: 10, y: 0 },
          ],
          closed: false,
          frame: identity(),
        },
        offset: 0,
        normal: 0,
        reverse: false,
      },
    },
  });
  regeneratePathText(text);
  const effect = smartShape("rect", 14, 8);
  setArtworkEffects(effect, { offset: 0.2, simplify: 0.01 });
  const linked = structuredClone(shape);
  linked.id = "linked-copy";
  linked.name = "Linked star";
  linkArtwork(linked, shape);
  linked.linkedGeometry.frame = [0, -1, 1, 0, 15, 2];
  const boundary = smartShape("rect", 70, 65);
  boundary.name = "Patch boundary";
  boundary.constructionArtworkIds = [
    hole.id,
    shape.id,
    pen.id,
    satin.id,
    text.id,
    effect.id,
    linked.id,
  ];
  boundary.operations = ["placement", "stop", "tackdown", "border"].map((t) =>
    makeOperation(t, boundary),
  );
  const manual = object("Manual", [], {
    type: "manual",
    commands: [
      { x: -2, y: 0, cmd: "jump" },
      { x: 2, y: 0, cmd: "stitch" },
      { x: 2, y: 0, cmd: "trim" },
      { x: 2, y: 0, cmd: "stop" },
    ],
  });
  const p = {
    version: 1,
    name: "Editable library fixture",
    machine: "se700",
    groups: [
      { id: "outer", name: "Wildlife Patch", kind: "group" },
      { id: "inner", name: "SVG children", kind: "svg", parentId: "outer" },
    ],
    objects: [hole, shape, pen, satin, text, effect, linked, boundary, manual],
  };
  p.objects.forEach((o, i) => (o.parentId = i < 5 ? "inner" : "outer"));
  syncLinkedArtwork(p);
  validateProject(p);
  return p;
}
