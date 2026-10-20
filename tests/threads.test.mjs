import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeThread,
  validateThread,
  validateThreadLibrary,
  mergeCatalog,
  emptyThreads,
} from "../src/thread-records.js";
import {
  csvRows,
  catalogInput,
  catalogRecords,
} from "../src/thread-catalogs.js";
import {
  assignThread,
  threadTargets,
  clearThread,
} from "../src/thread-assignment.js";
import { object, validateProject } from "../src/model.js";
import { makeOperation } from "../src/operations.js";
import { generate } from "../src/engine.js";
import { editOperations } from "../src/styles.js";
const thread = (extra = {}) =>
  normalizeThread({
    brandName: "New brothread",
    lineName: "Personal 40 wt",
    number: "001",
    colorName: "Personal white",
    hex: "#f4f4f4",
    ...extra,
  });
test("leading zeros, alphanumeric codes, brand and line form distinct physical identities", () => {
  const a = thread(),
    b = thread({ brandName: "Simthread" }),
    c = thread({ brandName: "Brother" }),
    d = thread({ lineName: "Personal other line" }),
    e = thread({ number: "S001" });
  assert.equal(new Set([a.id, b.id, c.id, d.id, e.id]).size, 5);
  assert.equal(a.number, "001");
  assert.equal(e.number, "S001");
  assert.equal(a.brandId, "newbrothread");
  assert.equal(b.brandId, "simthread");
  assert.equal(c.brandId, "brother");
  assert.equal(a.source.verification, "user-imported");
  assert.throws(() => thread({ number: 1 }), /must be text/);
});
test("missing screen approximations remain unknown; source claims cannot become app verification", () => {
  const r = thread({
    hex: null,
    source: { verification: "manufacturer-verified", license: "Not cleared" },
  });
  assert.equal(r.hex, null);
  assert.equal(r.source.colorAccuracy, "unknown");
  assert.equal(r.source.verification, "user-imported");
  assert.equal(r.source.declaredVerification, "manufacturer-verified");
  assert.equal(r.material, null);
  assert.equal(r.weight, null);
  validateThread(r);
});
test("RFC4180 CSV mapping preserves quoted names, newlines, codes and explicit provenance", () => {
  const input = catalogInput(
    '\uFEFFBrand,Product Line,Code,Color Name,Hex,Spool Sizes\r\nNew brothread,Personal kit,001,"White, bright",#f4f4f4,"500 m;1000 m"\r\nSimthread,Personal kit,S001,"Blue\nshade",#123456,\r\n',
    "mine.csv",
  );
  const rows = catalogRecords(input, {
    source: { name: "My chart", license: "Personal use" },
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].number, "001");
  assert.equal(rows[0].colorName, "White, bright");
  assert.deepEqual(rows[0].spoolSizes, ["500 m", "1000 m"]);
  assert.equal(rows[1].colorName, "Blue\nshade");
  assert.equal(rows[0].source.name, "My chart");
  assert.throws(() => csvRows('a,b\n"bad'), /Unclosed/);
  assert.throws(() => catalogInput("a,a\n1,2", "bad.csv"), /unique/);
  assert.throws(() => catalogInput("a,b\n1,2,3", "bad.csv"), /match/);
});
test("GPL labels are unnumbered swatches unless code parsing is explicitly selected", () => {
  const input = catalogInput(
    "GIMP Palette\nName: Personal test\nColumns: 2\n# Local synthetic colors\n244 244 244 001 White\n18 52 86 S001 Blue\n",
    "mine.gpl",
  );
  const plain = catalogRecords(input, {
      brandName: "My Brand",
      lineName: "My palette",
    }),
    coded = catalogRecords(input, {
      brandName: "My Brand",
      lineName: "My palette",
      numberPrefix: true,
    });
  assert.equal(plain[0].number, null);
  assert.equal(plain[0].colorName, "001 White");
  assert.equal(coded[0].number, "001");
  assert.equal(coded[1].number, "S001");
  assert.equal(coded[1].hex, "#123456");
  assert.equal(coded[0].source.verification, "user-imported");
});
test("JSON catalogs, missing-field defaults and duplicate handling are deliberate", () => {
  const input = catalogInput(
    JSON.stringify({
      records: [
        {
          brandName: "",
          lineName: "",
          number: "0003",
          colorName: "Personal",
          hex: null,
        },
      ],
    }),
    "mine.json",
  );
  const r = catalogRecords(input, {
    brandName: "My Brand",
    lineName: "My line",
  })[0];
  assert.equal(r.number, "0003");
  let merged = mergeCatalog([r], [{ ...r, colorName: "Revised" }]);
  assert.equal(merged.kept, 1);
  assert.equal(merged.records[0].colorName, "Personal");
  merged = mergeCatalog([r], [{ ...r, colorName: "Revised" }], true);
  assert.equal(merged.replaced, 1);
  assert.equal(merged.records[0].colorName, "Revised");
});
test("assigning independent sewing actions preserves geometry, order, settings and original design colors", () => {
  const o = object(
      "Region",
      [
        [
          { x: -6, y: -4 },
          { x: 6, y: -4 },
          { x: 6, y: 4 },
          { x: -6, y: 4 },
        ],
      ],
      { color: "#ee44aa", underlay: false },
    ),
    ops = [makeOperation("fill", o), makeOperation("border", o)];
  o.operations = ops;
  ops[1].color = "#102080";
  const rings = JSON.stringify(o.rings),
    state = { activeOperationId: ops[1].id };
  let targets = threadTargets([o], state, true);
  assignThread(targets, thread());
  assert.equal(ops[0].color, "#ee44aa");
  assert.equal(ops[1].color, "#f4f4f4");
  assert.equal(ops[1].physicalThread.designColor, "#102080");
  assignThread(targets, thread({ brandName: "Simthread", hex: "#123456" }));
  assert.equal(ops[1].physicalThread.designColor, "#102080");
  assert.equal(JSON.stringify(o.rings), rings);
  const p = {
    version: 1,
    name: "Thread project",
    machine: "se700",
    objects: [o],
  };
  validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(
    generate(p)
      .events.filter((e) => e.cmd === "stitch")
      .at(-1).color,
    "#123456",
  );
  clearThread(targets);
  assert.equal(ops[1].color, "#102080");
  assert.equal(ops[1].physicalThread, undefined);
});
test("unknown HEX assignment keeps the design color; custom HEX editing explicitly clears physical assignment", () => {
  const o = object(
    "Line",
    [
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
    ],
    { type: "run", color: "#123456" },
  );
  assignThread(threadTargets([o], {}, true), thread({ hex: null }));
  assert.equal(o.operations[0].color, "#123456");
  editOperations([o], {}, true, "color", "#ff0088");
  assert.equal(o.operations[0].physicalThread, undefined);
  assert.equal(o.operations[0].color, "#ff0088");
});
test("catalog loss does not invalidate saved projects; invalid assignment data is rejected", () => {
  const o = object("Region", [
    [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 3 },
    ],
  ]);
  assignThread(threadTargets([o], {}, true), thread());
  const p = {
      version: 1,
      name: "Detached catalog",
      machine: "se700",
      objects: [o],
    },
    copy = JSON.parse(JSON.stringify(p));
  validateProject(copy);
  assert.equal(
    copy.objects[0].operations[0].physicalThread.thread.number,
    "001",
  );
  copy.objects[0].operations[0].physicalThread.thread.number = "1";
  assert.throws(() => validateProject(copy), /identity/);
  const data = emptyThreads();
  data.records = [thread()];
  validateThreadLibrary(data);
  data.records.push(thread());
  assert.throws(() => validateThreadLibrary(data), /Duplicate/);
});

test("catalog text fields and preferences reject object-shaped payloads", () => {
  assert.throws(
    () => thread({ colorName: { malformed: true } }),
    /must be text/,
  );
  const d = emptyThreads();
  d.preferences = { brandName: { malformed: true } };
  assert.throws(() => validateThreadLibrary(d), /preference/);
  d.preferences = [];
  assert.throws(() => validateThreadLibrary(d), /library/);
});
