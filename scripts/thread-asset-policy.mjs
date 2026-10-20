// Physical catalogs are user-installed local data until a pack has an explicit rights review.
export function checkThreadAsset(path, text = "") {
  const name = path.split(/[\\/]/).at(-1).toLowerCase();
  if (
    [
      "threadresearch.zip",
      "thread_colors.csv",
      "thread_conversions.csv",
      "thread_brand_catalog.md",
      "thread_license_audit.md",
      "pec_palette.csv",
    ].includes(name) ||
    name.endsWith(".gpl")
  )
    throw Error(
      "Unreviewed thread research/palette cannot be included in public assets: " +
        path,
    );
  if (name.endsWith(".json")) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    const rows = Array.isArray(data) ? data : data?.records;
    if (
      Array.isArray(rows) &&
      rows.some(
        (r) =>
          r &&
          (r.brandId || r.brandName) &&
          (r.lineId || r.lineName) &&
          ("number" in r || "hex" in r),
      )
    )
      throw Error(
        "Physical thread catalog data requires a redistribution review before bundling: " +
          path,
      );
  }
  if (name.endsWith(".csv")) {
    const header = text.split(/\r?\n/, 1)[0].toLowerCase();
    if (
      /brand|manufacturer/.test(header) &&
      /line|thread|color|colour/.test(header)
    )
      throw Error(
        "Thread catalog CSV is local-import data, not a public build asset: " +
          path,
      );
  }
}
