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
  // Multi-hoop source regions are regenerated normally. Only pull-compensation
  // extensions are bounded at their exclusive source domain, before routing,
  // underlay, tie handling and machine command generation. Ordinary fills keep
  // their exact historical path through this code.
  if (o.multiHoopDomain) {
    const clip = o.multiHoopDomain.map((r) => r.map(ctx.local));
    ctx.helpers = {
      ...helpers,
      fillRows: (...args) => {
        while (args.length < 10) args.push(undefined);
        // Dense underlay uses world rings; top/emboss rows use fill-local rings.
        // Applying a local domain to world rows can truncate one side of a join.
        args[10] = args[0] === ctx.rings ? o.multiHoopDomain : clip;
        return helpers.fillRows(...args);
      },
    };
  }
  if (!generate)
    throw Error(
      `${FILL_METHODS[ctx.cfg.method]} is not implemented in this build. Choose an available method; no substitute stitches were generated.`,
    );
  return generate(ctx, from, to);
}
