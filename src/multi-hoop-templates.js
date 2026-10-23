import { getMachine } from "./equipment.js";
export const xml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const n = (x) => Number(x.toFixed(3));
const path = (rings, closed) =>
  rings
    .map(
      (r) =>
        r.map((p, i) => `${i ? "L" : "M"}${n(p.x)},${n(p.y)}`).join(" ") +
        (closed ? "Z" : ""),
    )
    .join(" ");
const sourcePath = (o) =>
  o.type === "manual"
    ? (o.commands || [])
        .filter((e) => ["jump", "stitch"].includes(e.cmd))
        .map(
          (e, i) => `${!i || e.cmd === "jump" ? "M" : "L"}${n(e.x)},${n(e.y)}`,
        )
        .join(" ")
    : path(o.rings || [], o.closed || o.type === "fill");
export function templateDrawing(master, section, registration) {
  const m = getMachine(master),
    h = section.hoop;
  return `<g fill="none" stroke="#263d32" stroke-width="0.18">${section.project.objects
    .filter((o) => !o.id.startsWith("@registration:"))
    .map(
      (o) =>
        `<path d="${sourcePath(o)}" transform="translate(${n(h.x)} ${n(h.y)})"/>`,
    )
    .join(
      "",
    )}</g><rect x="${n(h.x - m.width / 2)}" y="${n(h.y - m.height / 2)}" width="${m.width}" height="${m.height}" fill="none" stroke="#333" stroke-width="0.35" stroke-dasharray="3 2"/><path d="M${h.x - 4},${h.y}h8 M${h.x},${h.y - 4}v8" fill="none" stroke="#333" stroke-width="0.25"/>${registration.pairs
    .filter((p) => p.a === h.id || p.b === h.id)
    .flatMap((p) =>
      p.points.map(
        (q, i) =>
          `<g stroke="#a13434" stroke-width="0.25"><path d="M${n(q.x - 0.7)},${n(q.y)}h1.4 M${n(q.x)},${n(q.y - 0.7)}v1.4"/><text x="${n(q.x + (q.x > h.x ? -1 : 1))}" y="${n(q.y + (q.y > h.y ? -1 : 3))}" text-anchor="${q.x > h.x ? "end" : "start"}" stroke="none" fill="#a13434" font-size="2.5">${p.id}${i ? "B" : "A"}</text></g>`,
      ),
    )
    .join("")}`;
}
export function hoopTemplate(master, section, registration) {
  const m = getMachine(master),
    h = section.hoop;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}mm" height="${m.height}mm" viewBox="${n(h.x - m.width / 2)} ${n(h.y - m.height / 2)} ${m.width} ${m.height}"><title>Hooping ${section.number} · 1:1 · top is negative Y</title>${templateDrawing(master, section, registration)}</svg>`;
}
export function printTemplates(master, sections, registration) {
  const m = getMachine(master),
    pages = [];
  // A4 content: 190 × 277 mm after 10 mm margins. Header reserves 20 mm;
  // drawings are 190 × 250 mm at exactly one SVG unit per printed millimeter.
  for (const section of sections) {
    const nx = Math.max(1, Math.ceil((m.width - 10) / 180)),
      ny = Math.max(1, Math.ceil((m.height - 10) / 240));
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const left = section.hoop.x - m.width / 2 + x * 180,
          top = section.hoop.y - m.height / 2 + y * 240;
        pages.push(
          `<section class="sheet"><header><b>${xml(master.name).slice(0, 80)} · Hooping ${section.number} · tile ${x + 1}/${nx}, ${y + 1}/${ny} · TOP ↑</b><br/>Center: X ${n(section.hoop.x)}, Y ${n(section.hoop.y)} mm · field ${m.width} × ${m.height} mm · 100% / actual size<br/><svg width="50mm" height="6mm" viewBox="0 0 50 6"><path d="M0,2H50 M.1,0V4 M49.9,0V4" fill="none" stroke="black" stroke-width=".2"/><text x="15" y="5.8" font-size="2.5">Measure 50 mm</text></svg></header><svg xmlns="http://www.w3.org/2000/svg" width="190mm" height="250mm" viewBox="${n(left)} ${n(top)} 190 250">${templateDrawing(master, section, registration)}</svg></section>`,
        );
      }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>1:1 rehooping templates</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;font:10px system-ui}.sheet{width:190mm;height:277mm;break-after:page;overflow:hidden}.sheet:last-child{break-after:auto}header{height:20mm}svg{display:block}.instructions{padding:12px;background:#eee}@media print{.instructions{display:none}}</style></head><body><div class="instructions">Print at 100% / Actual size on A4. Disable Fit/Shrink and browser headers/footers. Verify the 50 mm calibration before using. Tile columns overlap by 10 mm; rows by 10 mm. Preserve TOP orientation and shared coordinates. Stitch marks are optional; templates do not prove physical alignment. Use Print in your browser.</div>${pages.join("")}</body></html>`;
}
export function overviewSvg(master, sections) {
  const m = getMachine(master),
    hs = sections.map((s) => s.hoop),
    x = Math.min(...hs.map((h) => h.x)) - m.width / 2 - 8,
    y = Math.min(...hs.map((h) => h.y)) - m.height / 2 - 8,
    w = Math.max(...hs.map((h) => h.x)) + m.width / 2 + 8 - x,
    h = Math.max(...hs.map((h) => h.y)) + m.height / 2 + 8 - y;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" viewBox="${x} ${y} ${w} ${h}"><title>Overview only · not actual size</title><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f4f0e5"/>${sections.map((s, i) => `<g stroke="${i % 2 ? "#a66736" : "#426c73"}"><rect x="${s.hoop.x - m.width / 2}" y="${s.hoop.y - m.height / 2}" width="${m.width}" height="${m.height}" fill="none" stroke-dasharray="3 2" stroke-width=".5"/><text x="${s.hoop.x - m.width / 2 + 3}" y="${s.hoop.y - m.height / 2 + 6}" font-size="5">${s.number}</text></g>${templateDrawing(master, s, { pairs: [] })}`).join("")}</svg>`;
}
