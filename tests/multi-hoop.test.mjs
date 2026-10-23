import assert from "node:assert/strict";
import { test } from "node:test";
import { object, validateProject, bounds } from "../src/model.js";
import {
  newLayout,
  suggestHoops,
  splitDomains,
  hoopRect,
  coverage,
} from "../src/multi-hoop-layout.js";
import { clipping, polygonArea, fillPolygons } from "../src/geometry.js";
import {
  assignWholeObjects,
  sectionProject,
} from "../src/multi-hoop-assignment.js";
import { generate } from "../src/engine.js";
import { deriveSections, generateMultiHoop } from "../src/multi-hoop-split.js";
import { inside } from "../src/geometry.js";
import {
  registrationFor,
  registrationObjects,
} from "../src/multi-hoop-registration.js";
import { hoopTemplate, printTemplates } from "../src/multi-hoop-templates.js";
import { selectEquipment, getMachine } from "../src/equipment.js";
import { makeOperation } from "../src/operations.js";
import { makeFillSettings } from "../src/fills/context.js";
import { makeRailSource } from "../src/manual-satin.js";
import { railRings } from "../src/smart-geometry.js";
import { normalizeThread } from "../src/thread-records.js";
import { assignThread, threadTargets } from "../src/thread-assignment.js";
const rect = (x, y, w, h) => [
  [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ],
];
const project = (rings = rect(-125, -30, 250, 60)) => ({
  version: 1,
  name: "Rehoop",
  machine: "se700",
  objects: [object("Area", rings, { compensation: 0, underlay: false })],
  multiHoop: newLayout(),
});
test("A: field-aware horizontal and vertical suggestions, persistence and validation", () => {
  const p = project();
  p.multiHoop.hoops = suggestHoops(p);
  assert.equal(p.multiHoop.hoops.length, 3);
  assert.equal(coverage(p).uncovered.length, 0);
  validateProject(JSON.parse(JSON.stringify(p)));
  const v = project(rect(-25, -125, 50, 250));
  v.multiHoop.hoops = suggestHoops(v);
  assert.equal(v.multiHoop.hoops.length, 3);
  assert.equal(new Set(v.multiHoop.hoops.map((h) => h.x)).size, 1);
  p.multiHoop.hoops[0].x = NaN;
  assert.throws(() => validateProject(p), /hooping/);
  const tiny = project(rect(-1, -1, 2, 2)),
    custom = {
      id: "user-mini",
      brand: "generic",
      name: "Small custom field",
      verification: "user-provided",
      maxField: { width: 5, height: 5 },
      hoops: [
        { id: "mini", name: "Mini", width: 5, height: 5, reposition: false },
      ],
      formats: ["pes"],
      preferred: "pes",
    };
  selectEquipment(tiny, custom.id, "mini", custom);
  tiny.multiHoop = newLayout(tiny);
  tiny.multiHoop.hoops = suggestHoops(tiny);
  assert.equal(tiny.multiHoop.hoops.length, 1);
  validateProject(tiny);
});
test("A: irregular and manually balanced domains partition union without holes or overlap", () => {
  const p = project();
  p.multiHoop.hoops = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 70, y: 35, seamX: 8 },
    { id: "c", x: 15, y: 75, seamY: -4 },
  ];
  const domains = splitDomains(p),
    union = clipping.union(...p.multiHoop.hoops.map((h) => hoopRect(p, h, 2)));
  assert(
    Math.abs(
      domains.reduce((n, d) => n + polygonArea(d), 0) - polygonArea(union),
    ) < 0.001,
  );
  for (let i = 0; i < domains.length; i++)
    for (let j = i + 1; j < domains.length; j++)
      assert(
        polygonArea(clipping.intersection(domains[i], domains[j])) < 0.001,
      );
});
test("A: uncovered holes and references never expand coverage", () => {
  const p = project();
  p.multiHoop.hoops = [{ id: "a", x: 0, y: 0 }];
  assert(coverage(p).uncovered[0].area > 1000);
  p.objects = [
    object("Reference", rect(900, 900, 30, 30), { type: "reference" }),
  ];
  assert.equal(coverage(p).uncovered.length, 0);
});
test("B: complete objects/actions keep source, colors, threads, groups and physical size", () => {
  const p = project();
  p.objects = [
    object("Left", rect(-100, -15, 20, 30), {
      operations: [
        { id: "f", type: "fill", color: "#123456" },
        { id: "b", type: "border", color: "#654321", width: 2 },
      ],
    }),
    object("Right", rect(70, -15, 20, 30)),
  ];
  p.multiHoop.hoops = [
    { id: "l", x: -90, y: 0 },
    { id: "r", x: 80, y: 0 },
  ];
  const before = JSON.stringify(p),
    a = assignWholeObjects(p);
  assert.equal(a.unassigned.length, 0);
  assert.equal(a.assignments.get(p.objects[0].id), "l");
  const s = sectionProject(p, p.multiHoop.hoops[0], [p.objects[0]]),
    plan = generate(s);
  assert(plan.stats.fits);
  assert.equal(plan.stats.uniqueColors, 2);
  assert.equal(JSON.stringify(p), before);
  assert.equal(s.objects[0].rings[0][1].x - s.objects[0].rings[0][0].x, 20);
  s.objects[0].operations[0].color = "#ffffff";
  assert.equal(p.objects[0].operations[0].color, "#123456");
});
test("B: construction dependencies are atomic; invalid manual assignment is actionable", () => {
  const p = project();
  p.objects = [
    object("Fabric", rect(-60, -20, 120, 40)),
    object("Decoration", rect(-4, -4, 8, 8)),
  ];
  p.objects[0].constructionArtworkIds = [p.objects[1].id];
  p.multiHoop.hoops = [
    { id: "l", x: -40, y: 0 },
    { id: "r", x: 40, y: 0 },
  ];
  const a = assignWholeObjects(p);
  assert.equal(a.assignments.size, 0);
  assert.match(a.problems[0].message, /construction must fit/);
  delete p.objects[0].constructionArtworkIds;
  p.multiHoop.assignments = { [p.objects[1].id]: "missing" };
  assert.match(
    assignWholeObjects(p).problems.at(-1).message,
    /assigned hooping/,
  );
});
test("C: oversized Tatami with hole regenerates disjoint source regions, shared rows and safe commands", () => {
  const p = project([...rect(-110, -20, 220, 40), ...rect(-12, -9, 24, 18)]);
  p.objects[0].angle = 0;
  p.objects[0].compensation = 0.3;
  p.objects[0].underlay = true;
  p.multiHoop.hoops = [
    { id: "a", x: -65, y: 0 },
    { id: "b", x: 0, y: 0 },
    { id: "c", x: 65, y: 0 },
  ];
  const before = JSON.stringify(p),
    r = generateMultiHoop(p);
  assert.deepEqual(r.problems, []);
  assert.equal(JSON.stringify(p), before);
  assert.equal(r.splits[0].kind, "fill");
  let area = 0;
  const rows = new Set();
  for (const s of r.sections) {
    assert(s.plan.stats.fits);
    assert(s.plan.stats.maxLength <= 7.01);
    area += polygonArea(fillPolygons(s.project.objects[0].rings, "nonzero"));
    for (const e of s.plan.events.filter(
      (e) => e.cmd === "stitch" && e.phase === "top",
    )) {
      const world = { x: e.x + s.hoop.x, y: e.y + s.hoop.y };
      assert(!inside(world, rect(-11.5, -8.5, 23, 17)), JSON.stringify(world));
      rows.add(Math.round((world.y + 20 - 0.21) / 0.42));
      const b = bounds(
        r.domains[s.number - 1].flat(2).map(([x, y]) => ({ x, y })),
      );
      assert(
        world.x >= b.minX - 0.051 && world.x <= b.maxX + 0.051,
        "compensation must stop at seam",
      );
    }
  }
  assert(Math.abs(area - (220 * 40 - 24 * 18)) < 0.01);
  assert(rows.size > 80);
  const parts = deriveSections(p).sections;
  p.multiHoop.hoops[1].seamX = 10;
  const next = deriveSections(p).sections;
  assert.notDeepEqual(
    parts[0].project.objects[0].rings,
    next[0].project.objects[0].rings,
  );
});
test("C: source running paths split without connecting artificial closing edges; Bean/Triple identities remain", () => {
  const p = project();
  p.objects = [
    object(
      "Long line",
      [
        [
          { x: -110, y: 0 },
          { x: 0, y: 5 },
          { x: 110, y: 0 },
        ],
      ],
      {
        type: "run",
        operations: [
          { id: "bean", type: "bean", length: 2, color: "#112233" },
          { id: "triple", type: "triple", length: 2, color: "#445566" },
        ],
      },
    ),
  ];
  p.multiHoop.hoops = [
    { id: "a", x: -65, y: 0 },
    { id: "b", x: 0, y: 0 },
    { id: "c", x: 65, y: 0 },
  ];
  const r = generateMultiHoop(p);
  assert.deepEqual(r.problems, []);
  assert(r.sections.every((s) => s.plan.stats.fits));
  assert(
    r.sections.every((s) =>
      s.project.objects[0].operations.every((op) => op.closed === false),
    ),
  );
  assert(r.sections.every((s) => s.plan.stats.uniqueColors === 2));
});
test("C: unsupported oversized rails/satin/decorative fills are blocked; complete lettering islands remain intact", () => {
  const p = project();
  p.objects[0].operations = [{ id: "s", type: "column" }];
  p.multiHoop.hoops = [
    { id: "a", x: -70, y: 0 },
    { id: "b", x: 0, y: 0 },
    { id: "c", x: 70, y: 0 },
  ];
  assert.match(
    deriveSections(p).problems[0].message,
    /cannot be cut automatically/,
  );
  p.objects[0].rings = [...rect(-92, -10, 20, 20), ...rect(72, -10, 20, 20)];
  p.objects[0].textSource = { text: "AB" };
  const r = deriveSections(p);
  assert.equal(r.problems.length, 0);
  assert.equal(r.splits[0].kind, "islands");
  assert.equal(r.sections.filter((s) => s.objectIds.length).length, 2);
  assert.equal(p.objects[0].textSource.text, "AB");
  p.objects[0].rings = rect(-110, -10, 220, 20);
  p.objects[0].operations = [
    { id: "c", type: "fill", fillSettings: { version: 1, method: "cross" } },
  ];
  assert.match(deriveSections(p).problems[0].message, /decorative fill/);
});
test("D: common registration is inside both real fields and avoids artwork; optional marks are explicit", () => {
  const p = project(rect(-65, -10, 130, 20));
  p.multiHoop.hoops = [
    { id: "a", x: -35, y: 0 },
    { id: "b", x: 35, y: 0 },
  ];
  assert.equal(registrationFor(p).pairs.length, 0);
  p.multiHoop.registration = true;
  const r = registrationFor(p);
  assert.deepEqual(r.problems, []);
  assert.equal(r.pairs.length, 1);
  const objects = p.multiHoop.hoops.map((h) => registrationObjects(r, h));
  for (let i = 0; i < 2; i++)
    for (const o of objects[i])
      for (const q of o.rings.flat()) {
        assert(Math.abs(q.x) < 50);
        assert(Math.abs(q.y) < 50);
        assert(
          !inside(
            { x: q.x + p.multiHoop.hoops[i].x, y: q.y },
            p.objects[0].rings,
          ),
        );
      }
  assert(
    Math.abs(objects[0][0].rings[0][0].x - objects[1][0].rings[0][0].x - 70) <
      1e-8,
  );
  const multi = generateMultiHoop(p);
  assert(
    multi.sections.every((s) =>
      s.project.objects[0].id.startsWith("@registration:"),
    ),
  );
  const s = multi.sections[0],
    svg = hoopTemplate(p, s, r),
    html = printTemplates(p, multi.sections, r);
  assert.match(svg, /width="100mm" height="100mm"/);
  assert.match(html, /width="190mm" height="250mm"/);
  assert.match(html, /width="50mm"/);
  assert.match(html, /@page\{size:A4/);
  p.objects[0].rings = rect(-100, -100, 200, 200);
  assert(registrationFor(p).problems.length); // No hidden placement through finished fill.
});

test("F: exact machine changes regenerate dimensions; large actual-size fields tile without scaling", () => {
  const p = project(rect(-120, -20, 240, 40));
  p.multiHoop.hoops = suggestHoops(p);
  const original = structuredClone(p.objects);
  selectEquipment(p, "janome-mc500e", "janome-sq14b");
  p.multiHoop.hoops = suggestHoops(p);
  const r = generateMultiHoop(p);
  assert.deepEqual(r.problems, []);
  assert.equal(getMachine(p).width, 140);
  assert.equal(r.sections.length, 2);
  assert(r.sections.every((s) => s.plan.stats.fits));
  assert.deepEqual(p.objects, original);
  selectEquipment(p, "janome-mc500e", "janome-re28b");
  p.multiHoop.hoops = suggestHoops(p);
  const large = generateMultiHoop(p),
    html = printTemplates(p, large.sections, large.registration);
  assert.equal(
    (html.match(/class="sheet"/g) || []).length,
    large.sections.length * 4,
  );
  assert.match(
    hoopTemplate(p, large.sections[0], large.registration),
    /width="200mm" height="280mm"/,
  );
});
test("F: oversized Emboss keeps texture frame and density; shared master is independent", () => {
  const p = project(rect(-110, -15, 220, 30)),
    o = p.objects[0];
  o.operations = [
    {
      ...makeOperation("fill", o),
      fillSettings: makeFillSettings("emboss", o, {
        motif: "lattice",
        strength: 0.7,
        scale: 4,
        repeat: 4,
      }),
    },
  ];
  p.multiHoop.hoops = [
    { id: "a", x: -65, y: 0 },
    { id: "b", x: 0, y: 0 },
    { id: "c", x: 65, y: 0 },
  ];
  const before = JSON.stringify(p),
    r = generateMultiHoop(p);
  assert.deepEqual(r.problems, []);
  assert(r.sections.every((s) => s.plan.stats.fits));
  assert(
    r.sections.every(
      (s) =>
        s.project.objects[0].operations[0].fillSettings.method === "emboss",
    ),
  );
  assert.equal(JSON.stringify(p), before);
});
test("F: complete manual satin rails, nested groups and real thread snapshots survive allocation", () => {
  const p = project(),
    curve = (y) => ({
      nodes: [
        { x: 50, y },
        { x: 80, y },
      ],
      closed: false,
      frame: [1, 0, 0, 1, 0, 0],
    }),
    satinRails = makeRailSource(curve(-2), curve(2));
  const o = object("Rails", railRings(satinRails), {
    closed: true,
    satinRails,
    parentId: "inner",
  });
  o.operations = [
    { ...makeOperation("column", o), columnMode: "rails", compensation: 0 },
  ];
  assignThread(
    threadTargets([o], {}),
    normalizeThread({
      brandName: "Personal fixture",
      lineName: "Polyester",
      number: "0001",
      hex: "#123456",
    }),
  );
  p.objects = [o];
  p.groups = [
    { id: "outer", kind: "group", name: "Outer" },
    { id: "inner", kind: "group", name: "Inner", parentId: "outer" },
  ];
  p.multiHoop.hoops = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 65, y: 0 },
  ];
  const before = JSON.stringify(p),
    r = generateMultiHoop(p),
    s = r.sections[1];
  assert.deepEqual(r.problems, []);
  assert.equal(
    s.project.objects[0].operations[0].physicalThread.thread.number,
    "0001",
  );
  assert.equal(s.project.groups.length, 2);
  assert(s.plan.stats.fits);
  assert(s.plan.events.some((e) => e.threadKey));
  assert.equal(JSON.stringify(p), before);
});
test("F: reversed hoop order cannot reverse overlapping paint layers; private derived geometry is not importable", () => {
  const p = project();
  p.objects = [
    object("Under", rect(-20, -10, 40, 20)),
    object("Over", rect(-10, -10, 40, 20)),
  ];
  p.multiHoop.hoops = [
    { id: "a", x: 20, y: 0 },
    { id: "b", x: -20, y: 0 },
  ];
  p.multiHoop.assignments = { [p.objects[0].id]: "b", [p.objects[1].id]: "a" };
  assert(
    deriveSections(p).problems.some((p) =>
      /reverses overlapping/.test(p.message),
    ),
  );
  p.multiHoop.hoops.reverse();
  assert.equal(deriveSections(p).problems.length, 0);
  p.objects[0].multiHoopDomain = [];
  assert.throws(() => validateProject(p), /Derived hooping/);
});

test("F: a realistic dense vector collection regenerates bounded sections without editing master controls", () => {
  const p = project();
  p.objects = Array.from({ length: 48 }, (_, i) =>
    object(
      `Imported island ${i}`,
      [
        Array.from({ length: 96 }, (_, j) => ({
          x: (i % 8) * 38 - 133 + 5 * Math.cos((j * Math.PI) / 48),
          y: Math.floor(i / 8) * 30 - 75 + 5 * Math.sin((j * Math.PI) / 48),
        })),
      ],
      { underlay: false, spacing: 0.7, color: i % 2 ? "#234567" : "#986a32" },
    ),
  );
  p.multiHoop.hoops = suggestHoops(p);
  const before = JSON.stringify(p),
    start = performance.now(),
    r = generateMultiHoop(p),
    elapsed = performance.now() - start;
  assert.deepEqual(r.problems, []);
  assert.equal(JSON.stringify(p), before);
  assert(r.sections.length > 4);
  assert(r.sections.every((s) => s.plan.stats.fits));
  assert(elapsed < 8000, `${elapsed} ms`);
  console.log(
    `Multi-hoop: 48 imported contours / 4608 samples, ${r.sections.length} sections, ${r.assembled.stats.stitches} stitches, ${elapsed.toFixed(1)} ms`,
  );
});

test("F: disabled artwork is retained but does not require extra hoopings; control-only files cannot be omitted silently", () => {
  const p = project(rect(-10, -10, 20, 20)),
    disabled = object("Disabled far away", rect(500, 500, 50, 50), {
      operations: [{ id: "off", name: "Off", type: "fill", enabled: false }],
    });
  p.objects.push(disabled);
  p.multiHoop.hoops = suggestHoops(p);
  assert.equal(p.multiHoop.hoops.length, 1);
  assert.equal(generateMultiHoop(p).problems.length, 0);
  assert.equal(p.objects.length, 2);
  const stop = object("Required pause", rect(120, -5, 5, 5), {
    operations: [{ id: "pause", name: "Required pause", type: "stop" }],
  });
  p.objects.push(stop);
  p.multiHoop.hoops.push({ id: "pause-field", x: 125, y: 0 });
  const r = generateMultiHoop(p);
  assert(
    r.problems.some((p) => /control actions without sewing/.test(p.message)),
  );
});
