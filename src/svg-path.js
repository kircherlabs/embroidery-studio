// Parse SVG path grammar before creating sampling geometry. In particular, signs
// can separate numbers, arc flags are single characters, and extra moveto pairs
// are lineto commands. Never infer coordinates by splitting on commas/spaces.
export class SVGPathError extends Error {}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };

export function parseSVGPath(data) {
  let index = 0,
    command = null,
    current = { x: 0, y: 0 },
    contour;
  let previous = null,
    control = null,
    commands = 0;
  const contours = [];
  const whitespace = () => {
    while (/[\t\n\r ]/.test(data[index] || "!")) index++;
  };
  const fail = () => {
    throw new SVGPathError(`Invalid path data near character ${index + 1}.`);
  };
  function number(comma, flag) {
    whitespace();
    if (comma && data[index] === ",") {
      index++;
      whitespace();
    }
    if (flag) {
      if (data[index] !== "0" && data[index] !== "1") fail();
      return Number(data[index++]);
    }
    const match = data.slice(index).match(NUMBER);
    if (!match) fail();
    index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail();
    return value;
  }
  function begin(point) {
    contour = { start: { ...point }, segments: [], closed: false };
    contours.push(contour);
  }
  function segment(type, args, end) {
    if (!contour || contour.closed) begin(current);
    contour.segments.push({
      type,
      args,
      start: { ...current },
      end: { ...end },
    });
    current = end;
  }
  while (true) {
    whitespace();
    if (index >= data.length) break;
    if (++commands > 100000)
      throw new SVGPathError("Path exceeds 100,000 commands.");
    const explicit = /[a-zA-Z]/.test(data[index]);
    if (explicit) command = data[index++];
    if (!command) fail();
    const type = command.toUpperCase(),
      relative = command !== type;
    if (!contours.length && type !== "M") fail();
    if (type === "Z") {
      if (!contour) fail();
      const end = { ...contour.start };
      segment("L", [end.x, end.y], end);
      contour.closed = true;
      previous = "Z";
      control = null;
      command = null;
      continue;
    }
    if (!ARITY[type]) fail();
    const values = Array.from({ length: ARITY[type] }, (_, i) =>
      number(i > 0 || !explicit, type === "A" && (i === 3 || i === 4)),
    );
    const point = (i) => ({
      x: values[i] + (relative ? current.x : 0),
      y: values[i + 1] + (relative ? current.y : 0),
    });
    const reflect = () =>
      control
        ? { x: current.x * 2 - control.x, y: current.y * 2 - control.y }
        : { ...current };
    let nextControl = null;
    if (type === "M") {
      current = point(0);
      begin(current);
      command = relative ? "l" : "L";
    } else if (type === "L" || type === "H" || type === "V") {
      const end =
        type === "H"
          ? { x: values[0] + (relative ? current.x : 0), y: current.y }
          : type === "V"
            ? { x: current.x, y: values[0] + (relative ? current.y : 0) }
            : point(0);
      segment("L", [end.x, end.y], end);
    } else if (type === "C" || type === "S") {
      const a =
        type === "C"
          ? point(0)
          : ["C", "S"].includes(previous)
            ? reflect()
            : { ...current };
      const b = point(type === "C" ? 2 : 0),
        end = point(type === "C" ? 4 : 2);
      segment("C", [a.x, a.y, b.x, b.y, end.x, end.y], end);
      nextControl = b;
    } else if (type === "Q" || type === "T") {
      const a =
        type === "Q"
          ? point(0)
          : ["Q", "T"].includes(previous)
            ? reflect()
            : { ...current };
      const end = point(type === "Q" ? 2 : 0);
      segment("Q", [a.x, a.y, end.x, end.y], end);
      nextControl = a;
    } else if (type === "A") {
      const end = point(5);
      segment("A", [...values.slice(0, 5), end.x, end.y], end);
    }
    if (![current.x, current.y].every(Number.isFinite)) fail();
    previous = type;
    control = nextControl;
  }
  return contours;
}

export function segmentPath(segment) {
  return `M${segment.start.x},${segment.start.y} ${segment.type}${segment.args.join(" ")}`;
}
