import { db } from "../services/authService.js";
import {
  collection, query, where, getDocs, getDoc, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { showDashboard } from "../app.js";

// === VALIDATION HELPERS (Standard) ===
function autoCapitalize(input) {
  const pos = input.selectionStart;
  const val = input.value;
  const capitalized = val.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  if (val !== capitalized) {
    input.value = capitalized;
    input.setSelectionRange(pos, pos);
  }
}

function filterPhoneNumber(input) {
  // Permette + all'inizio e numeri
  input.value = input.value.replace(/(?!^\+)[^0-9]/g, "");
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// DOM Elements
const editForm = document.getElementById("editClientForm");
const warningBanner = document.getElementById("editWarningBanner");

//  Funzione di EDIT cliente (singolo)
export async function loadClientForEdit(clientId) {
  document.getElementById("clientManageSection").style.display = "none";
  document.getElementById("clientEditSection").style.display = "block";

  const ref = doc(db, "clients", clientId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    alert("Cliente non trovato.");
    return;
  }

  const data = snap.data();
  const disabled = data.active === false;

  warningBanner.style.display = disabled ? "block" : "none";
  editForm.style.display = "block";
  editForm.innerHTML = "";

  const readonly = disabled ? "readonly" : "";
  const disabledAttr = disabled ? "disabled" : "";

  const isPerson = data.type === "person";
  const isCompany = data.type === "company";
  let companyOptions = "";

  if (isPerson) {
    const q = query(collection(db, "clients"), where("type", "==", "company"));
    const snapCompanies = await getDocs(q);
    companyOptions += `<option value="NO">-- Nessuna --</option>`;
    snapCompanies.forEach(doc => {
      const selected = doc.id === data.companyId ? "selected" : "";
      companyOptions += `<option value="${doc.id}" ${selected}>${doc.data().companyName}</option>`;
    });
  }

  const html = `
    <input type="hidden" id="editClientId" value="${clientId}" />

    ${isPerson ? `
      <label>Nome:</label>
      <input type="text" id="editFirstName" value="${data.firstName || ""}" ${readonly} />
      <label>Cognome:</label>
      <input type="text" id="editLastName" value="${data.lastName || ""}" ${readonly} />
      <label>
        <input type="checkbox" id="editIsContact" ${data.isContact ? "checked" : ""} ${disabledAttr}/> Contatto aziendale
      </label>
      <div id="companySelectContainer" class="${data.isContact ? "" : "hidden"}">
        <label>Azienda:</label>
        <select id="editCompanyId" ${disabledAttr}>${companyOptions}</select>
      </div>
    ` : `
      <label>Ragione Sociale:</label>
      <input type="text" id="editCompanyName" value="${data.companyName || ""}" ${readonly} />
    `}

    <label>Email:</label>
    <input type="email" id="editEmail" value="${data.email || ""}" ${readonly} />
    <small id="editEmailError" style="color:var(--danger);display:none;">Email non valida</small>

    <label>Telefono:</label>
    <input type="tel" id="editPhone" value="${data.phone || ""}" ${readonly} inputmode="numeric" />

    <label>Via:</label>
    <input type="text" id="editStreet" value="${data.address?.street || ""}" ${readonly} />
    <label>Numero civico:</label>
    <input type="text" id="editStreetNumber" value="${data.address?.number || ""}" ${readonly} />
    <label>CAP:</label>
    <input type="text" id="editCap" value="${data.address?.cap || ""}" ${readonly} inputmode="numeric" maxlength="5" />
    <label>Citt:</label>
    <input type="text" id="editCity" value="${data.address?.city || ""}" ${readonly} />

    <label>Codice Fiscale / P.IVA:${isCompany ? " *" : ""}</label>
    <input type="text" id="editFiscalCode" value="${data.fiscalCode || ""}" ${readonly} />
    ${isCompany ? `<small id="editFiscalError" style="color:var(--danger);display:none;">Obbligatorio per Ditta</small>` : ""}

    <label>Note:</label>
    <textarea id="editNote" ${readonly}>${data.note || ""}</textarea>

    <div class="form-actions">
      <button type="button" id="cancelEditBtn" class="btn btn--ghost">Annulla</button>
      <button type="submit" class="btn btn--primary" ${disabledAttr}>Salva</button>
    </div>
  `;

  editForm.innerHTML = html;

  // === BIND VALIDATION EVENTS ===
  if (!disabled) {
    // Nome/Cognome capitalize
    if (isPerson) {
      const fnInput = document.getElementById("editFirstName");
      const lnInput = document.getElementById("editLastName");
      fnInput.addEventListener("input", () => autoCapitalize(fnInput));
      lnInput.addEventListener("input", () => autoCapitalize(lnInput));
    }

    // Ragione Sociale capitalize
    if (isCompany) {
      const cnInput = document.getElementById("editCompanyName");
      cnInput.addEventListener("input", () => autoCapitalize(cnInput));
    }

    // Codice Fiscale uppercase
    const fcInput = document.getElementById("editFiscalCode");
    fcInput.addEventListener("input", () => {
      fcInput.value = fcInput.value.toUpperCase();
    });

    // Phone: solo numeri ma mantiene +
    const phoneInput = document.getElementById("editPhone");
    phoneInput.addEventListener("input", () => filterPhoneNumber(phoneInput));

    // CAP: solo numeri
    const capInput = document.getElementById("editCap");
    capInput.addEventListener("input", () => {
      capInput.value = capInput.value.replace(/[^0-9]/g, "");
    });

    // Citt: capitalize
    const cityInput = document.getElementById("editCity");
    cityInput.addEventListener("input", () => autoCapitalize(cityInput));

    // Email: pattern check
    const emailInput = document.getElementById("editEmail");
    const emailError = document.getElementById("editEmailError");
    emailInput.addEventListener("input", () => {
      const valid = emailInput.value === "" || validateEmail(emailInput.value);
      emailError.style.display = valid ? "none" : "block";
    });
  }

  // Gestione company select
  if (isPerson && !disabled) {
    const checkbox = document.getElementById("editIsContact");
    const companyContainer = document.getElementById("companySelectContainer");
    checkbox.addEventListener("change", () => {
      companyContainer.classList.toggle("hidden", !checkbox.checked);
    });
  }

  // Submit form
  editForm.onsubmit = async (e) => {
    e.preventDefault();
    if (disabled) {
      alert("Cliente disattivato. Non  possibile salvare.");
      return;
    }

    const email = document.getElementById("editEmail").value.trim();
    if (email && !validateEmail(email)) {
      alert(" Email non valida.");
      return;
    }

    if (isCompany) {
      const fc = document.getElementById("editFiscalCode").value.trim();
      if (!fc) {
        document.getElementById("editFiscalError").style.display = "block";
        alert(" Codice Fiscale / P.IVA obbligatorio per le Ditte.");
        return;
      }
    }

    if (isPerson) {
      const isContactChecked = document.getElementById("editIsContact").checked;
      const selectedCompany = document.getElementById("editCompanyId").value;
      if (isContactChecked && selectedCompany === "NO") {
        alert(" Devi selezionare un'azienda se il cliente  un contatto aziendale.");
        return;
      }
    }

    const updates = {
      email,
      phone: document.getElementById("editPhone").value.trim(),
      fiscalCode: document.getElementById("editFiscalCode").value.trim(),
      note: document.getElementById("editNote").value.trim(),
      address: {
        street: document.getElementById("editStreet").value.trim(),
        number: document.getElementById("editStreetNumber").value.trim(),
        cap: document.getElementById("editCap").value.trim(),
        city: document.getElementById("editCity").value.trim()
      }
    };

    if (isPerson) {
      updates.firstName = document.getElementById("editFirstName").value.trim();
      updates.lastName = document.getElementById("editLastName").value.trim();
      updates.isContact = document.getElementById("editIsContact").checked;
      const selectedCompany = document.getElementById("editCompanyId").value;
      updates.companyId = selectedCompany === "NO" ? null : selectedCompany;
    } else {
      updates.companyName = document.getElementById("editCompanyName").value.trim();
    }

    try {
      await updateDoc(ref, updates);
      alert(" Cliente aggiornato.");
      document.getElementById("clientEditSection").style.display = "none";
      document.getElementById("clientManageSection").style.display = "block";
      import("./clientManage.js").then(m => m.loadClients());
    } catch (err) {
      console.error("Errore aggiornamento:", err.message);
      alert(" Errore durante il salvataggio.");
    }
  };

  // Bottone "Annulla"
  document.getElementById("cancelEditBtn").addEventListener("click", () => {
    document.getElementById("clientEditSection").style.display = "none";
    document.getElementById("clientManageSection").style.display = "block";
    import("./clientManage.js").then(m => m.loadClients());
  });
}

// Bottone "Torna alla Dashboard"
document.getElementById("backToDashboardBtn").addEventListener("click", () => {
  document.getElementById("clientEditSection").style.display = "none";
  localStorage.removeItem("currentView");
  import("../app.js").then(m => m.showDashboard());
});
