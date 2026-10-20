import { matchIndex, matchGroups } from "./thread-matching.js";
import { assignThread } from "./thread-assignment.js";
export function matchingUI({
  dialog,
  library,
  targets,
  api,
  back,
  esc,
  option,
  display,
  dot,
}) {
  const $ = (id) => dialog.querySelector("#" + id);
  const brands = new Map(library.records.map((r) => [r.brandId, r.brandName]));
  dialog.innerHTML = `<form method="dialog"><div class="dialog-heading"><h2>Match design colors to thread</h2><button value="cancel" formnovalidate aria-label="Close thread matching">×</button></div><p class="property-note">Suggestions compare digital colors using CIELAB ΔE76. Physical thread, lighting and fabric differ. These are algorithmic suggestions, not manufacturer conversions. Review alternatives before applying. Original design colors remain available.</p><div class="thread-filters"><label>Brand<select id="match-brand">${option("", "All personal catalogs")}${[...brands].map(([id, n]) => option(id, n)).join("")}</select></label><label>Product line<select id="match-line"></select></label><label>Match from<select id="match-source">${option("design", "Original design colors")}${option("current", "Current thread approximation · substitute")}</select></label><label class="check"><input type="checkbox" id="match-owned">Use owned threads only</label></div><p id="match-count" role="status"></p><div id="match-results" class="thread-match-results"></div><div class="thread-pagination"><button type="button" id="match-prev">Previous</button><button type="button" id="match-next">Next</button></div><div class="dialog-actions"><button type="button" id="match-back">Back</button><button type="button" class="primary" id="thread-match-apply">Apply reviewed matches</button></div></form>`;
  let groups = [],
    choices = new Map(),
    page = 0;
  const owned = () =>
    library.inventory.filter((i) => i.quantity > 0).map((i) => i.thread.id);
  function render() {
    const visible = groups.slice(page * 40, page * 40 + 40);
    $("match-results").innerHTML =
      visible
        .map((g) => {
          const c = choices.get(g.key),
            previous = g.targets[0].operation.physicalThread?.thread;
          return `<div class="thread-match-row"><div>${dot({ hex: g.color })}<strong>${esc(g.color)}</strong><small>${g.targets.length} sewing action(s)${previous ? " · current: " + esc(display(previous)) : ""}</small></div><label>Suggested thread<select data-match="${esc(g.key)}">${option("", "Keep existing assignment / color")}${c.alternatives.map((a) => option(a.thread.id, display(a.thread) + " · ΔE " + a.deltaE.toFixed(1))).join("")}</select></label><small data-match-note>${c.id ? (c.manual ? "User-chosen substitution" : "Algorithmic nearest color") + (c.alternatives.find((a) => a.thread.id === c.id)?.deltaE > 20 ? " · large color difference; review carefully" : "") : "Unchanged"}</small></div>`;
        })
        .join("") || "<p>No sewing actions selected. Select artwork first.</p>";
    for (const el of dialog.querySelectorAll("[data-match]")) {
      const c = choices.get(el.dataset.match);
      el.value = c.id;
      el.onchange = () => {
        c.id = el.value;
        c.manual = true;
        render();
      };
    }
    $("match-count").textContent =
      `${groups.length} source color groups · ${[...choices.values()].filter((c) => c.id).length} proposed matches. ${$("match-owned").checked && !owned().length ? "No owned spools available; no fallback to unowned catalogs." : ""}`;
    $("match-prev").disabled = page === 0;
    $("match-next").disabled = (page + 1) * 40 >= groups.length;
    $("thread-match-apply").disabled = ![...choices.values()].some((c) => c.id);
  }
  function calculate() {
    groups = matchGroups(targets, $("match-source").value === "current");
    const nearest = matchIndex(library.records, {
      brand: $("match-brand").value,
      line: $("match-line").value,
      owned: $("match-owned").checked ? owned() : null,
    });
    choices = new Map(
      groups.map((g) => {
        const alternatives = nearest(g.color);
        return [
          g.key,
          { alternatives, id: alternatives[0]?.thread.id || "", manual: false },
        ];
      }),
    );
    page = 0;
    render();
  }
  function lines() {
    const brand = $("match-brand").value,
      lines = new Map(
        library.records
          .filter((r) => !brand || r.brandId === brand)
          .map((r) => [
            r.brandId + "|" + r.lineId,
            r.brandName + " · " + r.lineName,
          ]),
      );
    $("match-line").innerHTML =
      option("", "All product lines") +
      [...lines].map(([id, n]) => option(id, n)).join("");
  }
  $("match-brand").value = library.preferences.brandId || "";
  if ($("match-brand").selectedIndex < 0) $("match-brand").value = "";
  lines();
  const preferred =
    (library.preferences.brandId || "") +
    "|" +
    (library.preferences.lineId || "");
  if ([...$("match-line").options].some((o) => o.value === preferred))
    $("match-line").value = preferred;
  $("match-brand").onchange = () => {
    lines();
    calculate();
  };
  for (const id of ["match-line", "match-source", "match-owned"])
    $(id).onchange = calculate;
  $("match-prev").onclick = () => {
    page--;
    render();
  };
  $("match-next").onclick = () => {
    page++;
    render();
  };
  $("match-back").onclick = back;
  $("thread-match-apply").onclick = () => {
    let count = 0;
    api.mutate(() => {
      for (const g of groups) {
        const c = choices.get(g.key),
          a = c.alternatives.find((a) => a.thread.id === c.id);
        if (a)
          count += assignThread(
            g.targets,
            a.thread,
            c.manual ? "user" : "algorithmic",
            a.deltaE,
          );
      }
    });
    dialog.close();
    api.toast(
      `${count} sewing actions matched. Original design colors retained; digital matches are approximate.`,
    );
  };
  calculate();
}
