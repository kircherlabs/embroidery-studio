import { operationTargets, materialize, isSewing } from "./operations.js";
import { validateThread, validateAssignment } from "./thread-records.js";
export function threadTargets(objects, state, single = false) {
  return objects
    .filter((o) => o.type !== "reference")
    .flatMap((object) =>
      object.type === "manual"
        ? [{ object, operation: object }]
        : operationTargets(object, state, single)
            .filter(isSewing)
            .map((operation) => ({ object, operation })),
    );
}
export function assignThread(targets, record, method = "user", deltaE) {
  validateThread(record);
  let changed = 0;
  for (const { object, operation: old } of targets) {
    const op =
      object.type === "manual"
        ? object
        : materialize(object)[
            old.id === "base"
              ? 0
              : materialize(object).findIndex((o) => o.id === old.id)
          ];
    if (!op) continue;
    const assignment = {
      version: 1,
      thread: structuredClone(record),
      designColor: op.physicalThread?.designColor || op.color || object.color,
      method,
    };
    if (deltaE !== undefined) assignment.deltaE = deltaE;
    validateAssignment(assignment);
    op.physicalThread = assignment;
    op.color = record.hex || assignment.designColor;
    changed++;
  }
  return changed;
}
export function clearThread(targets) {
  for (const { object, operation: old } of targets) {
    const op =
      object.type === "manual"
        ? object
        : materialize(object)[
            old.id === "base"
              ? 0
              : materialize(object).findIndex((o) => o.id === old.id)
          ];
    if (op?.physicalThread) {
      op.color = op.physicalThread.designColor;
      delete op.physicalThread;
    }
  }
}
