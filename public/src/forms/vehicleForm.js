import { db, auth } from "../services/authService.js";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { showDashboard } from "../app.js";
import {
  addInlineMake,
  addInlineModel,
  resolveInlineVehicleType,
} from "../services/catalogInlineService.js";

// DOM elements
const form = document.getElementById("vehicleForm");
const customerSelect = document.getElementById("customerSelect");
const vehicleTypeSelect = document.getElementById("vehicleTypeSelect");
const makeSelect = document.getElementById("makeSelect");
const modelSelect = document.getElementById("modelSelect");
const modelManual = document.getElementById("modelManual");
const yearSelect = document.getElementById("yearSelect");
const yearManual = document.getElementById("yearManual");
const colorSelect = document.getElementById("colorSelect");
const chassisInput = document.getElementById("chassisNumber");
const licenseInput = document.getElementById("licensePlate");
const notesInput = document.getElementById("vehicleNotes");
const msgBox = document.getElementById("vehicleFormMsg");

const stepType = document.getElementById("stepType");
const stepMake = document.getElementById("stepMake");
const stepModel = document.getElementById("stepModel");
const stepYear = document.getElementById("stepYear");
const stepColor = document.getElementById("stepColor");
const stepChassis = document.getElementById("stepChassis");
const stepLicense = document.getElementById("stepLicense");
const stepNotes = document.getElementById("stepNotes");
const stepActions = document.getElementById("stepActions");

const cancelBtn = document.getElementById("cancelVehicleBtn");
const backBtn = document.getElementById("backToDashboardVehicleBtn");
const backToListBtn = document.getElementById("backToListVehicleBtn");

// Cache duration (24h)
const CACHE_DURATION = 24 * 60 * 60 * 1000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function roleForCatalogInline() {
  return localStorage.getItem("userRole") || "user";
}

function showInlineFeedback(target, message, kind = "error") {
  if (!target) return;
  target.className = "form-msg";
  if (kind === "success") target.classList.add("form-msg--success");
  if (kind === "error") target.classList.add("form-msg--error");
  target.textContent = message;
  target.style.display = message ? "block" : "none";
}

function clearInlineFeedback(root = document) {
  showInlineFeedback(root.querySelector("#inlineMakeFeedback"), "");
  showInlineFeedback(root.querySelector("#inlineModelFeedback"), "");
}

function isStatusOk(status) {
  return status === "OK";
}

function isStatusKnownError(status) {
  return status === "DUPLICATE" || status === "COLLISION" || status === "INVALID_INPUT" || status === "UNAUTHORIZED";
}

function bindInlineCatalogActions({
  root = document,
  makeSelectNode,
  modelSelectNode,
  vehicleTypeNode,
  onModelRefresh,
}) {
  const makeBtn = root.querySelector("#inlineAddMakeBtn");
  const modelBtn = root.querySelector("#inlineAddModelBtn");
  const makeFeedback = root.querySelector("#inlineMakeFeedback");
  const modelFeedback = root.querySelector("#inlineModelFeedback");

  if (!makeBtn || !modelBtn || !makeSelectNode || !modelSelectNode || !vehicleTypeNode) return;

  const syncModelBtn = () => {
    modelBtn.disabled = !makeSelectNode.value;
  };
  syncModelBtn();

  makeSelectNode.addEventListener("change", syncModelBtn);

  makeBtn.addEventListener("click", async () => {
    clearInlineFeedback(root);
    const inputName = window.prompt("Inserisci la nuova marca:");
    if (inputName === null) return;
    const role = roleForCatalogInline();
    makeBtn.disabled = true;
    modelBtn.disabled = true;
    try {
      const result = await addInlineMake({
        name: inputName,
        vehicleType: resolveInlineVehicleType(vehicleTypeNode.value),
        role,
      });
      makeBtn.disabled = false;
      syncModelBtn();

      if (isStatusOk(result.status)) {
        await loadMakes(makeSelectNode, { includeName: result.makeName });
        makeSelectNode.value = result.makeName;
        syncModelBtn();
        if (typeof onModelRefresh === "function") await onModelRefresh(result.makeName);
        showInlineFeedback(makeFeedback, result.message, "success");
        return;
      }

      const kind = isStatusKnownError(result.status) ? "error" : "error";
      showInlineFeedback(makeFeedback, result.message || "Errore aggiunta marca.", kind);
    } catch (error) {
      makeBtn.disabled = false;
      syncModelBtn();
      showInlineFeedback(makeFeedback, `Errore aggiunta marca: ${error?.message || String(error)}`);
    }
  });

  modelBtn.addEventListener("click", async () => {
    clearInlineFeedback(root);
    if (!makeSelectNode.value) {
      showInlineFeedback(modelFeedback, "Seleziona prima una marca.");
      return;
    }
    const inputModel = window.prompt("Inserisci il nuovo modello:");
    if (inputModel === null) return;
    const role = roleForCatalogInline();

    makeBtn.disabled = true;
    modelBtn.disabled = true;
    try {
      const result = await addInlineModel({
        makeName: makeSelectNode.value,
        modelName: inputModel,
        vehicleType: resolveInlineVehicleType(vehicleTypeNode.value),
        role,
      });
      makeBtn.disabled = false;
      modelBtn.disabled = false;

      if (isStatusOk(result.status)) {
        await loadModels(makeSelectNode.value, modelSelectNode, { includeName: result.modelName });
        modelSelectNode.value = result.modelName;
        showInlineFeedback(modelFeedback, result.message, "success");
        return;
      }
      showInlineFeedback(modelFeedback, result.message || "Errore aggiunta modello.");
    } catch (error) {
      makeBtn.disabled = false;
      modelBtn.disabled = false;
      showInlineFeedback(modelFeedback, `Errore aggiunta modello: ${error?.message || String(error)}`);
    }
  });
}

function parseYear(value) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(n)) return null;
  if (n < MIN_YEAR || n > MAX_YEAR) return null;
  return n;
}

function formatVIN(vin) {
  const clean = vin.replace(/\s+/g, '').toUpperCase();
  return clean.match(/.{1,3}/g)?.join(' ') || clean;
}

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

// Load customers
async function loadCustomers() {
  customerSelect.innerHTML = `<option value="">-- Seleziona cliente --</option>`;
  const q = query(collection(db, "clients"), where("active", "==", true));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    const d = doc.data();
    const label = d.type === "company"
      ? d.companyName
      : `${d.firstName} ${d.lastName}`;
    const opt = document.createElement("option");
    opt.value = `${doc.id}|${d.type}`;
    opt.textContent = label;
    customerSelect.appendChild(opt);
  });
}

function isPermissionError(err) {
  const message = String(err?.message || "").toLowerCase();
  return message.includes("missing or insufficient permissions");
}

async function loadCustomersSafe() {
  try {
    await loadCustomers();
  } catch (err) {
    if (isPermissionError(err)) {
      return;
    }
    throw err;
  }
}

// Export per reload da vehicleManage
export { loadCustomersSafe as reloadCustomers };

loadYears(yearSelect);

// UX Progressiva
customerSelect.addEventListener("change", () => {
  if (customerSelect.value) stepType.style.display = "block";
  else {
    hideSteps();
  }
});

vehicleTypeSelect.addEventListener("change", () => {
  if (vehicleTypeSelect.value) {
    stepMake.style.display = "block";
    loadMakes(makeSelect);
  } else {
    stepMake.style.display = "none";
    stepModel.style.display = "none";
  }
});

makeSelect.addEventListener("change", () => {
  if (makeSelect.value) {
    stepModel.style.display = "block";
    loadModels(makeSelect.value, modelSelect);
  } else {
    stepModel.style.display = "none";
  }
});

modelSelect.addEventListener("change", () => {
  if (modelSelect.value) {
    stepYear.style.display = "block";
  } else {
    stepYear.style.display = "none";
  }
});

yearSelect.addEventListener("change", () => {
  if (yearSelect.value === "__OTHER__") {
    yearSelect.style.display = "none";
    yearManual.style.display = "block";
    yearManual.required = true;
    yearSelect.required = false;
    yearManual.focus();
  } else if (yearSelect.value) {
    stepColor.style.display = "block";
  } else {
    stepColor.style.display = "none";
  }
});

yearManual.addEventListener("input", () => {
  if (yearManual.value.trim().length >= 4) stepColor.style.display = "block";
  else stepColor.style.display = "none";
});

colorSelect.addEventListener("change", () => {
  if (colorSelect.value) stepChassis.style.display = "block";
  else stepChassis.style.display = "none";
});

chassisInput.addEventListener("input", () => {
  formatVINOnInput(chassisInput);
  if (chassisInput.value.replace(/\s/g, '').length >= 6) stepLicense.style.display = "block";
  else stepLicense.style.display = "none";
});

licenseInput.addEventListener("input", () => {
  // Auto uppercase
  licenseInput.value = licenseInput.value.toUpperCase();
  
  if (licenseInput.value.trim().length >= 4) {
    stepNotes.style.display = "block";
    stepActions.style.display = "flex";
  } else {
    stepNotes.style.display = "none";
    stepActions.style.display = "none";
  }
});

// Helper: evidenzia campo con errore
function highlightError(field, message) {
  // Rimuovi errori precedenti
  form.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));
  
  if (field) {
    field.classList.add("field-error");
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.focus();
  }
  msgBox.textContent = message;
}

// Submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgBox.textContent = "";
  form.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));

  // Validazione con evidenziazione
  if (!customerSelect.value) {
    highlightError(customerSelect, " Seleziona un cliente.");
    return;
  }
  if (!vehicleTypeSelect.value) {
    highlightError(vehicleTypeSelect, " Seleziona un tipo veicolo.");
    return;
  }
  if (!makeSelect.value) {
    highlightError(makeSelect, " Seleziona una marca.");
    return;
  }
  
  const modelValue = modelSelect.value;
  if (!modelValue) {
    highlightError(modelSelect, " Seleziona un modello dal catalogo.");
    return;
  }
  
  const yearValue = yearManual.style.display !== "none" ? yearManual.value : yearSelect.value;
  if (!yearValue) {
    const field = yearManual.style.display !== "none" ? yearManual : yearSelect;
    highlightError(field, " Seleziona o inserisci un anno.");
    return;
  }
  
  if (!colorSelect.value) {
    highlightError(colorSelect, " Seleziona un colore.");
    return;
  }

  const chassisNumber = chassisInput.value.trim();
  if (chassisNumber.length < 15) {
    highlightError(chassisInput, " Numero telaio non valido (minimo 15 caratteri).");
    return;
  }
  
  const licensePlate = licenseInput.value.trim().toUpperCase();
  if (licensePlate.length < 4) {
    highlightError(licenseInput, " Targa non valida (minimo 4 caratteri).");
    return;
  }

  const formattedVIN = formatVIN(chassisNumber);

  // Check unique chassis
  const q = query(collection(db, "cars"), where("chassisNumber", "==", chassisNumber));
  const snap = await getDocs(q);
  if (!snap.empty) {
    msgBox.textContent = " Questo numero telaio  gi registrato.";
    return;
  }

  const [customerId, customerType] = customerSelect.value.split("|");

  const parsedYear = parseYear(yearManual.style.display !== "none" ? yearManual.value : yearSelect.value);

  const data = {
    customerId,
    customerType,
    vehicleType: vehicleTypeSelect.value,
    brand: makeSelect.value,
    model: modelSelect.value,
    year: parsedYear,
    color: colorSelect.value,
    chassisNumber: formattedVIN,
    licensePlate,
    notes: notesInput.value.trim() || null,
    createdBy: auth.currentUser?.email || "unknown",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (!parsedYear) {
    const field = yearManual.style.display !== "none" ? yearManual : yearSelect;
    highlightError(field, " Anno non valido.");
    return;
  }

  try {
    await addDoc(collection(db, "cars"), data);
    msgBox.textContent = " Veicolo salvato con successo.";
    form.reset();
    hideSteps();
  } catch (err) {
    console.error("Errore salvataggio:", err.message);
    msgBox.textContent = " Errore durante il salvataggio.";
  }
});

// Nascondi tutti gli step
export function hideSteps() {
  stepType.style.display = "none";
  stepMake.style.display = "none";
  stepModel.style.display = "none";
  stepYear.style.display = "none";
  stepColor.style.display = "none";
  stepChassis.style.display = "none";
  stepLicense.style.display = "none";
  stepNotes.style.display = "none";
  stepActions.style.display = "none";
  
  // Reset campi manuali
  if (modelManual) {
    modelManual.style.display = "none";
    modelManual.value = "";
    modelManual.required = false;
  }
  if (yearManual) {
    yearManual.style.display = "none";
    yearManual.value = "";
    yearManual.required = false;
  }
  // Ripristina select
  if (modelSelect) {
    modelSelect.style.display = "block";
    modelSelect.required = true;
  }
  if (yearSelect) {
    yearSelect.style.display = "block";
    yearSelect.required = true;
  }
}

// Reset completo form veicolo
export function resetVehicleForm() {
  form.reset();
  hideSteps();
  msgBox.textContent = "";
  form.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));
  // Reset select modelli
  if (modelSelect) modelSelect.innerHTML = '<option value="">-- Seleziona modello --</option>';
}

// Annulla e torna dashboard

backToListBtn.addEventListener("click", () => {
    resetVehicleForm();
    document.getElementById("vehicleFormSection").style.display = "none";
    document.getElementById("vehicleManageSection").style.display = "block";
    import("./vehicleManage.js").then(m => m.loadVehicles());
  });
  
cancelBtn.addEventListener("click", () => {
    resetVehicleForm();
    document.getElementById("vehicleFormSection").style.display = "none";
    document.getElementById("vehicleManageSection").style.display = "block";
    import("./vehicleManage.js").then(m => m.loadVehicles());
  });

backBtn.addEventListener("click", () => {
    resetVehicleForm();
    showDashboard();
  });

// --- Popola la select delle marche (brand) da Firestore ---
export async function loadMakes(targetSelect) {
  const options = arguments[1] || {};
  if (!targetSelect) return;
  const MSG_ID = "makeSelectErrorMsg";

  // Rimuovi messaggio errore vecchio se presente
  let oldMsg = targetSelect.parentNode.querySelector(`#${MSG_ID}`);
  if (oldMsg) oldMsg.remove();

  targetSelect.innerHTML = '<option value="">-- Seleziona marca --</option>';

  try {
    // Legge solo marche active da Firestore
    const q = query(collection(db, "vehicleMakes"), where("active", "==", true));
    const snap = await getDocs(q);
    
    const makes = [];
    snap.forEach(doc => {
      const name = doc.data().name;
      if (name) makes.push(name);
    });
    
    // Ordina alfabeticamente
    makes.sort((a, b) => a.localeCompare(b));

    const includeName = normalizeOptionalName(options.includeName);
    if (includeName && !makes.some((m) => m.toLowerCase() === includeName.toLowerCase())) {
      makes.push(includeName);
    }
    if (makes.length === 0) {
      const msg = document.createElement("div");
      msg.id = MSG_ID;
      msg.style.color = "red";
      msg.style.fontSize = "0.97em";
      msg.textContent = " Nessuna marca attiva. Contatta l'amministratore.";
      targetSelect.parentNode.appendChild(msg);
      return;
    }

    // Popola la select
    makes.forEach(make => {
      const opt = document.createElement("option");
      opt.value = make;
      opt.textContent = make;
      targetSelect.appendChild(opt);
    });

  } catch (err) {
    console.error("Errore caricamento marche:", err.message);
    const msg = document.createElement("div");
    msg.id = MSG_ID;
    msg.style.color = "red";
    msg.style.fontSize = "0.97em";
    msg.textContent = " Errore caricamento marche. Riprova pi tardi.";
    targetSelect.parentNode.appendChild(msg);
  }
}

// --- Popola la select dei modelli da Firestore ---
export async function loadModels(make, targetSelect) {
  const options = arguments[2] || {};
  if (!make || !targetSelect) return;
  const MSG_ID = "modelSelectErrorMsg";
  
  // Rimuovi messaggio errore precedente
  let oldMsg = targetSelect.parentNode.querySelector(`#${MSG_ID}`);
  if (oldMsg) oldMsg.remove();

  // Reset: mostra select, nascondi input manuale
  targetSelect.style.display = "block";
  targetSelect.required = true;
  if (modelManual) {
    modelManual.style.display = "none";
    modelManual.required = false;
    modelManual.value = "";
  }

  targetSelect.innerHTML = '<option value="">-- Seleziona modello --</option>';

  try {
    // Legge modelli da Firestore filtrati per marca
    const q = query(collection(db, "vehicleModels"), where("make", "==", make));
    const snap = await getDocs(q);
    
    const models = [];
    snap.forEach(doc => {
      const name = doc.data().name;
      if (name) models.push(name);
    });
    
    // Ordina alfabeticamente
    models.sort((a, b) => a.localeCompare(b));

    const includeName = normalizeOptionalName(options.includeName);
    if (includeName && !models.some((m) => m.toLowerCase() === includeName.toLowerCase())) {
      models.push(includeName);
    }
    if (models.length === 0) {
      const msg = document.createElement("div");
      msg.id = MSG_ID;
      msg.style.color = "red";
      msg.style.fontSize = "0.97em";
      msg.textContent = " Nessun modello disponibile per questa marca. Usa Catalog Admin.";
      targetSelect.parentNode.appendChild(msg);
      return;
    }

    // Popola la select
    models.forEach(model => {
      const opt = document.createElement("option");
      opt.value = model;
      opt.textContent = model;
      targetSelect.appendChild(opt);
    });

  } catch (err) {
    console.warn("Errore caricamento modelli:", err.message);
  }

  // Niente inserimento manuale da questo form: catalogo gestito da Catalog Admin.
}

function normalizeOptionalName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

// --- Popola la select degli anni ---
export function loadYears(targetSelect) {
  if (!targetSelect) return;
  
  // Reset: mostra select, nascondi input manuale
  targetSelect.style.display = "block";
  targetSelect.required = true;
  if (yearManual) {
    yearManual.style.display = "none";
    yearManual.required = false;
    yearManual.value = "";
  }
  
  targetSelect.innerHTML = '<option value="">-- Seleziona anno --</option>';
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= 1980; y--) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    targetSelect.appendChild(opt);
  }
  
  // Aggiungi opzione "Altro"
  const optOther = document.createElement("option");
  optOther.value = "__OTHER__";
  optOther.textContent = " Altro (inserisci manualmente)";
  targetSelect.appendChild(optOther);
}

/**
 * Salvataggio veicolo conforme a modello dati Firestore.
 * Tutti i campi sono inclusi e coerenti con il documento di esempio.
 * Gestisce anche quickMode (modale) con forzatura customerId/customerType.
 * @param {HTMLFormElement} formNode
 * @param {boolean} quickMode
 * @param {object} options - { forceCustomerId, forceCustomerType, forceCreatedBy }
 */
export async function handleVehicleFormSubmit(formNode, quickMode = false, options = {}) {
  const getVal = sel => {
    const el = formNode.querySelector(sel);
    return el ? el.value.trim() : "";
  };
  
  const isVisible = sel => {
    const el = formNode.querySelector(sel);
    return el && el.style.display !== "none";
  };

  // Determina model e year (select o manual)
  const modelValue = getVal("#modelSelect");
  const yearValue = isVisible("#yearManual") ? getVal("#yearManual") : getVal("#yearSelect");

  // Dati conformi al modello ufficiale Firestore
  const parsedYear = parseYear(yearValue);

  const data = {
    brand: getVal("#makeSelect"),
    model: modelValue,
    vehicleType: getVal("#vehicleTypeSelect"),
    year: parsedYear,
    color: getVal("#colorSelect"),
    chassisNumber: formatVIN(getVal("#chassisNumber")),
    licensePlate: getVal("#licensePlate"),
    notes: getVal("#vehicleNotes") || null,
    customerId: options.forceCustomerId || getVal("#customerSelect"),
    customerType: options.forceCustomerType || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: (auth.currentUser?.email || options.forceCreatedBy || window.userEmail || ""),
  };

  // Validazione precisa
  if (!data.brand) return { error: "Marca obbligatoria", field: "#makeSelect" };
  if (!data.model) return { error: "Modello obbligatorio (seleziona dal catalogo)", field: "#modelSelect" };
  if (!data.vehicleType) return { error: "Tipo veicolo obbligatorio", field: "#vehicleTypeSelect" };
  if (!data.year) return { error: "Anno obbligatorio o non valido", field: isVisible("#yearManual") ? "#yearManual" : "#yearSelect" };
  if (!data.color) return { error: "Colore obbligatorio", field: "#colorSelect" };
  if (!data.chassisNumber || data.chassisNumber.length < 15) return { error: "Numero telaio non valido (minimo 15 caratteri)", field: "#chassisNumber" };
  if (!data.licensePlate || data.licensePlate.length < 4) return { error: "Targa non valida (minimo 4 caratteri)", field: "#licensePlate" };
  if (!data.customerId) return { error: "Cliente obbligatorio", field: "#customerSelect" };
  if (!data.customerType) return { error: "Tipo cliente obbligatorio", field: "#customerSelect" };
  if (!data.createdBy) return { error: "Impossibile determinare l'utente creatore.", field: null };

  try {
    const docRef = await addDoc(collection(db, "cars"), data);
    return { newVehicleId: docRef.id };
  } catch (e) {
    return { error: e.message || "Errore durante il salvataggio" };
  }
}

export function initVehicleInlineCatalogControls() {
  bindInlineCatalogActions({
    root: document,
    makeSelectNode: makeSelect,
    modelSelectNode: modelSelect,
    vehicleTypeNode: vehicleTypeSelect,
    onModelRefresh: async (selectedMake) => {
      if (!selectedMake) return;
      await loadModels(selectedMake, modelSelect);
      stepModel.style.display = "block";
      stepYear.style.display = "none";
    },
  });
}

export function initScopedVehicleInlineCatalogControls({
  root,
  makeSelectNode,
  modelSelectNode,
  vehicleTypeNode,
  onModelRefresh,
}) {
  bindInlineCatalogActions({
    root,
    makeSelectNode,
    modelSelectNode,
    vehicleTypeNode,
    onModelRefresh,
  });
}

initVehicleInlineCatalogControls();
