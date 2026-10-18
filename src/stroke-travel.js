import { distance, safeConnector } from "./geometry.js";

// Travel on the extracted topology, then simplify only visibility-tested chords.
// This complements the object/fill optimizer; it never changes object order.
export function strokeTravel(graph, from, to, rings) {
  const safe = (a, b) =>
    safeConnector(a, b, rings, 0, rings.slice(1), "nonzero");
  const thin = (path) => {
    const out = [path[0]];
    for (let i = 0; i < path.length - 1; ) {
      let best = i + 1;
      for (let j = i + 1; j < path.length; j++) {
        if (distance(path[i], path[j]) > 2.8) break;
        if (safe(path[i], path[j])) best = j;
      }
      if (!safe(path[i], path[best])) return null;
      out.push(path[best]);
      i = best;
    }
    return out;
  };
  if (safe(from, to)) {
    const count = Math.max(1, Math.ceil(distance(from, to) / 2.8));
    return Array.from({ length: count + 1 }, (_, i) => ({
      x: from.x + ((to.x - from.x) * i) / count,
      y: from.y + ((to.y - from.y) * i) / count,
    }));
  }
  const nearest = (p) =>
    [...graph.adjacency.keys()]
      .map((id) => ({ id, d: distance(p, graph.point(id)) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 32)
      .find((n) => safe(p, graph.point(n.id)))?.id;
  const start = nearest(from),
    end = nearest(to);
  if (start === undefined || end === undefined) return null;
  const costs = new Map([[start, 0]]),
    previous = new Map(),
    heap = [];
  const push = (id, d) => {
    let i = heap.length;
    heap.push({ id, d });
    while (i) {
      const p = (i - 1) >> 1;
      if (heap[p].d <= d) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = { id, d };
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1].d < heap[c].d) c++;
        if (heap[c].d >= last.d) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
    }
    return first;
  };
  push(start, 0);
  while (heap.length) {
    const { id, d } = pop();
    if (d !== costs.get(id)) continue;
    if (id === end) break;
    for (const next of graph.adjacency.get(id) || []) {
      const cost = d + distance(graph.point(id), graph.point(next));
      if (cost < (costs.get(next) ?? Infinity)) {
        costs.set(next, cost);
        previous.set(next, id);
        push(next, cost);
      }
    }
  }
  if (!costs.has(end)) return null;
  const ids = [end];
  while (ids.at(-1) !== start) ids.push(previous.get(ids.at(-1)));
  return thin([from, ...ids.reverse().map(graph.point), to]);
}
