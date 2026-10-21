import {
  collectionUI,
  requirementsUI,
  personalUI,
} from "./thread-inventory-ui.js";
import { isVisible, isLocked } from "./hierarchy.js";
import { matchingUI } from "./thread-matching-ui.js";
import {
  THREAD_BRANDS,
  normalizeThread,
  builtinThreads,
  mergeCatalog,
  libraryThreads,
  inventoryEntry,
} from "./thread-records.js";
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
    collectionChecks = new Set(),
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
    const action = [
      "personal-apply",
      "inventory-save",
      "thread-match-apply",
      "catalog-apply",
      "catalog-preview-button",
      "manual-thread-save",
      "thread-use",
    ]
      .map($)
      .find((el) => el && !el.disabled);
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
    const feedback = $("manual-thread-error") || $("library-status");
    if (saving) return false;
    saving = true;
    try {
      await saveThreads(next);
      library = next;
      return true;
    } catch (e) {
      const message =
        "Could not save thread library. Existing data was retained. " +
        e.message;
      if (feedback?.isConnected) feedback.textContent = message;
      api.toast(message);
      return false;
    } finally {
      saving = false;
    }
  }
  const family = () => {
    const map = new Map(Object.entries(THREAD_BRANDS));
    for (const r of libraryThreads(library)) map.set(r.brandId, r.brandName);
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
    for (const r of libraryThreads(library))
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
    const collection = $("thread-collection").value,
      inventory = new Map(library.inventory.map((i) => [i.thread.id, i]));
    let rows = libraryThreads(library).filter(
      (r) =>
        (collection !== "owned" || inventory.get(r.id)?.quantity > 0) &&
        (collection !== "missing" || !(inventory.get(r.id)?.quantity > 0)) &&
        (collection !== "favorites" || inventory.get(r.id)?.favorite) &&
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
            `<div class="thread-library-row"><button type="button" class="thread-result ${chosen === r.id ? "selected" : ""}" data-thread="${esc(r.id)}" aria-pressed="${chosen === r.id}">${dot(r)}<span><strong>${esc(r.number || "Unnumbered swatch")} · ${esc(r.colorName || "Name unavailable")}</strong><small>${esc(r.brandName)} · ${esc(r.lineName)}${r.material ? " · " + esc(r.material) : ""}${r.weight ? " · " + esc(r.weight) : ""}${inventory.get(r.id)?.quantity > 0 ? " · Owned ×" + inventory.get(r.id).quantity : " · Not owned"}${inventory.get(r.id)?.favorite ? " · Favorite" : ""}</small></span></button><label class="collection-mark"><input type="checkbox" data-collection-check="${esc(r.id)}" aria-label="Select ${esc(r.number || r.colorName || "spool")} for collection" ${collectionChecks.has(r.id) ? "checked" : ""}></label></div>`,
        )
        .join("") ||
      '<div class="thread-empty"><strong>Your thread library</strong><p>No colors match these filters. Clear filters, enable built-in starter catalogs, add a spool or import a catalog through Library management. Clear search and filters to browse all threads.</p><p>Physical threads and inventory are optional; ordinary design colors still export normally.</p></div>';
    $("thread-result-count").textContent =
      `${rows.length.toLocaleString()} entries · page ${pageIndex + 1} of ${count}`;
    $("thread-prev").disabled = pageIndex === 0;
    $("thread-next").disabled = pageIndex === count - 1;
    const selected = libraryThreads(library).find((r) => r.id === chosen);
    $("thread-detail").innerHTML = selected
      ? `${dot(selected)}<strong>${esc(display(selected))}</strong><p>${selected.hex ? esc(selected.hex) + " · digital approximation" : "No HEX reference; assignment retains the design color."}</p><p>${esc(selected.material || "Material unknown")} · ${esc(selected.weight || "Weight unknown")}${selected.spoolSizes.length ? " · " + esc(selected.spoolSizes.join(", ")) : ""}</p><details><summary>Source &amp; accuracy</summary><p>${esc(selected.source.name || "Source not provided")} · ${esc(selected.source.catalogVersion || "Version unknown")}<br>${esc(selected.source.verification)} · ${esc(selected.source.colorAccuracy)}</p><p>${esc(selected.source.url || "")}</p><p>${esc(selected.source.license || "Redistribution rights not established")}<br>${esc(selected.source.attribution || "")}</p></details>`
      : '<p class="property-note">Choose a color to view its spool identity and source. Screen approximations do not reproduce physical thread exactly.</p>';
    if (selected) {
      $("thread-detail").insertAdjacentHTML(
        "beforeend",
        `<div class="thread-top-actions">${button("thread-edit", "Edit approximate color…")}${library.records.some((r) => r.id === selected.id) ? button("thread-delete", "Remove personal entry…") : ""}</div>`,
      );
      $("thread-edit").onclick = () => manual(selected);
      if ($("thread-delete"))
        $("thread-delete").onclick = () => {
          dialog.innerHTML =
            head("Remove personal entry?") +
            `<p>Remove ${esc(display(selected))} from your local catalog? Owned-spool records and saved project assignments keep their snapshots. Remove stock separately through Collection details.</p>` +
            end(
              button("thread-delete-back", "Keep entry") +
                button("thread-delete-confirm", "Remove entry"),
            );
          $("thread-delete-back").onclick = picker;
          $("thread-delete-confirm").onclick = async () => {
            const next = structuredClone(library);
            next.records = next.records.filter((r) => r.id !== selected.id);
            if (await persist(next)) picker();
          };
        };
    }
    $("thread-use").disabled = !selected || !targets.length;
    $("thread-collection-edit").disabled = !selected;
    $("thread-owned-add").textContent =
      `Mark checked owned (${collectionChecks.size})`;
    $("thread-owned-add").disabled = !collectionChecks.size;
  }
  function picker() {
    chosen = null;
    collectionChecks.clear();
    pageIndex = 0;
    dialog.innerHTML =
      head("Thread library") +
      `<p class="property-note">Find a spool to assign or optionally mark as owned. Your collection stays on this device; ordinary design colors work without it.</p><div class="thread-top-actions">${button("thread-manual", "Add thread…")}${button("thread-owned-add", "Mark checked owned")}${button("thread-collection-edit", "Collection details…")}${button("thread-match", "Match design colors…")}${button("thread-requirements", "Project threads…")}</div><details id="thread-management"><summary>Library management</summary><div class="thread-top-actions">${button("thread-import", "Import catalog…")}${button("thread-personal", "Backup / restore…")}${button("thread-prefer", "Use brand / line as default")}${button("thread-remove-line", "Remove selected line…")}</div><p class="property-note">Personal imports stay local. Built-in catalogs are partial factual starter subsets with Studio-estimated screen colors; verify against your spool. PEC machine colors are separate from physical thread products.</p><label class="check"><input id="thread-builtins" type="checkbox" ${library.preferences.includeBuiltins !== false ? "checked" : ""}>Browse built-in starter catalogs</label></details><p id="library-status" role="status"></p><div class="thread-filters"><label>Brand<select id="thread-brand">${option("", "All brands")}${family()
        .map(([id, n]) => option(id, n))
        .join(
          "",
        )}</select></label><label>Product line<select id="thread-line"></select></label><label>Search spool number or name<input id="thread-search" type="search" autocomplete="off"></label><label>Collection<select id="thread-collection">${option("all", "All threads")}${option("owned", "Owned threads")}${option("missing", "Not owned")}${option("favorites", "Favorites")}</select></label></div><details id="thread-more-filters"><summary>More filters &amp; sorting</summary><div class="thread-filters"><label>Material<select id="thread-material">${option("", "All materials")}${[
        ...new Set(
          libraryThreads(library)
            .map((r) => r.material)
            .filter(Boolean),
        ),
      ]
        .sort()
        .map((m) => option(m, m))
        .join(
          "",
        )}</select></label><label>Weight<select id="thread-weight">${option("", "All weights")}${[
        ...new Set(
          libraryThreads(library)
            .map((r) => r.weight)
            .filter(Boolean),
        ),
      ]
        .sort()
        .map((m) => option(m, m))
        .join(
          "",
        )}</select></label><label>Sort<select id="thread-sort">${option("number", "Spool number")}${option("color", "Digital color")}</select></label></div></details><div class="thread-browse"><div><p id="thread-result-count" role="status"></p><div id="thread-results"></div><div class="thread-pagination">${button("thread-prev", "Previous")}${button("thread-next", "Next")}</div></div><aside id="thread-detail"></aside></div><p class="property-note">${targets.length ? `Assign to ${targets.length} selected sewing action${targets.length === 1 ? "" : "s"}. Other actions, geometry and original design colors are retained.` : "Select artwork or a sewing action in Properties to assign physical thread. Browsing and custom HEX colors remain optional."}</p>` +
      end(
        '<button value="cancel" formnovalidate>Close</button>' +
          button("thread-use", "Assign selected thread"),
      );
    $("thread-builtins").onchange = async () => {
      const next = structuredClone(library);
      next.preferences.includeBuiltins = $("thread-builtins").checked;
      if (await persist(next)) picker();
    };
    $("thread-collection").value = library.preferences.ownedOnly
      ? "owned"
      : "all";
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
      "thread-collection",
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
    $("thread-results").onchange = (e) => {
      const id = e.target.dataset.collectionCheck;
      if (!id) return;
      if (e.target.checked) collectionChecks.add(id);
      else collectionChecks.delete(id);
      $("thread-owned-add").disabled = !collectionChecks.size;
      $("thread-owned-add").textContent =
        `Mark checked owned (${collectionChecks.size})`;
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
      next.preferences = {
        includeBuiltins: library.preferences.includeBuiltins !== false,
        ownedOnly: $("thread-collection").value === "owned",
      };
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
      const r = libraryThreads(library).find((r) => r.id === chosen);
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
      if (!count) {
        api.toast(
          "This is a built-in starter line. Turn off built-in catalogs to browse personal entries only; owned spools and project assignments are retained.",
        );
        return;
      }
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
    $("thread-match").onclick = () => match();
    const common = () => ({
      dialog,
      library,
      api,
      back: picker,
      esc,
      display,
      dot,
      head,
      end,
      button,
      persist,
    });
    $("thread-collection-edit").onclick = () => {
      const thread = libraryThreads(library).find((r) => r.id === chosen);
      if (thread) collectionUI({ ...common(), thread });
    };
    $("thread-owned-add").onclick = async () => {
      const next = structuredClone(library),
        ids = new Set(next.inventory.map((i) => i.thread.id));
      for (const thread of libraryThreads(library).filter((r) =>
        collectionChecks.has(r.id),
      )) {
        if (ids.has(thread.id)) {
          const entry = next.inventory.find((i) => i.thread.id === thread.id);
          entry.quantity = Math.max(1, entry.quantity);
        } else next.inventory.push(inventoryEntry(thread));
      }
      if (await persist(next)) {
        collectionChecks.clear();
        renderList();
        api.toast("Checked spools marked owned; existing quantities retained.");
      }
    };
    $("thread-requirements").onclick = () =>
      requirementsUI({
        ...common(),
        matchProject: () => {
          targets = threadTargets(
            api.state.project.objects.filter(
              (o) =>
                isVisible(api.state.project, o) &&
                !isLocked(api.state.project, o),
            ),
            { bulkOperations: "all" },
            false,
          );
          match(true);
        },
      });
    $("thread-personal").onclick = () =>
      personalUI({
        ...common(),
        onImported: (data) => {
          library = data.threads;
          api.settingsChanged?.();
          picker();
        },
      });

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
  function manual(existing = null) {
    dialog.innerHTML =
      head(existing ? "Edit thread approximation" : "Add a personal thread") +
      `<p class="property-note">Copy the spool label. Only brand and spool number are required. Leave product line blank if unknown; it will be listed as Unspecified product line.</p><div class="thread-filters"><label>Brand<input id="manual-thread-brand" required maxlength="160" autocomplete="off" aria-describedby="manual-thread-error"></label><label>Product line (optional)<input id="manual-thread-line" maxlength="160"></label><label>Spool number<input id="manual-thread-number" required maxlength="80" aria-describedby="manual-thread-error"></label><label>Color name (optional)<input id="manual-thread-name" maxlength="160"></label><label>HEX approximation (optional)<input id="manual-thread-hex" placeholder="#123456" maxlength="7" aria-describedby="manual-thread-error"></label></div><div class="thread-color-editor"><output id="manual-color-preview" aria-live="polite"></output><label>Visual color picker<input type="color" id="manual-color-picker" value="#4079b0"></label>${button("manual-color-use", "Use picker color")}<div class="thread-rgb">${["R", "G", "B"].map((c) => `<label>${c}<input id="manual-color-${c}" type="number" min="0" max="255" step="1" aria-label="${c} color channel"></label>`).join("")}</div></div><p class="property-note">Screen colors are approximate. Choose a color to enable visual matching, or leave HEX empty for a label-only spool. Corrections keep the same spool identity; saved project snapshots change only when reassigned.</p><details><summary>Use an existing catalog color</summary><label>Search color or spool number<input id="manual-color-search" type="search"></label><label>Copy an approximate color<select id="manual-color-source"></select></label></details><details><summary>Optional spool details</summary><div class="thread-filters"><label>Material<input id="manual-thread-material" maxlength="160"></label><label>Weight<input id="manual-thread-weight" maxlength="160"></label></div></details><p id="manual-thread-error" role="alert"></p>` +
      end(
        button("manual-thread-back", "Back") +
          button("manual-thread-save", "Save thread"),
      );
    const fields = {
      brand: "brandName",
      line: "lineName",
      number: "number",
      name: "colorName",
      hex: "hex",
      material: "material",
      weight: "weight",
    };
    if (existing)
      for (const [id, key] of Object.entries(fields))
        $("manual-thread-" + id).value = existing[key] || "";
    if (existing)
      for (const key of ["brand", "line", "number"])
        $("manual-thread-" + key).readOnly = true;
    const preview = () => {
      const hex = $("manual-thread-hex").value.trim();
      const valid = /^#[0-9a-f]{6}$/i.test(hex);
      $("manual-color-preview").className = valid ? "" : "unknown";
      $("manual-color-preview").style.background = valid ? hex : "";
      $("manual-color-preview").textContent = [
        $("manual-thread-number").value,
        $("manual-thread-name").value,
        valid ? hex : "Choose an approximate color",
      ]
        .filter(Boolean)
        .join(" · ");
      if (valid) {
        $("manual-color-picker").value = hex;
        ["R", "G", "B"].forEach(
          (c, i) =>
            ($("manual-color-" + c).value = parseInt(
              hex.slice(1 + i * 2, 3 + i * 2),
              16,
            )),
        );
      }
    };
    for (const id of ["hex", "number", "name"])
      $("manual-thread-" + id).oninput = preview;
    const useColor = () => {
      $("manual-thread-hex").value = $("manual-color-picker").value;
      preview();
    };
    $("manual-color-use").onclick = useColor;
    $("manual-color-picker").oninput = useColor;
    for (const c of ["R", "G", "B"])
      $("manual-color-" + c).oninput = () => {
        const inputs = ["R", "G", "B"].map((k) => $("manual-color-" + k));
        if (inputs.every((e) => e.value !== "" && e.checkValidity())) {
          $("manual-thread-hex").value =
            "#" +
            inputs
              .map((e) => Number(e.value).toString(16).padStart(2, "0"))
              .join("");
          preview();
        }
      };
    const sourceColors = () => {
      const query = $("manual-color-search").value.toLowerCase();
      $("manual-color-source").innerHTML =
        option("", "Choose a color…") +
        libraryThreads(library)
          .filter(
            (r) =>
              r.hex && (!query || display(r).toLowerCase().includes(query)),
          )
          .slice(0, 30)
          .map((r) => option(r.id, display(r)))
          .join("");
    };
    $("manual-color-search").oninput = sourceColors;
    $("manual-color-source").onchange = () => {
      const r = libraryThreads(library).find(
        (r) => r.id === $("manual-color-source").value,
      );
      if (r?.hex) {
        $("manual-thread-hex").value = r.hex;
        preview();
      }
    };
    sourceColors();
    preview();
    $("manual-thread-back").onclick = picker;
    $("manual-thread-brand").focus();
    $("manual-thread-save").className = "primary";
    $("manual-thread-save").onclick = async () => {
      if (saving) return;
      const error = $("manual-thread-error"),
        save = $("manual-thread-save");
      for (const [id, message] of [
        ["brand", "Enter the brand shown on your spool."],
        ["number", "Enter a spool number, keeping leading zeros and letters."],
      ]) {
        const input = $("manual-thread-" + id);
        input.removeAttribute("aria-invalid");
        if (
          !input.value.trim() &&
          !(existing && id === "number" && existing.number === null)
        ) {
          error.textContent = message;
          input.setAttribute("aria-invalid", "true");
          input.focus();
          return;
        }
      }
      save.disabled = true;
      try {
        if (
          ["R", "G", "B"].some((c) => !$("manual-color-" + c).checkValidity())
        )
          throw Error("RGB channels must be whole numbers from 0 to 255.");
        const r = normalizeThread({
          brandName: $("manual-thread-brand").value,
          lineName:
            $("manual-thread-line").value.trim() || "Unspecified product line",
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
        r.source.colorAccuracy = r.hex ? "user-selected" : "unknown";
        if (existing) {
          r.id = existing.id;
          r.brandId = existing.brandId;
          r.lineId = existing.lineId;
          if (r.id !== normalizeThread({ ...r }).id)
            throw Error(
              "Spool identity cannot change here. Add another thread for a different label.",
            );
        }
        if (!existing && libraryThreads(library).some((t) => t.id === r.id))
          throw Error(
            "This brand, product line and spool number already exist. Select the existing thread rather than adding a duplicate.",
          );
        const next = structuredClone(library);
        next.records = mergeCatalog(next.records, [r], !!existing).records;
        if (existing)
          for (const i of next.inventory)
            if (i.thread.id === r.id) i.thread = structuredClone(r);
        if (await persist(next)) {
          if (!dialog.open || !save.isConnected) return;
          picker();
          $("thread-brand").value = "";
          $("thread-brand").dispatchEvent(new Event("change"));
          $("thread-collection").value = "all";
          chosen = r.id;
          $("thread-search").value = r.number;
          renderList();
          $("library-status").textContent = "Saved " + display(r) + ".";
          dialog.querySelector(`[data-thread="${CSS.escape(r.id)}"]`)?.focus();
        }
      } catch (e) {
        if (error.isConnected) error.textContent = e.message;
      } finally {
        if (save.isConnected) save.disabled = false;
      }
    };
  }
  function match(ownedOnly = library.preferences.ownedOnly || false) {
    matchingUI({
      dialog,
      library,
      targets,
      api,
      back: picker,
      ownedOnly,
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
