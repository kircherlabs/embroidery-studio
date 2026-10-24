// The same scope is used for painting tangents and accepting pointer hits.
// Anchors remain selectable; selecting an edge exposes only its own controls.
export function selectedHandles(curve, node, segment) {
  if (!curve?.nodes) return [];
  const nodes = curve.nodes;
  let handles = [];
  if (Number.isInteger(node) && nodes[node])
    handles = [
      { i: node, key: "in" },
      { i: node, key: "out" },
    ];
  else if (Number.isInteger(segment?.index)) {
    const i = segment.index;
    if (i >= 0 && i < nodes.length - (curve.closed ? 0 : 1))
      handles = [
        { i, key: "out" },
        { i: (i + 1) % nodes.length, key: "in" },
      ];
  }
  return handles.filter(({ i, key }) => nodes[i][key]);
}
