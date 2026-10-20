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
  return EXPORT_FORMATS.includes(preferences[machine])
    ? preferences[machine]
    : EXPORT_FORMATS.includes(profiles[machine]?.preferred)
      ? profiles[machine].preferred
      : "pes";
}
export function exportGuidance(machine, format) {
  const profile = FORMAT_PROFILES[machine];
  if (!profile)
    return "This is a hoop profile, not a verified machine model. Choose a format accepted by your exact machine. Formats are software-tested; physical compatibility is not inferred from the brand.";
  if (!profile.supported.includes(format))
    return "This application can encode this format, but Brother does not list it for the SE700. Choose PES or DST for this model. Other formats remain available for conversion.";
  return format === "pes"
    ? "PES is preferred for the SE700. The PEC origin repair was independently stitched on this model; current exports are software-tested and still need a physical sew-out."
    : "Brother lists DST support for the SE700. DST does not store thread colors. This export is software-tested; physical validation is still required.";
}
