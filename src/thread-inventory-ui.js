import { inventoryEntry, validateInventory } from "./thread-records.js";
import {
  projectThreads,
  shoppingRows,
  shoppingCSV,
} from "./thread-requirements.js";
import {
  exportPersonal,
  importPersonal,
  validatePersonal,
} from "./personal-settings.js";
const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export function collectionUI({
  dialog,
  library,
  thread,
  persist,
  back,
  esc,
  display,
  head,
  end,
  button,
  api,
}) {
  const $ = (id) => dialog.querySelector("#" + id),
    current =
      library.inventory.find((i) => i.thread.id === thread.id) ||
      inventoryEntry(thread, 0);
  dialog.innerHTML =
    head("My thread collection") +
    `<p><strong>${esc(display(thread))}</strong></p><p class="property-note">Quantities and optional remaining metres are your estimates. Studio never subtracts stock automatically. Collection changes are personal settings, separate from project Undo.</p><div class="thread-filters"><label>Spools owned<input id="inventory-quantity" required type="number" min="0" max="1000000" step="1" value="${current.quantity}"></label><label>Spool size (optional)<input id="inventory-size" maxlength="80" value="${esc(current.spoolSize || "")}" placeholder="e.g. 500 m"></label><label>Remaining estimate · metres (optional)<input id="inventory-remaining" type="number" min="0" max="10000000" step="any" value="${current.remainingMetres ?? ""}"></label><label class="check"><input id="inventory-favorite" type="checkbox" ${current.favorite ? "checked" : ""}>Favorite spool</label></div><label>Notes<textarea id="inventory-notes" maxlength="2000" rows="3">${esc(current.notes)}</textarea></label><p id="inventory-error" role="status"></p>` +
    end(
      button("inventory-back", "Back") +
        button("inventory-delete", "Remove from collection") +
        button("inventory-save", "Save collection entry"),
    );
  $("inventory-save").className = "primary";
  $("inventory-back").onclick = back;
  $("inventory-save").onclick = async () => {
    try {
      if (
        !$("inventory-quantity").checkValidity() ||
        !$("inventory-remaining").checkValidity()
      )
        throw Error(
          "Enter a whole spool quantity and a non-negative remaining estimate.",
        );
      const record = validateInventory({
        ...inventoryEntry(thread),
        quantity: Number($("inventory-quantity").value),
        spoolSize: $("inventory-size").value.trim() || null,
        remainingMetres:
          $("inventory-remaining").value === ""
            ? null
            : Number($("inventory-remaining").value),
        favorite: $("inventory-favorite").checked,
        notes: $("inventory-notes").value,
      });
      const next = structuredClone(library);
      next.inventory = next.inventory.filter((i) => i.thread.id !== thread.id);
      next.inventory.push(record);
      if (await persist(next)) {
        back();
        api.toast("Thread collection saved on this device.");
      }
    } catch (e) {
      $("inventory-error").textContent = e.message;
    }
  };
  $("inventory-delete").onclick = async () => {
    const next = structuredClone(library);
    next.inventory = next.inventory.filter((i) => i.thread.id !== thread.id);
    if (await persist(next)) {
      back();
      api.toast(
        "Collection entry removed. Catalogs and project assignments retained.",
      );
    }
  };
}
export function requirementsUI({
  dialog,
  library,
  api,
  back,
  esc,
  display,
  dot,
  head,
  end,
  button,
  matchProject,
}) {
  const $ = (id) => dialog.querySelector("#" + id);
  let requirements;
  try {
    requirements = projectThreads(api.state.project, library.inventory);
  } catch (e) {
    api.toast("Could not calculate project threads: " + e.message);
    return;
  }
  const shopping = shoppingRows(requirements);
  dialog.innerHTML =
    head("Project threads & shopping list") +
    `<p>${requirements.changes} thread changes · ${requirements.stops} construction stops · ${requirements.rows.length} required colors/spools${requirements.fits ? "" : " · review hoop fit"}</p><p class="property-note">Actual generated sewing order is used; hidden and disabled actions do not contribute. One spool is requested for each missing physical color. Unassigned design colors need a spool choice before they can enter a shopping list. Thread use depends on machine, fabric and stitching; no remaining stock is deducted.</p><div class="thread-match-results">${requirements.rows.map((r) => `<div class="thread-match-row">${dot({ hex: r.color })}<strong>${esc(r.thread ? display(r.thread) : r.color + " · choose a physical spool")}</strong><span>Color blocks ${r.blocks.join(", ")} · ${r.thread ? (r.missing ? "Missing · shopping quantity 1" : "Owned · " + r.quantityOwned + " spool(s)") : "Unassigned"}</span>${r.alternatives.length ? `<small>Owned alternatives (approximate): ${r.alternatives.map((a) => esc(display(a.thread)) + " · ΔE " + a.deltaE.toFixed(1)).join("; ")}</small>` : ""}</div>`).join("") || "<p>No sewn artwork yet.</p>"}</div><p role="status" id="shopping-count">${shopping.length} missing physical thread(s) · exact spool identities retained</p><label>Shopping list · select or copy<textarea id="shopping-text" rows="5" readonly>${esc(shoppingCSV(shopping))}</textarea></label>` +
    end(
      button("requirements-back", "Back") +
        button(
          "requirements-match",
          "Match editable project actions using owned threads…",
        ) +
        button("shopping-copy", "Copy list") +
        button("shopping-export", "Export shopping CSV"),
    );
  $("requirements-back").onclick = back;
  $("requirements-match").onclick = matchProject;
  $("shopping-export").onclick = () =>
    download(
      "embroidery-shopping-list.csv",
      shoppingCSV(shopping),
      "text/csv;charset=utf-8",
    );
  $("shopping-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(shoppingCSV(shopping));
      api.toast("Shopping list copied.");
    } catch {
      $("shopping-text").focus();
      $("shopping-text").select();
      api.toast("Select and copy the shopping list shown here.");
    }
  };
}
export function personalUI({
  dialog,
  api,
  back,
  esc,
  head,
  end,
  button,
  onImported,
}) {
  const $ = (id) => dialog.querySelector("#" + id);
  dialog.innerHTML =
    head("Back up personal settings") +
    `<p>Transfer your local thread catalogs, collection, favorite brand/line, custom machines/hoops, My Machine and per-machine export preferences. Projects are saved separately. Catalogs remain personal data; sharing a backup does not establish redistribution rights.</p><p class="property-note">Export a backup before restoring. Import merges identities without adding quantities together. Keep existing duplicates by default, or explicitly replace matching entries. It does not remove unrelated data or change the current design.</p><label class="check"><input type="checkbox" id="personal-replace">Replace matching thread, collection and equipment records and preferences</label><p id="personal-status" role="status"></p>` +
    end(
      button("personal-back", "Back") +
        button("personal-export", "Export personal backup") +
        button("personal-import", "Choose backup to restore…"),
    );
  let pending = null,
    busy = false,
    revision = 0;
  const view = dialog.querySelector("form"),
    currentView = () =>
      dialog.open && view.isConnected && dialog.contains(view);
  $("personal-back").onclick = back;
  $("personal-export").onclick = async () => {
    try {
      const data = await exportPersonal(localStorage);
      if (!currentView()) return;
      download(
        "embroidery-personal-settings.json",
        JSON.stringify(data, null, 2),
        "application/json",
      );
      $("personal-status").textContent =
        "Personal backup exported. Keep it somewhere safe; projects are separate.";
    } catch (e) {
      if (currentView())
        $("personal-status").textContent = "Backup failed: " + e.message;
    }
  };
  $("personal-import").onclick = () => {
    if (busy) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const ticket = ++revision;
      try {
        const file = input.files[0];
        if (!file || !currentView()) return;
        pending = null;
        $("personal-apply")?.remove();
        $("personal-status").textContent = "Reading backup…";
        if (file.size > 64000000)
          throw Error("Choose a backup smaller than 64 MB.");
        const data = validatePersonal(JSON.parse(await file.text()));
        if (ticket !== revision || !currentView()) return;
        pending = data;
        $("personal-status").textContent =
          `Review: ${pending.threads.records.length} catalog entries, ${pending.threads.inventory.length} collection entries, ${pending.equipment.customMachines.length} custom machines. Current artwork remains unchanged.`;
        let apply = $("personal-apply");
        if (!apply) {
          apply = document.createElement("button");
          apply.type = "button";
          apply.id = "personal-apply";
          apply.className = "primary";
          apply.textContent = "Restore reviewed backup";
          dialog.querySelector(".dialog-actions").append(apply);
        }
        apply.onclick = async () => {
          if (busy || !pending) return;
          busy = true;
          apply.disabled = true;
          try {
            const data = await importPersonal(
              localStorage,
              pending,
              $("personal-replace").checked,
            );
            onImported(data);
            api.toast(
              "Personal settings merged and saved. Current project was retained.",
            );
          } catch (e) {
            if (currentView()) $("personal-status").textContent = e.message;
            busy = false;
            apply.disabled = false;
          }
        };
      } catch (e) {
        if (ticket !== revision || !currentView()) return;
        pending = null;
        $("personal-apply")?.remove();
        $("personal-status").textContent =
          "Backup was not imported: " + e.message;
      }
    };
    input.click();
  };
}
