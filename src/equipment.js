// Reference facts are separate from application stitch-planning defaults.
export const EQUIPMENT_VERSION = 1;
export const EQUIPMENT_CATALOG_VERSION = "2026-10-20";
export const EQUIPMENT_KEY = "embroidery-equipment-v1";
export const BRANDS = {
  brother: "Brother",
  babylock: "Baby Lock",
  janome: "Janome",
  bernina: "BERNINA",
  viking: "Husqvarna Viking",
  pfaff: "Pfaff",
  singer: "Singer",
  generic: "Generic / Custom",
};
const source = (url, title) => ({
  url,
  title,
  checked: "2026-10-20",
  status: "manufacturer-documented",
});
export const SOURCES = {
  se700: source(
    "https://support.brother.com/g/b/colist.aspx?c=us&cao=hfemba&lang=en&prod=hf_se700eus",
    "Brother SE700 accessories: 100 × 100 mm field",
  ),
  se700Formats: source(
    "https://support.brother.com/g/b/sp/faqend.aspx?c=us&faqid=faqh00100271_002&ftype3=2103&lang=en&prod=hf_se700eus",
    "Brother SE700 embroidery data precautions",
  ),
  janome: source(
    "https://www.janome.ca/product/memory-craft-500e/",
    "Janome Memory Craft 500E: field and included hoops",
  ),
  janomeFormats: source(
    "https://www.janome.com/siteassets/products/machines/embroidery/mc500e-le/memory-craft-500e-le-sell-sheet.pdf",
    "Janome 500E LE: JEF format",
  ),
  babylock: source(
    "https://babylock.com/flourish-ii",
    "Baby Lock Flourish II specifications and data formats",
  ),
  babylockHoops: source(
    "https://s3.amazonaws.com/mediastore.babylock.com/media/contentmanager/content/b03a33f1-b6c4-425b-bf99-325e66e40d28.pdf",
    "Baby Lock embroidery accessory/hoop chart",
  ),
  bernina: source(
    "https://www.bernina.com/bernina/media/products/Sewing%2C%20Quilting%20and%20Embroidery/NEW%20BERNINA%205%20Series/Brosch%C3%BCren/B%20540/BERNINA_5_Series_Broschuere_B540_EN_SDT.pdf",
    "BERNINA 5 Series: B 500 field, hoops and formats",
  ),
  viking: source(
    "https://husqvarnavikingbenelux.com/wp-content/uploads/2024/05/BR-Designer-Jade-35-FR.pdf",
    "Husqvarna Viking Designer Jade 35 brochure",
  ),
  pfaff: source(
    "https://www.pfaffblog.de/blog/software/details/items/fuer-alle-pfaff-creative-15-besitzer.html",
    "Pfaff creative 1.5: 240 × 150 mm and VP3",
  ),
  singer: source(
    "https://www.singer.com/es/products/singer-se9180-sewing-and-embroidery-machine?variant=47934106370327",
    "Singer SE9180: included 170 × 100 mm field",
  ),
  singerFormats: source(
    "https://www.singer.com/products/singer-se9180-sewing-and-embroidery-machine",
    "Singer SE9180: VP3 design import",
  ),
};
const hoop = (id, name, width, height, sources, extra = {}) => ({
  id,
  name,
  width,
  height,
  orientation:
    width === height ? "square" : width > height ? "landscape" : "portrait",
  physicalDimensions: null,
  reposition: false,
  sources,
  ...extra,
});
export const HOOPS = {
  "brother-100": hoop("brother-100", "Standard 100 × 100", 100, 100, ["se700"]),
  "janome-re28b": hoop("janome-re28b", "RE28b", 200, 280, ["janome"], {
    part: "RE28b",
  }),
  "janome-sq20b": hoop("janome-sq20b", "SQ20b", 200, 200, ["janome"], {
    part: "SQ20b",
  }),
  "janome-re20b": hoop("janome-re20b", "RE20b", 140, 200, ["janome"], {
    part: "RE20b",
  }),
  "janome-sq14b": hoop("janome-sq14b", "SQ14b", 140, 140, ["janome"], {
    part: "SQ14b",
  }),
  "babylock-ef81": hoop("babylock-ef81", "EF81", 160, 260, ["babylockHoops"], {
    part: "EF81",
  }),
  "bernina-large-oval": hoop(
    "bernina-large-oval",
    "Large Oval · field envelope",
    255,
    145,
    ["bernina"],
    {
      fieldShape: "oval-envelope",
      notes:
        "Oval hoop: rectangular field envelope only. Check the hoop template near rounded corners.",
    },
  ),
  "bernina-medium": hoop("bernina-medium", "Medium", 130, 100, ["bernina"]),
  "viking-jewel": hoop("viking-jewel", "DESIGNER Jewel", 240, 150, ["viking"]),
  "pfaff-master": hoop("pfaff-master", "creative MASTER", 240, 150, ["pfaff"]),
  "singer-170": hoop("singer-170", "Included hoop", 170, 100, ["singer"]),
};
export const FIELD_PRESETS = [
  [100, 100],
  [130, 180],
  [160, 260],
  [200, 200],
  [200, 280],
  [240, 150],
];
for (const [w, h] of FIELD_PRESETS)
  HOOPS[`field-${w}-${h}`] = hoop(
    `field-${w}-${h}`,
    `${w} × ${h} mm field`,
    w,
    h,
    [],
    { verification: "dimension-preset" },
  );
const machine = (
  id,
  brand,
  model,
  width,
  height,
  hoops,
  sources,
  formats = [],
  preferred = null,
) => ({
  id,
  brand,
  model,
  name: `${BRANDS[brand]} ${model}`,
  maxField: { width, height },
  hoops,
  formats,
  preferred,
  sources,
  verification: "manufacturer-documented",
  catalogVersion: EQUIPMENT_CATALOG_VERSION,
  limits: {},
  multiPosition: null,
  hardwareTested: false,
});
export const MACHINE_CATALOG = {
  se700: machine(
    "se700",
    "brother",
    "SE700",
    100,
    100,
    ["brother-100"],
    ["se700", "se700Formats"],
    ["pes", "dst"],
    "pes",
  ),
  "janome-mc500e": machine(
    "janome-mc500e",
    "janome",
    "Memory Craft 500E",
    200,
    280,
    ["janome-re28b", "janome-sq20b", "janome-re20b", "janome-sq14b"],
    ["janome"],
  ),
  "babylock-flourish2": machine(
    "babylock-flourish2",
    "babylock",
    "Flourish II · BLMFO2",
    160,
    260,
    ["babylock-ef81"],
    ["babylock", "babylockHoops"],
    ["pes", "dst"],
    "pes",
  ),
  "bernina-b500": machine(
    "bernina-b500",
    "bernina",
    "B 500 · SDT generation",
    400,
    150,
    ["bernina-large-oval", "bernina-medium"],
    ["bernina"],
  ),
  "viking-jade35": machine(
    "viking-jade35",
    "viking",
    "Designer Jade 35",
    240,
    150,
    ["viking-jewel"],
    ["viking"],
  ),
  "pfaff-creative15": machine(
    "pfaff-creative15",
    "pfaff",
    "creative 1.5",
    240,
    150,
    ["pfaff-master"],
    ["pfaff"],
    ["vp3"],
    "vp3",
  ),
  "singer-se9180": machine(
    "singer-se9180",
    "singer",
    "SE9180",
    170,
    100,
    ["singer-170"],
    ["singer", "singerFormats"],
    ["vp3"],
    "vp3",
  ),
  generic: {
    ...machine(
      "generic",
      "generic",
      "Design field",
      1000,
      1000,
      FIELD_PRESETS.map(([w, h]) => `field-${w}-${h}`),
      [],
    ),
    verification: "dimension-preset",
  },
};
export const LEGACY_EQUIPMENT = {
  se700: ["se700", "brother-100"],
  brother130: ["generic", "field-130-180"],
  generic200: ["generic", "field-200-200"],
};
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);
export function equipmentOf(p) {
  if (p.equipment) return p.equipment;
  const [machineId, hoopId] = own(LEGACY_EQUIPMENT, p.machine) || [
    p.machine,
    own(MACHINE_CATALOG, p.machine)?.hoops[0],
  ];
  return { version: 1, machineId, hoopId };
}
export function machineOf(p) {
  const e = equipmentOf(p);
  return own(MACHINE_CATALOG, e.machineId) || e.custom;
}
export function hoopOf(p) {
  const e = equipmentOf(p);
  return (
    own(HOOPS, e.hoopId) || e.custom?.hoops?.find((h) => h.id === e.hoopId)
  );
}
export function getMachine(p) {
  const m = machineOf(p),
    h = hoopOf(p);
  if (!m || !h) throw Error("Unknown machine or hoop.");
  return {
    name: m.name,
    width: h.width,
    height: h.height,
    speed: equipId(p) === "se700" ? 400 : 600,
    maxStitch: 7,
  };
}
function equipId(p) {
  return equipmentOf(p).machineId;
}
export function selectEquipment(p, machineId, hoopId, custom) {
  const e = {
    version: 1,
    catalogVersion: EQUIPMENT_CATALOG_VERSION,
    machineId,
    hoopId,
  };
  if (custom) e.custom = structuredClone(custom);
  validateEquipment({ machine: machineId, equipment: e });
  p.machine = machineId;
  p.equipment = e;
}
const field = (x) => Number.isFinite(x) && x >= 5 && x <= 1000;
const text = (s) =>
  typeof s === "string" && s.trim().length > 0 && s.length <= 160;
export function validateCustom(m) {
  if (
    !m ||
    !/^user-[a-zA-Z0-9-]{1,100}$/.test(m.id) ||
    !text(m.name) ||
    m.brand !== "generic" ||
    m.verification !== "user-provided" ||
    !field(m.maxField?.width) ||
    !field(m.maxField?.height) ||
    !Array.isArray(m.hoops) ||
    !m.hoops.length ||
    m.hoops.length > 50 ||
    !Array.isArray(m.formats) ||
    m.formats.some(
      (f) => !["pes", "pec", "dst", "exp", "jef", "vp3"].includes(f),
    ) ||
    !m.formats.includes(m.preferred)
  )
    throw Error("Invalid custom machine profile.");
  const ids = new Set();
  for (const h of m.hoops) {
    if (
      !h ||
      !text(h.id) ||
      ids.has(h.id) ||
      !text(h.name) ||
      !field(h.width) ||
      !field(h.height) ||
      h.width > m.maxField.width ||
      h.height > m.maxField.height ||
      h.reposition !== false
    )
      throw Error("Invalid custom hoop or continuous field.");
    ids.add(h.id);
  }
  return m;
}
export function validateEquipment(p) {
  if (typeof p.machine !== "string") throw Error("Invalid machine identifier.");
  if (!p.equipment) {
    if (!own(LEGACY_EQUIPMENT, p.machine) && !own(MACHINE_CATALOG, p.machine))
      throw Error("Unknown machine profile.");
    return;
  }
  const e = p.equipment,
    m = machineOf(p),
    h = hoopOf(p);
  if (
    !e ||
    e.version !== 1 ||
    (e.catalogVersion !== undefined &&
      (typeof e.catalogVersion !== "string" || e.catalogVersion.length > 80)) ||
    p.machine !== e.machineId ||
    !m ||
    !h
  )
    throw Error("Invalid saved machine / hoop selection.");
  if (e.custom) {
    validateCustom(e.custom);
    if (e.custom.id !== e.machineId || MACHINE_CATALOG[e.machineId])
      throw Error("Invalid custom machine identifier.");
  }
  if (!e.custom && !m.hoops.includes(e.hoopId))
    throw Error("Hoop is not documented for this model.");
}
export function validateEquipmentSettings(s) {
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.customMachines) ||
    s.customMachines.length > 100
  )
    throw Error("Invalid equipment settings.");
  const ids = new Set();
  for (const m of s.customMachines) {
    validateCustom(m);
    if (ids.has(m.id)) throw Error("Duplicate custom machine.");
    ids.add(m.id);
  }
  if (s.default) {
    validateEquipment({ machine: s.default.machineId, equipment: s.default });
  }
  return s;
}
export function loadEquipment(storage) {
  const raw = storage.getItem(EQUIPMENT_KEY);
  return raw
    ? validateEquipmentSettings(JSON.parse(raw))
    : { version: 1, customMachines: [] };
}
export function saveEquipment(storage, s) {
  validateEquipmentSettings(s);
  storage.setItem(EQUIPMENT_KEY, JSON.stringify(s));
}
export function applyDefault(p, s) {
  if (s.default) {
    p.machine = s.default.machineId;
    p.equipment = structuredClone(s.default);
  }
  return p;
}
export const fieldLabel = (h) =>
  `${h.width} × ${h.height} mm · ≈${(h.width / 25.4).toFixed(2)} × ${(h.height / 25.4).toFixed(2)} in`;
