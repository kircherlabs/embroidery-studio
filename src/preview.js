// Only movement commands move the drawing cursor. Trims, stops and color changes
// must never turn metadata coordinates into a visible sewing connector.
export function* movementSegments(events, end = events.length) {
  let from = { x: 0, y: 0 };
  for (let i = 0; i < Math.min(end, events.length); i++) {
    const event = events[i];
    if (event.cmd !== "stitch" && event.cmd !== "jump") continue;
    yield { from, to: event, event, index: i };
    from = event;
  }
}
