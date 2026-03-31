// âœ… src/app.js
import {
  getAuth
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { hideSteps } from "./forms/vehicleForm.js";
import { initGlobalErrorHandling } from "./errorHandler.js";
import { initSessionManager } from "./sessionManager.js";
import { initRouter } from "./router.js";


// DOM
const loginContainer = document.getElementById("loginContainer");
const dashboardContainer = document.getElementById("dashboardContainer");
const clientFormSection = document.getElementById("clientFormSection");
const clientEditSection = document.getElementById("clientEditSection");
const clientManageSection = document.getElementById("clientManageSection");
const vehicleFormSection = document.getElementById("vehicleFormSection");
const vehicleManageSection = document.getElementById("vehicleManageSection");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const welcomeMsg = document.getElementById("welcomeMsg");
const roleButtons = document.getElementById("roleButtons");
const alertBanner = document.getElementById("alertBanner");
const appointmentManageSection = document.getElementById("appointmentManageSection");
const appointmentFormSection = document.getElementById("appointmentFormSection");
const catalogSyncSection = document.getElementById("catalogSyncSection");

const auth = getAuth();
const db = getFirestore();
window.__FIREBASE_PROJECT_ID__ = db.app?.options?.projectId || "";
const sectionByView = [
  { key: "catalogSyncAdmin", el: catalogSyncSection },
  { key: "gestioneAppuntamenti", el: appointmentManageSection },
  { key: "nuovoAppuntamento", el: appointmentFormSection },
  { key: "gestioneVeicoli", el: vehicleManageSection },
  { key: "gestioneClienti", el: clientManageSection },
  { key: "formClienti", el: clientFormSection },
  { key: "modificaClienti", el: clientEditSection },
];
const router = initRouter({ sectionByView, hideAllSections });

// Nascondi tutto all'avvio
dashboardContainer.style.display = "none";
clientFormSection.style.display = "none";
clientEditSection.style.display = "none";
vehicleFormSection.style.display = "none";
alertBanner.style.display = "none";

function showLoginState() {
  hideAllSections();
  loginContainer.style.display = "block";
  dashboardContainer.style.display = "none";
  logoutBtn.style.display = "none";
}

const sessionController = initSessionManager({
  auth,
  db,
  loginBtn,
  logoutBtn,
  onAuthenticated: updateUI,
  onLoggedOut: showLoginState,
  onPostAuthCheck: checkInvalidContacts,
});

window.addEventListener("beforeunload", () => {
  sessionController.teardown();
});

// ðŸŽ› Funzione UI centrale
function updateUI(userInfo) {
  loginContainer.style.display = "none";
  logoutBtn.style.display = "inline-block";

  const restoredView = router.restoreCurrentView();
  if (restoredView) {
    applyCurrentViewEffects(restoredView);
    return;
  }

  showDashboard(userInfo);
}


// ðŸ”§ Utility per nascondere tutte le sezioni
function hideAllSections() {
  dashboardContainer.style.display = "none";
  clientFormSection.style.display = "none";
  clientEditSection.style.display = "none";
  clientManageSection.style.display = "none";
  vehicleFormSection.style.display = "none";
  vehicleManageSection.style.display = "none";
  appointmentManageSection.style.display = "none";
  appointmentFormSection.style.display = "none";
  catalogSyncSection.style.display = "none";
  roleButtons.style.display = "none";
}

// âž• Pulsanti dinamici
function addRoleButton(label, action) {
  const btn = document.createElement("button");
  btn.className = "btn btn--primary";
  btn.textContent = label;

  const id = "dash-" + label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  btn.dataset.testid = id;

  btn.addEventListener("click", action);
  roleButtons.appendChild(btn);
}

function applyCurrentViewEffects(viewKey) {
  if (viewKey === "gestioneVeicoli") {
    import("./forms/vehicleManage.js").then((m) => m.loadVehicles());
    return;
  }
  if (viewKey === "gestioneClienti") {
    import("./forms/clientManage.js").then((m) => m.loadClients());
    return;
  }
  if (viewKey === "gestioneAppuntamenti") {
    import("./forms/appointmentManage.js").then((m) => m.loadAppointments());
    return;
  }
  if (viewKey === "nuovoAppuntamento") {
    import("./forms/appointmentForm.js").then((m) => m.resetAppointmentForm());
    return;
  }
  if (viewKey === "catalogSyncAdmin") {
    import("./admin/catalogSyncUI.js").then((m) => m.initCatalogSyncUI());
    const backBtn = document.getElementById("backToDashboardCatalogSyncBtn");
    if (backBtn) {
      backBtn.onclick = () => {
        router.clearCurrentView();
        showDashboard();
      };
    }
  }
}

// ðŸ§¹ Controlla se ci sono contatti orfani
async function checkInvalidContacts() {
  const invalidContacts = [];

  try {
    const q = query(
      collection(db, "clients"),
      where("type", "==", "person"),
      where("isContact", "==", true),
      where("active", "==", true)
    );

    const snap = await getDocs(q);
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const companyId = data.companyId;
      if (companyId) {
        const companyRef = doc(db, "clients", companyId);
        const companySnap = await getDoc(companyRef);
        if (!companySnap.exists()) {
          invalidContacts.push({
            id: docSnap.id,
            name: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
            email: data.email || ""
          });
        }
      }
    }

    sessionStorage.setItem("invalidContacts", JSON.stringify(invalidContacts));
    alertBanner.style.display = invalidContacts.length > 0 ? "block" : "none";
  } catch (err) {
    console.error("Errore durante la verifica contatti orfani:", err.message);
  }
}

const jsErrorBanner = document.getElementById("jsErrorBanner");
initGlobalErrorHandling({ bannerEl: jsErrorBanner });

window.addEventListener("beforeunload", () => {
  router.persistCurrentViewFromUI();
});


export async function showDashboard(userInfo = null) {
  hideAllSections();
  // FORZA SEMPRE la visibilitÃ  e la pulizia DOM!
  dashboardContainer.style.display = "block";
  loginContainer.style.display = "none";
  logoutBtn.style.display = "inline-block";
  roleButtons.style.display = "flex";
  roleButtons.innerHTML = "";

  // Leggi ruolo e info utente dalla sessione o dal parametro passato
  let userRole, userName, userEmail;
  
  if (userInfo) {
    userRole = userInfo.role || "user";
    userName = userInfo.name || "";
    userEmail = userInfo.email || "";
  } else {
    // Fallback: leggi da localStorage
    userRole = localStorage.getItem("userRole");
    userName = localStorage.getItem("userName") || "";
    userEmail = localStorage.getItem("userEmail") || "";
    
    // Se localStorage vuoto/incompleto ma utente autenticato, recupera da Firebase
    const currentUser = auth.currentUser;
    if (currentUser) {
      // Recupera nome/email da auth se mancanti
      if (!userName) {
        userName = currentUser.displayName || "";
        localStorage.setItem("userName", userName);
      }
      if (!userEmail) {
        userEmail = currentUser.email || "";
        localStorage.setItem("userEmail", userEmail);
      }
      
      // Se ruolo mancante o "user", ri-verifica da Firestore
      if (!userRole || userRole === "user") {
        try {
          const userRef = doc(db, "allowedUsers", currentUser.email);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            userRole = userSnap.data().role || "user";
            localStorage.setItem("userRole", userRole);
          }
        } catch (err) {
          console.error("Errore recupero ruolo:", err.message);
          userRole = userRole || "user";
        }
      }
    }
    
    // Default finale se ancora vuoto
    userRole = userRole || "user";
  }

  welcomeMsg.textContent = `Benvenuto ${userName} (Ruolo: ${userRole})`;

  // Bottoni dinamici (sincroni, no setTimeout)
  if (userRole === "admin" || userRole === "staff") {
    addRoleButton("Gestione appuntamenti", () => {
      hideAllSections();
      appointmentManageSection.style.display = "block";
      const backToDash = document.getElementById("backToDashboardAppointmentsBtn");
      if (backToDash) {
        backToDash.onclick = () => {
          router.clearCurrentView();
          showDashboard();
        };
      }
      import("./forms/appointmentManage.js").then(m => m.loadAppointments());
      router.setCurrentView("gestioneAppuntamenti");
    });
    addRoleButton("Nuovo appuntamento", () => {
      hideAllSections();
      appointmentFormSection.style.display = "block";
      import("./forms/appointmentForm.js").then(m => m.resetAppointmentForm());
      router.setCurrentView("nuovoAppuntamento");
    });
    addRoleButton("Gestione Veicoli", () => {
      hideAllSections();
      vehicleManageSection.style.display = "block";
      import("./forms/vehicleManage.js").then(m => m.loadVehicles());
      router.setCurrentView("gestioneVeicoli");
    });
    if (userRole === "admin") {
      addRoleButton("Gestione Clienti", () => {
        hideAllSections();
        clientManageSection.style.display = "block";
        import("./forms/clientManage.js").then(m => m.loadClients());
        router.setCurrentView("gestioneClienti");
      });
      addRoleButton("Catalog Sync Admin", () => {
        hideAllSections();
        catalogSyncSection.style.display = "block";
        import("./admin/catalogSyncUI.js").then((m) => m.initCatalogSyncUI());
        router.setCurrentView("catalogSyncAdmin");
      });
    }
  }

  if (document.getElementById("vehicleForm")) document.getElementById("vehicleForm").reset();
  if (typeof hideSteps === "function") hideSteps();
}



