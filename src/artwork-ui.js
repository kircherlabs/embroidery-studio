import { extractArtwork, insertArtwork } from "./artwork-library.js";
import {
  createArtworkRecord,
  uniqueArtworkName,
  artworkName,
  artworkBackup,
  parseArtworkBackup,
  mergeArtworkRecords,
  MAX_BACKUP_BYTES,
} from "./artwork-records.js";
import {
  loadArtwork,
  putArtwork,
  deleteArtwork,
  importArtwork,
  artworkRecovery,
  purgeInvalidArtwork,
} from "./artwork-store.js";
import { artworkThumbnail, artworkDimensions } from "./artwork-thumbnail.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (id, label) =>
  `<button type="button" id="${id}">${label}</button>`;
const download = (name, data) => {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export function installArtworkLibrary(api) {
  const dialog = document.createElement("dialog");
  dialog.id = "artwork-dialog";
  dialog.className = "thread-dialog artwork-dialog";
  dialog.setAttribute("aria-labelledby", "artwork-heading");
  document.body.append(dialog);
  const $ = (id) => dialog.querySelector("#" + id);
  let records = [],
    issues = [],
    chosen = null,
    query = "",
    page = 0,
    busy = false,
    epoch = 0,
    invoker = null;
  const previews = new Map();
  const selected = () => records.find((r) => r.id === chosen);
  const eligible = () => api.selection().length > 0;
  const head = (title) =>
    `<form method="dialog"><div class="dialog-heading"><h2 id="artwork-heading">${esc(title)}</h2><button value="cancel" formnovalidate aria-label="Close My Artwork">×</button></div>`;
  const end = (html) => `<div class="dialog-actions">${html}</div></form>`;
  const status = (message) => {
    if ($("artwork-status")) $("artwork-status").textContent = message;
  };
  async function action(work, done) {
    if (busy) return;
    busy = true;
    const ticket = epoch;
    dialog.setAttribute("aria-busy", "true");
    try {
      const result = await work();
      if (dialog.open && ticket === epoch) await done?.(result);
    } catch (e) {
      if (dialog.open && ticket === epoch) status(e.message);
      else api.toast(e.message);
    } finally {
      busy = false;
      dialog.removeAttribute("aria-busy");
    }
  }
  function renderResults() {
    if (!$("artwork-results")) return;
    const focus = document.activeElement?.dataset.artwork;
    const rows = records
      .filter((r) =>
        r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      )
      .sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) ||
          a.name.localeCompare(b.name),
      );
    const pages = Math.max(1, Math.ceil(rows.length / 40));
    page = Math.max(0, Math.min(page, pages - 1));
    $("artwork-results").innerHTML =
      rows
        .slice(page * 40, page * 40 + 40)
        .map((r) => {
          const key = r.id + "|" + r.updatedAt;
          if (!previews.has(key))
            previews.set(key, artworkThumbnail(r.artwork));
          return `<button type="button" class="thread-result artwork-card ${r.id === chosen ? "selected" : ""}" data-artwork="${esc(r.id)}" aria-pressed="${r.id === chosen}" title="${esc(r.name)} · ${esc(artworkDimensions(r.artwork))}">${previews.get(key)}<span class="thread-card-label"><strong>${esc(r.name)}</strong><small>${esc(artworkDimensions(r.artwork))}</small><small>${r.artwork.groups.length ? "Grouped artwork" : "Editable source"}</small></span></button>`;
        })
        .join("") ||
      `<div class="thread-empty"><strong>${records.length ? "No matching artwork." : "Your artwork library is empty."}</strong><p>${records.length ? "Try another name." : "Select artwork in your project, then choose Save Selection."}</p></div>`;
    $("artwork-count").textContent =
      `${rows.length} saved element${rows.length === 1 ? "" : "s"} · page ${page + 1} of ${pages}`;
    $("artwork-prev").disabled = page === 0;
    $("artwork-next").disabled = page === pages - 1;
    const r = selected(),
      canInsert = api.canInsert?.() !== false;
    $("artwork-insert").disabled = !r || !canInsert;
    $("artwork-rename").disabled = !r;
    $("artwork-delete").disabled = !r;
    $("artwork-selected").textContent = !canInsert
      ? "Finish or cancel the current drawing before inserting artwork."
      : r
        ? `${r.name} · ${artworkDimensions(r.artwork)}${r.artwork.order ? " · Saved manual sewing order" : ""}`
        : "Select an element to insert an independent editable copy.";
    if (focus)
      [...dialog.querySelectorAll("[data-artwork]")]
        .find((e) => e.dataset.artwork === focus)
        ?.focus({ preventScroll: true });
  }
  function gallery(message = "") {
    epoch++;
    dialog.innerHTML =
      head("My Artwork") +
      `<div class="thread-toolbar">${button("artwork-save", "Save Selection")}<details id="artwork-management"><summary>Library management</summary><div class="thread-top-actions">${button("artwork-import", "Import Library…")}${button("artwork-export", "Export Library")}${button("artwork-rename", "Rename selected…")}${button("artwork-delete", "Delete selected…")}${issues.length ? button("artwork-recovery", "Export recovery data") + button("artwork-cleanup", "Remove unreadable entries…") : ""}</div></details></div><div class="thread-library-content"><p id="artwork-status" role="status">${esc(message || (issues.length ? `${issues.length} unreadable entries were kept in storage. Use Library management to export recovery data or remove only unreadable entries.` : ""))}</p><label class="artwork-search-label">Search saved artwork by name<input id="artwork-search" type="search" autocomplete="off" value="${esc(query)}"></label><p id="artwork-count" role="status"></p><div id="artwork-results"></div><div class="thread-pagination">${button("artwork-prev", "Previous")}${button("artwork-next", "Next")}</div></div>` +
      end(
        `<span id="artwork-selected"></span><button value="cancel" formnovalidate>Close</button>${button("artwork-insert", "Insert Selected")}`,
      );
    $("artwork-save").disabled = !eligible();
    $("artwork-save").onclick = saveSelection;
    $("artwork-export").onclick = () => {
      try {
        download("My-Artwork.artwork-library.json", artworkBackup(records));
        status(
          `Exported ${records.length} editable elements.${issues.length ? " Unreadable entries were excluded; export recovery data separately." : ""}`,
        );
      } catch (e) {
        status(e.message);
      }
    };
    $("artwork-search").oninput = () => {
      query = $("artwork-search").value.trim();
      page = 0;
      renderResults();
    };
    $("artwork-results").onclick = (e) => {
      const card = e.target.closest("[data-artwork]");
      if (card) {
        chosen = card.dataset.artwork;
        renderResults();
      }
    };
    $("artwork-prev").onclick = () => {
      page--;
      renderResults();
    };
    $("artwork-next").onclick = () => {
      page++;
      renderResults();
    };
    $("artwork-insert").className = "primary";
    $("artwork-insert").onclick = () => {
      const r = selected();
      if (!r || busy || api.canInsert?.() === false) return;
      if (
        api.mutate(() => {
          const result = insertArtwork(api.state.project, r.artwork);
          api.selectInserted(result.roots);
        })
      ) {
        dialog.close();
        api.reveal();
        api.toast(
          `Inserted ${r.name} at its saved physical size.${[...r.artwork.objects, ...r.artwork.groups].some((n) => n.visible === false || n.locked) ? " Saved visibility and locks retained." : ""}`,
        );
      } else
        status(
          "Could not insert artwork. Check project object/geometry limits; the destination was retained.",
        );
    };
    $("artwork-rename").onclick = () => nameEditor(selected());
    $("artwork-delete").onclick = () => {
      const r = selected();
      if (r)
        confirm(
          "Delete saved artwork?",
          `Delete “${r.name}” from My Artwork? Previously inserted project copies are unaffected.`,
          "Delete saved item",
          () => deleteArtwork(r.id),
        );
    };
    $("artwork-import").onclick = importFile;
    if ($("artwork-recovery"))
      $("artwork-recovery").onclick = () =>
        action(
          () => artworkRecovery(),
          (raw) => {
            download("My-Artwork-recovery.json", {
              kind: "embroidery-studio-artwork-recovery",
              version: 1,
              items: raw,
            });
            status("Recovery data exported. Stored entries were retained.");
          },
        );
    if ($("artwork-cleanup"))
      $("artwork-cleanup").onclick = () =>
        confirm(
          "Remove unreadable entries?",
          "Export recovery data first if needed. This removes only entries that fail validation; valid artwork remains.",
          "Remove unreadable entries",
          purgeInvalidArtwork,
        );
    renderResults();
    if (chosen)
      [...dialog.querySelectorAll("[data-artwork]")]
        .find((e) => e.dataset.artwork === chosen)
        ?.focus({ preventScroll: true });
    else $("artwork-search").focus({ preventScroll: true });
  }
  async function reload(message) {
    const loaded = await loadArtwork();
    records = loaded.records;
    issues = loaded.issues;
    previews.clear();
    gallery(message);
  }
  function nameEditor(record = null, artwork = null) {
    epoch++;
    const source = record?.artwork || artwork;
    dialog.innerHTML =
      head(record ? "Rename saved artwork" : "Save to My Artwork") +
      `<p class="property-note">${esc(artworkDimensions(source))}. Keeps editable geometry, sewing actions and thread snapshots.</p><label class="artwork-search-label">Artwork name<input id="artwork-name" maxlength="160" value="${esc(record?.name || uniqueArtworkName(source.groups.find((g) => source.roots.includes(g.id))?.name || source.objects[0].name, records))}" required></label><p id="artwork-status" role="status"></p>` +
      end(
        button("artwork-back", "Back") +
          button("artwork-confirm", record ? "Save name" : "Save to Library"),
      );
    $("artwork-confirm").className = "primary";
    $("artwork-back").onclick = () => gallery();
    $("artwork-confirm").onclick = () =>
      action(
        async () => {
          const name = artworkName($("artwork-name").value);
          if (
            records.some(
              (r) =>
                r.id !== record?.id &&
                r.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
            )
          )
            throw Error("That name is already used. Choose a distinct name.");
          const next = record
            ? { ...record, name, updatedAt: new Date().toISOString() }
            : createArtworkRecord(name, source);
          await putArtwork(next, { replace: !!record });
          chosen = next.id;
          query = "";
          return next;
        },
        (next) => reload(`Saved “${next.name}”. Your project is unchanged.`),
      );
    $("artwork-name").focus();
    $("artwork-name").select();
  }
  function saveSelection() {
    try {
      nameEditor(null, extractArtwork(api.state.project, api.selection()));
    } catch (e) {
      status(e.message);
    }
  }
  function confirm(title, message, label, work) {
    epoch++;
    dialog.innerHTML =
      head(title) +
      `<p>${esc(message)}</p><p id="artwork-status" role="status"></p>` +
      end(button("artwork-back", "Cancel") + button("artwork-confirm", label));
    $("artwork-back").onclick = () => gallery();
    $("artwork-confirm").onclick = () =>
      action(work, () => {
        chosen = null;
        return reload("Library updated. Project copies are unaffected.");
      });
    $("artwork-confirm").focus();
  }
  function importFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.artwork-library.json";
    input.onchange = () =>
      action(
        async () => {
          const file = input.files[0];
          if (!file) return null;
          if (file.size > MAX_BACKUP_BYTES)
            throw Error("Choose a library backup smaller than 72 MB.");
          return parseArtworkBackup(await file.text());
        },
        (preview) => {
          if (!preview) return;
          const merged = mergeArtworkRecords(records, preview.records);
          epoch++;
          dialog.innerHTML =
            head("Import My Artwork Library") +
            `<p>${merged.added} new elements · ${merged.skipped} duplicates skipped · ${merged.renamed} names adjusted · ${preview.issues.length} invalid items excluded.</p><p class="property-note">Existing items are retained. Imported source geometry stays editable.</p>${preview.issues.length ? `<details><summary>Import issues</summary><p>${preview.issues.map(esc).join("<br>")}</p></details>` : ""}<p id="artwork-status" role="status"></p>` +
            end(
              button("artwork-back", "Cancel") +
                button("artwork-confirm", "Import valid artwork"),
            );
          $("artwork-back").onclick = () => gallery();
          $("artwork-confirm").disabled = !merged.added;
          $("artwork-confirm").className = "primary";
          $("artwork-confirm").onclick = () =>
            action(
              () => importArtwork(preview.records),
              (result) => {
                query = "";
                chosen = null;
                page = 0;
                return reload(
                  `Imported ${result.added} elements; ${result.skipped} duplicates skipped.`,
                );
              },
            );
          $("artwork-confirm").focus();
        },
      );
    input.click();
  }
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      dialog.close();
    } else if (
      e.key === "Enter" &&
      !e.target.matches("button,select,textarea,summary")
    ) {
      e.preventDefault();
      const target = $("artwork-confirm") || $("artwork-insert");
      if (target && !target.disabled) target.click();
    }
  });
  dialog.addEventListener("close", () => {
    epoch++;
    requestAnimationFrame(() => {
      const target = invoker?.isConnected
        ? invoker
        : document.getElementById("artwork-library");
      target?.focus({ preventScroll: true });
    });
  });
  async function open({ save = false } = {}) {
    if (busy || dialog.open) return;
    invoker = document.activeElement;
    query = "";
    chosen = null;
    page = 0;
    epoch++;
    dialog.innerHTML =
      head("My Artwork") +
      '<p id="artwork-status" role="status">Loading your artwork…</p>' +
      end('<button value="cancel" formnovalidate>Close</button>');
    dialog.showModal();
    await action(
      () => loadArtwork(),
      (loaded) => {
        records = loaded.records;
        issues = loaded.issues;
        previews.clear();
        gallery();
        if (save) saveSelection();
      },
    );
  }
  return { open };
}
