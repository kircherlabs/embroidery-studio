import test from "node:test";
import assert from "node:assert/strict";
import {
  EDITING_STYLE,
  strokeEditingPath,
  editingHandle,
  sourceThread,
  sourceOutlinePaths,
  drawSourceOverlay,
} from "../src/editing-overlay.js";
import { object } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
import { generate } from "../src/engine.js";

function context() {
  const strokes = [],
    fills = [],
    stack = [];
  return {
    strokes,
    fills,
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: "original",
    fillStyle: "original",
    dash: [],
    save() {
      stack.push({
        globalAlpha: this.globalAlpha,
        lineWidth: this.lineWidth,
        strokeStyle: this.strokeStyle,
        fillStyle: this.fillStyle,
        dash: this.dash,
      });
    },
    restore() {
      Object.assign(this, stack.pop());
    },
    setLineDash(v) {
      this.dash = v;
    },
    beginPath() {
      this.path = [];
    },
    moveTo(x, y) {
      this.path.push(["M", x, y]);
    },
    lineTo(x, y) {
      this.path.push(["L", x, y]);
    },
    closePath() {
      this.path.push(["Z"]);
    },
    rect(x, y, w, h) {
      this.path.push(["R", x, y, w, h]);
    },
    arc(x, y, r) {
      this.path.push(["A", x, y, r]);
    },
    stroke() {
      strokes.push({
        path: structuredClone(this.path),
        color: this.strokeStyle,
        width: this.lineWidth,
        alpha: this.globalAlpha,
        dash: this.dash,
      });
    },
    fill() {
      fills.push({ path: structuredClone(this.path), color: this.fillStyle });
    },
  };
}
test("editing paths use coincident light halo and dark foreground at constant screen widths and restore canvas state", () => {
  for (const scale of [0.25, 1, 4, 24]) {
    const ctx = context();
    strokeEditingPath(
      ctx,
      (c) => {
        c.moveTo(2, 3);
        c.lineTo(8, 7);
      },
      scale,
      { dash: [4, 3] },
    );
    assert.equal(ctx.strokes.length, 2);
    const [halo, ink] = ctx.strokes;
    assert.deepEqual(halo.path, ink.path);
    assert.equal(halo.color, EDITING_STYLE.halo);
    assert.equal(ink.color, EDITING_STYLE.ink);
    assert.equal(ink.width * scale, EDITING_STYLE.sourceWidth);
    assert.equal(
      halo.width * scale,
      EDITING_STYLE.sourceWidth + EDITING_STYLE.haloExtra,
    );
    assert.deepEqual(
      ink.dash.map((v) => v * scale),
      [4, 3],
    );
    assert.equal(ctx.strokeStyle, "original");
    assert.equal(ctx.globalAlpha, 1);
    assert.deepEqual(ctx.dash, []);
  }
});
test("sewing-action color overrides original gold source paint without altering either", () => {
  const o = object(
    "Blue satin",
    [
      [
        { x: 0, y: 0 },
        { x: 10, y: 3 },
      ],
    ],
    { type: "satin", color: "#e6ab43" },
  );
  o.operations = [
    makeOperation("stop", o),
    makeOperation("satin", o),
    makeOperation("run", o),
  ];
  o.operations[1].color = "#303e64";
  o.operations[1].width = 4;
  o.operations[2].color = "#ffffff";
  const before = structuredClone(o);
  assert.deepEqual(sourceThread(o), {
    color: "#303e64",
    width: 4,
    type: "satin",
  });
  assert.equal(sourceThread(o, o.operations[2].id).color, "#ffffff");
  o.operations[2].enabled = false;
  assert.equal(sourceThread(o, o.operations[2].id).color, "#303e64");
  o.operations[2].enabled = before.operations[2].enabled;
  assert.deepEqual(o, before);
});
test("manual outlines exclude jumps and metadata coordinates from sewing connections", () => {
  const o = {
    type: "manual",
    commands: [
      { cmd: "jump", x: 1, y: 1 },
      { cmd: "stitch", x: 3, y: 1 },
      { cmd: "jump", x: 10, y: 10 },
      { cmd: "stitch", x: 12, y: 10 },
      { cmd: "trim", x: 300, y: 900 },
      { cmd: "color", x: 0, y: 0 },
      { cmd: "stitch", x: 14, y: 10 },
    ],
  };
  const { rings, closed } = sourceOutlinePaths(o);
  assert.equal(closed, false);
  assert.deepEqual(
    rings.map((r) => r.map(({ x, y }) => [x, y])),
    [
      [
        [1, 1],
        [3, 1],
      ],
      [
        [10, 10],
        [12, 10],
      ],
      [
        [12, 10],
        [14, 10],
      ],
    ],
  );
});
test("filled geometry highlights perimeter and holes without filling or outlining internal stitches", () => {
  const rings = [
    [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 },
    ],
    [
      { x: -2, y: -2 },
      { x: 2, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 },
    ],
  ];
  const o = object("Counter", rings),
    before = structuredClone(o),
    ctx = context();
  drawSourceOverlay(ctx, o, 3);
  assert.equal(ctx.fills.length, 0);
  assert.equal(ctx.strokes.length, 2);
  assert.equal(ctx.strokes[0].path.filter((p) => p[0] === "Z").length, 2);
  assert.equal(
    sourceOutlinePaths({ ...o, type: "reference", closed: false }).closed,
    true,
  );
  assert.deepEqual(o, before);
});
test("centerline width remains physical while its outline stays in screen pixels", () => {
  const o = object(
    "Satin",
    [
      [
        { x: 0, y: 0 },
        { x: 10, y: 2 },
      ],
    ],
    { type: "run", width: 2 },
  );
  o.operations = [{ id: "satin", type: "satin", width: 5, color: "#14264a" }];
  const before = structuredClone(o),
    ctx = context();
  drawSourceOverlay(ctx, o, 4, { band: true });
  assert.equal(ctx.strokes.length, 3);
  assert.equal(ctx.strokes[0].width, 5);
  assert.equal(ctx.strokes[0].alpha, 0.3);
  assert.equal(ctx.strokes[0].color, "#14264a");
  assert.equal(ctx.strokes[2].width * 4, EDITING_STYLE.sourceWidth);
  assert.deepEqual(o, before);
});
test("anchors, tangents and seams have distinct silhouettes with haloed borders", () => {
  for (const shape of ["square", "circle", "diamond"]) {
    const c = context();
    editingHandle(c, { x: 3, y: 7 }, 2, { shape });
    assert.equal(c.fills.length, 1);
    assert.equal(c.strokes.length, 2);
    assert.equal(c.strokes[0].color, EDITING_STYLE.halo);
    assert.notEqual(c.strokes[0].color, c.strokes[1].color);
    assert.equal(
      c.strokes[0].path[0][0],
      { square: "R", circle: "A", diamond: "M" }[shape],
    );
  }
});
test("rendering leaves source geometry, operations and generated machine instructions unchanged", () => {
  const o = object(
      "Selected",
      [
        [
          { x: -10, y: -5 },
          { x: 10, y: -5 },
          { x: 10, y: 5 },
          { x: -10, y: 5 },
        ],
      ],
      { spacing: 0.5 },
    ),
    p = { version: 1, name: "Overlay", machine: "se700", objects: [o] };
  const before = structuredClone(p),
    plan = generate(p);
  for (const scale of [0.5, 1, 2])
    drawSourceOverlay(context(), o, scale, { multiple: true });
  assert.deepEqual(p, before);
  assert.deepEqual(generate(p), plan);
});
