import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultLayout,
  readLayout,
  panelLimits,
} from "../src/workspace-layout.js";
import { object, ellipse, objectBounds } from "../src/model.js";
import { arrangeArtwork, snapTranslation } from "../src/arrange.js";
import { selectionBounds } from "../src/hierarchy.js";
const p = () => ({
  version: 1,
  name: "Arrange",
  machine: "se700",
  groups: [{ id: "g", kind: "group", name: "SVG" }],
  objects: [
    object("A", [ellipse(15, 10, 5, 3)], { parentId: "g" }),
    object("B", [ellipse(30, 10, 3, 2)], { parentId: "g" }),
    object("C", [ellipse(-20, 5, 8, 6)]),
  ],
});
test("layout restoration validates stored sizes and retains independent compact visibility", () => {
  const s = readLayout({
    left: -400,
    right: Infinity,
    bottom: 99999,
    open: { left: false, right: "bad" },
    compactOpen: { bottom: true },
    tools: false,
  });
  assert.equal(s.left, 240);
  assert.equal(s.right, 280);
  assert.equal(s.bottom, 600);
  assert.deepEqual(s.open, { left: false, right: true, bottom: true });
  assert.equal(s.compactOpen.bottom, true);
  assert.equal(s.tools, false);
  assert.equal(readLayout({ tools: "invalid" }).tools, true);
  assert.deepEqual(readLayout(null), defaultLayout());
  assert.deepEqual(panelLimits("left", 1200, 700, 280), { min: 240, max: 600 });
  assert(panelLimits("right", 1100, 650, 550).max <= 230);
  assert.equal(panelLimits("left", 360, 500, 0, true).max, 328);
  assert.equal(panelLimits("bottom", 360, 400).max, 150);
});
test("group centering and matching size alter source geometry but preserve embroidery parameters", () => {
  const project = p(),
    params = project.objects.map(({ spacing, length, width, angle }) => ({
      spacing,
      length,
      width,
      angle,
    })),
    old = selectionBounds(project.objects.slice(0, 2));
  assert(arrangeArtwork(project, ["g"], "center"));
  let b = selectionBounds(project.objects.slice(0, 2));
  assert(Math.abs(b.minX + b.maxX) < 1e-10);
  assert(Math.abs(b.minY + b.maxY) < 1e-10);
  assert.equal(b.width, old.width);
  assert(arrangeArtwork(project, ["g", project.objects[2].id], "match-width"));
  assert(Math.abs(objectBounds(project.objects[2]).width - b.width) < 1e-10);
  assert.deepEqual(
    project.objects.map(({ spacing, length, width, angle }) => ({
      spacing,
      length,
      width,
      angle,
    })),
    params,
  );
  const x = objectBounds(project.objects[2]).minX;
  arrangeArtwork(project, [project.objects[2].id], "hoop-y");
  b = objectBounds(project.objects[2]);
  assert(Math.abs(b.minY + b.maxY) < 1e-10);
  assert.equal(b.minX, x);
});
test("locked objects remain protected during positioning and matching", () => {
  const project = p(),
    locked = project.objects[2];
  locked.locked = true;
  const before = JSON.stringify(locked);
  arrangeArtwork(project, ["@project"], "center");
  assert.equal(JSON.stringify(locked), before);
  assert.equal(arrangeArtwork(project, [locked.id], "center"), false);
});
test("drag guides snap within screen tolerance, use hoop center, and preserve distant offsets", () => {
  const b = { minX: 5, maxX: 15, minY: 8, maxY: 12 };
  let result = snapTranslation(b, -9.5, -9.8, [], 0.7);
  assert.equal(result.dx, -10);
  assert.equal(result.dy, -10);
  assert.equal(result.guides.length, 2);
  result = snapTranslation(
    b,
    10.6,
    0,
    [{ minX: 26, maxX: 36, minY: 30, maxY: 40 }],
    0.5,
  );
  assert(Math.abs(result.dx - 11) < 1e-10);
  assert.equal(result.dy, 0);
  assert.equal(result.guides.length, 1);
  result = snapTranslation(b, 15, 7, [], 0.5);
  assert.deepEqual(result, { dx: 15, dy: 7, guides: [] });
});
