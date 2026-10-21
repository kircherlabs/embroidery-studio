import { FILL_METHODS } from "./schema.js";
import { fillContext } from "./context.js";
const generators = new Map();
export function registerFill(method, generate) {
  if (!Object.hasOwn(FILL_METHODS, method) || generators.has(method))
    throw Error("Invalid or duplicate fill generator.");
  generators.set(method, generate);
}
export const availableFillMethods = () =>
  Object.fromEntries(
    [...generators.keys()].map((id) => [id, FILL_METHODS[id]]),
  );
export function generateFill(o, helpers, from, to) {
  const ctx = fillContext(o, helpers),
    generate = generators.get(ctx.cfg.method);
  if (!generate)
    throw Error(
      `${FILL_METHODS[ctx.cfg.method]} is not implemented in this build. Choose an available method; no substitute stitches were generated.`,
    );
  return generate(ctx, from, to);
}
