import { db, auth } from "../services/authService.js";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { showDashboard } from "../app.js";
import { openModal, closeModal } from "../utils/modal.js";
import { loadMakes, loadModels, loadYears } from "./vehicleForm.js";
import {
  buildSortableHeaderRow,
  loadSortState,
  resolveSortUserKey,
  saveSortState,
  sortRows,
} from "../utils/tableSort.js";

const vehiclesList = document.getElementById("vehiclesList");
const searchBtn = document.getElementById("searchVehiclesBtn");
const searchPlate = document.getElementById("searchPlate");
const searchChassis = document.getElementById("searchChassis");
const searchOwner = document.getElementById("searchOwner");
const addBtn = document.getElementById("showAddVehicleBtn");
const backBtn = document.getElementById("backToDashboardVehiclesBtn");
const vehicleManageSection = document.getElementById("vehicleManageSection");
const resetBtn = document.getElementById("resetVehiclesBtn");
const VEHICLES_TABLE_ID = "vehicles.manage";
const DEFAULT_VEHICLES_SORT = { key: "owner", direction: "asc" };
let vehiclesSortState = { ...DEFAULT_VEHICLES_SORT };
let vehiclesSortUserKey = null;

const EDIT_ICON = `
  <svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="m3 17.25 9.06-9.06 3.75 3.75L6.75 21H3v-3.75Zm14.71-9.04-1.92 1.92-3.75-3.75 1.92-1.92a1.5 1.5 0 0 1 2.12 0l1.63 1.63a1.5 1.5 0 0 1 0 2.12Z" fill="currentColor"/>
  </svg>
`;
const VIEW_ICON = `
  <svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M1.5 12s3.8-7 10.5-7 10.5 7 10.5 7-3.8 7-10.5 7S1.5 12 1.5 12Zm10.5 4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" fill="currentColor"/>
  </svg>
`;
const DELETE_ICON = `
  <svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h2v9H7V9Zm4 0h2v9h-2V9Zm4 0h2v9h-2V9Z" fill="currentColor"/>
  </svg>
`;

// Format telaio: XXX XXX XXX...
function formatVINOnInput(input) {
  const pos = input.selectionStart;
  const raw = input.value.replace(/\s+/g, '').toUpperCase();
  const formatted = raw.match(/.{1,3}/g)?.join(' ') || raw;
  if (input.value !== formatted) {
    const addedSpaces = (formatted.match(/\s/g) || []).length - (input.value.match(/\s/g) || []).length;
    input.value = formatted;
    input.setSelectionRange(pos + addedSpaces, pos + addedSpaces);
  }
}

backBtn.addEventListener("click", () => showDashboard());

addBtn.addEventListener("click", async () => {
  vehicleManageSection.style.display = "none";
  document.getElementById("vehicleFormSection").style.display = "block";
  const { reloadCustomers } = await import("./vehicleForm.js");
  if (typeof reloadCustomers === "function") reloadCustomers();
});

export async function loadVehicles() {
  vehiclesList.innerHTML = "Caricamento...";
  const q = query(collection(db, "cars"));
  const snap = await getDocs(q);

  const all = [];
  for (const d of snap.docs) {
    const data = d.data();
    let ownerLabel = "";
    if (data.customerId) {
      const ref = doc(db, "clients", data.customerId);
      const s = await getDoc(ref);
      if (s.exists()) {
        const c = s.data();
        ownerLabel = c.type === "company" ? c.companyName : `${c.firstName || ""} ${c.lastName || ""}`.trim();
        data.ownerType = c.type || "person";
      }
    }
    all.push({ id: d.id, ...data, ownerLabel });
  }
  renderList(all);
}

searchBtn.addEventListener("click", async () => {
  const plate = searchPlate.value.trim().toLowerCase();
  const chassis = searchChassis.value.trim().toLowerCase();
  const owner = searchOwner.value.trim().toLowerCase();

  vehiclesList.innerHTML = "Ricerca...";
  const q = query(collection(db, "cars"));
  const snap = await getDocs(q);

  const results = [];
  for (const d of snap.docs) {
    const data = d.data();
    let ownerLabel = "";
    if (data.customerId) {
      const ref = doc(db, "clients", data.customerId);
      const s = await getDoc(ref);
      if (s.exists()) {
        const c = s.data();
        ownerLabel = c.type === "company" ? c.companyName : `${c.firstName || ""} ${c.lastName || ""}`.trim();
        data.ownerType = c.type || "person";
      }
    }
    if ((plate && !data.licensePlate?.toLowerCase().includes(plate)) ||
        (chassis && !data.chassisNumber?.toLowerCase().includes(chassis)) ||
        (owner && !ownerLabel.toLowerCase().includes(owner))) continue;
    results.push({ id: d.id, ...data, ownerLabel });
  }
  renderList(results);
});

resetBtn.addEventListener("click", () => {
  searchPlate.value = "";
  searchChassis.value = "";
  searchOwner.value = "";
  loadVehicles();
});

function renderList(docs) {
  const currentUserKey = resolveSortUserKey({
    authUser: auth.currentUser,
    fallbackEmail: window.userEmail || "",
  });
  if (vehiclesSortUserKey !== currentUserKey) {
    vehiclesSortUserKey = currentUserKey;
    vehiclesSortState = loadSortState({
      tableId: VEHICLES_TABLE_ID,
      userKey: vehiclesSortUserKey,
      defaultState: DEFAULT_VEHICLES_SORT,
    });
  }

  vehiclesList.innerHTML = "";
  if (docs.length === 0) {
    vehiclesList.textContent = "Nessun veicolo trovato.";
    return;
  }

  const table = document.createElement("table");
  const columns = [
    { key: "owner", label: "Proprietario", className: "cell-mobile-wrap", getValue: (v) => v.ownerLabel || "" },
    { key: "vehicleMobile", label: "Veicolo", className: "show-mobile cell-mobile-wrap", sortable: false, getValue: (v) => `${v.brand || ""} ${v.model || ""}`.trim() },
    { key: "brand", label: "Marca", className: "hide-mobile", getValue: (v) => v.brand || "" },
    { key: "model", label: "Modello", className: "hide-mobile", getValue: (v) => v.model || "" },
    { key: "year", label: "Anno", className: "hide-mobile", getValue: (v) => Number(v.year) || 0 },
    { key: "plate", label: "Targa", className: "hide-mobile", getValue: (v) => v.licensePlate || "" },
    { key: "chassis", label: "Nr. Telaio", className: "hide-mobile", getValue: (v) => v.chassisNumber || "" },
    { key: null, label: "Azioni", className: "actions-column", sortable: false },
  ];
  const thead = document.createElement("thead");
  thead.appendChild(buildSortableHeaderRow({
    columns,
    state: vehiclesSortState,
    onSortChange: (nextState) => {
      vehiclesSortState = nextState;
      saveSortState({
        tableId: VEHICLES_TABLE_ID,
        userKey: vehiclesSortUserKey,
        state: vehiclesSortState,
      });
      renderList(docs);
    },
  }));
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const sortedDocs = sortRows(docs, {
    state: vehiclesSortState,
    columns,
    tieBreaker: (v) => v.id || "",
  });

  sortedDocs.forEach(v => {
    const ownerCell = formatOwnerCell(v.ownerLabel, v.ownerType);
    const vehicleMobileCard = formatVehicleMobileCard(v);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="cell-mobile-wrap">${ownerCell}</td>
      <td class="show-mobile cell-mobile-wrap">${vehicleMobileCard}</td>
      <td class="hide-mobile">${v.brand}</td>
      <td class="hide-mobile">${v.model}</td>
      <td class="hide-mobile">${v.year || ""}</td>
      <td class="hide-mobile">${v.licensePlate}</td>
      <td class="hide-mobile">${v.chassisNumber}</td>
      <td class="actions-column">
        <button class="btn btn--icon btn--view viewBtn" data-id="${v.id}" title="Visualizza" aria-label="Visualizza veicolo">${VIEW_ICON}</button>
        <button class="btn btn--icon btn--ghost editBtn" data-id="${v.id}" title="Modifica" aria-label="Modifica veicolo">${EDIT_ICON}</button>
        <button class="btn btn--icon btn--danger deleteBtn" data-id="${v.id}" title="Elimina" aria-label="Elimina veicolo">${DELETE_ICON}</button>
      </td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  vehiclesList.appendChild(table);

  table.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains("viewBtn")) {
      const item = docs.find((v) => v.id === id);
      if (item) showVehicleViewModal(item);
    }
    if (btn.classList.contains("editBtn")) await openVehicleEditModal(id);
    if (btn.classList.contains("deleteBtn")) {
      if (confirm("Sei sicuro di voler cancellare questo veicolo?")) {
        await deleteDoc(doc(db, "cars", id));
        alert(" Veicolo cancellato.");
        loadVehicles();
      }
    }
  });
}

function formatOwnerCell(ownerLabel, ownerType) {
  if (!ownerLabel) return "N/D";
  if (ownerType !== "person") {
    return `<span class="company-name-cell">${ownerLabel}</span>`;
  }
  const parts = ownerLabel.trim().split(/\s+/);
  const firstName = parts.shift() || "";
  const lastName = parts.join(" ") || "";
  if (!firstName && !lastName) return "N/D";
  if (!lastName) return firstName;
  return `<span class="person-name-stack"><span>${firstName}</span><span>${lastName}</span></span>`;
}

function formatVehicleMobileCard(vehicle) {
  return `
    <span class="vehicle-mobile-card">
      <span>${vehicle.brand || "-"}</span>
      <span>${vehicle.model || "-"}</span>
      <span>${vehicle.year || "-"}</span>
      <span>${vehicle.licensePlate || "-"}</span>
    </span>
  `;
}

function showVehicleViewModal(vehicle) {
  const content = document.createElement("div");
  content.className = "client-view-modal";
  content.innerHTML = `
    <div class="client-view-row"><strong>Proprietario:</strong> ${vehicle.ownerLabel || "N/D"}</div>
    <div class="client-view-row"><strong>Marca:</strong> ${vehicle.brand || "N/D"}</div>
    <div class="client-view-row"><strong>Modello:</strong> ${vehicle.model || "N/D"}</div>
    <div class="client-view-row"><strong>Anno:</strong> ${vehicle.year || "N/D"}</div>
    <div class="client-view-row"><strong>Targa:</strong> ${vehicle.licensePlate || "N/D"}</div>
    <div class="client-view-row"><strong>N. Telaio:</strong> ${vehicle.chassisNumber || "N/D"}</div>
    <div class="client-view-row"><strong>Colore:</strong> ${vehicle.color || "-"}</div>
  `;

  openModal({
    title: "Dettagli Veicolo",
    content,
    noModalCancelBtn: false,
  });
}

async function openVehicleEditModal(id) {
  const ref = doc(db, "cars", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    alert("Veicolo non trovato.");
    return;
  }
  const d = snap.data();

  // Crea elementi
  const brandSelect = document.createElement("select");
  const modelSelect = document.createElement("select");
  const yearSelect = document.createElement("select");
  
  const colorInput = document.createElement("input");
  colorInput.type = "text";
  colorInput.value = d.color || "";

  const plateInput = document.createElement("input");
  plateInput.type = "text";
  plateInput.value = d.licensePlate || "";
  plateInput.addEventListener("input", () => { plateInput.value = plateInput.value.toUpperCase(); });

  const chassisInput = document.createElement("input");
  chassisInput.type = "text";
  chassisInput.value = d.chassisNumber || "";
  chassisInput.addEventListener("input", () => formatVINOnInput(chassisInput));

  const msgBox = document.createElement("div");

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn--ghost";
  cancelBtn.textContent = "Annulla";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn--primary";
  saveBtn.textContent = "Salva";

  // Costruisci contenuto
  const content = document.createElement("div");
  
  const addField = (label, input) => {
    const lbl = document.createElement("label");
    lbl.textContent = label;
    content.appendChild(lbl);
    content.appendChild(input);
  };

  addField("Marca:", brandSelect);
  addField("Modello:", modelSelect);
  addField("Anno:", yearSelect);
  addField("Colore:", colorInput);
  addField("Targa:", plateInput);
  addField("Nr. Telaio:", chassisInput);

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "form-actions";
  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);
  content.appendChild(actionsDiv);
  content.appendChild(msgBox);

  // Carica tendine
  await loadMakes(brandSelect);
  brandSelect.value = d.brand || "";
  
  if (d.brand) {
    await loadModels(d.brand, modelSelect);
    modelSelect.value = d.model || "";
  }
  
  loadYears(yearSelect);
  yearSelect.value = d.year || "";

  // Evento cambio marca -> ricarica modelli
  brandSelect.addEventListener("change", async () => {
    if (brandSelect.value) {
      await loadModels(brandSelect.value, modelSelect);
    } else {
      modelSelect.innerHTML = '<option value="">-- Seleziona modello --</option>';
    }
  });

  cancelBtn.onclick = () => closeModal();

  saveBtn.onclick = async () => {
    const updates = {
      brand: brandSelect.value,
      model: modelSelect.value,
      year: parseInt(yearSelect.value) || null,
      color: colorInput.value.trim(),
      licensePlate: plateInput.value.trim().toUpperCase(),
      chassisNumber: chassisInput.value.trim().toUpperCase(),
      updatedAt: serverTimestamp()
    };
    
    if (!updates.brand) { msgBox.textContent = " Marca obbligatoria."; return; }
    if (!updates.model) { msgBox.textContent = " Modello obbligatorio."; return; }
    if (!updates.year) { msgBox.textContent = " Anno obbligatorio."; return; }
    
    try {
      await updateDoc(ref, updates);
      msgBox.className = "form-msg form-msg--success";
      msgBox.textContent = " Aggiornato.";
      setTimeout(() => { closeModal(); loadVehicles(); }, 500);
    } catch (err) {
      msgBox.className = "form-msg form-msg--error";
      msgBox.textContent = " Errore durante il salvataggio.";
    }
  };

  openModal({ title: " Modifica Veicolo", content: content, noModalCancelBtn: true });
}
