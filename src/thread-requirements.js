import { generate } from "./engine.js";
import { matchIndex } from "./thread-matching.js";
export function projectThreads(project, inventory = []) {
  const plan = generate(project),
    snapshots = new Map(),
    rows = new Map(),
    owned = new Map(inventory.map((i) => [i.thread.id, i]));
  for (const o of project.objects)
    for (const action of [o, ...(o.operations || [])])
      if (action.physicalThread)
        snapshots.set(
          action.physicalThread.thread.id,
          action.physicalThread.thread,
        );
  const alternatives = matchIndex(
    inventory.filter((i) => i.quantity > 0).map((i) => i.thread),
  );
  let block = 1;
  for (const e of plan.events) {
    if (e.cmd === "color") block++;
    if (e.cmd !== "stitch") continue;
    const key = e.threadKey || e.color.toLowerCase();
    if (!rows.has(key)) {
      const thread = snapshots.get(e.threadKey),
        entry = thread && owned.get(thread.id);
      rows.set(key, {
        key,
        color: e.color,
        thread: thread || null,
        quantityOwned: entry?.quantity || 0,
        missing: !!thread && !(entry?.quantity > 0),
        blocks: [],
        alternatives:
          thread && entry?.quantity > 0 ? [] : alternatives(e.color, 3),
      });
    }
    const row = rows.get(key);
    if (!row.blocks.includes(block)) row.blocks.push(block);
  }
  return {
    rows: [...rows.values()],
    changes: plan.stats.changes,
    stops: plan.stats.stops,
    fits: plan.stats.fits,
    issues: plan.issues,
  };
}
export function shoppingRows(requirements) {
  return requirements.rows
    .filter((r) => r.missing && r.thread)
    .map((r) => ({
      brand: r.thread.brandName,
      line: r.thread.lineName,
      number: r.thread.number || "Number not provided",
      name: r.thread.colorName || "Name unavailable",
      quantity: 1,
    }));
}
export function shoppingCSV(rows) {
  const quote = (v) => {
    let s = String(v);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [
    ["Brand", "Product line", "Spool number", "Color name", "Desired quantity"],
    ...rows.map((r) => [r.brand, r.line, r.number, r.name, r.quantity]),
  ]
    .map((row) => row.map(quote).join(","))
    .join("\r\n");
}
