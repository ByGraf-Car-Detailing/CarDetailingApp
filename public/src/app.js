// âœ… src/app.js
import { loginWithGoogle } from "./services/authService.js";
import {
  getAuth,
  signOut,
  onAuthStateChanged
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

const auth = getAuth();
const db = getFirestore();

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

function persistCurrentViewFromUI() {
  const sectionByView = [
    { key: "gestioneAppuntamenti", el: appointmentManageSection },
    { key: "nuovoAppuntamento", el: appointmentFormSection },
    { key: "gestioneVeicoli", el: vehicleManageSection },
    { key: "gestioneClienti", el: clientManageSection },
    { key: "formClienti", el: clientFormSection },
    { key: "modificaClienti", el: clientEditSection },
  ];
  const active = sectionByView.find(item => item.el && getComputedStyle(item.el).display !== "none");
  if (active) {
    localStorage.setItem("currentView", active.key);
  }
}

window.addEventListener("beforeunload", () => {
  persistCurrentViewFromUI();
});

// ðŸ”„ Ripristina sessione utente
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    localStorage.removeItem("userEmail");
    showLoginState();
    return;
  }

  let userRole = localStorage.getItem("userRole");
  try {
    const userRef = doc(db, "allowedUsers", user.email);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      localStorage.removeItem("userRole");
      localStorage.removeItem("userName");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("currentView");
      await signOut(auth);
      showLoginState();
      return;
    }
    userRole = userSnap.data().role || userRole || "user";
    localStorage.setItem("userRole", userRole);
  } catch (err) {
    console.error("Errore verifica ruolo:", err.message);
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("currentView");
    await signOut(auth);
    showLoginState();
    return;
  }

  const userInfo = {
    name: user.displayName,
    email: user.email,
    role: userRole
  };

  // Salva sempre i dati utente in localStorage per showDashboard()
  localStorage.setItem("userName", user.displayName || "");
  localStorage.setItem("userEmail", user.email || "");

  updateUI(userInfo);
  await checkInvalidContacts();
});

// ðŸ” Login handler
loginBtn.addEventListener("click", async () => {
  const userInfo = await loginWithGoogle();
  if (userInfo) {
    // Salva in localStorage - onAuthStateChanged gestirÃ  l'UI
    localStorage.setItem("userRole", userInfo.role);
    localStorage.setItem("userName", userInfo.name || "");
    localStorage.setItem("userEmail", userInfo.email || "");
    // NON chiamare updateUI() qui - evita duplicazione pulsanti
  }
});

// ðŸšª Logout handler
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  localStorage.clear();
  location.reload();
});

// ðŸŽ› Funzione UI centrale
function updateUI(userInfo) {
  loginContainer.style.display = "none";
  logoutBtn.style.display = "inline-block";

  // ---- PATCH: SPA navigation "currentView" prioritario ----
  const currentView = localStorage.getItem("currentView");
  if (currentView === "formClienti") {
    hideAllSections();
    clientFormSection.style.display = "block";
    return;
  } else if (currentView === "modificaClienti") {
    hideAllSections();
    clientEditSection.style.display = "block";
    return;
  } else if (currentView === "gestioneVeicoli") {
    hideAllSections();
    vehicleManageSection.style.display = "block";
    import("./forms/vehicleManage.js").then(m => m.loadVehicles());
    return;
  } else if (currentView === "gestioneClienti") {
    hideAllSections();
    clientManageSection.style.display = "block";
    import("./forms/clientManage.js").then(m => m.loadClients());
    return;
  } else if (currentView === "gestioneAppuntamenti") {
    hideAllSections();
    appointmentManageSection.style.display = "block";
    import("./forms/appointmentManage.js").then(m => m.loadAppointments());
    return;
  } else if (currentView === "nuovoAppuntamento") {
    hideAllSections();
    appointmentFormSection.style.display = "block";
    import("./forms/appointmentForm.js").then(m => m.resetAppointmentForm());
    return;
  }

  // ---- Solo se nessun currentView valido: mostra dashboard ----
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
          localStorage.removeItem("currentView");
          showDashboard();
        };
      }
      import("./forms/appointmentManage.js").then(m => m.loadAppointments());
      localStorage.setItem("currentView", "gestioneAppuntamenti");
    });
    addRoleButton("Nuovo appuntamento", () => {
      hideAllSections();
      appointmentFormSection.style.display = "block";
      import("./forms/appointmentForm.js").then(m => m.resetAppointmentForm());
      localStorage.setItem("currentView", "nuovoAppuntamento");
    });
    addRoleButton("Gestione Veicoli", () => {
      hideAllSections();
      vehicleManageSection.style.display = "block";
      import("./forms/vehicleManage.js").then(m => m.loadVehicles());
      localStorage.setItem("currentView", "gestioneVeicoli");
    });
    if (userRole === "admin") {
      addRoleButton("Gestione Clienti", () => {
        hideAllSections();
        clientManageSection.style.display = "block";
        import("./forms/clientManage.js").then(m => m.loadClients());
        localStorage.setItem("currentView", "gestioneClienti");
      });
    }
  }

  if (document.getElementById("vehicleForm")) document.getElementById("vehicleForm").reset();
  if (typeof hideSteps === "function") hideSteps();
}



