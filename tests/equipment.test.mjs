import test from "node:test";
import assert from "node:assert/strict";
import { demo, validateProject, object } from "../src/model.js";
import { generate } from "../src/engine.js";
import {
  MACHINE_CATALOG,
  HOOPS,
  BRANDS,
  LEGACY_EQUIPMENT,
  getMachine,
  equipmentOf,
  selectEquipment,
  validateCustom,
  loadEquipment,
  saveEquipment,
  applyDefault,
} from "../src/equipment.js";
const custom = () => ({
  id: "user-fixture",
  name: "My machine",
  brand: "generic",
  verification: "user-provided",
  maxField: { width: 160, height: 260 },
  formats: ["jef"],
  preferred: "jef",
  hoops: [
    {
      id: "small",
      name: "Small hoop",
      width: 100,
      height: 100,
      reposition: false,
    },
    {
      id: "large",
      name: "Large hoop",
      width: 160,
      height: 260,
      reposition: false,
    },
  ],
});
test("documented models have independent sources, exact compatible hoops and unknown hardware limits", () => {
  assert.equal(Object.keys(BRANDS).length, 8);
  for (const m of Object.values(MACHINE_CATALOG)) {
    if (m.brand !== "generic") assert.ok(m.sources.length);
    assert.deepEqual(m.limits, {});
    assert.equal(m.hardwareTested, false);
    for (const id of m.hoops) {
      const h = HOOPS[id];
      assert.ok(h);
      assert.ok(h.width <= m.maxField.width && h.height <= m.maxField.height);
      assert.equal(h.reposition, false);
      assert.equal(h.physicalDimensions, null);
    }
  }
});
test("all three legacy identifiers load without mutation or loss of original fields", () => {
  for (const [id, size] of Object.entries({
    se700: [100, 100],
    brother130: [130, 180],
    generic200: [200, 200],
  })) {
    const p = { ...demo(), machine: id },
      before = JSON.stringify(p);
    validateProject(p);
    const m = getMachine(p);
    assert.deepEqual([m.width, m.height], size);
    assert.equal(JSON.stringify(p), before);
    assert.deepEqual(
      [equipmentOf(p).machineId, equipmentOf(p).hoopId],
      LEGACY_EQUIPMENT[id],
    );
  }
});
test("hoop changes update actual stitch bounds but never alter artwork or sewing actions", () => {
  const p = demo();
  p.objects = [
    object(
      "Wide region",
      [
        [
          { x: -80, y: -10 },
          { x: 80, y: -10 },
          { x: 80, y: 10 },
          { x: -80, y: 10 },
        ],
      ],
      { underlay: false },
    ),
  ];
  const before = JSON.stringify(p.objects);
  selectEquipment(p, "janome-mc500e", "janome-re28b");
  assert.equal(generate(p).stats.fits, true);
  selectEquipment(p, "se700", "brother-100");
  assert.equal(generate(p).stats.fits, false);
  assert.equal(JSON.stringify(p.objects), before);
  const bad = structuredClone(p);
  bad.equipment.hoopId = "janome-re28b";
  assert.throws(() => validateProject(bad), /Hoop/);
});
test("custom snapshots travel inside projects independently of local preferences", () => {
  const m = custom(),
    p = demo();
  selectEquipment(p, m.id, "large", m);
  m.maxField.width = 5;
  assert.equal(getMachine(p).width, 160);
  validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(getMachine(p).height, 260);
  const copy = structuredClone(p);
  copy.equipment.custom.hoops[1].width = NaN;
  assert.throws(() => validateProject(copy), /custom hoop/);
  copy.equipment.custom = custom();
  copy.equipment.machineId = "se700";
  copy.machine = "se700";
  assert.throws(() => validateProject(copy), /custom machine identifier/);
});
test("local default preferences validate, survive transfer and never resize a new project", () => {
  const m = custom(),
    p = demo();
  selectEquipment(p, m.id, "small", m);
  const s = { version: 1, customMachines: [m], default: p.equipment },
    mem = new Map(),
    storage = { getItem: (k) => mem.get(k), setItem: (k, v) => mem.set(k, v) };
  saveEquipment(storage, s);
  const loaded = loadEquipment(storage),
    n = applyDefault(demo(), loaded);
  assert.equal(getMachine(n).width, 100);
  assert.deepEqual(
    n.objects,
    demo().objects.map((o, i) => ({ ...o, id: n.objects[i].id })),
  );
  assert.equal(n.machine, m.id);
  assert.throws(
    () => validateCustom({ ...m, maxField: { width: Infinity, height: 100 } }),
    /custom machine/,
  );
  assert.throws(
    () => validateCustom({ ...m, formats: ["unknown"] }),
    /custom machine/,
  );
  assert.throws(
    () =>
      saveEquipment(
        {
          setItem() {
            throw Error("Storage full");
          },
        },
        s,
      ),
    /Storage full/,
  );
});

test("equipment metadata rejects foreign versions and forged catalog entries", () => {
  const p = demo();
  selectEquipment(p, "se700", "brother-100");
  p.equipment.catalogVersion = { fake: true };
  assert.throws(() => validateProject(p), /selection/);
  for (const machine of ["__proto__", "constructor", "not-a-machine"])
    assert.throws(() => validateProject({ ...demo(), machine }));
});

test("expanded exact-model catalog retains sourced hoops, conservative format evidence and generation variants", () => {
  const models = Object.values(MACHINE_CATALOG).filter(
    (m) => m.brand !== "generic",
  );
  assert.equal(models.length, 42);
  for (const brand of Object.keys(BRANDS).filter((b) => b !== "generic"))
    assert.ok(models.filter((m) => m.brand === brand).length >= 2);
  for (const m of models) {
    const p = {
      version: 1,
      machine: "se700",
      name: "Field fixture",
      objects: [],
    };
    for (const id of m.hoops) {
      selectEquipment(p, m.id, id);
      validateProject(p);
      assert.equal(getMachine(p).width, HOOPS[id].width);
    }
  }
  assert.equal(MACHINE_CATALOG["brother-se2000"].maxField.width, 130);
  assert.equal(HOOPS["brother-mag180"].width, 100);
  assert.equal(
    MACHINE_CATALOG["janome-mc400e"].hoops.includes("janome-re36b"),
    false,
  );
  assert.equal(MACHINE_CATALOG["janome-mc550e"].maxField.height, 360);
  assert.equal(MACHINE_CATALOG["bernina-b570-2017"].maxField.height, 150);
  assert.match(MACHINE_CATALOG["bernina-b570-2017"].notes, /module required/i);
  for (const id of ["pfaff-ambition640", "viking-topaz65", "singer-se9185"]) {
    assert.deepEqual(MACHINE_CATALOG[id].formats, []);
    assert.equal(MACHINE_CATALOG[id].preferred, null);
  }
});
