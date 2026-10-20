import { machineOf } from "./equipment.js";
export const EXPORT_FORMATS = ["pes", "pec", "dst", "exp", "jef", "vp3"];
export const EXPORT_PREFERENCE_KEY = "embroidery-export-formats-v1";
// Exact model evidence; hoop-only profiles are deliberately not brand guesses.
export const FORMAT_PROFILES = {
  se700: {
    preferred: "pes",
    supported: ["pes", "dst"],
    source:
      "https://support.brother.com/g/b/sp/faqend.aspx?c=us&faqid=faqh00100271_002&ftype3=2103&lang=en&prod=hf_se700eus",
  },
};
export function preferredExport(
  machine,
  preferences = {},
  profiles = FORMAT_PROFILES,
) {
  const selected = typeof machine === "object" ? machineOf(machine) : null;
  machine = typeof machine === "object" ? machine.machine : machine;
  const preferred = selected?.preferred || profiles[machine]?.preferred;
  return EXPORT_FORMATS.includes(preferences[machine])
    ? preferences[machine]
    : EXPORT_FORMATS.includes(preferred)
      ? preferred
      : "pes";
}
export function exportGuidance(machine, format) {
  const selected = typeof machine === "object" ? machineOf(machine) : null;
  machine = typeof machine === "object" ? machine.machine : machine;
  const profile = FORMAT_PROFILES[machine];
  if (!profile && selected && selected.brand !== "generic")
    return selected.formats.includes(format)
      ? "This format is documented for " +
          selected.name +
          ". Export encoding is software-tested; physical hardware compatibility remains unverified."
      : "The design field is documented for " +
          selected.name +
          ", but this export format has not been verified for this model. Check its manual before stitching.";
  if (!profile)
    return "This is a hoop profile, not a verified machine model. Choose a format accepted by your exact machine. Formats are software-tested; physical compatibility is not inferred from the brand.";
  if (!profile.supported.includes(format))
    return "This application can encode this format, but Brother does not list it for the SE700. Choose PES or DST for this model. Other formats remain available for conversion.";
  return format === "pes"
    ? "PES is preferred for the SE700. The PEC origin repair was independently stitched on this model; current exports are software-tested and still need a physical sew-out."
    : "Brother lists DST support for the SE700. DST does not store thread colors. This export is software-tested; physical validation is still required.";
}
