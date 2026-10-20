import test from "node:test";
import assert from "node:assert/strict";
import { demo } from "../src/model.js";
import { selectEquipment } from "../src/equipment.js";
import { preferredExport } from "../src/export-preferences.js";
import {
  exportPreflight,
  checkRoundTrip,
  FORMAT_STATUS,
} from "../src/export-safety.js";
const event = (cmd, x = 0, y = 0) => ({ cmd, x, y, color: "#102030" });
test("file evidence distinguishes implemented six writers from HUS/VIP readers", () => {
  assert.equal(
    Object.values(FORMAT_STATUS).filter((x) => x.implemented && x.roundTrip)
      .length,
    6,
  );
  for (const f of ["hus", "vip"])
    assert.match(exportPreflight(demo(), [], f).errors[0], /no .*writer/i);
});
test("preflight refuses lost VP3 construction stops and reports DST/EXP pause semantics", () => {
  const p = demo(),
    e = [event("stitch"), event("stop"), event("stitch", 2), event("end", 2)];
  assert.match(
    exportPreflight(p, e, "vp3").errors.join(),
    /standalone machine stops/,
  );
  for (const f of ["dst", "exp"]) {
    const check = exportPreflight(p, e, f);
    assert.deepEqual(check.errors, []);
    assert.match(check.warnings.join(), /color-change pauses/);
  }
});
test("format palette block limits include PEC encoded stops", () => {
  const p = demo(),
    e = [
      event("stitch"),
      ...Array.from({ length: 255 }, () => event("stop")),
      event("end"),
    ];
  assert.match(exportPreflight(p, e, "pes").errors.join(), /256/);
  assert.match(exportPreflight(p, e, "pec").errors.join(), /256/);
});
test("JEF rejects incorrect large-hoop fallback and explains trims, palette and independent hoop coding", () => {
  const p = demo();
  selectEquipment(p, "janome-mc500e", "janome-re28b");
  assert.equal(preferredExport(p), "jef");
  const large = [
    event("jump", 0, -110),
    event("stitch", 0, -110),
    event("stitch", 0, 110),
    event("end", 0, 110),
  ];
  assert.match(exportPreflight(p, large, "jef").errors.join(), /RE28b/);
  const small = exportPreflight(
    p,
    [event("stitch"), event("trim"), event("stitch", 2), event("end", 2)],
    "jef",
  );
  assert.deepEqual(small.errors, []);
  assert.match(small.warnings.join(), /explicit trim/);
  assert.match(small.warnings.join(), /legacy JEF hoop code/);
});
test("format safety checks actual commanded bounds and origin without changing coordinates", () => {
  const p = demo(),
    e = [event("stitch", 60), event("end", 60)],
    before = JSON.stringify(e);
  assert.match(exportPreflight(p, e, "pes").errors.join(), /outside/);
  assert.equal(JSON.stringify(e), before);
  selectEquipment(p, "generic", "field-200-280");
  const q = [
    event("jump", 0, 130),
    event("stitch", 0, 130),
    event("stitch", 0, -130),
    event("end", 0, -130),
  ];
  assert.match(exportPreflight(p, q, "pes").errors.join(), /12-bit/);
});
test("round-trip checks reject changed or missing needles and required pause order", () => {
  const a = [
    event("jump", 1, 2),
    event("stitch", 1, 2),
    event("stop", 1, 2),
    event("stitch", 3, 2),
    event("color", 3, 2),
    event("stitch", 4, 4),
    event("end", 4, 4),
  ];
  assert.deepEqual(checkRoundTrip(a, a, "pes").errors, []);
  let b = structuredClone(a);
  b[3].x = 99;
  assert.match(checkRoundTrip(a, b, "pes").errors.join(), /needle positions/);
  b = a.filter((e) => e.cmd !== "stop");
  assert.match(checkRoundTrip(a, b, "pes").errors.join(), /stop/);
  b = a.map((e) => (e.cmd === "stop" ? { ...e, cmd: "color" } : e));
  assert.deepEqual(checkRoundTrip(a, b, "dst").errors, []);
});
