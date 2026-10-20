import { nodeById, within } from "./hierarchy.js";

// Presentation only: ancestors remain legible as the route to a nested target;
// they are not themselves part of its isolated drawing scope.
export function focusClass(project, node, isolation) {
  const target = isolation && nodeById(project, isolation);
  if (!target) return "";
  if (node.id === target.id) return "focus-target";
  if (within(project, node, isolation)) return "focus-included";
  if (within(project, target, node.id)) return "focus-ancestor";
  return "focus-outside";
}
