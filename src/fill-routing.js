import { distance, safeConnector } from "./geometry.js";

// A fill is a graph of scanline spans, rather than a flat left-to-right list.
// Route between interior anchors; compensated tips are sewn only by their own
// span. This keeps travel off counters even when compensation extends into them.
export function routeFill(
  rows,
  o,
  from,
  phase,
  { stride = 1, connectFrom = false, to = null } = {},
) {
  if (!rows.length) return [];
  // Containment alone does not mean concealment. In the opt-in quality path,
  // completed rows cannot be used as bridges back to an unsewn branch.
  const quality = o.qualitySafeguards === true && phase === "top";
  const holes = o.polygon ? o.rings.slice(1) : [],
    safe = (a, b) => safeConnector(a, b, o.rings, 0, holes, o.fillRule),
    nodes = [],
    edges = [],
    groups = new Map();
  const add = (p, row, end) => {
    const id = nodes.length;
    nodes.push({ p, row, end });
    edges.push([]);
    return id;
  };
  const link = (a, b) => {
    const d = distance(nodes[a].p, nodes[b].p);
    edges[a].push({ to: b, d });
    edges[b].push({ to: a, d });
  };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i],
      anchor = r.anchors || [r[0], r.at(-1)];
    r.nodeIds = [add(anchor[0], i, 0), add(anchor[1], i, 1)];
    if (safe(anchor[0], anchor[1])) link(...r.nodeIds);
    const key = r.scanline ?? i;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  for (const [key, indices] of groups)
    for (const i of indices)
      for (const j of groups.get(key + 1) || []) {
        const a = rows[i],
          b = rows[j];
        // Only neighboring spans can connect. Avoid all-to-all visibility graphs.
        if (
          Math.max(a.interval?.[0] ?? -Infinity, b.interval?.[0] ?? -Infinity) >
          Math.min(a.interval?.[1] ?? Infinity, b.interval?.[1] ?? Infinity) + 3
        )
          continue;
        for (const u of a.nodeIds)
          for (const v of b.nodeIds)
            if (safe(nodes[u].p, nodes[v].p)) link(u, v);
      }
  const todo = new Set(
      rows.flatMap((r, i) =>
        (r.scanline ?? i) % stride === Math.floor(stride / 2) &&
        new Set(r.map((p) => Math.round(p.x * 10) + "," + Math.round(p.y * 10)))
          .size > 1
          ? [i]
          : [],
      ),
    ),
    out = [];
  function thinTravel(path) {
    const out = [path[0]];
    for (let i = 0; i < path.length - 1; ) {
      let best = i + 1,
        length = 0;
      for (let j = i + 1; j < path.length; j++) {
        length += distance(path[j - 1], path[j]);
        if (length > 2.8) break;
        if (safe(path[i], path[j])) best = j;
      }
      out.push(path[best]);
      i = best;
    }
    return out;
  }
  let at = null,
    position = from;
  const neighbors = quality
    ? rows.map((r, i) =>
        [
          ...new Set(
            r.nodeIds.flatMap((n) => edges[n].map((e) => nodes[e.to].row)),
          ),
        ].filter((j) => j !== i),
      )
    : null;
  function targets() {
    if (!quality) return todo;
    // A middle-row entry strands the first half once completed rows cannot be
    // retraced. Prefer an end of an unsewn row chain in the existing graph.
    const ends = [...todo].filter(
      (i) => neighbors[i].filter((j) => todo.has(j)).length <= 1,
    );
    return ends.length ? ends : [...todo];
  }
  function nearest() {
    if (to && todo.size === 1) {
      const ids = rows[[...todo][0]].nodeIds,
        minimum = Math.min(...ids.map((n) => distance(position, nodes[n].p)));
      return ids
        .filter((n) => distance(position, nodes[n].p) <= minimum + 2)
        .sort((a, b) => {
          const score = (n) =>
            distance(position, nodes[n].p) +
            0.25 *
              distance(
                nodes[rows[nodes[n].row].nodeIds[nodes[n].end ? 0 : 1]].p,
                to,
              );
          return score(a) - score(b);
        })[0];
    }
    let best = null,
      cost = Infinity;
    for (const i of targets())
      for (const n of rows[i].nodeIds) {
        const d = distance(position, nodes[n].p);
        if (d < cost) {
          best = n;
          cost = d;
        }
      }
    return best;
  }
  function route(start) {
    const dist = new Float64Array(nodes.length).fill(Infinity),
      prev = new Int32Array(nodes.length).fill(-1),
      done = new Uint8Array(nodes.length);
    dist[start] = 0;
    // Binary heap keeps complex compound fills bounded by graph edges, not N².
    const heap = [];
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
      const root = heap[0],
        tail = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let c = i * 2 + 1;
          if (c + 1 < heap.length && heap[c + 1].d < heap[c].d) c++;
          if (heap[c].d >= tail.d) break;
          heap[i] = heap[c];
          i = c;
        }
        heap[i] = tail;
      }
      return root;
    };
    push(start, 0);
    let best = null,
      bestScore = Infinity,
      firstCost = Infinity;
    while (heap.length) {
      const { id } = pop();
      if (done[id]) continue;
      done[id] = 1;
      if (todo.has(nodes[id].row)) {
        const path = [];
        for (let n = id; n !== -1; n = prev[n]) path.push(n);
        if (!to || todo.size !== 1) return path.reverse();
        firstCost = Math.min(firstCost, dist[id]);
        const end = rows[nodes[id].row].nodeIds[nodes[id].end ? 0 : 1],
          score = dist[id] + 0.25 * distance(nodes[end].p, to);
        // Exit lookahead is only a tie breaker. Do not add long running paths
        // through already sewn material merely to shorten a trimmed jump.
        if (dist[id] <= firstCost + 2 && score < bestScore) {
          best = path.reverse();
          bestScore = score;
        }
        continue;
      }
      for (const e of edges[id]) {
        if (quality && !todo.has(nodes[e.to].row)) continue;
        const d = dist[id] + e.d;
        if (d < dist[e.to]) {
          dist[e.to] = d;
          prev[e.to] = id;
          push(e.to, d);
        }
      }
    }
    return best;
  }
  while (todo.size) {
    let entering = false;
    if (at === null && connectFrom) {
      let cost = Infinity;
      for (const i of quality
        ? targets().flatMap((i) => rows[i].nodeIds)
        : nodes.keys()) {
        const d = distance(position, nodes[i].p);
        if (d < cost && safe(position, nodes[i].p)) {
          at = i;
          cost = d;
        }
      }
      connectFrom = false;
      entering = quality && at !== null;
    }
    const adjacent =
      at === null
        ? []
        : to && todo.size === 1
          ? []
          : edges[at]
              .filter((e) => todo.has(nodes[e.to].row))
              .sort((a, b) => a.d - b.d || a.to - b.to);
    let path = entering
        ? [at]
        : at === null
          ? null
          : adjacent.length
            ? [at, adjacent[0].to]
            : route(at),
      target = path?.at(-1) ?? nearest();
    if (target === null) break;
    const n = nodes[target],
      row = rows[n.row],
      p = n.end ? [...row].reverse() : [...row];
    if (path) {
      let travel = [position, ...path.map((id) => nodes[id].p), p[0]];
      const length = travel.reduce(
        (n, p, i) => n + (i ? distance(travel[i - 1], p) : 0),
        0,
      );
      if (
        (!quality || path.length === 2) &&
        distance(position, p[0]) <= length + 1e-8 &&
        // The nominal anchors must also see each other through material. Pull
        // compensation at the tips must not shortcut across a narrow open slot.
        safe(nodes[path[0]].p, nodes[path.at(-1)].p) &&
        safeConnector(
          position,
          p[0],
          o.rings,
          o.polygon ? o.compensation + 0.02 : 0,
          holes,
          o.fillRule,
        )
      )
        travel = [position, p[0]];
      else if (!quality) travel = thinTravel(travel);
      // The short retraces to compensated tips follow the original fill spans.
      out.push({
        p: travel,
        phase: phase === "underlay" ? "underlay-travel" : "travel",
        continuous: true,
        ...(phase === "top" &&
        path.slice(1, -1).some((id) => !todo.has(nodes[id].row)) &&
        travel.slice(1).reduce((n, p, i) => n + distance(travel[i], p), 0) > 3
          ? { routingRisk: "fill-return" }
          : {}),
      });
    }
    out.push({ p, phase, continuous: !!path });
    todo.delete(n.row);
    at = row.nodeIds[n.end ? 0 : 1];
    position = p.at(-1);
  }
  return out;
}
