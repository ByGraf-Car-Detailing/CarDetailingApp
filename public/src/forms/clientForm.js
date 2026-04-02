import { db, auth } from "../services/authService.js";
import {
  collection, addDoc, serverTimestamp, getDocs, getDoc, doc,
  query, where
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { showDashboard } from "../app.js";

// DOM - Form e messaggi
const form = document.getElementById("clientForm");
const msgBox = document.getElementById("clientFormMsg");
const submitBtn = document.getElementById("submitBtn");

// DOM - Campi
const typeField = document.getElementById("clientType");
const firstNameField = document.getElementById("firstName");
const lastNameField = document.getElementById("lastName");
const companyNameField = document.getElementById("companyName");
const linkedCompanySelect = document.getElementById("linkedCompanyId");
const emailField = document.getElementById("email");
const prefixSelect = document.getElementById("phonePrefix");
const phoneNumberField = document.getElementById("phoneNumber");
const streetField = document.getElementById("street");
const streetNumberField = document.getElementById("streetNumber");
const capField = document.getElementById("cap");
const cityField = document.getElementById("city");
const fiscalCodeField = document.getElementById("fiscalCode");
const noteField = document.getElementById("note");

// DOM - Step containers
const stepClientType = document.getElementById("stepClientType");
const stepNameFields = document.getElementById("stepNameFields");
const stepCompanyFields = document.getElementById("stepCompanyFields");
const stepCompanyLink = document.getElementById("stepCompanyLink");
const stepEmail = document.getElementById("stepEmail");
const stepPhone = document.getElementById("stepPhone");
const stepAddress = document.getElementById("stepAddress");
const stepExtras = document.getElementById("stepExtras");
const stepClientActions = document.getElementById("stepClientActions");

// DOM - Bottoni navigazione
const backToListBtn = document.getElementById("backToListClientBtn");
const backToDashboardBtn = document.getElementById("backToDashboardClientBtn");
const cancelBtn = document.getElementById("cancelClientBtn");

// Prefissi statici Europa
const defaultPrefixes = [
  { code: "+39", country: "Italia" },
  { code: "+41", country: "Svizzera" },
  { code: "+49", country: "Germania" },
  { code: "+33", country: "Francia" },
  { code: "+34", country: "Spagna" },
  { code: "+351", country: "Portogallo" },
  { code: "+43", country: "Austria" },
  { code: "+44", country: "Regno Unito" },
  { code: "+32", country: "Belgio" },
  { code: "+31", country: "Paesi Bassi" },
  { code: "+45", country: "Danimarca" },
  { code: "+46", country: "Svezia" },
  { code: "+47", country: "Norvegia" },
  { code: "+48", country: "Polonia" },
  { code: "+36", country: "Ungheria" },
  { code: "+40", country: "Romania" },
  { code: "+380", country: "Ucraina" },
  { code: "+420", country: "Repubblica Ceca" },
  { code: "+421", country: "Slovacchia" },
  { code: "+386", country: "Slovenia" },
  { code: "+385", country: "Croazia" },
  { code: "+387", country: "Bosnia-Erzegovina" },
  { code: "+382", country: "Montenegro" },
  { code: "+389", country: "Macedonia del Nord" },
  { code: "+381", country: "Serbia" },
  { code: "+355", country: "Albania" },
  { code: "+30", country: "Grecia" },
  { code: "+357", country: "Cipro" },
  { code: "+359", country: "Bulgaria" },
  { code: "+373", country: "Moldavia" },
  { code: "+370", country: "Lituania" },
  { code: "+371", country: "Lettonia" },
  { code: "+372", country: "Estonia" },
  { code: "+353", country: "Irlanda" },
  { code: "+354", country: "Islanda" },
  { code: "+352", country: "Lussemburgo" },
  { code: "+356", country: "Malta" },
  { code: "+358", country: "Finlandia" }
];

function insertPrefixOptions() {
  prefixSelect.innerHTML = '<option value="">+Prefisso</option>';
  defaultPrefixes.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.code;
    opt.textContent = `${p.code} (${p.country})`;
    prefixSelect.appendChild(opt);
  });
}
insertPrefixOptions();

// Capitalizza stringhe
function capitalize(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Carica aziende nel select
async function loadCompanies() {
  linkedCompanySelect.innerHTML = "";
  const optNone = document.createElement("option");
  optNone.value = "NO";
  optNone.textContent = "-- NO --";
  linkedCompanySelect.appendChild(optNone);

  const q = query(collection(db, "clients"), where("type", "==", "company"), where("active", "==", true));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = doc.data().companyName || "(Senza nome)";
    linkedCompanySelect.appendChild(opt);
  });
}

function isPermissionError(err) {
  const message = String(err?.message || "").toLowerCase();
  return message.includes("missing or insufficient permissions");
}

async function loadCompaniesSafe() {
  try {
    await loadCompanies();
  } catch (err) {
    if (isPermissionError(err)) {
      return;
    }
    throw err;
  }
}
let companiesLoaded = false;
async function ensureCompaniesLoaded() {
  if (companiesLoaded) return;
  await loadCompaniesSafe();
  companiesLoaded = true;
}

// === WIZARD: Nascondi tutti gli step ===
function hideAllSteps() {
  stepNameFields.style.display = "none";
  stepCompanyFields.style.display = "none";
  stepCompanyLink.style.display = "none";
  stepEmail.style.display = "none";
  stepPhone.style.display = "none";
  stepAddress.style.display = "none";
  stepExtras.style.display = "none";
  stepClientActions.style.display = "none";
}

// === WIZARD: Reset completo ===
export function resetClientForm() {
  form.reset();
  hideAllSteps();
  msgBox.textContent = ""; // Reset notifica
  form.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));
}

// Reset notifica quando si entra nella sezione
export function clearClientFormMsg() {
  if (msgBox) msgBox.textContent = "";
}

// === WIZARD: Step 1 - Tipo Cliente ===
typeField.addEventListener("change", () => {
  const type = typeField.value;
  hideAllSteps();
  
  if (type === "person") {
    stepNameFields.style.display = "block";
  } else if (type === "company") {
    stepCompanyFields.style.display = "block";
  }
});

// === WIZARD: Step 2a - Nome/Cognome (Privato) ===
function checkNameFields() {
  const firstName = firstNameField.value.trim();
  const lastName = lastNameField.value.trim();
  if (firstName.length >= 2 && lastName.length >= 2) {
    ensureCompaniesLoaded().catch(() => {});
    stepCompanyLink.style.display = "block";
    // Mostra subito Email (Ditta è opzionale, default NO)
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

// Auto-capitalize nome/cognome mentre si digita
function autoCapitalize(input) {
  const cursorPos = input.selectionStart;
  const val = input.value;
  const capitalizedVal = val.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  if (val !== capitalizedVal) {
    input.value = capitalizedVal;
    input.setSelectionRange(cursorPos, cursorPos);
  }
}

firstNameField.addEventListener("input", () => {
  autoCapitalize(firstNameField);
  checkNameFields();
});
lastNameField.addEventListener("input", () => {
  autoCapitalize(lastNameField);
  checkNameFields();
});

// === WIZARD: Step 2b - Ragione Sociale (Azienda) ===
function checkCompanyName() {
  const companyName = companyNameField.value.trim();
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
companyNameField.addEventListener("input", () => {
  autoCapitalize(companyNameField);
  checkCompanyName();
});

// === STANDARD: Uppercase Codice Fiscale ===
fiscalCodeField.addEventListener("input", () => {
  fiscalCodeField.value = fiscalCodeField.value.toUpperCase();
});

// === WIZARD: Step 4 - Email ===
// Formato richiesto: xxx@xxx.xxx
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function checkEmail() {
  const email = emailField.value.trim();
  if (isValidEmail(email)) {
    stepPhone.style.display = "block";
    setTimeout(() => prefixSelect.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  } else {
    stepPhone.style.display = "none";
    stepAddress.style.display = "none";
    stepExtras.style.display = "none";
    stepClientActions.style.display = "none";
  }
}
emailField.addEventListener("input", checkEmail);

// === WIZARD: Step 5 - Telefono ===
// Filtro: solo numeri
phoneNumberField.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^0-9]/g, "");
  checkPhone();
});

// === CAP: Filtro solo numeri + scroll a Città + checkAddress ===
capField.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^0-9]/g, "");
  // Scroll a Città quando CAP è valido
  if (e.target.value.length >= 4) {
    setTimeout(() => cityField.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  }
  checkAddress();
});

function checkPhone() {
  const prefix = prefixSelect.value;
  const number = phoneNumberField.value.trim();
  if (prefix && number.length >= 6) {
    stepAddress.style.display = "block";
    setTimeout(() => streetField.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  } else {
    stepAddress.style.display = "none";
    stepExtras.style.display = "none";
    stepClientActions.style.display = "none";
  }
}
prefixSelect.addEventListener("change", checkPhone);

// === WIZARD: Step 6 - Indirizzo ===
function checkAddress() {
  const street = streetField.value.trim();
  const number = streetNumberField.value.trim();
  const cap = capField.value.trim();
  const city = cityField.value.trim();
  if (street.length >= 2 && number.length >= 1 && cap.length >= 4 && city.length >= 2) {
    stepExtras.style.display = "block";
    stepClientActions.style.display = "block";
    setTimeout(() => stepClientActions.scrollIntoView({ behavior: "smooth", block: "end" }), 100);
  } else {
    stepExtras.style.display = "none";
    stepClientActions.style.display = "none";
  }
}
streetField.addEventListener("input", checkAddress);
streetNumberField.addEventListener("input", checkAddress);
// capField listener già definito sopra con filtro numerico
cityField.addEventListener("input", () => {
  autoCapitalize(cityField);
  checkAddress();
});

// === NAVIGAZIONE ===
backToListBtn.addEventListener("click", () => {
  resetClientForm();
  document.getElementById("clientFormSection").style.display = "none";
  document.getElementById("clientManageSection").style.display = "block";
  import("./clientManage.js").then(m => m.loadClients());
});

backToDashboardBtn.addEventListener("click", () => {
  resetClientForm();
  document.getElementById("clientFormSection").style.display = "none";
  showDashboard();
});

cancelBtn.addEventListener("click", () => {
  resetClientForm();
  document.getElementById("clientFormSection").style.display = "none";
  document.getElementById("clientManageSection").style.display = "block";
  import("./clientManage.js").then(m => m.loadClients());
});

// === Helper: evidenzia campo con errore ===
function highlightError(field, message) {
  form.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));
  if (field) {
    field.classList.add("field-error");
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.focus();
  }
  msgBox.textContent = message;
}

// ======= FUNZIONE RIUTILIZZABILE PER SUBMIT CLIENTE (classico + modale) =======
/**
 * Gestisce validazione e salvataggio cliente.
 * @param {HTMLFormElement} formNode - nodo form da cui estrarre i valori.
 * @param {boolean} quickMode - se true, NON resetta/chiude, ritorna {newClientId} oppure {error}
 * @param {object} options - { forceType, forceIsContact, forceCompanyId }
 * @returns {Promise<{newClientId?:string, error?:string}>}
 */
export async function handleClientFormSubmit(formNode, quickMode = false, options = {}) {
  try {
    // Recupera dati
    const type = options.forceType || formNode.querySelector("#clientType").value;
    const email = formNode.querySelector("#email").value.trim();
    const phonePrefix = formNode.querySelector("#phonePrefix").value;
    const phoneNumber = formNode.querySelector("#phoneNumber").value;
    const phone = phonePrefix + phoneNumber;
    const address = {
      street: capitalize(formNode.querySelector("#street").value.trim()),
      number: formNode.querySelector("#streetNumber").value.trim(),
      cap: formNode.querySelector("#cap").value.trim(),
      city: capitalize(formNode.querySelector("#city").value.trim())
    };

    // Determina isContact e companyId
    let isContact = options.forceIsContact || false;
    let companyId = options.forceCompanyId || null;
    if (type === "person" && !options.forceIsContact) {
      const linkedVal = formNode.querySelector("#linkedCompanyId")?.value;
      if (linkedVal && linkedVal !== "NO") {
        isContact = true;
        companyId = linkedVal;
      }
    }

    let data = {
      type,
      ...(type === "person" && {
        firstName: capitalize(formNode.querySelector("#firstName").value.trim()),
        lastName: capitalize(formNode.querySelector("#lastName").value.trim()),
        canActPrivately: true,
        companyId: companyId,
        isContact: isContact
      }),
      ...(type === "company" && {
        companyName: capitalize(formNode.querySelector("#companyName").value.trim())
      }),
      email,
      phone,
      address,
      fiscalCode: formNode.querySelector("#fiscalCode").value.trim() || null,
      note: formNode.querySelector("#note").value.trim() || null,
      active: true,
      createdBy: auth.currentUser?.email || "unknown",
      createdAt: serverTimestamp()
    };

    // Validazioni campi obbligatori
    if (!type) return { error: "❌ Seleziona il tipo cliente.", field: "#clientType" };
    if (type === "person" && !data.firstName) return { error: "❌ Inserisci il nome.", field: "#firstName" };
    if (type === "person" && !data.lastName) return { error: "❌ Inserisci il cognome.", field: "#lastName" };
    if (type === "company" && !data.companyName) return { error: "❌ Inserisci ragione sociale.", field: "#companyName" };
    if (!email) return { error: "❌ Inserisci email.", field: "#email" };
    if (!phonePrefix) return { error: "❌ Seleziona il prefisso telefonico.", field: "#phonePrefix" };
    if (!phoneNumber) return { error: "❌ Inserisci il numero di telefono.", field: "#phoneNumber" };
    if (!address.street) return { error: "❌ Inserisci la via.", field: "#street" };
    if (!address.number) return { error: "❌ Inserisci il numero civico.", field: "#streetNumber" };
    if (!address.cap) return { error: "❌ Inserisci il CAP.", field: "#cap" };
    if (!address.city) return { error: "❌ Inserisci la città.", field: "#city" };
    
    // P.IVA obbligatoria per Azienda
    if (type === "company" && !data.fiscalCode) return { error: "❌ Inserisci P.IVA / Codice Fiscale per l'azienda.", field: "#fiscalCode" };

    // Validazione asincrona azienda
    if (type === "person" && isContact && companyId) {
      const ref = doc(db, "clients", companyId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { error: "❌ Azienda selezionata non trovata.", field: "#linkedCompanyId" };
    }

    // Verifica duplicati
    const [emailClients, phoneClients] = await Promise.all([
      getDocs(query(collection(db, "clients"), where("email", "==", email))),
      getDocs(query(collection(db, "clients"), where("phone", "==", phone))),
    ]);
    if (!emailClients.empty) return { error: "❌ Email già esistente.", field: "#email" };
    if (!phoneClients.empty) return { error: "❌ Telefono già registrato.", field: "#phoneNumber" };

    // Duplicati per nome+telefono, nome+indirizzo
    if (type === "person") {
      const fname = (data.firstName || "").toLowerCase();
      const lname = (data.lastName || "").toLowerCase();
      const allClients = await getDocs(collection(db, "clients"));
      for (const docu of allClients.docs) {
        const c = docu.data();
        if (
          c.firstName?.toLowerCase() === fname &&
          c.lastName?.toLowerCase() === lname
        ) {
          if (c.phone === phone) {
            return { error: "❌ Esiste già un cliente con stesso nome e telefono.", field: "#phoneNumber" };
          }
          if (
            c.address?.street === address.street &&
            c.address?.number === address.number &&
            c.address?.cap === address.cap &&
            c.address?.city === address.city
          ) {
            return { error: "❌ Esiste già un cliente con stesso nome e indirizzo.", field: "#street" };
          }
        }
      }
    }

    // Salvataggio finale
    const docRef = await addDoc(collection(db, "clients"), data);
    if (quickMode) {
      return { newClientId: docRef.id };
    } else {
      msgBox.textContent = "✅ Cliente salvato con successo.";
      resetClientForm();
    }
  } catch (err) {
    return { error: "❌ Errore: " + (err.message || "sconosciuto") };
  }
}

// === Submit normale (usata nella sezione principale) ===
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgBox.textContent = "";
  form.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));
  
  const res = await handleClientFormSubmit(form, false);
  if (res && res.error) {
    msgBox.textContent = res.error;
    // Evidenzia campo con errore
    if (res.field) {
      const errorField = form.querySelector(res.field);
      if (errorField) {
        errorField.classList.add("field-error");
        errorField.scrollIntoView({ behavior: "smooth", block: "center" });
        errorField.focus();
      }
    }
    return;
  }
  msgBox.textContent = "✅ Cliente salvato con successo.";
  setTimeout(() => {
    document.getElementById("clientFormSection").style.display = "none";
    document.getElementById("clientManageSection").style.display = "block";
    import("./clientManage.js").then(m => m.loadClients());
  }, 600);
});
