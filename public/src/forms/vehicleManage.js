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

const vehiclesList = document.getElementById("vehiclesList");
const searchBtn = document.getElementById("searchVehiclesBtn");
const searchPlate = document.getElementById("searchPlate");
const searchChassis = document.getElementById("searchChassis");
const searchOwner = document.getElementById("searchOwner");
const addBtn = document.getElementById("showAddVehicleBtn");
const backBtn = document.getElementById("backToDashboardVehiclesBtn");
const vehicleManageSection = document.getElementById("vehicleManageSection");
const resetBtn = document.getElementById("resetVehiclesBtn");

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
  vehiclesList.innerHTML = "";
  if (docs.length === 0) {
    vehiclesList.textContent = "Nessun veicolo trovato.";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Proprietario</th><th>Marca</th><th>Modello</th><th>Anno</th><th>Targa</th><th>Nr. Telaio</th><th class="actions-column">Azioni</th></tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  docs.forEach(v => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${v.ownerLabel}</td>
      <td>${v.brand}</td>
      <td>${v.model}</td>
      <td>${v.year || ""}</td>
      <td>${v.licensePlate}</td>
      <td>${v.chassisNumber}</td>
      <td class="actions-column">
        <button class="btn btn--icon btn--ghost editBtn" data-id="${v.id}">Modifica</button>
        <button class="btn btn--icon btn--danger deleteBtn" data-id="${v.id}">Elimina</button>
      </td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  vehiclesList.appendChild(table);

  table.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains("editBtn")) await openVehicleEditModal(id);
    if (btn.classList.contains("deleteBtn")) {
      if (confirm("Sei sicuro di voler cancellare questo veicolo?")) {
        await deleteDoc(doc(db, "cars", id));
        alert("Veicolo cancellato.");
        loadVehicles();
      }
    }
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
    
    if (!updates.brand) { msgBox.textContent = "Errore: Marca obbligatoria."; return; }
    if (!updates.model) { msgBox.textContent = "Errore: Modello obbligatorio."; return; }
    if (!updates.year) { msgBox.textContent = "Errore: Anno obbligatorio."; return; }
    
    try {
      await updateDoc(ref, updates);
      msgBox.className = "form-msg form-msg--success";
      msgBox.textContent = "Aggiornato.";
      setTimeout(() => { closeModal(); loadVehicles(); }, 500);
    } catch (err) {
      msgBox.className = "form-msg form-msg--error";
      msgBox.textContent = "Errore: Salvataggio non riuscito.";
    }
  };

  openModal({ title: "Modifica Veicolo", content: content, noModalCancelBtn: true });
}


