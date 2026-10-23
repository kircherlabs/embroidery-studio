// Layout metadata only: never expands a machine's continuous sewing field.
export function validateMultiHoop(p) {
  const m = p.multiHoop;
  if (m === undefined) return;
  const finite = (v, max) => Number.isFinite(v) && Math.abs(v) <= max;
  if (!m || m.version !== 1 || typeof m.enabled !== 'boolean' ||
      !Array.isArray(m.hoops) || m.hoops.length > 64 ||
      !finite(m.overlap, 500) || m.overlap < 0 ||
      !finite(m.margin, 20) || m.margin < 0.5 ||
      typeof m.registration !== 'boolean') throw Error('Invalid multi-hoop layout.');
  const ids = new Set();
  for (const h of m.hoops) {
    if (!h || typeof h.id !== 'string' || !h.id || h.id.length > 100 || ids.has(h.id) ||
        !finite(h.x, 10000) || !finite(h.y, 10000) ||
        !finite(h.seamX ?? 0, 500) || !finite(h.seamY ?? 0, 500)) throw Error('Invalid hooping position or duplicate ID.');
    ids.add(h.id);
  }
  if (m.assignments !== undefined && (!m.assignments || Array.isArray(m.assignments) ||
      typeof m.assignments !== 'object' || Object.keys(m.assignments).length > 1000 ||
      Object.entries(m.assignments).some(([k,v]) => k.length > 100 || typeof v !== 'string' || v.length > 100)))
    throw Error('Invalid hooping assignments.');
}
