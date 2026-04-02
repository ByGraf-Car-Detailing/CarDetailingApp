import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { auth, db } from "../services/authService.js";
import {
  getCatalogJob,
  getEffectivePolicyPreview,
  normalizeBrandName,
  normalizeOverrideId,
  normalizeVehicleType,
  runCatalogSync,
} from "./catalogSyncRunner.js";

const TARGET_BY_PROJECT = {
  "cardetailingapp-e6c95-staging": "staging",
  "cardetailingapp-e6c95": "prod",
};
const CATALOG_UI_BUILD_TAG = "catalog-ui-2026-04-02-17:45";

let uiBound = false;
let editingOverrideId = null;
let editingOverrideOrigin = "custom";
let latestPreview = null;
let latestOverrides = [];

function getCurrentTargetFromRuntime() {
  const projectId = window.__FIREBASE_PROJECT_ID__ || "";
  return TARGET_BY_PROJECT[projectId] || "prod";
}

function appendLine(logEl, message) {
  const ts = new Date().toLocaleTimeString();
  logEl.value = `${logEl.value}[${ts}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setButtonsDisabled(buttons, disabled) {
  for (const btn of buttons) btn.disabled = disabled;
}

function parseMaxWrites(inputEl) {
  const value = Number(inputEl.value);
  if (!Number.isFinite(value) || value <= 0) return 100;
  return Math.floor(value);
}

function validateConfirmation(target, value) {
  return value.trim() === `SYNC ${target.toUpperCase()}`;
}

function resolveMode(button) {
  if (button.id === "syncMakesBtn") return "makes";
  if (button.id === "syncModelsBtn") return "models";
  return "reference";
}

function applyVehicleTypeFilter(list, filter) {
  if (!filter || filter === "all") return list;
  return list.filter((item) => item.vehicleType === filter);
}

function vehicleTypeLabel(vehicleType) {
  if (vehicleType === "car") return "Auto";
  if (vehicleType === "motorcycle") return "Moto";
  return "Auto + Moto";
}

function renderActiveBrandsTable(brands, overrides, filter) {
  const overrideById = new Map(overrides.map((o) => [o.id, o]));
  const filtered = applyVehicleTypeFilter(brands, filter);
  const rows = filtered
    .map((item) => {
      const existingOverride = overrideById.get(normalizeOverrideId(item.name));
      const actionLabel = existingOverride ? "Modifica override" : "Configura override";
      return `
      <tr>
        <td>${item.name}</td>
        <td>${vehicleTypeLabel(item.vehicleType)}</td>
        <td class="actions-column">
          <button
            type="button"
            class="btn btn--ghost"
            data-action="configure-baseline"
            data-name="${item.name}"
            data-vehicletype="${item.vehicleType}"
            data-active="${item.active !== false}"
          >${actionLabel}</button>
        </td>
      </tr>`;
    })
    .join("");

  const body = rows || `<tr><td colspan="3">Nessun brand attivo con il filtro selezionato.</td></tr>`;
  return `
    <h4>Brand attivi effettivi</h4>
    <table>
      <thead>
        <tr><th>Brand</th><th>Tipo</th><th class="actions-column">Azioni</th></tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderOverridesTable(overrides) {
  const rows = overrides
    .map((item) => {
      const labelType = vehicleTypeLabel(item.vehicleType);
      const labelAction = item.active === false ? "Attiva" : "Disattiva";
      const badge = item.active === false ? "Disattivato" : "Attivo";
      const isCustom = item.origin === "custom";
      const removeLabel = isCustom ? "Elimina" : "Ripristina";
      const removeAction = isCustom ? "delete" : "restore-baseline";
      return `
        <tr>
          <td>${item.name || item.id}</td>
          <td>${labelType}</td>
          <td><span class="badge" data-active="${item.active !== false}">${badge}</span></td>
          <td class="actions-column">
            <button type="button" class="btn btn--ghost" data-action="edit" data-id="${item.id}">Modifica</button>
            <button type="button" class="btn btn--ghost" data-action="toggle" data-id="${item.id}">${labelAction}</button>
            <button type="button" class="btn btn--danger" data-action="${removeAction}" data-id="${item.id}">${removeLabel}</button>
          </td>
        </tr>
      `;
    })
    .join("");

  const body = rows || `<tr><td colspan="4">Nessun override configurato.</td></tr>`;
  return `
    <h4>Override configurati</h4>
    <table>
      <thead>
        <tr><th>Brand</th><th>Tipo</th><th>Stato</th><th class="actions-column">Azioni</th></tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

async function loadOverrides() {
  const snap = await getDocs(collection(db, "vehicleMakeOverrides"));
  return snap.docs
    .map((d) => {
      const data = d.data() || {};
      const fallbackName = String(d.id || "").replace(/_/g, " ").trim();
      return {
        id: d.id,
        ...data,
        name: normalizeBrandName(data.name || fallbackName || d.id),
        vehicleType: normalizeVehicleType(data.vehicleType),
        origin: data.origin || (data.source === "manual_override" ? "custom" : "baseline"),
      };
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

function resetBrandForm() {
  editingOverrideId = null;
  editingOverrideOrigin = "custom";
  const brandNameInput = document.getElementById("brandNameInput");
  const brandTypeInput = document.getElementById("brandTypeInput");
  const brandActiveInput = document.getElementById("brandActiveInput");
  const saveBtn = document.getElementById("saveBrandOverrideBtn");
  if (!brandNameInput || !brandTypeInput || !brandActiveInput || !saveBtn) return;
  brandNameInput.value = "";
  brandNameInput.disabled = false;
  brandTypeInput.value = "car";
  brandActiveInput.checked = true;
  saveBtn.textContent = "Salva brand custom";
}

function setAccordionState(panelId, open) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.classList.toggle("open", Boolean(open));
  const button = panel.querySelector(".accordion-header");
  if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
}

function bindAccordion(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const header = panel.querySelector(".accordion-header");
  if (!header || header.dataset.bound === "true") return;
  header.addEventListener("click", () => {
    const isOpen = panel.classList.contains("open");
    setAccordionState(panelId, !isOpen);
  });
  header.dataset.bound = "true";
}

function renderBrandPanels({ preview, overrides, filter }) {
  const activeHtml = renderActiveBrandsTable(preview.activeBrands, overrides, filter);
  const overridesHtml = renderOverridesTable(overrides);
  const collisionRows = (preview.overrideStats.blockedCollisions || [])
    .map((c) => `<li><code>${c.code}</code>: ${c.name || c.overrideId || "n/d"}</li>`)
    .join("");

  const collisions = collisionRows
    ? `<div class="form-msg form-msg--error"><strong>Collisioni bloccanti:</strong><ul>${collisionRows}</ul></div>`
    : "";

  return `
    <p class="text-muted">
      Policy versione: <strong>${preview.policyVersion}</strong> |
      Override: ${preview.overrideStats.total} (attivi: ${preview.overrideStats.enabledByOverride}, disattivi: ${preview.overrideStats.disabledByOverride})
    </p>
    ${collisions}
    <div class="accordion-panel open" id="panelActiveBrands">
      <button type="button" class="accordion-header" aria-expanded="true">
        <span>Brand Attivi Effettivi</span>
        <span class="accordion-icon">v</span>
      </button>
      <div class="accordion-content">${activeHtml}</div>
    </div>
    <div class="accordion-panel open" id="panelOverrides">
      <button type="button" class="accordion-header" aria-expanded="true">
        <span>Override Attivi</span>
        <span class="accordion-icon">v</span>
      </button>
      <div class="accordion-content">${overridesHtml}</div>
    </div>
    <div class="accordion-panel" id="panelCustomBrand">
      <button type="button" class="accordion-header" aria-expanded="false">
        <span>Aggiungi Brand Custom</span>
        <span class="accordion-icon">v</span>
      </button>
      <div class="accordion-content" id="customBrandFormHost"></div>
    </div>
  `;
}

function renderCustomForm() {
  return `
      <label for="brandNameInput">Nome brand:</label>
      <input id="brandNameInput" type="text" placeholder="Es. Ferrari" />
      <label for="brandTypeInput">Tipo veicolo:</label>
      <select id="brandTypeInput">
        <option value="car">Auto</option>
        <option value="motorcycle">Moto</option>
        <option value="both">Auto + Moto</option>
      </select>
      <label>
        <input id="brandActiveInput" type="checkbox" checked />
        Brand attivo
      </label>
      <div class="toolbar">
        <button id="saveBrandOverrideBtn" type="button" class="btn btn--primary">Salva brand custom</button>
        <button id="resetBrandOverrideBtn" type="button" class="btn btn--ghost">Reset form</button>
      </div>
      <p class="text-muted">
        I brand custom vengono salvati in <code>vehicleMakeOverrides</code>. Non e consentito creare custom con nome che collide con la baseline.
      </p>
  `;
}

async function renderBrandManagement({ container, filter, logEl, onOverrideChanged }) {
  const [preview, overrides] = await Promise.all([getEffectivePolicyPreview(), loadOverrides()]);
  latestPreview = preview;
  latestOverrides = overrides;
  const html = renderBrandPanels({ preview, overrides, filter });
  container.innerHTML = html;
  const customHost = container.querySelector("#customBrandFormHost");
  if (customHost) customHost.innerHTML = renderCustomForm();
  resetBrandForm();

  bindAccordion("panelActiveBrands");
  bindAccordion("panelOverrides");
  bindAccordion("panelCustomBrand");

  for (const btn of container.querySelectorAll("button[data-action='edit']")) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const item = overrides.find((o) => o.id === id);
      if (!item) return;
      editingOverrideId = id;
      editingOverrideOrigin = item.origin || "custom";
      const brandNameInput = document.getElementById("brandNameInput");
      const brandTypeInput = document.getElementById("brandTypeInput");
      const brandActiveInput = document.getElementById("brandActiveInput");
      const saveBtn = document.getElementById("saveBrandOverrideBtn");
      if (!brandNameInput || !brandTypeInput || !brandActiveInput || !saveBtn) return;
      brandNameInput.value = item.name || "";
      brandNameInput.disabled = true;
      brandTypeInput.value = normalizeVehicleType(item.vehicleType);
      brandActiveInput.checked = item.active !== false;
      saveBtn.textContent = item.origin === "baseline" ? "Salva override baseline" : "Aggiorna brand";
      setAccordionState("panelCustomBrand", true);
      appendLine(logEl, `Modifica override: ${item.name}`);
    });
  }

  for (const btn of container.querySelectorAll("button[data-action='toggle']")) {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const item = overrides.find((o) => o.id === id);
      if (!item) return;
      const nextActive = item.active === false;
      try {
        await updateDoc(doc(db, "vehicleMakeOverrides", id), {
          active: nextActive,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.email || "unknown",
        });
        appendLine(logEl, `Override ${item.name}: active=${nextActive}`);
        await materializeOverridesNow(logEl);
        await renderBrandManagement({ container, filter, logEl, onOverrideChanged });
      } catch (err) {
        appendLine(logEl, `Errore toggle override ${item.name}: ${err?.message || String(err)}`);
      }
    });
  }

  for (const btn of container.querySelectorAll("button[data-action='delete']")) {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const item = overrides.find((o) => o.id === id);
      if (!item) return;
      try {
        await deleteDoc(doc(db, "vehicleMakeOverrides", id));
        appendLine(logEl, `Override eliminato: ${item.name}`);
        await materializeOverridesNow(logEl);
        await renderBrandManagement({ container, filter, logEl, onOverrideChanged });
      } catch (err) {
        appendLine(logEl, `Errore elimina override ${item.name}: ${err?.message || String(err)}`);
      }
    });
  }

  for (const btn of container.querySelectorAll("button[data-action='restore-baseline']")) {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const item = overrides.find((o) => o.id === id);
      if (!item) return;
      try {
        await deleteDoc(doc(db, "vehicleMakeOverrides", id));
        appendLine(logEl, `Override baseline ripristinato: ${item.name}`);
        await materializeOverridesNow(logEl);
        await renderBrandManagement({ container, filter, logEl, onOverrideChanged });
      } catch (err) {
        appendLine(logEl, `Errore ripristino override ${item.name}: ${err?.message || String(err)}`);
      }
    });
  }

  for (const btn of container.querySelectorAll("button[data-action='configure-baseline']")) {
    btn.addEventListener("click", () => {
      const brandNameInput = document.getElementById("brandNameInput");
      const brandTypeInput = document.getElementById("brandTypeInput");
      const brandActiveInput = document.getElementById("brandActiveInput");
      const saveBtn = document.getElementById("saveBrandOverrideBtn");
      const baseName = normalizeBrandName(btn.dataset.name || "");
      const baseType = normalizeVehicleType(btn.dataset.vehicletype || "car");
      const baseActive = String(btn.dataset.active || "true") === "true";
      if (!brandNameInput || !brandTypeInput || !brandActiveInput || !saveBtn || !baseName) return;
      editingOverrideId = normalizeOverrideId(baseName);
      editingOverrideOrigin = "baseline";
      brandNameInput.value = baseName;
      brandNameInput.disabled = true;
      brandTypeInput.value = baseType;
      brandActiveInput.checked = baseActive;
      saveBtn.textContent = "Salva override baseline";
      setAccordionState("panelCustomBrand", true);
      appendLine(logEl, `Configura override baseline: ${baseName}`);
    });
  }

  const saveOverrideBtn = container.querySelector("#saveBrandOverrideBtn");
  if (saveOverrideBtn && saveOverrideBtn.dataset.bound !== "true") {
    saveOverrideBtn.addEventListener("click", async () => {
      const saved = await saveOverrideFromForm(logEl);
      if (!saved) return;
      await renderBrandManagement({ container, filter, logEl, onOverrideChanged });
    });
    saveOverrideBtn.dataset.bound = "true";
  }

  const resetOverrideBtn = container.querySelector("#resetBrandOverrideBtn");
  if (resetOverrideBtn && resetOverrideBtn.dataset.bound !== "true") {
    resetOverrideBtn.addEventListener("click", () => {
      resetBrandForm();
      appendLine(logEl, "Form brand resettato.");
    });
    resetOverrideBtn.dataset.bound = "true";
  }
}

async function saveOverrideFromForm(logEl) {
  const brandNameInput = document.getElementById("brandNameInput");
  const brandTypeInput = document.getElementById("brandTypeInput");
  const brandActiveInput = document.getElementById("brandActiveInput");
  if (!brandNameInput || !brandTypeInput || !brandActiveInput) {
    appendLine(logEl, "Form override non disponibile.");
    return;
  }

  const brandName = normalizeBrandName(brandNameInput.value);
  if (!brandName) {
    appendLine(logEl, "Inserisci un nome brand valido.");
    return;
  }

  const actorEmail = auth.currentUser?.email || "unknown";
  const vehicleType = normalizeVehicleType(brandTypeInput.value);
  const isActive = brandActiveInput.checked;
  const docId = editingOverrideId || normalizeOverrideId(brandName);
  const normalizedKey = normalizeOverrideId(brandName);
  const baselineSet = new Set((latestPreview?.baselineKeys || []).map((k) => normalizeOverrideId(k)));

  if (!editingOverrideId && baselineSet.has(normalizedKey)) {
    appendLine(logEl, `Override non consentito: '${brandName}' esiste gia nella baseline.`);
    return;
  }

  const duplicateCustom = latestOverrides.find((item) => item.id === normalizedKey && item.id !== editingOverrideId);
  if (!editingOverrideId && duplicateCustom) {
    appendLine(logEl, `Override non consentito: esiste gia '${duplicateCustom.name}'.`);
    return;
  }

  const ref = doc(db, "vehicleMakeOverrides", docId);
  const payload = {
    name: brandName,
    vehicleType,
    active: isActive,
    origin: editingOverrideOrigin || "custom",
    source: "manual_override",
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  };
  if (!editingOverrideId) {
    payload.createdAt = serverTimestamp();
    payload.createdBy = actorEmail;
  }

  try {
    await setDoc(ref, payload, { merge: true });
    appendLine(logEl, `Override salvato: ${brandName} (${vehicleType}, active=${isActive})`);
    resetBrandForm();

    const target = getCurrentTargetFromRuntime();
    const maxWritesInput = document.getElementById("catalogSyncMaxWrites");
    const maxWrites = parseMaxWrites(maxWritesInput);
    appendLine(logEl, "Materializzazione automatica override: sincronizzazione marche in corso...");
    const result = await runCatalogSync({ mode: "makes", target, maxWrites });
    appendLine(logEl, `OK jobId=${result.jobId} status=${result.status}`);
    appendLine(logEl, `summary=${JSON.stringify(result.summary)}`);

    return true;
  } catch (err) {
    appendLine(logEl, `Errore salvataggio override ${brandName}: ${err?.message || String(err)}`);
    return false;
  }
}

async function startSync({ mode, target, maxWrites, logEl, buttons }) {
  setButtonsDisabled(buttons, true);
  appendLine(logEl, `Avvio mode=${mode}, target=${target}, maxWrites=${maxWrites}`);
  try {
    const result = await runCatalogSync({ mode, target, maxWrites });
    appendLine(logEl, `OK jobId=${result.jobId} status=${result.status}`);
    appendLine(logEl, `summary=${JSON.stringify(result.summary)}`);
  } catch (err) {
    appendLine(logEl, `ERRORE ${err?.message || String(err)}`);
  } finally {
    setButtonsDisabled(buttons, false);
  }
}

async function materializeOverridesNow(logEl) {
  const targetSelect = document.getElementById("catalogSyncTarget");
  const maxWritesInput = document.getElementById("catalogSyncMaxWrites");
  const makesBtn = document.getElementById("syncMakesBtn");
  const modelsBtn = document.getElementById("syncModelsBtn");
  const referenceBtn = document.getElementById("syncReferenceBtn");

  if (!targetSelect || !maxWritesInput || !makesBtn || !modelsBtn || !referenceBtn) {
    appendLine(logEl, "Materializzazione override non disponibile: controlli sync non trovati.");
    return;
  }

  const target = targetSelect.value || getCurrentTargetFromRuntime();
  const maxWrites = parseMaxWrites(maxWritesInput);
  const buttons = [makesBtn, modelsBtn, referenceBtn];
  appendLine(logEl, "Materializzazione automatica override: sincronizzazione marche in corso...");
  await startSync({
    mode: "makes",
    target,
    maxWrites,
    logEl,
    buttons,
  });
}

function initCatalogSyncUI() {
  const section = document.getElementById("catalogSyncSection");
  const targetSelect = document.getElementById("catalogSyncTarget");
  const maxWritesInput = document.getElementById("catalogSyncMaxWrites");
  const confirmationInput = document.getElementById("catalogSyncConfirmation");
  const makesBtn = document.getElementById("syncMakesBtn");
  const modelsBtn = document.getElementById("syncModelsBtn");
  const referenceBtn = document.getElementById("syncReferenceBtn");
  const checkBtn = document.getElementById("syncJobCheckBtn");
  const checkInput = document.getElementById("syncJobIdInput");
  const logEl = document.getElementById("catalogSyncLog");
  const refreshBrandListBtn = document.getElementById("refreshBrandListBtn");
  const brandFilterType = document.getElementById("brandFilterType");
  const brandListContainer = document.getElementById("brandListContainer");

  if (
    !section ||
    !targetSelect ||
    !maxWritesInput ||
    !confirmationInput ||
    !makesBtn ||
    !modelsBtn ||
    !referenceBtn ||
    !logEl ||
    !refreshBrandListBtn ||
    !brandFilterType ||
    !brandListContainer
  ) {
    return;
  }

  const currentTarget = getCurrentTargetFromRuntime();
  targetSelect.innerHTML = "";
  const option = document.createElement("option");
  option.value = currentTarget;
  option.textContent = `${currentTarget} (runtime corrente)`;
  targetSelect.appendChild(option);
  targetSelect.value = currentTarget;

  if (!uiBound) {
    appendLine(logEl, `Runtime target: ${currentTarget}`);
    appendLine(logEl, `Build: ${CATALOG_UI_BUILD_TAG}`);
    appendLine(logEl, `Conferma richiesta: SYNC ${currentTarget.toUpperCase()}`);
  }

  const runButtons = [makesBtn, modelsBtn, referenceBtn];
  if (currentTarget === "prod" && window.__ENABLE_PROD_CATALOG_SYNC__ !== true) {
    setButtonsDisabled(runButtons, true);
    appendLine(logEl, "Policy freeze attiva: sync catalog su prod disabilitato finche staging non viene validato.");
  }

  const runOverrideMaterialization = async () => {
    const target = targetSelect.value;
    const maxWrites = parseMaxWrites(maxWritesInput);
    appendLine(logEl, "Materializzazione automatica override: sincronizzazione marche in corso...");
    await startSync({
      mode: "makes",
      target,
      maxWrites,
      logEl,
      buttons: runButtons,
    });
  };

  const refreshBrandData = async () => {
    await renderBrandManagement({
      container: brandListContainer,
      filter: brandFilterType.value,
      logEl,
      onOverrideChanged: runOverrideMaterialization,
    });
  };

  if (!uiBound) {
    for (const btn of runButtons) {
      btn.addEventListener("click", async () => {
        const target = targetSelect.value;
        const confirmation = confirmationInput.value || "";
        if (!validateConfirmation(target, confirmation)) {
          appendLine(logEl, `Conferma non valida. Inserisci esattamente: SYNC ${target.toUpperCase()}`);
          return;
        }
        const maxWrites = parseMaxWrites(maxWritesInput);
        await startSync({
          mode: resolveMode(btn),
          target,
          maxWrites,
          logEl,
          buttons: runButtons,
        });
        await refreshBrandData();
      });
    }

    if (checkBtn && checkInput) {
      checkBtn.addEventListener("click", async () => {
        const jobId = (checkInput.value || "").trim();
        if (!jobId) {
          appendLine(logEl, "Inserisci un jobId.");
          return;
        }
        const job = await getCatalogJob(jobId);
        if (!job) {
          appendLine(logEl, `Job non trovato: ${jobId}`);
          return;
        }
        appendLine(logEl, `Job ${jobId}: ${JSON.stringify(job)}`);
      });
    }

    refreshBrandListBtn.addEventListener("click", async () => {
      await refreshBrandData();
      appendLine(logEl, "Elenco brand aggiornato.");
    });

    brandFilterType.addEventListener("change", refreshBrandData);

    uiBound = true;
  }

  refreshBrandData().catch((err) => appendLine(logEl, `Errore caricamento brand: ${err?.message || String(err)}`));
}

export { initCatalogSyncUI };
