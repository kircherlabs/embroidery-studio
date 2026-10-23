import { getMachine } from "./equipment.js";
export function drawHoopingOverlay(ctx, s, scale, moving = false) {
  const layout = s.project.multiHoop;
  if (!layout?.enabled) return;
  const m = getMachine(s.project),
    bundle = s.multiHoopBundle;
  ctx.save();
  if (s.multiHoopMode && bundle && !moving) {
    for (const gap of bundle.uncovered || []) {
      ctx.beginPath();
      for (const poly of gap.polygon)
        for (const ring of poly) {
          ring.forEach(([x, y], i) =>
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
          );
          ctx.closePath();
        }
      ctx.fillStyle = "#cf43432a";
      ctx.fill("evenodd");
      ctx.strokeStyle = "#b63232";
      ctx.lineWidth = 1.5 / scale;
      ctx.stroke();
    }
    ctx.strokeStyle = "#69736e";
    ctx.lineWidth = 0.8 / scale;
    ctx.setLineDash([2 / scale, 4 / scale]);
    for (const domain of bundle.domains) {
      ctx.beginPath();
      for (const poly of domain)
        for (const ring of poly) {
          ring.forEach(([x, y], i) =>
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
          );
          ctx.closePath();
        }
      ctx.stroke();
    }
  }
  layout.hoops.forEach((h, i) => {
    const selected = s.multiHoopSelected === h.id,
      x = h.x - m.width / 2,
      y = h.y - m.height / 2;
    ctx.setLineDash([8 / scale, 5 / scale]);
    ctx.strokeStyle = "#fff9ed";
    ctx.lineWidth = (selected ? 4 : 3) / scale;
    ctx.strokeRect(x, y, m.width, m.height);
    ctx.strokeStyle = selected ? "#87532c" : "#426d72";
    ctx.lineWidth = (selected ? 2 : 1.3) / scale;
    ctx.strokeRect(x, y, m.width, m.height);
    if (s.multiHoopMode) {
      ctx.fillStyle = selected ? "#a36e2920" : "#426d7209";
      ctx.fillRect(x, y, m.width, m.height);
    }
    ctx.setLineDash([]);
    ctx.fillStyle = selected ? "#87532c" : "#28463d";
    ctx.beginPath();
    ctx.roundRect(
      x + 5 / scale,
      y + 5 / scale,
      24 / scale,
      24 / scale,
      4 / scale,
    );
    ctx.fill();
    ctx.fillStyle = "#fff9ed";
    ctx.font = `bold ${13 / scale}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), x + 17 / scale, y + 17 / scale);
  });
  if (bundle)
    for (const pair of bundle.registration?.pairs || [])
      for (const p of pair.points) {
        ctx.strokeStyle = "#c54b49";
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.moveTo(p.x - 4 / scale, p.y);
        ctx.lineTo(p.x + 4 / scale, p.y);
        ctx.moveTo(p.x, p.y - 4 / scale);
        ctx.lineTo(p.x, p.y + 4 / scale);
        ctx.stroke();
      }
  ctx.restore();
}
