// Reposition row penetrations subject to both length bounds. Never move boundary
// endpoints or delete thin spans. Interior points retain their phase wherever
// feasible; a short edge interval is not merged into an overlong stitch.
export function redistributeRow(row, minimum, maximum) {
  if (row.length < 2 || minimum <= 0) return { points: row, limited: false };
  const a = row[0].x,
    b = row.at(-1).x,
    span = b - a;
  if (minimum > maximum || span < minimum)
    return { points: row, limited: true };
  if (
    row
      .slice(1)
      .every(
        (p, i) =>
          p.x - row[i].x >= minimum - 1e-9 && p.x - row[i].x <= maximum + 1e-9,
      )
  )
    return { points: row, limited: false };
  const low = Math.ceil(span / maximum - 1e-9),
    high = Math.floor(span / minimum + 1e-9);
  if (low > high) return { points: row, limited: true };
  const n = Math.max(low, Math.min(high, row.length - 1)),
    points = [row[0]];
  for (let i = 1; i < n; i++) {
    const target = n === row.length - 1 ? row[i].x : a + (span * i) / n;
    const min = Math.max(points.at(-1).x + minimum, b - (n - i) * maximum),
      max = Math.min(points.at(-1).x + maximum, b - (n - i) * minimum);
    points.push({ x: Math.max(min, Math.min(max, target)), y: row[0].y });
  }
  points.push(row.at(-1));
  return { points, limited: false };
}
