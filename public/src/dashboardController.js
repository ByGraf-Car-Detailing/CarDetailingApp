import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { resolveOperatorDisplayName } from "./services/operatorIdentity.js";

export function createDashboardController({
  auth,
  db,
  hideAllSections,
  loginContainer,
  dashboardContainer,
  logoutBtn,
  roleButtons,
  welcomeMsg,
  isStagingRuntime,
  onNavigate,
  hideSteps,
}) {
  let currentUserRole = "user";

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

  function renderPrimaryMenu() {
    addRoleButton("Gestione appuntamenti", () => onNavigate("gestioneAppuntamenti"));
    addRoleButton("Nuovo appuntamento", () => onNavigate("nuovoAppuntamento"));
    addRoleButton("Gestione Veicoli", () => onNavigate("gestioneVeicoli"));

    if (currentUserRole === "admin") {
      addRoleButton("Gestione Clienti", () => onNavigate("gestioneClienti"));
    }
  }

  function renderDashboardMenu() {
    roleButtons.innerHTML = "";
    renderPrimaryMenu();

    if (currentUserRole === "admin" && isStagingRuntime) {
      addRoleButton("Amministrazione", renderAdminMenu);
    }
  }

  function renderAdminMenu() {
    roleButtons.innerHTML = "";
    addRoleButton("Catalogo Marche", () => onNavigate("catalogSyncAdmin"));
    addRoleButton("Gestione Sedi", () => onNavigate("runtimeConfigAdmin"));
    addRoleButton("Torna alla Dashboard", renderDashboardMenu);
  }

  async function resolveUserContext(userInfo = null) {
    let userRole;
    let userName;
    let userEmail;
    let allowedDisplayName = "";

    if (userInfo) {
      userRole = userInfo.role || "user";
      userName = userInfo.name || "";
      userEmail = userInfo.email || "";
    } else {
      userRole = localStorage.getItem("userRole");
      userName = localStorage.getItem("userName") || "";
      userEmail = localStorage.getItem("userEmail") || "";

      const currentUser = auth.currentUser;
      if (currentUser) {
        if (!userEmail) {
          userEmail = currentUser.email || "";
          localStorage.setItem("userEmail", userEmail);
        }

        if (!userRole || userRole === "user" || !userName) {
          try {
            const userRef = doc(db, "allowedUsers", currentUser.email);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const userData = userSnap.data() || {};
              userRole = userData.role || "user";
              allowedDisplayName =
                typeof userData.displayName === "string" ? userData.displayName.trim() : "";
              localStorage.setItem("userRole", userRole);
            }
          } catch (err) {
            console.error("Errore recupero ruolo:", err.message);
            userRole = userRole || "user";
          }
        }

        if (!userName) {
          userName = resolveOperatorDisplayName({
            allowedDisplayName,
            authDisplayName: currentUser.displayName || "",
            email: userEmail || currentUser.email || "",
            operatorId: currentUser.email || "",
          });
          localStorage.setItem("userName", userName);
        }
      }

      userRole = userRole || "user";
    }

    return { userRole, userName, userEmail };
  }

  async function showDashboard(userInfo = null) {
    hideAllSections();
    dashboardContainer.style.display = "block";
    loginContainer.style.display = "none";
    logoutBtn.style.display = "inline-block";
    roleButtons.style.display = "flex";
    roleButtons.innerHTML = "";

    const { userRole, userName, userEmail } = await resolveUserContext(userInfo);
    currentUserRole = userRole;
    const welcomeName = userName || resolveOperatorDisplayName({ email: userEmail, operatorId: userEmail }) || "utente";
    welcomeMsg.textContent = `Benvenuto ${welcomeName} (Ruolo: ${userRole})`;

    if (userRole === "admin" || userRole === "staff") {
      renderDashboardMenu();
    }

    const vehicleForm = document.getElementById("vehicleForm");
    if (vehicleForm) vehicleForm.reset();
    if (typeof hideSteps === "function") hideSteps();
  }

  return {
    showAdminMenu: async () => {
      await showDashboard();
      if (currentUserRole === "admin" && isStagingRuntime) {
        renderAdminMenu();
      }
    },
    showDashboard,
  };
}
