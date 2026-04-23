//  Import servizi e moduli necessari
import { db, auth } from "../services/authService.js";
import { collection, addDoc, getDocs, getDoc, doc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { showDashboard } from "../app.js";
import { openModal, closeModal } from "../utils/modal.js";
import { resolveOperatorDisplayName } from "../services/operatorIdentity.js";
import { getAppointmentLocations } from "../services/runtimeConfigService.js";

// DOM elements: step-by-step fields
const formSection = document.getElementById("appointmentFormSection");
const form = document.getElementById("appointmentForm");
const msgBox = document.getElementById("appointmentFormMsg");
const cancelBtn = document.getElementById("cancelAppointmentBtn");
const saveBtn = document.getElementById("saveAppointmentBtn");

// Step DOM references (ID univoci!)
const stepLocation = document.getElementById("stepLocationAppointment");
const stepOperator = document.getElementById("stepOperatorAppointment");
const stepCustomerType = document.getElementById("stepCustomerTypeAppointment");
const stepCustomer = document.getElementById("stepCustomerAppointment");
const stepContactPerson = document.getElementById("stepContactPersonAppointment");
const stepVehicle = document.getElementById("stepVehicleAppointment");
const stepVehicleCard = document.getElementById("stepVehicleCardAppointment");
const stepJobType = document.getElementById("stepJobTypeAppointment");
const stepDates = document.getElementById("stepDatesAppointment");
const stepInternalNote = document.getElementById("stepInternalNoteAppointment");
const stepActions = document.getElementById("stepActionsAppointment");
const backToDashboardBtn = document.getElementById("backToDashboardAppointmentBtn");
const backToListBtn = document.getElementById("backToListAppointmentBtn");

if (backToDashboardBtn) {
  backToDashboardBtn.addEventListener("click", () => {
    resetAppointmentForm();
    formSection.style.display = "none";
    showDashboard();
  });
}

if (backToListBtn) {
  backToListBtn.addEventListener("click", () => {
    resetAppointmentForm();
    formSection.style.display = "none";
    document.getElementById("appointmentManageSection").style.display = "block";
    import("./appointmentManage.js").then(m => m.loadAppointments());
  });
}

// Stato temporaneo del form
let state = {
  location: "",
  operatorId: "",
  operatorData: null,
  customerType: "",
  customerId: "",
  customerData: null,
  contactPersonId: "",
  contactPersonData: null,
  vehicleId: "",
  vehicleData: null,
  jobTypeId: "",
  jobTypeData: null,
  price: 0,
  dates: {
    startReception: "",
    endReception: "",
    startWork: "",
    endWork: "",
    startDelivery: "",
    endDelivery: "",
  },
  noteInternal: "",
};

function toPositiveInt(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n < 0) return fallback;
  return n;
}

//  Reset completo del form (wizard appointment)
export function resetAppointmentForm() {
  msgBox.textContent = "";
  form.reset();
  state = {
    location: "",
    operatorId: "",
    operatorData: null,
    customerType: "",
    customerId: "",
    customerData: null,
    contactPersonId: "",
    contactPersonData: null,
    vehicleId: "",
    vehicleData: null,
    jobTypeId: "",
    jobTypeData: null,
    price: 0,
    dates: {
      startReception: "",
      endReception: "",
      startWork: "",
      endWork: "",
      startDelivery: "",
      endDelivery: "",
    },
    noteInternal: "",
  };
  hideAllSteps();
  void renderStepLocation();
}

// Nasconde tutti gli step
function hideAllSteps() {
  stepLocation.innerHTML = "";
  stepOperator.innerHTML = "";
  stepCustomerType.innerHTML = "";
  stepCustomer.innerHTML = "";
  stepContactPerson.innerHTML = "";
  stepVehicle.innerHTML = "";
  stepVehicleCard.innerHTML = "";
  stepJobType.innerHTML = "";
  stepDates.innerHTML = "";
  stepInternalNote.innerHTML = "";
  stepActions.style.display = "none";
}

// === STEP 1: SEDE ===
function buildLocationOptionsMarkup(locations) {
  return locations.map((location) => `<option value="${location}">${location}</option>`).join("");
}

async function renderStepLocation() {
  const locations = await getAppointmentLocations({ db });
  stepLocation.innerHTML = `
    <label>Sede:</label>
    <select id="locationSelectAppointment" required>
      <option value="">-- Seleziona sede --</option>
      ${buildLocationOptionsMarkup(locations)}
    </select>
  `;
  stepLocation.style.display = "block";
  const locationSelect = document.getElementById("locationSelectAppointment");
  locationSelect.addEventListener("change", () => {
    state.location = locationSelect.value;
    if (state.location) renderStepOperator();
    else {
      hideAfter(stepLocation);
    }
  });
}

// === STEP 2: OPERATORE ===
async function renderStepOperator() {
  stepOperator.innerHTML = `<label>Operatore:</label>`;
  const select = document.createElement("select");
  select.id = "operatorSelectAppointment";
  select.required = true;
  select.innerHTML = `<option value="">-- Seleziona operatore --</option>`;

  // Carica operatori consentiti
  const q = query(collection(db, "allowedUsers"));
  const snap = await getDocs(q);
  snap.forEach(docSnap => {
    const d = docSnap.data() || {};
    const opt = document.createElement("option");
    opt.value = docSnap.id;
    const displayName = resolveOperatorDisplayName({
      allowedDisplayName: d.displayName || "",
      authDisplayName: "",
      email: d.email || docSnap.id,
      operatorId: docSnap.id,
    }) || docSnap.id;
    opt.textContent = displayName;
    select.appendChild(opt);
  });

  // Se staff, seleziona e blocca il proprio utente
  const currentUser = auth.currentUser?.email;
  const userRole = localStorage.getItem("userRole");
  if (userRole === "staff" && currentUser) {
    select.value = currentUser;
    select.disabled = true;
    state.operatorId = currentUser;
    state.operatorData = snap.docs.find(d => d.id === currentUser)?.data() || {};
    state.operatorData.displayName = resolveOperatorDisplayName({
      allowedDisplayName: state.operatorData.displayName || "",
      authDisplayName: auth.currentUser?.displayName || "",
      email: state.operatorData.email || state.operatorId || "",
      operatorId: state.operatorId,
    });
    renderStepCustomerType();
    stepOperator.appendChild(select);
    return;
  }

  select.addEventListener("change", () => {
    state.operatorId = select.value;
    state.operatorData = snap.docs.find(d => d.id === select.value)?.data() || {};
    state.operatorData.displayName = resolveOperatorDisplayName({
      allowedDisplayName: state.operatorData.displayName || "",
      authDisplayName: auth.currentUser?.displayName || "",
      email: state.operatorData.email || state.operatorId || "",
      operatorId: state.operatorId,
    });
    if (state.operatorId) renderStepCustomerType();
    else hideAfter(stepOperator);
  });
  stepOperator.appendChild(select);
}

// === STEP 3: TIPO CLIENTE ===
function renderStepCustomerType() {
  stepCustomerType.innerHTML = `
    <label>Tipo cliente:</label>
    <select id="customerTypeSelectAppointment" required>
      <option value="">-- Seleziona --</option>
      <option value="person">Privato</option>
      <option value="company">Azienda</option>
    </select>
  `;
  stepCustomerType.style.display = "block";
  const select = document.getElementById("customerTypeSelectAppointment");
  select.addEventListener("change", () => {
    state.customerType = select.value;
    if (state.customerType) renderStepCustomer();
    else hideAfter(stepCustomerType);
  });
}

// === STEP 4: CLIENTE ===
async function renderStepCustomer() {
  stepCustomer.innerHTML = `
    <label>Cliente:</label>
    <select id="customerSelectAppointment" required></select>
    <span id="addCustomerSuccessMsg" style="color:green; margin-left:10px;"></span>
  `;
  stepCustomer.style.display = "block";
  const customerSelect = document.getElementById("customerSelectAppointment");
  const addCustomerSuccessMsg = document.getElementById("addCustomerSuccessMsg");

  // Carica clienti attivi del tipo selezionato
  async function populateCustomers(selectIdToSelect = null) {
    customerSelect.innerHTML = `<option value="">-- Seleziona cliente --</option><option value="__ADD__"> Aggiungi cliente</option>`;
    const q = query(
      collection(db, "clients"),
      where("type", "==", state.customerType),
      where("active", "==", true)
    );
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      const d = docSnap.data();
      const label = d.type === "company"
        ? d.companyName
        : `${d.firstName || ""} ${d.lastName || ""}`.trim();
      const opt = document.createElement("option");
      opt.value = docSnap.id;
      opt.textContent = label || docSnap.id;
      customerSelect.appendChild(opt);
    });

    // Se richiesto, seleziona nuovo cliente appena inserito
    if (selectIdToSelect) {
      customerSelect.value = selectIdToSelect;
      const docSnap = snap.docs.find(d => d.id === selectIdToSelect);
      state.customerId = selectIdToSelect;
      state.customerData = docSnap?.data() || null;
      addCustomerSuccessMsg.textContent = "Cliente salvato con successo";
      setTimeout(() => { addCustomerSuccessMsg.textContent = ""; }, 3500);
      if (state.customerType === "company") renderStepContactPerson();
      else renderStepVehicle();
    }
  }
  await populateCustomers();

  customerSelect.addEventListener("change", () => {
    if (customerSelect.value === "__ADD__") {
      customerSelect.value = "";
      openQuickClientModal(populateCustomers);
      return;
    }
    state.customerId = customerSelect.value;
    state.customerData = null;
    if (state.customerId) {
      getDoc(doc(db, "clients", state.customerId)).then(snap => {
        state.customerData = snap.data() || null;
        if (state.customerType === "company") renderStepContactPerson();
        else renderStepVehicle();
      });
    } else {
      hideAfter(stepCustomer);
    }
  });
}

// === MODALE CLIENTE RAPIDO (WIZARD) ===
function openQuickClientModal(onSuccessCallback) {
    const container = document.createElement("div");
    container.innerHTML = `<div id="quickClientFormWrapper"></div>`;
    openModal({
      title: " Aggiungi Cliente",
      content: container,
      onClose: () => {},
      noModalCancelBtn: true
    });
  
    import('./clientForm.js').then(module => {
      const clientFormSection = document.getElementById("clientFormSection");
      if (!clientFormSection) {
        container.innerHTML = "<b>Errore: modulo clienti non trovato</b>";
        return;
      }
      const originalForm = clientFormSection.querySelector("form");
      if (!originalForm) {
        container.innerHTML = "<b>Errore: form clienti non trovato</b>";
        return;
      }
      const formClone = originalForm.cloneNode(true);
      
      // Rimuovi bottoni navigazione
      const backToListBtn = formClone.querySelector("#backToListClientBtn");
      if (backToListBtn) backToListBtn.remove();
      const backToDashboardBtn = formClone.querySelector("#backToDashboardClientBtn");
      if (backToDashboardBtn) backToDashboardBtn.remove();
      const navRow = formClone.querySelector("div[style*='margin-bottom:15px']");
      if (navRow && navRow.children.length === 0) navRow.remove();

      formClone.id = "quickClientForm";
      formClone.reset();
      
      // Setup pulsanti
      const submitBtn = formClone.querySelector("#submitBtn");
      if (submitBtn) submitBtn.textContent = "Salva";
      const cancelBtn = formClone.querySelector("#cancelClientBtn");
      if (cancelBtn) cancelBtn.textContent = "Annulla";
      const msgBox = formClone.querySelector("#clientFormMsg");
      if (msgBox) msgBox.textContent = "";

      // === WIZARD: Riferimenti step ===
      const stepClientType = formClone.querySelector("#stepClientType");
      const stepNameFields = formClone.querySelector("#stepNameFields");
      const stepCompanyFields = formClone.querySelector("#stepCompanyFields");
      const stepCompanyLink = formClone.querySelector("#stepCompanyLink");
      const stepEmail = formClone.querySelector("#stepEmail");
      const stepPhone = formClone.querySelector("#stepPhone");
      const stepAddress = formClone.querySelector("#stepAddress");
      const stepExtras = formClone.querySelector("#stepExtras");
      const stepClientActions = formClone.querySelector("#stepClientActions");
      
      // Campi
      const clientTypeSelect = formClone.querySelector("#clientType");
      const firstNameField = formClone.querySelector("#firstName");
      const lastNameField = formClone.querySelector("#lastName");
      const companyNameField = formClone.querySelector("#companyName");
      const emailField = formClone.querySelector("#email");
      const prefixSelect = formClone.querySelector("#phonePrefix");
      const phoneNumberField = formClone.querySelector("#phoneNumber");
      const streetField = formClone.querySelector("#street");
      const streetNumberField = formClone.querySelector("#streetNumber");
      const capField = formClone.querySelector("#cap");
      const cityField = formClone.querySelector("#city");

      // === STANDARD: Capitalize nome/cognome/ragione sociale ===
      function autoCapitalize(input) {
        const pos = input.selectionStart;
        input.value = input.value
          .toLowerCase()
          .replace(/(?:^|\s|-)\S/g, c => c.toUpperCase());
        input.setSelectionRange(pos, pos);
      }
      if (firstNameField) firstNameField.addEventListener("input", () => autoCapitalize(firstNameField));
      if (lastNameField) lastNameField.addEventListener("input", () => autoCapitalize(lastNameField));
      if (companyNameField) companyNameField.addEventListener("input", () => autoCapitalize(companyNameField));

      // === WIZARD: Nascondi tutti gli step inizialmente ===
      function hideAllSteps() {
        if (stepNameFields) stepNameFields.style.display = "none";
        if (stepCompanyFields) stepCompanyFields.style.display = "none";
        if (stepCompanyLink) stepCompanyLink.style.display = "none";
        if (stepEmail) stepEmail.style.display = "none";
        if (stepPhone) stepPhone.style.display = "none";
        if (stepAddress) stepAddress.style.display = "none";
        if (stepExtras) stepExtras.style.display = "none";
        if (stepClientActions) stepClientActions.style.display = "none";
      }
      hideAllSteps();
      
      // Forza tipo cliente e disabilita
      if (clientTypeSelect) {
        clientTypeSelect.value = state.customerType;
        clientTypeSelect.disabled = true;
        // Mostra step appropriato
        if (state.customerType === "person") {
          stepNameFields.style.display = "block";
        } else if (state.customerType === "company") {
          stepCompanyFields.style.display = "block";
        }
      }

      // === WIZARD: Validazione email ===
      function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      }

      // === WIZARD: Step Nome/Cognome (Privato) ===
      function checkNameFields() {
        const firstName = firstNameField?.value.trim() || "";
        const lastName = lastNameField?.value.trim() || "";
        if (firstName.length >= 2 && lastName.length >= 2) {
          stepCompanyLink.style.display = "block";
          stepEmail.style.display = "block";
        } else {
          stepCompanyLink.style.display = "none";
          stepEmail.style.display = "none";
          stepPhone.style.display = "none";
          stepAddress.style.display = "none";
          stepExtras.style.display = "none";
          stepClientActions.style.display = "none";
        }
      }
      if (firstNameField) firstNameField.addEventListener("input", checkNameFields);
      if (lastNameField) lastNameField.addEventListener("input", checkNameFields);

      // === WIZARD: Step Ragione Sociale (Azienda) ===
      function checkCompanyName() {
        const companyName = companyNameField?.value.trim() || "";
        if (companyName.length >= 2) {
          stepEmail.style.display = "block";
        } else {
          stepEmail.style.display = "none";
          stepPhone.style.display = "none";
          stepAddress.style.display = "none";
          stepExtras.style.display = "none";
          stepClientActions.style.display = "none";
        }
      }
      if (companyNameField) companyNameField.addEventListener("input", checkCompanyName);

      // === WIZARD: Step Email ===
      function checkEmail() {
        const email = emailField?.value.trim() || "";
        if (isValidEmail(email)) {
          stepPhone.style.display = "block";
          setTimeout(() => prefixSelect?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
        } else {
          stepPhone.style.display = "none";
          stepAddress.style.display = "none";
          stepExtras.style.display = "none";
          stepClientActions.style.display = "none";
        }
      }
      if (emailField) emailField.addEventListener("input", checkEmail);

      // === WIZARD: Step Telefono ===
      if (phoneNumberField) {
        phoneNumberField.addEventListener("input", (e) => {
          e.target.value = e.target.value.replace(/[^0-9]/g, "");
          checkPhone();
        });
      }
      function checkPhone() {
        const prefix = prefixSelect?.value || "";
        const number = phoneNumberField?.value.trim() || "";
        if (prefix && number.length >= 6) {
          stepAddress.style.display = "block";
          setTimeout(() => streetField?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
        } else {
          stepAddress.style.display = "none";
          stepExtras.style.display = "none";
          stepClientActions.style.display = "none";
        }
      }
      if (prefixSelect) prefixSelect.addEventListener("change", checkPhone);
      
      // Filtro CAP numerico + scroll a Citt
      if (capField) {
        capField.addEventListener("input", (e) => {
          e.target.value = e.target.value.replace(/[^0-9]/g, "");
          if (e.target.value.length >= 4) {
            setTimeout(() => cityField?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
          }
          checkAddress();
        });
      }

      // === WIZARD: Step Indirizzo ===
      function checkAddress() {
        const street = streetField?.value.trim() || "";
        const number = streetNumberField?.value.trim() || "";
        const cap = capField?.value.trim() || "";
        const city = cityField?.value.trim() || "";
        if (street.length >= 2 && number.length >= 1 && cap.length >= 4 && city.length >= 2) {
          stepExtras.style.display = "block";
          stepClientActions.style.display = "block";
          setTimeout(() => stepClientActions?.scrollIntoView({ behavior: "smooth", block: "end" }), 100);
        } else {
          stepExtras.style.display = "none";
          stepClientActions.style.display = "none";
        }
      }
      if (streetField) streetField.addEventListener("input", checkAddress);
      if (streetNumberField) streetNumberField.addEventListener("input", checkAddress);
      if (cityField) cityField.addEventListener("input", () => {
        autoCapitalize(cityField);
        checkAddress();
      });

      // === STANDARD: Uppercase Codice Fiscale ===
      const fiscalCodeField = formClone.querySelector("#fiscalCode");
      if (fiscalCodeField) {
        fiscalCodeField.addEventListener("input", () => {
          fiscalCodeField.value = fiscalCodeField.value.toUpperCase();
        });
      }
  
      formClone.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (msgBox) msgBox.textContent = "";
        formClone.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));
      
        let spinner = document.createElement("div");
        spinner.textContent = "Salvataggio in corso...";
        spinner.style.textAlign = "center";
        spinner.style.margin = "14px 0";
        msgBox.parentNode.insertBefore(spinner, msgBox.nextSibling);
      
        if (submitBtn) submitBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;
      
        try {
          const saveStart = Date.now();
          const result = await module.handleClientFormSubmit(formClone, true);
          const elapsed = Date.now() - saveStart;
          const delay = Math.max(1000 - elapsed, 0);
          setTimeout(() => {
            spinner.remove();
            if (submitBtn) submitBtn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
            if (result && result.newClientId) {
              closeModal();
              onSuccessCallback(result.newClientId);
            } else if (result && result.error) {
              if (msgBox) msgBox.textContent = result.error;
              // Evidenzia campo con errore
              if (result.field) {
                const errorField = formClone.querySelector(result.field);
                if (errorField) {
                  errorField.classList.add("field-error");
                  errorField.scrollIntoView({ behavior: "smooth", block: "center" });
                  errorField.focus();
                }
              }
            }
          }, delay);
        } catch (err) {
          spinner.remove();
          if (submitBtn) submitBtn.disabled = false;
          if (cancelBtn) cancelBtn.disabled = false;
          if (msgBox) msgBox.textContent = "Errore: " + (err.message || "sconosciuto");
        }
      });
      
      if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
          e.preventDefault();
          closeModal();
        });
      }
      container.querySelector("#quickClientFormWrapper").appendChild(formClone);
    });
  }
  
  // Funzione retry per attendere che Firestore propaghi il nuovo cliente
  function waitForCustomerInList(newClientId, onSuccessCallback, attempt = 0) {
    const MAX_ATTEMPTS = 20; // ~6 secondi totali
    const DELAY = 300;
  
    const customerSelect = document.getElementById("customerSelectAppointment");
    const addCustomerSuccessMsg = document.getElementById("addCustomerSuccessMsg");
  
    const checkAndSelect = async () => {
      await onSuccessCallback(newClientId);
      // Dopo la populate, controlla se la select ha ora quell'ID tra le opzioni
      const found = !!(customerSelect && customerSelect.querySelector(`option[value="${newClientId}"]`));
      if (found) {
        customerSelect.value = newClientId;
        customerSelect.dispatchEvent(new Event("change"));
        if (addCustomerSuccessMsg) addCustomerSuccessMsg.textContent = "Cliente salvato con successo";
        // Il messaggio resta fisso!
        return;
      }
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(() => waitForCustomerInList(newClientId, onSuccessCallback, attempt + 1), DELAY);
      } else {
        // Dopo X tentativi, selezione forzata (soft error)
        customerSelect.value = "";
        if (addCustomerSuccessMsg) addCustomerSuccessMsg.textContent = "Cliente creato, ma non ancora visibile. Riprova tra qualche secondo.";
      }
    };
    checkAndSelect();
  }
  

// === STEP 5: CONTATTO AZIENDALE ===
async function renderStepContactPerson() {
    stepContactPerson.innerHTML = `
      <label>Contatto aziendale:</label>
      <select id="contactPersonSelectAppointment" required></select>
      <span id="addContactSuccessMsg" style="color:green; margin-left:10px;"></span>
    `;
    stepContactPerson.style.display = "block";
    const contactSelect = document.getElementById("contactPersonSelectAppointment");
    const addContactSuccessMsg = document.getElementById("addContactSuccessMsg");
  
    // Carica contatti aziendali collegati all'azienda scelta
    async function populateContacts(selectIdToSelect = null) {
      contactSelect.innerHTML = `<option value="">-- Seleziona contatto --</option><option value="__ADD__"> Aggiungi contatto</option>`;
      const q = query(
        collection(db, "clients"),
        where("isContact", "==", true),
        where("companyId", "==", state.customerId),
        where("active", "==", true)
      );
      const snap = await getDocs(q);
      snap.forEach(docSnap => {
        const d = docSnap.data();
        const opt = document.createElement("option");
        opt.value = docSnap.id;
        opt.textContent = `${d.firstName || ""} ${d.lastName || ""}`.trim();
        contactSelect.appendChild(opt);
      });
      // Se richiesto, seleziona il nuovo contatto
      if (selectIdToSelect) {
        contactSelect.value = selectIdToSelect;
        const docSnap = snap.docs.find(d => d.id === selectIdToSelect);
        state.contactPersonId = selectIdToSelect;
        state.contactPersonData = docSnap?.data() || null;
        addContactSuccessMsg.textContent = "Contatto salvato con successo";
        setTimeout(() => { addContactSuccessMsg.textContent = ""; }, 3500);
        renderStepVehicle();
      }
    }
    await populateContacts();
  
    contactSelect.addEventListener("change", () => {
      if (contactSelect.value === "__ADD__") {
        contactSelect.value = "";
        openQuickContactModal(populateContacts, state.customerId);
        return;
      }
      state.contactPersonId = contactSelect.value;
      state.contactPersonData = null;
      if (state.contactPersonId) {
        getDoc(doc(db, "clients", state.contactPersonId)).then(snap => {
          state.contactPersonData = snap.data() || null;
          renderStepVehicle();
        });
      } else {
        hideAfter(stepContactPerson);
      }
    });
  }
  
  // === MODALE CONTATTO AZIENDALE (WIZARD) ===
  function openQuickContactModal(onSuccessCallback, companyId) {
    const container = document.createElement("div");
    container.innerHTML = `<div id="quickContactFormWrapper"></div>`;
    openModal({
      title: " Aggiungi Contatto aziendale",
      content: container,
      onClose: () => {},
      noModalCancelBtn: true
    });
  
    import('./clientForm.js').then(module => {
      const clientFormSection = document.getElementById("clientFormSection");
      if (!clientFormSection) {
        container.innerHTML = "<b>Errore: modulo clienti non trovato</b>";
        return;
      }
      const originalForm = clientFormSection.querySelector("form");
      if (!originalForm) {
        container.innerHTML = "<b>Errore: form clienti non trovato</b>";
        return;
      }
      const formClone = originalForm.cloneNode(true);
      formClone.id = "quickContactForm";
      formClone.reset();

      // Rimuovi bottoni navigazione
      const backToListBtn = formClone.querySelector("#backToListClientBtn");
      if (backToListBtn) backToListBtn.remove();
      const backToDashboardBtn = formClone.querySelector("#backToDashboardClientBtn");
      if (backToDashboardBtn) backToDashboardBtn.remove();
      const navRow = formClone.querySelector("div[style*='margin-bottom:15px']");
      if (navRow && navRow.children.length === 0) navRow.remove();

      // === WIZARD: Riferimenti step ===
      const stepClientType = formClone.querySelector("#stepClientType");
      const stepNameFields = formClone.querySelector("#stepNameFields");
      const stepCompanyFields = formClone.querySelector("#stepCompanyFields");
      const stepCompanyLink = formClone.querySelector("#stepCompanyLink");
      const stepEmail = formClone.querySelector("#stepEmail");
      const stepPhone = formClone.querySelector("#stepPhone");
      const stepAddress = formClone.querySelector("#stepAddress");
      const stepExtras = formClone.querySelector("#stepExtras");
      const stepClientActions = formClone.querySelector("#stepClientActions");
      
      // Campi
      const firstNameField = formClone.querySelector("#firstName");
      const lastNameField = formClone.querySelector("#lastName");
      const emailField = formClone.querySelector("#email");
      const prefixSelect = formClone.querySelector("#phonePrefix");
      const phoneNumberField = formClone.querySelector("#phoneNumber");
      const streetField = formClone.querySelector("#street");
      const streetNumberField = formClone.querySelector("#streetNumber");
      const capField = formClone.querySelector("#cap");
      const cityField = formClone.querySelector("#city");

      // === STANDARD: Capitalize nome/cognome ===
      function autoCapitalize(input) {
        const pos = input.selectionStart;
        input.value = input.value
          .toLowerCase()
          .replace(/(?:^|\s|-)\S/g, c => c.toUpperCase());
        input.setSelectionRange(pos, pos);
      }
      if (firstNameField) firstNameField.addEventListener("input", () => autoCapitalize(firstNameField));
      if (lastNameField) lastNameField.addEventListener("input", () => autoCapitalize(lastNameField));

      // === WIZARD: Nascondi tutti gli step inizialmente ===
      function hideAllSteps() {
        if (stepNameFields) stepNameFields.style.display = "none";
        if (stepCompanyFields) stepCompanyFields.style.display = "none";
        if (stepCompanyLink) stepCompanyLink.style.display = "none";
        if (stepEmail) stepEmail.style.display = "none";
        if (stepPhone) stepPhone.style.display = "none";
        if (stepAddress) stepAddress.style.display = "none";
        if (stepExtras) stepExtras.style.display = "none";
        if (stepClientActions) stepClientActions.style.display = "none";
      }
      hideAllSteps();
  
      // Forza tipo persona e azienda
      const typeField = formClone.querySelector("#clientType");
      if (typeField) {
        typeField.value = "person";
        typeField.disabled = true;
      }
      stepNameFields.style.display = "block";
      if (stepCompanyFields) stepCompanyFields.style.display = "none";
      
      const linkedCompanySelect = formClone.querySelector("#linkedCompanyId");
      if (linkedCompanySelect) {
        linkedCompanySelect.value = companyId;
        linkedCompanySelect.disabled = true;
      }
  
      const submitBtn = formClone.querySelector("#submitBtn");
      if (submitBtn) submitBtn.textContent = "Salva";
      const cancelBtn = formClone.querySelector("#cancelClientBtn");
      if (cancelBtn) cancelBtn.textContent = "Annulla";
      const msgBox = formClone.querySelector("#clientFormMsg");
      if (msgBox) msgBox.textContent = "";

      // === WIZARD: Validazione email ===
      function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      }

      // === WIZARD: Step Nome/Cognome ===
      function checkNameFields() {
        const firstName = firstNameField?.value.trim() || "";
        const lastName = lastNameField?.value.trim() || "";
        if (firstName.length >= 2 && lastName.length >= 2) {
          stepCompanyLink.style.display = "block";
          stepEmail.style.display = "block";
        } else {
          stepCompanyLink.style.display = "none";
          stepEmail.style.display = "none";
          stepPhone.style.display = "none";
          stepAddress.style.display = "none";
          stepExtras.style.display = "none";
          stepClientActions.style.display = "none";
        }
      }
      if (firstNameField) firstNameField.addEventListener("input", checkNameFields);
      if (lastNameField) lastNameField.addEventListener("input", checkNameFields);

      // === WIZARD: Step Email ===
      function checkEmail() {
        const email = emailField?.value.trim() || "";
        if (isValidEmail(email)) {
          stepPhone.style.display = "block";
          setTimeout(() => prefixSelect?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
        } else {
          stepPhone.style.display = "none";
          stepAddress.style.display = "none";
          stepExtras.style.display = "none";
          stepClientActions.style.display = "none";
        }
      }
      if (emailField) emailField.addEventListener("input", checkEmail);

      // === WIZARD: Step Telefono ===
      if (phoneNumberField) {
        phoneNumberField.addEventListener("input", (e) => {
          e.target.value = e.target.value.replace(/[^0-9]/g, "");
          checkPhone();
        });
      }
      function checkPhone() {
        const prefix = prefixSelect?.value || "";
        const number = phoneNumberField?.value.trim() || "";
        if (prefix && number.length >= 6) {
          stepAddress.style.display = "block";
          setTimeout(() => streetField?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
        } else {
          stepAddress.style.display = "none";
          stepExtras.style.display = "none";
          stepClientActions.style.display = "none";
        }
      }
      if (prefixSelect) prefixSelect.addEventListener("change", checkPhone);
      
      // Filtro CAP numerico + scroll a Citt
      if (capField) {
        capField.addEventListener("input", (e) => {
          e.target.value = e.target.value.replace(/[^0-9]/g, "");
          if (e.target.value.length >= 4) {
            setTimeout(() => cityField?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
          }
          checkAddress();
        });
      }

      // === WIZARD: Step Indirizzo ===
      function checkAddress() {
        const street = streetField?.value.trim() || "";
        const number = streetNumberField?.value.trim() || "";
        const cap = capField?.value.trim() || "";
        const city = cityField?.value.trim() || "";
        if (street.length >= 2 && number.length >= 1 && cap.length >= 4 && city.length >= 2) {
          stepExtras.style.display = "block";
          stepClientActions.style.display = "block";
          setTimeout(() => stepClientActions?.scrollIntoView({ behavior: "smooth", block: "end" }), 100);
        } else {
          stepExtras.style.display = "none";
          stepClientActions.style.display = "none";
        }
      }
      if (streetField) streetField.addEventListener("input", checkAddress);
      if (streetNumberField) streetNumberField.addEventListener("input", checkAddress);
      if (cityField) cityField.addEventListener("input", () => {
        autoCapitalize(cityField);
        checkAddress();
      });

      // === STANDARD: Uppercase Codice Fiscale ===
      const fiscalCodeField = formClone.querySelector("#fiscalCode");
      if (fiscalCodeField) {
        fiscalCodeField.addEventListener("input", () => {
          fiscalCodeField.value = fiscalCodeField.value.toUpperCase();
        });
      }
  
      formClone.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (msgBox) msgBox.textContent = "";
        formClone.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));
  
        let spinner = document.createElement("div");
        spinner.textContent = "Salvataggio in corso...";
        spinner.style.textAlign = "center";
        spinner.style.margin = "14px 0";
        msgBox.parentNode.insertBefore(spinner, msgBox.nextSibling);
  
        if (submitBtn) submitBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;
  
        try {
          const saveStart = Date.now();
          const result = await module.handleClientFormSubmit(formClone, true, {
            forceType: "person",
            forceIsContact: true,
            forceCompanyId: companyId
          });
          const elapsed = Date.now() - saveStart;
          const delay = Math.max(1000 - elapsed, 0);
          setTimeout(() => {
            spinner.remove();
            if (submitBtn) submitBtn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
            if (result && result.newClientId) {
              closeModal();
              onSuccessCallback(result.newClientId);
            } else if (result && result.error) {
              if (msgBox) msgBox.textContent = result.error;
              // Evidenzia campo con errore
              if (result.field) {
                const errorField = formClone.querySelector(result.field);
                if (errorField) {
                  errorField.classList.add("field-error");
                  errorField.scrollIntoView({ behavior: "smooth", block: "center" });
                  errorField.focus();
                }
              }
            }
          }, delay);
        } catch (err) {
          spinner.remove();
          if (submitBtn) submitBtn.disabled = false;
          if (cancelBtn) cancelBtn.disabled = false;
          if (msgBox) msgBox.textContent = "Errore: " + (err.message || "sconosciuto");
        }
      });
  
      if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
          e.preventDefault();
          closeModal();
        });
      }
      container.querySelector("#quickContactFormWrapper").appendChild(formClone);
    });
  }
  


// === STEP 6: VEICOLO ===
async function renderStepVehicle() {
    stepVehicle.innerHTML = `
      <label>Veicolo:</label>
      <select id="vehicleSelectAppointment" required></select>
      <span id="addVehicleSuccessMsg" style="color:green; margin-left:10px;"></span>
    `;
    stepVehicle.style.display = "block";
    const vehicleSelect = document.getElementById("vehicleSelectAppointment");
    const addVehicleSuccessMsg = document.getElementById("addVehicleSuccessMsg");
  
    // Carica veicoli attivi del cliente selezionato
    async function populateVehicles(selectIdToSelect = null) {
      vehicleSelect.innerHTML = `<option value="">-- Seleziona veicolo --</option><option value="__ADD__"> Aggiungi veicolo</option>`;
      const q = query(
        collection(db, "cars"),
        where("customerId", "==", state.customerId)
      );
      const snap = await getDocs(q);
      snap.forEach(docSnap => {
        const d = docSnap.data();
        const opt = document.createElement("option");
        opt.value = docSnap.id;
        opt.textContent = `${d.brand || ""} ${d.model || ""} (${d.licensePlate || ""})`.trim();
        vehicleSelect.appendChild(opt);
      });
      // Se richiesto, seleziona nuovo veicolo appena inserito
      if (selectIdToSelect) {
        vehicleSelect.value = selectIdToSelect;
        const docSnap = snap.docs.find(d => d.id === selectIdToSelect);
        state.vehicleId = selectIdToSelect;
        state.vehicleData = docSnap?.data() || null;
        addVehicleSuccessMsg.textContent = "Veicolo salvato con successo";
        setTimeout(() => { addVehicleSuccessMsg.textContent = ""; }, 3500);
        renderStepVehicleCard();
      }
    }
    await populateVehicles();
  
    vehicleSelect.addEventListener("change", () => {
      if (vehicleSelect.value === "__ADD__") {
        vehicleSelect.value = "";
        openQuickVehicleModal(populateVehicles, state.customerId);
        return;
      }
      state.vehicleId = vehicleSelect.value;
      state.vehicleData = null;
      if (state.vehicleId) {
        getDoc(doc(db, "cars", state.vehicleId)).then(snap => {
          state.vehicleData = snap.data() || null;
          renderStepVehicleCard();
        });
      } else {
        hideAfter(stepVehicle);
      }
    });
  }
  
  // === MODALE VEICOLO RAPIDO (WIZARD) ===
  function openQuickVehicleModal(onSuccessCallback, customerId) {
    const container = document.createElement("div");
    container.innerHTML = `<div id="quickVehicleFormWrapper"></div>`;
    openModal({
      title: " Aggiungi Veicolo",
      content: container,
      onClose: () => {},
      noModalCancelBtn: true
    });
  
    import('./vehicleForm.js').then(module => {
      const vehicleFormSection = document.getElementById("vehicleFormSection");
      if (!vehicleFormSection) {
        container.innerHTML = "<b>Errore: modulo veicolo non trovato</b>";
        return;
      }
      const originalForm = vehicleFormSection.querySelector("form");
      if (!originalForm) {
        container.innerHTML = "<b>Errore: form veicolo non trovato</b>";
        return;
      }
      const formClone = originalForm.cloneNode(true);
      formClone.id = "quickVehicleForm";
      formClone.reset();
      
      // Rimuovi bottoni navigazione
      const backToListBtn = formClone.querySelector("#backToListVehicleBtn");
      if (backToListBtn) backToListBtn.remove();
      const backToDashboardBtn = formClone.querySelector("#backToDashboardVehicleBtn");
      if (backToDashboardBtn) backToDashboardBtn.remove();
      const btnRow = formClone.querySelector("div[style*='margin-bottom:15px']");
      if (btnRow && btnRow.children.length === 0) btnRow.remove();

      // Riferimenti step
      const stepCustomer = formClone.querySelector("#stepCustomer");
      const stepType = formClone.querySelector("#stepType");
      const stepMake = formClone.querySelector("#stepMake");
      const stepModel = formClone.querySelector("#stepModel");
      const stepYear = formClone.querySelector("#stepYear");
      const stepColor = formClone.querySelector("#stepColor");
      const stepChassis = formClone.querySelector("#stepChassis");
      const stepLicense = formClone.querySelector("#stepLicense");
      const stepNotes = formClone.querySelector("#stepNotes");
      const stepActions = formClone.querySelector("#stepActions");
      
      // Riferimenti campi
      const customerSelect = formClone.querySelector("#customerSelect");
      const vehicleTypeSelect = formClone.querySelector("#vehicleTypeSelect");
      const makeSelect = formClone.querySelector("#makeSelect");
      const modelSelect = formClone.querySelector("#modelSelect");
      const modelManual = formClone.querySelector("#modelManual");
      const yearSelect = formClone.querySelector("#yearSelect");
      const yearManual = formClone.querySelector("#yearManual");
      const colorSelect = formClone.querySelector("#colorSelect");
      const chassisNumber = formClone.querySelector("#chassisNumber");
      const licensePlate = formClone.querySelector("#licensePlate");
      
      // Nascondi tutti gli step tranne cliente
      function hideAllSteps() {
        if (stepType) stepType.style.display = "none";
        if (stepMake) stepMake.style.display = "none";
        if (stepModel) stepModel.style.display = "none";
        if (stepYear) stepYear.style.display = "none";
        if (stepColor) stepColor.style.display = "none";
        if (stepChassis) stepChassis.style.display = "none";
        if (stepLicense) stepLicense.style.display = "none";
        if (stepNotes) stepNotes.style.display = "none";
        if (stepActions) stepActions.style.display = "none";
      }
      hideAllSteps();
  
      // Forza cliente e mostra tipo veicolo
      if (customerSelect) {
        customerSelect.innerHTML = "";
        const opt = document.createElement("option");
        let label = "";
        if (state.customerData) {
          label = state.customerData.type === "company"
            ? state.customerData.companyName
            : `${state.customerData.firstName || ""} ${state.customerData.lastName || ""}`.trim();
        }
        opt.value = `${customerId}|${state.customerData?.type || ""}`;
        opt.textContent = label || customerId;
        customerSelect.appendChild(opt);
        customerSelect.value = `${customerId}|${state.customerData?.type || ""}`;
        customerSelect.disabled = true;
        // Mostra step tipo veicolo
        stepType.style.display = "block";
      }
  
      // Pulsanti
      const submitBtn = formClone.querySelector("#saveVehicleBtn");
      if (submitBtn) submitBtn.textContent = "Salva";
      const cancelBtn = formClone.querySelector("#cancelVehicleBtn");
      if (cancelBtn) cancelBtn.textContent = "Annulla";
      const msgBox = formClone.querySelector("#vehicleFormMsg");
      if (msgBox) msgBox.textContent = "";

      // === STANDARD: Formattazione telaio XXX XXX XXX ===
      function formatChassis(input) {
        const pos = input.selectionStart;
        const raw = input.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        const parts = raw.match(/.{1,3}/g) || [];
        input.value = parts.join(" ");
        const newPos = Math.min(pos + Math.floor(pos / 3), input.value.length);
        input.setSelectionRange(newPos, newPos);
      }
      if (chassisNumber) chassisNumber.addEventListener("input", () => formatChassis(chassisNumber));

      // === STANDARD: Targa uppercase ===
      if (licensePlate) licensePlate.addEventListener("input", () => {
        licensePlate.value = licensePlate.value.toUpperCase();
      });
      
      // === WIZARD: Tipo -> Marca ===
      if (vehicleTypeSelect) {
        vehicleTypeSelect.addEventListener("change", async () => {
          if (vehicleTypeSelect.value) {
            stepMake.style.display = "block";
            if (module.loadMakes) await module.loadMakes(makeSelect);
          } else {
            stepMake.style.display = "none";
            stepModel.style.display = "none";
            stepYear.style.display = "none";
            stepColor.style.display = "none";
            stepChassis.style.display = "none";
            stepLicense.style.display = "none";
            stepNotes.style.display = "none";
            stepActions.style.display = "none";
          }
        });
      }
      
      // === WIZARD: Marca -> Modello ===
      if (makeSelect) {
        makeSelect.addEventListener("change", async () => {
          if (makeSelect.value) {
            stepModel.style.display = "block";
            if (module.loadModels) await module.loadModels(makeSelect.value, modelSelect);
            modelSelect.value = "";
            if (modelManual) {
              modelManual.style.display = "none";
              modelManual.value = "";
              modelManual.required = false;
            }
            modelSelect.style.display = "block";
            modelSelect.required = true;
          } else {
            stepModel.style.display = "none";
            stepYear.style.display = "none";
            stepColor.style.display = "none";
            stepChassis.style.display = "none";
            stepLicense.style.display = "none";
            stepNotes.style.display = "none";
            stepActions.style.display = "none";
          }
        });
      }
      
      // === WIZARD: Modello -> Anno ===
      function checkModel() {
        const modelValue = modelSelect?.value;
        if (modelValue) {
          stepYear.style.display = "block";
          if (module.loadYears) module.loadYears(yearSelect);
        } else {
          stepYear.style.display = "none";
          stepColor.style.display = "none";
          stepChassis.style.display = "none";
          stepLicense.style.display = "none";
          stepNotes.style.display = "none";
          stepActions.style.display = "none";
        }
      }
      if (modelSelect) modelSelect.addEventListener("change", checkModel);
      
      // === WIZARD: Anno -> Colore ===
      function checkYear() {
        const yearValue = yearSelect?.style.display !== "none" ? yearSelect?.value : yearManual?.value;
        if (yearValue && yearValue !== "__OTHER__") {
          stepColor.style.display = "block";
        } else if (yearValue === "__OTHER__") {
          yearSelect.style.display = "none";
          yearSelect.required = false;
          yearManual.style.display = "block";
          yearManual.required = true;
          yearManual.focus();
        } else {
          stepColor.style.display = "none";
          stepChassis.style.display = "none";
          stepLicense.style.display = "none";
          stepNotes.style.display = "none";
          stepActions.style.display = "none";
        }
      }
      if (yearSelect) yearSelect.addEventListener("change", checkYear);
      if (yearManual) yearManual.addEventListener("input", () => {
        if (yearManual.value.trim().length >= 4) {
          stepColor.style.display = "block";
        }
      });
      
      // === WIZARD: Colore -> Telaio ===
      if (colorSelect) {
        colorSelect.addEventListener("change", () => {
          if (colorSelect.value) {
            stepChassis.style.display = "block";
          } else {
            stepChassis.style.display = "none";
            stepLicense.style.display = "none";
            stepNotes.style.display = "none";
            stepActions.style.display = "none";
          }
        });
      }
      
      // === WIZARD: Telaio -> Targa ===
      if (chassisNumber) {
        chassisNumber.addEventListener("input", () => {
          if (chassisNumber.value.trim().length >= 5) {
            stepLicense.style.display = "block";
            setTimeout(() => licensePlate?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
          } else {
            stepLicense.style.display = "none";
            stepNotes.style.display = "none";
            stepActions.style.display = "none";
          }
        });
      }
      
      // === WIZARD: Targa -> Note + Actions ===
      if (licensePlate) {
        licensePlate.addEventListener("input", () => {
          if (licensePlate.value.trim().length >= 4) {
            stepNotes.style.display = "block";
            stepActions.style.display = "flex";
            setTimeout(() => stepActions?.scrollIntoView({ behavior: "smooth", block: "end" }), 100);
          } else {
            stepNotes.style.display = "none";
            stepActions.style.display = "none";
          }
        });
      }
  
      // Submit modale
      formClone.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (msgBox) msgBox.textContent = "";
  
        let spinner = document.createElement("div");
        spinner.textContent = "Salvataggio in corso...";
        spinner.style.textAlign = "center";
        spinner.style.margin = "14px 0";
        msgBox.parentNode.insertBefore(spinner, msgBox.nextSibling);
  
        if (submitBtn) submitBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;
  
        try {
          formClone.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));
          const result = await module.handleVehicleFormSubmit(formClone, true, {
            forceCustomerId: customerId,
            forceCustomerType: state.customerData?.type
          });
          setTimeout(() => {
            spinner.remove();
            if (submitBtn) submitBtn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
            if (result && result.newVehicleId) {
              closeModal();
              onSuccessCallback(result.newVehicleId);
            } else if (result && result.error) {
              if (msgBox) msgBox.textContent = result.error;
              if (result.field) {
                const errorField = formClone.querySelector(result.field);
                if (errorField) {
                  errorField.classList.add("field-error");
                  errorField.scrollIntoView({ behavior: "smooth", block: "center" });
                  errorField.focus();
                }
              }
            }
          }, 800);
        } catch (err) {
          spinner.remove();
          if (submitBtn) submitBtn.disabled = false;
          if (cancelBtn) cancelBtn.disabled = false;
          if (msgBox) msgBox.textContent = "Errore: " + (err.message || "sconosciuto");
        }
      });
  
      if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
          e.preventDefault();
          closeModal();
        });
      }
      container.querySelector("#quickVehicleFormWrapper").appendChild(formClone);
    });
  }
  
    

// === STEP 7: CARD VEICOLO ===
function renderStepVehicleCard() {
  if (!state.vehicleData) {
    stepVehicleCard.innerHTML = "";
    hideAfter(stepVehicleCard);
    return;
  }
  const v = state.vehicleData;
  stepVehicleCard.innerHTML = `
    <div class="vehicle-card">
      <div class="vehicle-card-title">${v.brand || ""} ${v.model || ""} <span>(${v.licensePlate || ""})</span></div>
      <div class="vehicle-card-details">
        <span>Anno: ${v.year || ""}</span>
        <span>Colore: ${v.color || ""}</span>
        <span>Telaio: ${v.chassisNumber || ""}</span>
      </div>
    </div>
  `;
  renderStepJobType();
}

// === STEP 8: TIPO LAVORO ===
async function renderStepJobType() {
  stepJobType.innerHTML = `
    <label>Tipo lavoro:</label>
    <select id="jobTypeSelectAppointment" required></select>
    <input type="number" id="priceInputAppointment" min="0" placeholder="Prezzo ()" style="margin-left:10px; width:110px;" />
  `;
  stepJobType.style.display = "block";
  const jobTypeSelect = document.getElementById("jobTypeSelectAppointment");
  const priceInput = document.getElementById("priceInputAppointment");

  // Carica jobTypes da collezione
  jobTypeSelect.innerHTML = `<option value="">-- Seleziona --</option>`;
  const snap = await getDocs(collection(db, "jobTypes"));
  snap.forEach(docSnap => {
    const d = docSnap.data();
    const normalizedDefaultPrice = toPositiveInt(d.defaultPrice, 0);
    const opt = document.createElement("option");
    opt.value = docSnap.id;
    opt.textContent = `${d.description} (${normalizedDefaultPrice} )`;
    opt.setAttribute("data-price", String(normalizedDefaultPrice));
    jobTypeSelect.appendChild(opt);
  });

  jobTypeSelect.addEventListener("change", () => {
    state.jobTypeId = jobTypeSelect.value;
    const rawJobTypeData = snap.docs.find(d => d.id === state.jobTypeId)?.data() || null;
    state.jobTypeData = rawJobTypeData
      ? { ...rawJobTypeData, defaultPrice: toPositiveInt(rawJobTypeData.defaultPrice, 0) }
      : null;
    // Aggiorna prezzo suggerito
    if (state.jobTypeData) {
      priceInput.value = state.jobTypeData.defaultPrice;
      state.price = state.jobTypeData.defaultPrice;
    } else {
      priceInput.value = "";
      state.price = 0;
    }
    if (state.jobTypeId) renderStepDates();
    else hideAfter(stepJobType);
  });

  priceInput.addEventListener("input", () => {
    state.price = toPositiveInt(priceInput.value, 0);
  });

}

// === STEP 9: DATE/ORARI ===
function renderStepDates() {
  stepDates.innerHTML = `
    <div class="date-row">
      <label>Ricezione:</label>
      <input type="datetime-local" id="startReceptionAppointment" required />
      <span class="separator">-</span>
      <input type="datetime-local" id="endReceptionAppointment" required />
    </div>
    <div class="date-row">
      <label>Lavorazione:</label>
      <input type="datetime-local" id="startWorkAppointment" required />
      <span class="separator">-</span>
      <input type="datetime-local" id="endWorkAppointment" required />
    </div>
    <div class="date-row">
      <label>Consegna:</label>
      <input type="datetime-local" id="startDeliveryAppointment" required />
      <span class="separator">-</span>
      <input type="datetime-local" id="endDeliveryAppointment" required />
    </div>
  `;
  stepDates.style.display = "block";

  const sRec = document.getElementById("startReceptionAppointment");
  const eRec = document.getElementById("endReceptionAppointment");
  const sWork = document.getElementById("startWorkAppointment");
  const eWork = document.getElementById("endWorkAppointment");
  const sDel = document.getElementById("startDeliveryAppointment");
  const eDel = document.getElementById("endDeliveryAppointment");


  function setEndTime(startInput, endInput, offsetMinutes) {
    startInput.addEventListener("change", () => {
      if (startInput.value) {
        const [date, time] = startInput.value.split("T");
        const [year, month, day] = date.split("-").map(Number);
        const [hour, minute] = time.split(":").map(Number);
        const startDate = new Date(year, month - 1, day, hour, minute, 0, 0);
        startDate.setMinutes(startDate.getMinutes() + offsetMinutes);
        const pad = n => String(n).padStart(2, "0");
        const localValue = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}T${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
        endInput.value = localValue;
        validateDates();
      }
    });
    endInput.addEventListener("change", validateDates);
  }

  setEndTime(sRec, eRec, 30);
  setEndTime(sWork, eWork, 120);
  setEndTime(sDel, eDel, 30);

  function validateDates() {
    state.dates = {
      startReception: sRec.value,
      endReception: eRec.value,
      startWork: sWork.value,
      endWork: eWork.value,
      startDelivery: sDel.value,
      endDelivery: eDel.value,
    };
    if (
      sRec.value && eRec.value && sWork.value && eWork.value &&
      sDel.value && eDel.value
    ) {
      renderStepInternalNote();
    } else {
      hideAfter(stepDates);
    }
  }

  [sRec, eRec, sWork, eWork, sDel, eDel].forEach(inp => inp.addEventListener("change", validateDates));
}

// === STEP 10: NOTE INTERNE ===
function renderStepInternalNote() {
  stepInternalNote.innerHTML = `
    <label>Note interne:</label>
    <textarea id="noteInternalAppointment" rows="2" placeholder="Note riservate (opzionale)"></textarea>
  `;
  stepInternalNote.style.display = "block";
  document.getElementById("noteInternalAppointment").addEventListener("input", (e) => {
    state.noteInternal = e.target.value.trim();
    stepActions.style.display = "flex";
  });
  stepActions.style.display = "flex";
}

// Nasconde tutti gli step dopo un nodo dato
function hideAfter(stepNode) {
  let found = false;
  [
    stepLocation, stepOperator, stepCustomerType, stepCustomer, stepContactPerson,
    stepVehicle, stepVehicleCard, stepJobType, stepDates, stepInternalNote
  ].forEach(node => {
    if (found) {
      node.innerHTML = "";
      node.style.display = "none";
    }
    if (node === stepNode) found = true;
  });
  stepActions.style.display = "none";
}

// === HANDLER: ANNULLA ===
cancelBtn.addEventListener("click", () => {
  resetAppointmentForm();
  formSection.style.display = "none";
  showDashboard();
});

// === HANDLER: SUBMIT ===
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgBox.textContent = "";

  if (
    !state.location || !state.operatorId || !state.customerType ||
    !state.customerId || (state.customerType === "company" && !state.contactPersonId) ||
    !state.vehicleId || !state.jobTypeId ||
    !state.dates.startReception || !state.dates.endReception ||
    !state.dates.startWork || !state.dates.endWork ||
    !state.dates.startDelivery || !state.dates.endDelivery
  ) {
    msgBox.textContent = " Compila tutti i campi obbligatori.";
    return;
  }

  if (!state.operatorData || typeof state.operatorData !== "object") {
    state.operatorData = {};
  }
  if (!state.operatorData.operatorId) {
    state.operatorData.operatorId = state.operatorId || "";
  }
  if (!state.operatorData.displayName) {
    state.operatorData.displayName = resolveOperatorDisplayName({
      allowedDisplayName: state.operatorData.displayName || "",
      authDisplayName: auth.currentUser?.displayName || "",
      email: state.operatorData.email || state.operatorId || "",
      operatorId: state.operatorId,
    });
  }

  const normalizedJobTypeData = state.jobTypeData
    ? { ...state.jobTypeData, defaultPrice: toPositiveInt(state.jobTypeData.defaultPrice, 0) }
    : null;

  const data = {
    customerId: state.customerId,
    customerData: state.customerData,
    customerType: state.customerType,
    contactPersonId: state.contactPersonId || null,
    contactPersonData: state.contactPersonData || null,
    vehicleId: state.vehicleId,
    vehicleData: state.vehicleData,
    location: state.location,
    operatorId: state.operatorId,
    operatorData: state.operatorData,
    jobTypeId: state.jobTypeId,
    jobTypeData: normalizedJobTypeData,
    price: toPositiveInt(state.price, 0),
    noteInternal: state.noteInternal,
    status: "programmato",
    startReception: state.dates.startReception,
    endReception: state.dates.endReception,
    startWork: state.dates.startWork,
    endWork: state.dates.endWork,
    startDelivery: state.dates.startDelivery,
    endDelivery: state.dates.endDelivery,
    createdBy: auth.currentUser?.email || "unknown",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    history: [],
    deleted: false
  };

  try {
    await addDoc(collection(db, "appointments"), data);
    msgBox.textContent = " Appuntamento creato con successo!";
    setTimeout(() => {
      resetAppointmentForm();
      formSection.style.display = "none";
      import("./appointmentManage.js").then(m => m.loadAppointments());
      document.getElementById("appointmentManageSection").style.display = "block";
    }, 1000);
  } catch (err) {
    console.error("Errore salvataggio appuntamento:", err.message);
    msgBox.textContent = " Errore durante il salvataggio. Riprova.";
  }
});
