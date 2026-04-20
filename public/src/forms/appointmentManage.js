// /src/forms/appointmentManage.js
// Car Detailing App  Gestione Appuntamenti

import { db, auth } from "../services/authService.js";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

const EDIT_ICON = `
  <svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="m3 17.25 9.06-9.06 3.75 3.75L6.75 21H3v-3.75Zm14.71-9.04-1.92 1.92-3.75-3.75 1.92-1.92a1.5 1.5 0 0 1 2.12 0l1.63 1.63a1.5 1.5 0 0 1 0 2.12Z" fill="currentColor"/>
  </svg>
`;
const DELETE_ICON = `
  <svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h2v9H7V9Zm4 0h2v9h-2V9Zm4 0h2v9h-2V9Z" fill="currentColor"/>
  </svg>
`;

async function populateJobTypeFilter(select) {
  select.innerHTML = `<option value="">Tutti</option>`;
  const snap = await getDocs(collection(db, "jobTypes"));
  snap.forEach(doc => {
    const d = doc.data();
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = d.description || doc.id;
    select.appendChild(opt);
  });
}

async function populateOperatorFilter(select) {
  select.innerHTML = `<option value="">Tutti</option>`;
  const snap = await getDocs(collection(db, "allowedUsers"));
  snap.forEach(doc => {
    const d = doc.data();
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = d.displayName || doc.id;
    select.appendChild(opt);
  });
}

// Funzione principale: chiamata ogni volta che si entra nella sezione
export async function loadAppointments() {
  const manageSection = document.getElementById("appointmentManageSection");
  const listContainer = document.getElementById("appointmentsList");
  const editSectionId = "appointmentEditSection";
  let editSection = document.getElementById(editSectionId);

  const newAppointmentBtn = document.getElementById("showAppointmentFormFromListBtn");
  const backBtn = document.getElementById("backToDashboardAppointmentsBtn");
  const filterStatus = document.getElementById("filterStatus");
  const filterDate = document.getElementById("filterDate");
  const filterCustomer = document.getElementById("filterCustomer");
  const filterOperator = document.getElementById("filterOperator");
  const filterJobType = document.getElementById("filterJobType");
  const filterPlate = document.getElementById("filterPlate");
  const allowedUsersSnap = await getDocs(collection(db, "allowedUsers"));
  const operatorDisplayById = new Map();
  allowedUsersSnap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const displayName =
      (typeof d.displayName === "string" && d.displayName.trim()) ||
      (typeof d.email === "string" && d.email.trim()) ||
      docSnap.id;
    operatorDisplayById.set(docSnap.id, displayName);
  });
  await populateOperatorFilter(filterOperator);
  await populateJobTypeFilter(filterJobType);
  const searchBtn = document.getElementById("searchAppointmentsBtn");
  const resetBtn = document.getElementById("resetAppointmentsBtn");

  let userRole = localStorage.getItem("userRole");
  let userEmail = auth.currentUser?.email || window.userEmail || "";

  // Listener "Nuovo appuntamento"
  if (newAppointmentBtn && !newAppointmentBtn._listenerAttached) {
    newAppointmentBtn.addEventListener("click", () => {
      manageSection.style.display = "none";
      document.getElementById("appointmentFormSection").style.display = "block";
      import("./appointmentForm.js").then(m => {
        if (typeof m.resetAppointmentForm === "function") m.resetAppointmentForm();
      });
      localStorage.setItem("currentView", "nuovoAppuntamento");
    });
    newAppointmentBtn._listenerAttached = true;
  }

  // Listener "Torna alla Dashboard"
  if (backBtn && !backBtn._listenerAttached) {
    backBtn.addEventListener("click", () => {
      if (editSection) editSection.style.display = "none";
      manageSection.style.display = "none";
      import("../app.js").then(m => m.showDashboard());
    });
    backBtn._listenerAttached = true;
  }

  // Listener ricerca
  if (searchBtn && !searchBtn._listenerAttached) {
    searchBtn.addEventListener("click", async () => {
      await searchAppointments();
    });
    searchBtn._listenerAttached = true;
  }

  // Listener reset
  if (resetBtn && !resetBtn._listenerAttached) {
    resetBtn.addEventListener("click", () => {
      filterStatus.value = "";
      filterDate.value = "";
      filterCustomer.value = "";
      filterPlate.value = "";
      filterOperator.value = "";
      filterJobType.value = "";
      loadAppointments();
    });
    resetBtn._listenerAttached = true;
  }

  // Carica appuntamenti
  listContainer.innerHTML = "Caricamento appuntamenti...";
  const q = query(collection(db, "appointments"), where("deleted", "==", false));
  const snap = await getDocs(q);

  let appointments = [];
  for (const d of snap.docs) {
    appointments.push({ id: d.id, ...d.data() });
  }
  renderList(appointments);

  // Funzione ricerca appuntamenti
  async function searchAppointments() {
    listContainer.innerHTML = "Ricerca...";
    const status = filterStatus.value;
    const date = filterDate.value;
    const customer = filterCustomer.value.trim().toLowerCase();
    const plate = document.getElementById("filterPlate").value.trim().toLowerCase();
    const chassis = document.getElementById("filterChassis").value.trim().toLowerCase();
    const operator = filterOperator.value;
    const jobType = filterJobType.value;
  
    const q = query(collection(db, "appointments"), where("deleted", "==", false));
    const snap = await getDocs(q);
  
    const filtered = [];
    for (const d of snap.docs) {
      const data = d.data();
      let match = true;
  
      if (status && data.status !== status) match = false;
      if (date) {
        const dateOnly = dt => dt ? dt.slice(0, 10) : "";
        if (dateOnly(data.startWork) !== date) match = false;
      }
      if (customer) {
        const c = data.customerData || {};
        const cLabel = (c.type === "company"
          ? c.companyName
          : `${c.firstName || ""} ${c.lastName || ""}`).toLowerCase();
        if (!cLabel.includes(customer)) match = false;
      }
      if (plate) {
        const t = (data.vehicleData?.licensePlate || "").toLowerCase();
        if (!t.includes(plate)) match = false;
      }
      if (chassis) {
        const ch = (data.vehicleData?.chassisNumber || "").toLowerCase();
        if (!ch.includes(chassis)) match = false;
      }
      if (operator && data.operatorId !== operator) match = false;
      if (jobType && data.jobTypeId !== jobType) match = false;
      if (match) filtered.push({ id: d.id, ...data });
    }
    renderList(filtered);
  }

  // Render tabella appuntamenti
  function renderList(appointments) {
    listContainer.innerHTML = "";
    if (appointments.length === 0) {
      listContainer.textContent = "Nessun appuntamento trovato.";
      return;
    }
  
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>Cliente</th>
        <th>Veicolo</th>
        <th>Targa</th>
        <th>N TELAIO</th>
        <th>Tipo Lavoro</th>
        <th>Operatore</th>
        <th>Stato</th>
        <th>Data lavorazione</th>
        <th class="actions-column">Azioni</th>
      </tr>
    `;
    table.appendChild(thead);
  
    const tbody = document.createElement("tbody");
    appointments.forEach(d => {
      const cliente = d.customerData?.type === "company"
        ? d.customerData.companyName
        : `${d.customerData?.firstName || ""} ${d.customerData?.lastName || ""}`.trim();
      const veicolo = d.vehicleData
        ? `${d.vehicleData.brand || ""} ${d.vehicleData.model || ""}`.trim()
        : "";
      const targa = d.vehicleData?.licensePlate || "";
      const telaio = d.vehicleData?.chassisNumber || "N/D";
      const jobType = d.jobTypeData?.description || "";
      const operatore = formatOperatore(d, operatorDisplayById);
      const stato = d.status || "";
      const dataLavorazione = d.startWork ? formatDateTime(d.startWork) : "";
  
      let actions = "";
      if ((userRole === "admin") || (userRole === "staff" && d.createdBy === userEmail)) {
        actions += `<button class="btn btn--icon btn--ghost editBtn" data-id="${d.id}" title="Modifica" aria-label="Modifica appuntamento">${EDIT_ICON}</button>`;
      }
      if (userRole === "admin") {
        actions += `<button class="btn btn--icon btn--danger deleteBtn" data-id="${d.id}" title="Elimina" aria-label="Elimina appuntamento">${DELETE_ICON}</button>`;
      }
  
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${cliente}</td>
        <td>${veicolo}</td>
        <td>${targa}</td>
        <td>${telaio}</td>
        <td>${jobType}</td>
        <td>${operatore}</td>
        <td>${formatStatus(stato)}</td>
        <td>${dataLavorazione}</td>
        <td class="actions-column">${actions}</td>
      `;
      tbody.appendChild(tr);
    });
  
    table.appendChild(tbody);
    listContainer.appendChild(table);
  
    // Event delegato per azioni
    table.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.classList.contains("editBtn")) {
        showEditSection(id);
      }
      if (btn.classList.contains("deleteBtn")) {
        if (confirm("Sei sicuro di voler cancellare (soft delete) questo appuntamento?")) {
          await softDeleteAppointment(id);
          loadAppointments();
        }
      }
    });
  }

  // Funzione: mostra sezione modifica appuntamento
  async function showEditSection(appointmentId) {
    let editSection = document.getElementById(editSectionId);
    if (!editSection) {
      editSection = document.createElement("section");
      editSection.id = editSectionId;
      manageSection.parentNode.insertBefore(editSection, manageSection.nextSibling);
    }

    const ref = doc(db, "appointments", appointmentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      alert("Appuntamento non trovato.");
      return;
    }
    const data = snap.data();
    const canEditAll = userRole === "admin" || (userRole === "staff" && data.createdBy === userEmail);

    editSection.innerHTML = `<h3> Modifica Appuntamento</h3>
      <form id="appointmentEditForm">
        <label>Cliente:</label>
        <input type="text" value="${formatCliente(data.customerData)}" readonly />
        <label>Veicolo:</label>
        <input type="text" value="${formatVeicolo(data.vehicleData)}" readonly />
        <label>Tipo Lavoro:</label>
        <input type="text" value="${data.jobTypeData?.description || ""}" readonly />
        <label>Operatore:</label>
        <input type="text" value="${formatOperatore(data, operatorDisplayById)}" readonly />
        <label>Stato:</label>
        <select id="editStatus" ${canEditAll ? "" : "disabled"}>
          ${statusOptions(data.status)}
        </select>
        <label>Data/Ora Ricezione (inizio-fine):</label>
        <input type="datetime-local" id="editStartReception" value="${toLocalInput(data.startReception)}" ${canEditAll ? "" : "readonly"}/>
        <input type="datetime-local" id="editEndReception" value="${toLocalInput(data.endReception)}" ${canEditAll ? "" : "readonly"}/>
        <label>Data/Ora Lavorazione (inizio-fine):</label>
        <input type="datetime-local" id="editStartWork" value="${toLocalInput(data.startWork)}" ${canEditAll ? "" : "readonly"}/>
        <input type="datetime-local" id="editEndWork" value="${toLocalInput(data.endWork)}" ${canEditAll ? "" : "readonly"}/>
        <label>Data/Ora Consegna (inizio-fine):</label>
        <input type="datetime-local" id="editStartDelivery" value="${toLocalInput(data.startDelivery)}" ${canEditAll ? "" : "readonly"}/>
        <input type="datetime-local" id="editEndDelivery" value="${toLocalInput(data.endDelivery)}" ${canEditAll ? "" : "readonly"}/>
        <label>Note interne:</label>
        <textarea id="editNoteInternal" rows="2" ${canEditAll ? "" : "readonly"}>${data.noteInternal || ""}</textarea>
        <div class="form-actions">
          <button type="button" class="btn btn--ghost cancel-edit-btn">Annulla</button>
          <button type="submit" class="btn btn--primary" ${canEditAll ? "" : "disabled"}>Salva</button>
        </div>
        <div id="editMsg"></div>
      </form>
    `;
    editSection.style.display = "block";
    manageSection.style.display = "none";

    // Tasto Annulla
    const cancelBtn = editSection.querySelector(".cancel-edit-btn");
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        editSection.style.display = "none";
        manageSection.style.display = "block";
        loadAppointments();
      };
    }

    // Form submit
    const editForm = editSection.querySelector("#appointmentEditForm");
    if (editForm) {
      editForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!canEditAll) return;
        const msgBox = document.getElementById("editMsg");
        msgBox.textContent = "";

        const startReception = document.getElementById("editStartReception").value;
        const endReception = document.getElementById("editEndReception").value;
        const startWork = document.getElementById("editStartWork").value;
        const endWork = document.getElementById("editEndWork").value;
        const startDelivery = document.getElementById("editStartDelivery").value;
        const endDelivery = document.getElementById("editEndDelivery").value;

        if (!startReception || !endReception || !startWork || !endWork || !startDelivery || !endDelivery) {
          msgBox.textContent = " Compila tutte le date/ore.";
          return;
        }

        if (
          (new Date(startWork) < new Date(endReception)) ||
          (new Date(endWork) < new Date(startWork)) ||
          (new Date(startDelivery) < new Date(endWork)) ||
          (new Date(endDelivery) < new Date(startDelivery))
        ) {
          msgBox.textContent = " Ordine delle date/ore non valido.";
          return;
        }

        if (((new Date(endWork) - new Date(startWork)) / (1000 * 60 * 60)) < 2) {
          msgBox.textContent = " Durata lavorazione minima: 2h.";
          return;
        }

        const updates = {
          status: document.getElementById("editStatus").value,
          startReception,
          endReception,
          startWork,
          endWork,
          startDelivery,
          endDelivery,
          noteInternal: document.getElementById("editNoteInternal").value.trim(),
          updatedAt: serverTimestamp(),
          history: [
            ...(Array.isArray(data.history) ? data.history : []),
            {
              updatedBy: userEmail,
              updatedAt: new Date().toISOString(),
              oldStatus: data.status,
              newStatus: document.getElementById("editStatus").value,
            }
          ]
        };

        try {
          await updateDoc(ref, updates);
          msgBox.className = "form-msg form-msg--success";
          msgBox.textContent = " Appuntamento aggiornato.";
          setTimeout(() => {
            editSection.style.display = "none";
            manageSection.style.display = "block";
            loadAppointments();
          }, 650);
        } catch (err) {
          msgBox.className = "form-msg form-msg--error";
          msgBox.textContent = " Errore durante il salvataggio.";
        }
      };
    }
  }

  async function softDeleteAppointment(appointmentId) {
    const ref = doc(db, "appointments", appointmentId);
    const currentData = (await getDoc(ref)).data();
    await updateDoc(ref, {
      deleted: true,
      updatedAt: serverTimestamp(),
      history: [
        ...(Array.isArray(currentData.history) ? currentData.history : []),
        { updatedBy: userEmail, updatedAt: new Date().toISOString(), softDeleted: true }
      ]
    });
  }

  function formatOperatore(data, operatorDisplayMap) {
    if (data.operatorData?.displayName) return data.operatorData.displayName;
    if (data.operatorId && operatorDisplayMap?.has(data.operatorId)) {
      return operatorDisplayMap.get(data.operatorId);
    }
    if (data.operatorData?.operatorId && operatorDisplayMap?.has(data.operatorData.operatorId)) {
      return operatorDisplayMap.get(data.operatorData.operatorId);
    }
    if (data.operatorData?.email) return data.operatorData.email;
    if (data.operatorData?.operatorId) return data.operatorData.operatorId;
    if (data.operatorId) return data.operatorId;
    return "N/D";
  }

  function formatStatus(status) {
    return `<span class="badge" data-status="${status}">${status}</span>`;
  }

  function statusOptions(selected) {
    const options = ["programmato", "ricezione", "attesa", "lavorazione", "pronto", "in consegna", "concluso", "fatturato", "pagato"];
    return options.map(s => `<option value="${s}" ${selected === s ? "selected" : ""}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join("");
  }

  function formatDateTime(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return dt;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  
  function pad(n) { return String(n).padStart(2, "0"); }
  
  function toLocalInput(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  
  function formatCliente(c) {
    if (!c) return "";
    return c.type === "company" ? c.companyName : `${c.firstName || ""} ${c.lastName || ""}`.trim();
  }
  
  function formatVeicolo(v) {
    if (!v) return "";
    return `${v.brand || ""} ${v.model || ""}`.trim();
  }
}

export {};
