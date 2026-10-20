import { getMachine, hoopOf, machineOf } from "./equipment.js";
export const FORMAT_STATUS = {
  pes: {
    implemented: true,
    roundTrip: true,
    colors: "RGB plus PEC fallback",
    pauses: "stop",
    maxBlocks: 255,
  },
  pec: {
    implemented: true,
    roundTrip: true,
    colors: "PEC machine palette approximation",
    pauses: "stop",
    maxBlocks: 255,
  },
  dst: {
    implemented: true,
    roundTrip: true,
    colors: "No embedded thread palette",
    pauses: "color",
  },
  exp: {
    implemented: true,
    roundTrip: true,
    colors: "No embedded thread palette / companion color file",
    pauses: "color",
  },
  jef: {
    implemented: true,
    roundTrip: true,
    colors: "Janome machine palette approximation",
    pauses: "stop",
  },
  vp3: {
    implemented: true,
    roundTrip: true,
    colors: "RGB",
    pauses: "unsupported",
    maxBlocks: 255,
  },
  hus: {
    implemented: false,
    roundTrip: false,
    reason: "The pinned dependency includes a reader but no HUS writer.",
  },
  vip: {
    implemented: false,
    roundTrip: false,
    reason: "The pinned dependency includes a reader but no VIP writer.",
  },
};
export function exportPreflight(project, events, format) {
  const errors = [],
    warnings = [],
    spec = FORMAT_STATUS[format],
    m = getMachine(project),
    model = machineOf(project),
    hoop = hoopOf(project);
  if (!spec?.implemented)
    return {
      errors: [spec?.reason || "No tested export writer for this format."],
      warnings,
    };
  const points = events.filter((e) => ["stitch", "jump"].includes(e.cmd));
  if (!points.length || !events.some((e) => e.cmd === "stitch"))
    errors.push("There are no sewing stitches to export.");
  if (events.length > 250000)
    errors.push("The design exceeds 250,000 machine commands.");
  if (events.some((e) => !Number.isFinite(e.x) || !Number.isFinite(e.y)))
    errors.push("The plan contains invalid coordinates.");
  if (
    points.some(
      (e) =>
        Math.abs(e.x) > m.width / 2 + 0.001 ||
        Math.abs(e.y) > m.height / 2 + 0.001,
    )
  )
    errors.push("Commands extend outside the selected design field.");
  const stops = events.filter((e) => e.cmd === "stop").length,
    changes = events.filter((e) => e.cmd === "color").length;
  const blocks =
    1 + changes + (format === "pes" || format === "pec" ? stops : 0);
  if (spec.maxBlocks && blocks > spec.maxBlocks)
    errors.push(
      `${format.toUpperCase()} supports at most ${spec.maxBlocks} encoded color / pause blocks in this writer; this plan needs ${blocks}.`,
    );
  if (stops && spec.pauses === "unsupported")
    errors.push(
      "The current VP3 writer cannot preserve standalone machine stops. Use another documented format, or explicitly revise the construction actions; stops will not be silently removed.",
    );
  if (stops && spec.pauses === "color")
    warnings.push(
      `${stops} operator stops become color-change pauses in ${format.toUpperCase()}. Keep the same thread for those pauses; follow the project action list.`,
    );
  if (events.some((e) => e.threadKey)) {
    warnings.push(
      "Physical spool brand, product line and number remain in the project thread list; the machine file may not carry that identity. Follow the project list for substitutions and thread changes.",
    );
    if (["pes", "pec"].includes(format)) {
      let previous = events.find((e) => e.cmd === "stitch")?.color;
      if (
        events.some((e) => {
          if (e.cmd !== "color") return false;
          const same = e.threadKey && e.color === previous;
          previous = e.color;
          return same;
        })
      )
        warnings.push(
          "Different physical spools share a digital color. PES/PEC represents those thread changes as repeated-color operator pauses. Change to the next spool in the project thread list at each such pause.",
        );
    }
  }
  if (["dst", "exp"].includes(format))
    warnings.push(
      "Thread colors and physical spool identities are not embedded. Keep the project thread list and assign colors at the machine.",
    );
  if (["pec", "jef"].includes(format))
    warnings.push(
      "On-machine colors use a fixed format palette and can differ from artwork or physical threads.",
    );
  if (events.some((e) => e.cmd === "trim") && format === "jef")
    warnings.push(
      "The current JEF writer does not emit explicit trim commands. Machine jump-trim settings and long-travel heuristics control trimming. Review jump paths and machine settings.",
    );
  if (format === "vp3")
    warnings.push(
      "VP3 represents travel differently from explicit jump commands. The decoded preview may report fewer jumps; review trimmed travel and test on your machine.",
    );
  if (format === "jef")
    warnings.push(
      "The writer selects a legacy JEF hoop code from design dimensions, independently of this hoop selector. Confirm the physical hoop and placement on the machine; modern hoop headers remain unverified.",
    );
  if (format === "jef" && points.length) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const w = Math.round((maxX - minX) * 10),
      h = Math.round((maxY - minY) * 10);
    if (w >= 2000 || h >= 2000)
      errors.push(
        "This JEF writer has no verified hoop header for designs reaching 200 mm or larger on either axis. Choose a smaller field/design or convert with machine-vendor software. The full RE28b field is not yet export-verified.",
      );
  }
  if ((format === "pes" || format === "pec") && points.length) {
    const first = points[0];
    let minX = first.x,
      minY = first.y;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    }
    if (
      Math.round((first.x - minX) * 10) > 2047 ||
      Math.round((first.y - minY) * 10) > 2047
    )
      errors.push(
        "The PEC origin exceeds its verified 12-bit range. Reorder the first sewing region or use another documented format; do not rescale merely to bypass the origin check.",
      );
  }
  if (hoop.fieldShape === "oval-envelope")
    warnings.push(
      "The selected oval hoop is checked against its rectangular field envelope. Confirm corner clearance against its physical template.",
    );
  if (model.brand === "generic")
    warnings.push(
      "Machine compatibility and field dimensions are user-provided / generic, not manufacturer-verified.",
    );
  else if (!model.formats.includes(format))
    warnings.push(
      "This format is not documented for the selected exact model. Export is available for conversion; check the machine manual.",
    );
  return { errors, warnings };
}
// Validate the decoded result before a download, never the thumbnail or screen rendering.
export function checkRoundTrip(source, decoded, format) {
  const errors = [],
    a = source.filter((e) => e.cmd === "stitch"),
    b = decoded.filter((e) => e.cmd === "stitch");
  let at = 0;
  for (const needle of a) {
    while (
      at < b.length &&
      (Math.abs(needle.x - b[at].x) > 0.11 ||
        Math.abs(needle.y - b[at].y) > 0.11)
    )
      at++;
    if (at === b.length) {
      errors.push(
        "Decoded needle positions or sewing order differ from the generated plan. Export was canceled.",
      );
      break;
    }
    at++;
  }
  const pause = (e) =>
    e.filter((x) => ["stop", "color"].includes(x.cmd)).map((x) => x.cmd);
  let previousColor = source.find((e) => e.cmd === "stitch")?.color;
  const expected = source
    .filter((e) => ["stop", "color"].includes(e.cmd))
    .map((e) => {
      let cmd = e.cmd;
      if (cmd === "color") {
        if (
          ["pes", "pec"].includes(format) &&
          e.threadKey &&
          e.color === previousColor
        )
          cmd = "stop";
        previousColor = e.color;
      }
      return ["dst", "exp"].includes(format) && cmd === "stop" ? "color" : cmd;
    });
  if (JSON.stringify(expected) !== JSON.stringify(pause(decoded)))
    errors.push(
      "The exported file did not preserve the required stops and color-change order. Export was canceled.",
    );
  if (!decoded.length || decoded.at(-1).cmd !== "end")
    errors.push("The exported file lacks its final end command.");
  return { errors, addedNeedles: Math.max(0, b.length - a.length) };
}
