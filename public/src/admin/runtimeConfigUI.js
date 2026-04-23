import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { auth, db } from "../services/authService.js";
import {
  APPOINTMENT_LOCATIONS_DOC,
  RUNTIME_COLLECTION,
  getAppointmentLocations,
  saveAppointmentLocations,
} from "../services/runtimeConfigService.js";

let uiBound = false;
let originalLocations = [];
let workingLocations = [];
let currentVersion = 0;

function q(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeLocation(input) {
  return String(input || "").trim();
}

function showMessage(type, text) {
  const box = q("runtimeConfigMessage");
  if (!box) return;
  box.style.display = "block";
  box.className = "form-msg";
  if (type === "error") box.classList.add("form-msg--error");
  if (type === "success") box.classList.add("form-msg--success");
  box.textContent = text;
}

function clearMessage() {
  const box = q("runtimeConfigMessage");
  if (!box) return;
  box.style.display = "none";
  box.className = "form-msg";
  box.textContent = "";
}

function renderMeta(meta) {
  const el = q("runtimeConfigMeta");
  if (!el) return;
  if (!meta) {
    el.textContent = "Nessun metadato disponibile.";
    return;
  }

  const updatedBy = meta.updatedBy || "n/d";
  const version = Number.isInteger(meta.version) ? meta.version : 0;
  let updatedAt = "n/d";
  const rawUpdatedAt = meta.updatedAt;
  if (rawUpdatedAt?.toDate) {
    updatedAt = rawUpdatedAt.toDate().toLocaleString("it-CH");
  } else if (rawUpdatedAt instanceof Date) {
    updatedAt = rawUpdatedAt.toLocaleString("it-CH");
  } else if (typeof rawUpdatedAt === "string" && rawUpdatedAt.trim()) {
    updatedAt = rawUpdatedAt;
  }

  el.innerHTML = `
    <div><strong>version:</strong> ${version}</div>
    <div><strong>updatedBy:</strong> ${escapeHtml(updatedBy)}</div>
    <div><strong>updatedAt:</strong> ${escapeHtml(updatedAt)}</div>
  `;
}

function renderLocations() {
  const listEl = q("runtimeLocationsList");
  if (!listEl) return;

  if (!workingLocations.length) {
    listEl.innerHTML = `<div class="text-muted">Nessuna sede configurata.</div>`;
    return;
  }

  listEl.innerHTML = workingLocations
    .map((location, index) => {
      const safeLabel = escapeHtml(location);
      return `
        <div class="runtime-config-item" data-index="${index}">
          <div class="runtime-config-item-label">${safeLabel}</div>
          <div class="runtime-config-actions">
            <button type="button" class="btn btn--ghost" data-action="up" data-index="${index}" ${index === 0 ? "disabled" : ""}>Su</button>
            <button type="button" class="btn btn--ghost" data-action="down" data-index="${index}" ${index === workingLocations.length - 1 ? "disabled" : ""}>Giu</button>
            <button type="button" class="btn btn--danger" data-action="remove" data-index="${index}">Rimuovi</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function moveItem(index, direction) {
  const target = index + direction;
  if (index < 0 || target < 0 || index >= workingLocations.length || target >= workingLocations.length) {
    return;
  }
  const next = [...workingLocations];
  [next[index], next[target]] = [next[target], next[index]];
  workingLocations = next;
  renderLocations();
}

function removeItem(index) {
  if (index < 0 || index >= workingLocations.length) return;
  workingLocations = workingLocations.filter((_, i) => i !== index);
  renderLocations();
}

function addLocation() {
  const input = q("runtimeLocationInput");
  if (!input) return;

  const value = normalizeLocation(input.value);
  if (!value) {
    showMessage("error", "Inserisci una sede valida.");
    return;
  }

  const exists = workingLocations.some((x) => x.toLowerCase() === value.toLowerCase());
  if (exists) {
    showMessage("error", "La sede e gia presente.");
    return;
  }

  workingLocations = [...workingLocations, value];
  input.value = "";
  clearMessage();
  renderLocations();
}

function resetLocations() {
  workingLocations = [...originalLocations];
  clearMessage();
  renderLocations();
}

async function readRuntimeMeta() {
  const ref = doc(db, RUNTIME_COLLECTION, APPOINTMENT_LOCATIONS_DOC);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() || null;
}

async function saveLocations() {
  if (!workingLocations.length) {
    showMessage("error", "La lista sedi non puo essere vuota.");
    return;
  }

  const saveBtn = q("runtimeLocationSaveBtn");
  const addBtn = q("runtimeLocationAddBtn");
  if (saveBtn) saveBtn.disabled = true;
  if (addBtn) addBtn.disabled = true;

  showMessage("success", "Salvataggio in corso...");
  try {
    await saveAppointmentLocations({
      db,
      locations: workingLocations,
      actorEmail: auth.currentUser?.email || "unknown",
      previousVersion: currentVersion,
      enabled: true,
    });

    const [locations, meta] = await Promise.all([
      getAppointmentLocations({ db }),
      readRuntimeMeta(),
    ]);

    originalLocations = [...locations];
    workingLocations = [...locations];
    currentVersion = Number.isInteger(meta?.version) ? meta.version : currentVersion + 1;

    renderLocations();
    renderMeta(meta);
    showMessage("success", "Configurazione sedi salvata con successo.");
  } catch (err) {
    showMessage("error", `Errore salvataggio: ${err?.message || String(err)}`);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (addBtn) addBtn.disabled = false;
  }
}

function bindListActions() {
  const listEl = q("runtimeLocationsList");
  if (!listEl || listEl.dataset.bound === "true") return;
  listEl.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const index = Number.parseInt(btn.dataset.index || "-1", 10);
    if (!Number.isInteger(index) || index < 0) return;

    if (action === "up") moveItem(index, -1);
    if (action === "down") moveItem(index, 1);
    if (action === "remove") removeItem(index);
  });
  listEl.dataset.bound = "true";
}

function bindActions() {
  const addBtn = q("runtimeLocationAddBtn");
  const saveBtn = q("runtimeLocationSaveBtn");
  const resetBtn = q("runtimeLocationResetBtn");
  const input = q("runtimeLocationInput");
  if (!addBtn || !saveBtn || !resetBtn || !input) return;

  if (!addBtn.dataset.bound) {
    addBtn.addEventListener("click", addLocation);
    addBtn.dataset.bound = "true";
  }
  if (!saveBtn.dataset.bound) {
    saveBtn.addEventListener("click", () => {
      void saveLocations();
    });
    saveBtn.dataset.bound = "true";
  }
  if (!resetBtn.dataset.bound) {
    resetBtn.addEventListener("click", resetLocations);
    resetBtn.dataset.bound = "true";
  }
  if (!input.dataset.bound) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addLocation();
      }
    });
    input.dataset.bound = "true";
  }

  bindListActions();
}

export async function initRuntimeConfigUI() {
  if (!q("runtimeConfigSection")) return;
  bindActions();
  clearMessage();
  showMessage("success", "Caricamento configurazione...");

  try {
    const [locations, meta] = await Promise.all([
      getAppointmentLocations({ db }),
      readRuntimeMeta(),
    ]);

    originalLocations = [...locations];
    workingLocations = [...locations];
    currentVersion = Number.isInteger(meta?.version) ? meta.version : 0;

    renderLocations();
    renderMeta(meta);
    clearMessage();
  } catch (err) {
    showMessage("error", `Errore caricamento: ${err?.message || String(err)}`);
  }

  if (!uiBound) uiBound = true;
}
