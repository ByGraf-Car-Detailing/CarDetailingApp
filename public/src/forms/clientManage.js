import { db } from "../services/authService.js";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { showDashboard } from "../app.js";
import { resetClientForm } from "./clientForm.js";
import { openModal, closeModal } from "../utils/modal.js";

// DOM Elements
const backBtn = document.getElementById("backToDashboardClientsBtn");
const addBtn = document.getElementById("showAddClientBtn");
const searchFirstName = document.getElementById("searchFirstNameManage");
const searchLastName = document.getElementById("searchLastNameManage");
const searchEmail = document.getElementById("searchEmailManage");
const searchCompanyInput = document.getElementById("searchCompanyInputManage");
const searchBtn = document.getElementById("searchClientsBtnManage");
const resetBtn = document.getElementById("resetClientsBtnManage");
const searchInactive = document.getElementById("searchIncludeInactive");
const list = document.getElementById("clientsList");
const clientManageSection = document.getElementById("clientManageSection");

// Event: Back to Dashboard
backBtn.addEventListener("click", () => {
  localStorage.removeItem("currentView");
  import("../app.js").then(m => m.showDashboard());
});

// Event: Show Add Client Form
addBtn.addEventListener("click", () => {
  clientManageSection.style.display = "none";
  document.getElementById("clientFormSection").style.display = "block";
  resetClientForm();
});

// Carica elenco clienti
export async function loadClients() {
  list.innerHTML = "Caricamento...";

  const q = query(collection(db, "clients"));
  const snap = await getDocs(q);

  const clients = [];
  for (const d of snap.docs) {
    const data = d.data();
    clients.push({ id: d.id, ...data });
  }
  renderList(clients);
}

// Ricerca clienti filtrata
searchBtn.addEventListener("click", async () => {
  list.innerHTML = "Ricerca...";

  const fname = searchFirstName.value.trim().toLowerCase();
  const lname = searchLastName.value.trim().toLowerCase();
  const email = searchEmail.value.trim().toLowerCase();
  const companyNameFilter = searchCompanyInput.value.trim().toLowerCase();
  const includeInactive = searchInactive.checked;

  const q = query(collection(db, "clients"));
  const snap = await getDocs(q);

  const results = [];
  for (const d of snap.docs) {
    const data = d.data();
    let match = true;

    if (!includeInactive && data.active === false) match = false;

    if (data.type === "person") {
      if (match && fname && !(data.firstName || "").toLowerCase().includes(fname)) match = false;
      if (match && lname && !(data.lastName || "").toLowerCase().includes(lname)) match = false;
    }

    if (match && email && !(data.email || "").toLowerCase().includes(email)) match = false;

    if (match && companyNameFilter) {
      if (data.type === "company") {
        if (!(data.companyName || "").toLowerCase().includes(companyNameFilter)) match = false;
      } else if (data.isContact && data.companyId) {
        const ref = doc(db, "clients", data.companyId);
        const s = await getDoc(ref);
        if (s.exists()) {
          const cname = s.data().companyName || "";
          if (!cname.toLowerCase().includes(companyNameFilter)) match = false;
        } else {
          match = false;
        }
      } else {
        match = false;
      }
    }

    if (match) results.push({ id: d.id, ...data });
  }

  renderList(results);
});

// Reset ricerca
resetBtn.addEventListener("click", () => {
  if (searchFirstName) searchFirstName.value = "";
  if (searchLastName) searchLastName.value = "";
  if (searchEmail) searchEmail.value = "";
  if (searchCompanyInput) searchCompanyInput.value = "";
  if (searchInactive) searchInactive.checked = false;
  loadClients();
});

// Render elenco clienti
function renderList(docs) {
  list.innerHTML = "";
  if (docs.length === 0) {
    list.textContent = "Nessun cliente trovato.";
    return;
  }

  const table = document.createElement("table");

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Nome / Azienda</th>
      <th class="hide-mobile">Email</th>
      <th>Tipo</th>
      <th>Stato</th>
      <th class="actions-column">Azioni</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  docs.forEach(d => {
    const fullName = d.type === "company"
      ? d.companyName
      : `${d.firstName || ""} ${d.lastName || ""}`.trim();

    const tipoFull = d.type === "person" ? "Privato" : "Ditta";
    const tipoShort = d.type === "person" ? "P" : "D";
    const isActive = d.active !== false;
    const statoFull = isActive ? "Attivo" : "Disattivato";
    const statoShort = isActive ? "A" : "D";
    const statoClass = isActive ? "badge--active-short" : "badge--inactive-short";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fullName}</td>
      <td class="hide-mobile">${d.email || ""}</td>
      <td><span class="show-desktop">${tipoFull}</span><span class="show-mobile">${tipoShort}</span></td>
      <td><span class="badge show-desktop" data-active="${isActive}">${statoFull}</span><span class="badge ${statoClass} show-mobile">${statoShort}</span></td>
      <td class="actions-column">
        <button class="btn btn--icon btn--view viewBtn" data-id="${d.id}" title="Visualizza">🔍</button>
        <button class="btn btn--icon btn--ghost editBtn" data-id="${d.id}" title="Modifica">✏️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  list.appendChild(table);

  // Event delegato per azioni
  table.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    
    if (btn.classList.contains("viewBtn")) {
      await showClientViewModal(id);
    }
    if (btn.classList.contains("editBtn")) {
      clientManageSection.style.display = "none";
      document.getElementById("clientEditSection").style.display = "block";
      import("./clientEdit.js").then(m => m.loadClientForEdit(id));
    }
  });
}

// Modal visualizzazione cliente (solo lettura)
async function showClientViewModal(clientId) {
  const ref = doc(db, "clients", clientId);
  const snap = await getDoc(ref);
  
  if (!snap.exists()) {
    alert("Cliente non trovato.");
    return;
  }
  
  const d = snap.data();
  const fullName = d.type === "company"
    ? d.companyName
    : `${d.firstName || ""} ${d.lastName || ""}`.trim();
  
  const tipo = d.type === "person" ? "Privato" : "Ditta";
  const isActive = d.active !== false;
  
  // Costruisci indirizzo
  let indirizzo = "";
  if (d.address) {
    const a = d.address;
    indirizzo = `${a.street || ""} ${a.number || ""}, ${a.cap || ""} ${a.city || ""}`.trim();
    if (indirizzo === ",") indirizzo = "";
  }
  
  const content = document.createElement("div");
  content.className = "client-view-modal";
  content.innerHTML = `
    <div class="client-view-row"><strong>Nome:</strong> ${fullName}</div>
    <div class="client-view-row"><strong>Tipo:</strong> ${tipo}</div>
    <div class="client-view-row"><strong>Email:</strong> ${d.email || "-"}</div>
    <div class="client-view-row"><strong>Telefono:</strong> ${d.phone || "-"}</div>
    <div class="client-view-row"><strong>Indirizzo:</strong> ${indirizzo || "-"}</div>
    ${d.fiscalCode ? `<div class="client-view-row"><strong>P.IVA/CF:</strong> ${d.fiscalCode}</div>` : ""}
    ${d.note ? `<div class="client-view-row"><strong>Note:</strong> ${d.note}</div>` : ""}
    <div class="client-view-row"><strong>Stato:</strong> <span class="badge" data-active="${isActive}">${isActive ? "Attivo" : "Disattivato"}</span></div>
  `;
  
  openModal({
    title: "👤 Dettagli Cliente",
    content: content,
    noModalCancelBtn: false
  });
}

export { renderList };
