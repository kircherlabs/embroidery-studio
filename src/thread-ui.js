import { matchingUI } from "./thread-matching-ui.js";
import { THREAD_BRANDS, mergeCatalog } from "./thread-records.js";
import {
  CATALOG_FIELDS,
  catalogInput,
  catalogRecords,
} from "./thread-catalogs.js";
import { loadThreads, saveThreads } from "./thread-store.js";
import {
  threadTargets,
  assignThread,
  clearThread,
} from "./thread-assignment.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const option = (v, n) => `<option value="${esc(v)}">${esc(n)}</option>`;
const display = (r) =>
  `${r.brandName} · ${r.lineName} · ${r.number || "number not provided"}${r.colorName ? " · " + r.colorName : ""}`;
const dot = (r) =>
  `<span class="physical-swatch ${r.hex ? "" : "unknown"}" style="${r.hex ? "background:" + r.hex : ""}" aria-label="${esc(r.hex || "No digital color reference")}"></span>`;
export function installThreads(api) {
  const dialog = document.createElement("dialog");
  dialog.id = "thread-dialog";
  dialog.className = "thread-dialog";
  document.body.append(dialog);
  const $ = (id) => dialog.querySelector("#" + id);
  let library = null,
    targets = [],
    chosen = null,
    pageIndex = 0,
    importInput = null,
    sourceName = "",
    saving = false,
    opening = false,
    invoker = null;
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      dialog.close();
      return;
    }
    if (e.key !== "Enter" || e.target.matches("button,select,textarea")) return;
    e.preventDefault();
    const action =
      $("thread-match-apply") && !$("thread-match-apply").disabled
        ? $("thread-match-apply")
        : $("catalog-apply") && !$("catalog-apply").disabled
          ? $("catalog-apply")
          : $("catalog-preview-button") ||
            $("manual-thread-save") ||
            ($("thread-use") && !$("thread-use").disabled
              ? $("thread-use")
              : null);
    action?.click();
  });
  dialog.addEventListener("close", () =>
    requestAnimationFrame(() => {
      const target = invoker?.isConnected
        ? invoker
        : document.querySelector("[data-thread-pick]") ||
          document.getElementById("thread-library");
      target?.focus({ preventScroll: true });
    }),
  );
  const button = (id, text) =>
    `<button type="button" id="${id}">${text}</button>`;
  const head = (title) =>
    `<form method="dialog"><div class="dialog-heading"><h2>${title}</h2><button value="cancel" formnovalidate aria-label="Close thread library">×</button></div>`;
  const end = (footer) =>
    `<div class="dialog-actions">${footer || '<button value="cancel" formnovalidate>Close</button>'}</div></form>`;
  async function persist(next) {
    if (saving) return false;
    saving = true;
    try {
      await saveThreads(next);
      library = next;
      return true;
    } catch (e) {
      api.toast(
        "Could not save thread library. Existing data was retained. " +
          e.message,
      );
      return false;
    } finally {
      saving = false;
    }
  }
  const family = () => {
    const map = new Map(Object.entries(THREAD_BRANDS));
    for (const r of library.records) map.set(r.brandId, r.brandName);
    if (library.preferences.brandId && !map.has(library.preferences.brandId))
      map.set(
        library.preferences.brandId,
        library.preferences.brandName || library.preferences.brandId,
      );
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  };
  function lines() {
    const brand = $("thread-brand").value,
      items = new Map();
    for (const r of library.records)
      if (!brand || r.brandId === brand)
        items.set(
          r.brandId + "|" + r.lineId,
          `${brand ? "" : r.brandName + " · "}${r.lineName}`,
        );
    return [...items].sort((a, b) => a[1].localeCompare(b[1]));
  }
  function renderList() {
    if (!$("thread-search")) return;
    const query = $("thread-search").value.trim().toLowerCase(),
      brand = $("thread-brand").value,
      line = $("thread-line").value,
      material = $("thread-material").value,
      weight = $("thread-weight").value;
    let rows = library.records.filter(
      (r) =>
        (!brand || r.brandId === brand) &&
        (!line || r.brandId + "|" + r.lineId === line) &&
        (!material || r.material === material) &&
        (!weight || r.weight === weight) &&
        (!query ||
          [r.number, r.colorName, r.brandName, r.lineName].some((x) =>
            x?.toLowerCase().includes(query),
          )),
    );
    const compare = new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: "base",
      }),
      sort = $("thread-sort").value;
    rows.sort((a, b) =>
      sort === "color"
        ? (a.hex ? parseInt(a.hex.slice(1), 16) : 0xffffff + 1) -
            (b.hex ? parseInt(b.hex.slice(1), 16) : 0xffffff + 1) ||
          compare.compare(a.number || "", b.number || "")
        : compare.compare(a.number || "", b.number || "") ||
          compare.compare(a.colorName || "", b.colorName || "") ||
          a.id.localeCompare(b.id),
    );
    const count = Math.max(1, Math.ceil(rows.length / 50));
    pageIndex = Math.max(0, Math.min(pageIndex, count - 1));
    $("thread-results").innerHTML =
      rows
        .slice(pageIndex * 50, pageIndex * 50 + 50)
        .map(
          (r) =>
            `<button type="button" class="thread-result ${chosen === r.id ? "selected" : ""}" data-thread="${esc(r.id)}" aria-pressed="${chosen === r.id}">${dot(r)}<span><strong>${esc(r.number || "Unnumbered swatch")} · ${esc(r.colorName || "Name unavailable")}</strong><small>${esc(r.brandName)} · ${esc(r.lineName)}${r.material ? " · " + esc(r.material) : ""}${r.weight ? " · " + esc(r.weight) : ""}</small></span></button>`,
        )
        .join("") ||
      '<p class="property-note">No catalog colors match. Import a personal catalog or add a thread manually. No third-party color catalog is bundled.</p>';
    $("thread-result-count").textContent =
      `${rows.length.toLocaleString()} entries · page ${pageIndex + 1} of ${count}`;
    $("thread-prev").disabled = pageIndex === 0;
    $("thread-next").disabled = pageIndex === count - 1;
    const selected = library.records.find((r) => r.id === chosen);
    $("thread-detail").innerHTML = selected
      ? `${dot(selected)}<strong>${esc(display(selected))}</strong><p>${selected.hex ? esc(selected.hex) + " · digital approximation" : "No HEX reference; assignment retains the design color."}</p><p>${esc(selected.material || "Material unknown")} · ${esc(selected.weight || "Weight unknown")}${selected.spoolSizes.length ? " · " + esc(selected.spoolSizes.join(", ")) : ""}</p><details><summary>Source &amp; accuracy</summary><p>${esc(selected.source.name || "Source not provided")} · ${esc(selected.source.catalogVersion || "Version unknown")}<br>${esc(selected.source.verification)} · ${esc(selected.source.colorAccuracy)}</p><p>${esc(selected.source.url || "")}</p><p>${esc(selected.source.license || "Redistribution rights not established")}<br>${esc(selected.source.attribution || "")}</p></details>`
      : '<p class="property-note">Choose a color to view its spool identity and source. Screen approximations do not reproduce physical thread exactly.</p>';
    $("thread-use").disabled = !selected || !targets.length;
  }
  function picker() {
    chosen = null;
    pageIndex = 0;
    dialog.innerHTML =
      head("Thread library") +
      `<p class="property-note">Personal catalogs stay on this device. Import does not grant redistribution rights. PEC machine colors are separate from physical thread products.</p><div class="thread-top-actions">${button("thread-match", "Match design colors…")}${button("thread-import", "Import catalog…")}${button("thread-manual", "Add thread…")}${button("thread-prefer", "Use brand / line as default")}${button("thread-remove-line", "Remove selected line…")}</div><div class="thread-filters"><label>Brand<select id="thread-brand">${option("", "All brands")}${family()
        .map(([id, n]) => option(id, n))
        .join(
          "",
        )}</select></label><label>Product line<select id="thread-line"></select></label><label>Search spool number or name<input id="thread-search" type="search" autocomplete="off"></label><label>Material<select id="thread-material">${option("", "All materials")}${[
        ...new Set(library.records.map((r) => r.material).filter(Boolean)),
      ]
        .sort()
        .map((m) => option(m, m))
        .join(
          "",
        )}</select></label><label>Weight<select id="thread-weight">${option("", "All weights")}${[
        ...new Set(library.records.map((r) => r.weight).filter(Boolean)),
      ]
        .sort()
        .map((m) => option(m, m))
        .join(
          "",
        )}</select></label><label>Sort<select id="thread-sort">${option("number", "Spool number")}${option("color", "Digital color")}</select></label></div><div class="thread-browse"><div><p id="thread-result-count" role="status"></p><div id="thread-results"></div><div class="thread-pagination">${button("thread-prev", "Previous")}${button("thread-next", "Next")}</div></div><aside id="thread-detail"></aside></div><p class="property-note">${targets.length ? `Assign to ${targets.length} selected sewing action${targets.length === 1 ? "" : "s"}. Other actions, geometry and original design colors are retained.` : "Select artwork or a sewing action in Properties to assign physical thread. Browsing and custom HEX colors remain optional."}</p>` +
      end(
        '<button value="cancel" formnovalidate>Close</button>' +
          button("thread-use", "Assign selected thread"),
      );
    $("thread-brand").value = library.preferences.brandId || "";
    if ($("thread-brand").selectedIndex < 0) $("thread-brand").value = "";
    const updateLines = () => {
      $("thread-line").innerHTML =
        option("", "All product lines") +
        lines()
          .map(([id, n]) => option(id, n))
          .join("");
    };
    updateLines();
    if (library.preferences.lineId)
      $("thread-line").value =
        (library.preferences.brandId || "") + "|" + library.preferences.lineId;
    if ($("thread-line").selectedIndex < 0) $("thread-line").value = "";
    $("thread-brand").onchange = () => {
      pageIndex = 0;
      updateLines();
      renderList();
    };
    for (const id of [
      "thread-line",
      "thread-material",
      "thread-weight",
      "thread-sort",
    ])
      $(id).onchange = () => {
        pageIndex = 0;
        renderList();
      };
    let timer;
    $("thread-search").oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        pageIndex = 0;
        renderList();
      }, 100);
    };
    $("thread-results").onclick = (e) => {
      const row = e.target.closest("[data-thread]");
      if (row) {
        chosen = row.dataset.thread;
        renderList();
      }
    };
    $("thread-prev").onclick = () => {
      pageIndex--;
      renderList();
    };
    $("thread-next").onclick = () => {
      pageIndex++;
      renderList();
    };
    $("thread-prefer").onclick = async () => {
      const next = structuredClone(library),
        line = $("thread-line").value.split("|");
      next.preferences = {};
      if ($("thread-brand").value)
        next.preferences.brandId = $("thread-brand").value;
      if (line[1]) {
        next.preferences.lineId = line[1];
        next.preferences.brandId = line[0];
      }
      if (next.preferences.brandId)
        next.preferences.brandName =
          family().find(([id]) => id === next.preferences.brandId)?.[1] ||
          next.preferences.brandId;
      if (await persist(next))
        api.toast("Preferred thread brand / line saved on this device.");
    };
    $("thread-use").className = "primary";
    $("thread-use").onclick = () => {
      const r = library.records.find((r) => r.id === chosen);
      if (!r) return;
      let count = 0;
      api.mutate(() => (count = assignThread(targets, r)));
      dialog.close();
      api.toast(
        `${count} sewing actions assigned to ${display(r)}. Physical color matches are approximate.`,
      );
    };
    $("thread-remove-line").onclick = () => {
      const line = $("thread-line").value;
      if (!line) {
        api.toast("Choose a specific product line to remove.");
        return;
      }
      const count = library.records.filter(
        (r) => r.brandId + "|" + r.lineId === line,
      ).length;
      dialog.innerHTML =
        head("Remove local catalog line?") +
        `<p>Remove ${count} local entries? Saved projects keep their physical thread snapshots and visual fallbacks. Source files are untouched.</p>` +
        end(
          button("thread-remove-back", "Keep line") +
            button("thread-remove-confirm", "Remove line"),
        );
      $("thread-remove-back").onclick = picker;
      $("thread-remove-confirm").onclick = async () => {
        const next = structuredClone(library);
        next.records = next.records.filter(
          (r) => r.brandId + "|" + r.lineId !== line,
        );
        if (await persist(next)) picker();
      };
    };
    $("thread-import").onclick = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv,.json,.gpl";
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return;
        try {
          if (f.size > 24000000)
            throw Error("Choose a catalog smaller than 24 MB.");
          sourceName = f.name;
          importInput = catalogInput(await f.text(), f.name);
          importer();
        } catch (e) {
          api.toast(e.message);
        }
      };
      input.click();
    };
    $("thread-manual").onclick = () => manual();
    $("thread-match").onclick = match;
    renderList();
  }
  function importer() {
    const mapping = importInput.mapping || {};
    dialog.innerHTML =
      head("Import personal thread catalog") +
      `<p>${esc(sourceName)} · ${importInput.rows.length.toLocaleString()} source rows</p><p class="property-note">Use data you are entitled to use. It stays local and is never bundled or redistributed. Imports remain labeled user-imported, even when a source claims manufacturer verification.</p><div class="thread-filters"><label>Default brand (for missing fields)<input id="catalog-brand" value="${esc(library.preferences.brandId ? THREAD_BRANDS[library.preferences.brandId] || library.preferences.brandId : "")}"></label><label>Default product line<input id="catalog-line"></label><label>Source URL (optional)<input id="catalog-url" type="url"></label><label>Catalog version (optional)<input id="catalog-version"></label><label>License / personal-use note<input id="catalog-license" value="Personal local use; redistribution rights not established"></label></div>${importInput.kind === "csv" ? `<details open><summary>Column mapping</summary><div class="thread-filters">${CATALOG_FIELDS.map((k) => `<label>${esc(k)}<select data-map="${k}">${option("", "Not provided / use default")}${importInput.headers.map((h) => option(h, h)).join("")}</select></label>`).join("")}</div></details>` : importInput.kind === "gpl" ? '<label class="check"><input id="catalog-number-prefix" type="checkbox">Interpret a leading code in each color label as its spool number</label><p class="property-note">Without explicit numbers these are unnumbered palette swatches, not verified physical spool products.</p>' : ""}<label class="check"><input id="catalog-replace" type="checkbox">Replace matching brand + line + number records (otherwise keep existing)</label><p id="catalog-status" role="status"></p><div id="catalog-preview"></div>` +
      end(
        button("catalog-back", "Back") +
          button("catalog-preview-button", "Preview import") +
          button("catalog-apply", "Import into local library"),
      );
    dialog.querySelectorAll("[data-map]").forEach((el) => {
      el.value = mapping[el.dataset.map] || "";
    });
    let preview = null;
    const scan = () => {
      try {
        const map = Object.fromEntries(
          [...dialog.querySelectorAll("[data-map]")].map((el) => [
            el.dataset.map,
            el.value,
          ]),
        );
        preview = catalogRecords(importInput, {
          mapping: map,
          brandName: $("catalog-brand").value,
          lineName: $("catalog-line").value,
          numberPrefix: $("catalog-number-prefix")?.checked,
          source: {
            name: sourceName,
            url: $("catalog-url").value || null,
            catalogVersion: $("catalog-version").value || null,
            license: $("catalog-license").value || null,
          },
        });
        const result = mergeCatalog(
          library.records,
          preview,
          $("catalog-replace").checked,
        );
        $("catalog-status").textContent =
          `${preview.length} valid entries · ${result.added} new · ${result.kept} existing kept · ${result.replaced} replaced. ${preview.filter((r) => r.hex === null).length} have no HEX reference.`;
        $("catalog-preview").innerHTML = preview
          .slice(0, 8)
          .map((r) => `<p>${dot(r)}${esc(display(r))}</p>`)
          .join("");
        $("catalog-apply").disabled = false;
      } catch (e) {
        preview = null;
        $("catalog-status").textContent = e.message;
        $("catalog-apply").disabled = true;
      }
    };
    for (const el of dialog.querySelectorAll("input,select"))
      el.oninput = el.onchange = () => {
        preview = null;
        $("catalog-apply").disabled = true;
        $("catalog-status").textContent =
          "Preview the revised mapping before importing.";
      };
    $("catalog-preview-button").onclick = scan;
    $("catalog-apply").disabled = true;
    $("catalog-apply").className = "primary";
    $("catalog-back").onclick = picker;
    $("catalog-apply").onclick = async () => {
      if (!preview) return;
      const next = structuredClone(library),
        result = mergeCatalog(
          next.records,
          preview,
          $("catalog-replace").checked,
        );
      next.records = result.records;
      if (await persist(next)) {
        picker();
        api.toast(
          `${result.added} thread entries added; ${result.replaced} replaced. Source numbers and brand / line identity retained.`,
        );
      }
    };
  }
  function manual() {
    dialog.innerHTML =
      head("Add a personal thread") +
      `<p class="property-note">Enter the spool label. Leave unknown material, weight or digital color empty; no manufacturer color is inferred.</p><div class="thread-filters"><label>Brand<input id="manual-thread-brand" required></label><label>Product line<input id="manual-thread-line" required></label><label>Spool number (text)<input id="manual-thread-number" maxlength="80"></label><label>Color name<input id="manual-thread-name"></label><label>HEX approximation (optional)<input id="manual-thread-hex" placeholder="#123456"></label><label>Material<input id="manual-thread-material"></label><label>Weight<input id="manual-thread-weight"></label></div><p id="manual-thread-error" role="status"></p>` +
      end(
        button("manual-thread-back", "Back") +
          button("manual-thread-save", "Save thread"),
      );
    $("manual-thread-back").onclick = picker;
    $("manual-thread-save").onclick = async () => {
      try {
        const { normalizeThread } = await import("./thread-records.js");
        const r = normalizeThread({
          brandName: $("manual-thread-brand").value,
          lineName: $("manual-thread-line").value,
          number: $("manual-thread-number").value,
          colorName: $("manual-thread-name").value,
          hex: $("manual-thread-hex").value,
          material: $("manual-thread-material").value,
          weight: $("manual-thread-weight").value,
          source: {
            name: "Personal spool label",
            verification: "user-entered",
          },
        });
        r.source.verification = "user-entered";
        const next = structuredClone(library);
        next.records = mergeCatalog(next.records, [r], true).records;
        if (await persist(next)) {
          picker();
          chosen = r.id;
          renderList();
        }
      } catch (e) {
        $("manual-thread-error").textContent = e.message;
      }
    };
  }
  function match() {
    matchingUI({
      dialog,
      library,
      targets,
      api,
      back: picker,
      esc,
      option,
      display,
      dot,
    });
  }
  async function open(nextTargets = [], matching = false) {
    if (opening || dialog.open) return;
    opening = true;
    invoker = document.activeElement;
    dialog.innerHTML =
      head("Thread library") +
      '<p role="status">Loading local thread library…</p>' +
      end();
    dialog.showModal();
    try {
      library = await loadThreads();
      if (!dialog.open) return;
      targets = nextTargets;
      if (matching) match();
      else picker();
    } catch (e) {
      dialog.close();
      api.toast(
        "Thread library could not be read. Existing data was not overwritten. " +
          e.message,
      );
    } finally {
      opening = false;
    }
  }
  function inspector(objects, single, state) {
    const color = document.getElementById("thread-color");
    if (!color) return;
    const scoped = threadTargets(objects, state, single);
    if (!scoped.length) return;
    const box = document.createElement("div");
    box.className = "physical-thread-controls";
    const values = scoped
        .map((t) => t.operation.physicalThread?.thread)
        .filter(Boolean),
      label =
        values.length === scoped.length &&
        values.every((r) => r.id === values[0].id)
          ? display(values[0])
          : values.length
            ? "Mixed physical thread assignments"
            : "Custom design color · no physical thread assigned";
    box.innerHTML = `<p class="property-note">${esc(label)}</p><button type="button" data-thread-pick aria-haspopup="dialog" aria-controls="thread-dialog">Choose physical thread…</button>${values.length ? '<button type="button" data-thread-clear>Restore design color</button>' : ""}`;
    color.nextElementSibling?.after(box);
    box.querySelector("[data-thread-pick]").onclick = () => open(scoped);
    box
      .querySelector("[data-thread-clear]")
      ?.addEventListener("click", () => api.mutate(() => clearThread(scoped)));
  }
  return {
    open,
    inspector,
    match: (objects) =>
      open(threadTargets(objects, { bulkOperations: "all" }, false), true),
  };
}
