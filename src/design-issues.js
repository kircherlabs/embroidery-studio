import { operationsOf, operationObject, isSewing } from "./operations.js";
import { isVisible } from "./hierarchy.js";
export function designIssues(project, warnings = [], diagnostics = {}) {
  const issues = [],
    add = (issue) => {
      if (
        !issues.some(
          (i) =>
            i.code === issue.code &&
            i.objectId === issue.objectId &&
            i.operationId === issue.operationId,
        )
      )
        issues.push(issue);
    };
  for (const o of project.objects.filter((o) => isVisible(project, o))) {
    const ops = operationsOf(o).filter((op) => op.enabled !== false);
    for (const op of ops) {
      const base = {
        objectId: o.id,
        objectName: o.name,
        operationId: op.id,
        operationName: op.name,
      };
      if (isSewing(op) && o.type !== "manual") {
        try {
          const view = operationObject(o, op);
          if (view.operationWarning)
            add({
              ...base,
              code: "collapsed-offset",
              severity: "error",
              message:
                "The contour offset collapses this region; this step generates no stitches.",
              action:
                "Reduce the inset, widen the boundary, or disable the step deliberately.",
            });
        } catch (e) {
          add({
            ...base,
            code: "invalid-operation",
            severity: "error",
            message: e.message,
            action:
              "Repair or close the source geometry, choose a compatible method, or disable this step.",
          });
        }
      }
      if (
        ["fill", "column", "satin", "border"].includes(op.type) &&
        (op.spacing ?? o.spacing) < 0.25
      )
        add({
          ...base,
          code: "density",
          severity: "warning",
          message:
            "Row spacing is below 0.25 mm; coverage may build up thread and pucker fabric.",
          action:
            "Increase row spacing or review thread, stabilizer and overlapping passes. Test a sew-out.",
        });
    }
    const stops = ops.filter((op) => op.type === "stop");
    if (stops.length)
      add({
        objectId: o.id,
        objectName: o.name,
        operationId: stops[0].id,
        operationName: stops[0].name,
        code: "stops",
        severity: "info",
        message: `${stops.length} intentional operator stops in this object's construction.`,
        action:
          "Review fabric positioning and trimming. PES uses repeated thread colors for stops; verify pauses on your machine.",
      });
    if (o.constructionArtworkIds?.length) {
      const linked = o.constructionArtworkIds.filter((id) =>
        project.objects.some((a) => a.id === id),
      );
      if (linked.length !== o.constructionArtworkIds.length)
        add({
          objectId: o.id,
          objectName: o.name,
          code: "missing-artwork",
          severity: "info",
          message: "Some linked decorative artwork has been deleted.",
          action:
            "Remaining artwork still sews between preparation and finishing. Undo deletion to restore removed components.",
        });
      const enabled = ops.filter(isSewing);
      if (
        !enabled.some(
          (op) =>
            (op.constructionStage ||
              (op.type === "border" ? "finish" : "prepare")) === "finish",
        )
      )
        add({
          objectId: o.id,
          objectName: o.name,
          code: "no-finish",
          severity: "warning",
          message:
            "This patch has no enabled finishing step after the artwork.",
          action:
            "Enable a finishing border, or keep this intentional for an unfinished construction.",
        });
    }
  }
  for (const warning of warnings) {
    if (
      warning.includes("this offset collapses") ||
      warning.includes("require operator action") ||
      warning.includes("spacing below 0.25")
    )
      continue;
    const info = /retained|omitted|source-order|layer order|wide satin/i.test(
      warning,
    );
    add({
      code: warning,
      severity: info ? "info" : "warning",
      message: warning,
      action: /hoop/i.test(warning)
        ? "Move or resize artwork, then regenerate before export."
        : /duplicate|coincident/i.test(warning)
          ? "Review coincident objects before removing intentional repeated passes."
          : /island/i.test(warning)
            ? "Set Small islands to zero to retain all details, or inspect the omitted fragments."
            : "Review the indicated construction or planning setting and inspect the stitch preview.",
    });
  }
  for (const issue of diagnostics.operationIssues || []) add(issue);
  const rank = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
