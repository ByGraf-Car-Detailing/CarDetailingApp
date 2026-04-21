// src/app.js
import { auth, db } from "./services/authService.js";
import { hideSteps } from "./forms/vehicleForm.js";
import { initGlobalErrorHandling } from "./errorHandler.js";
import { initSessionManager } from "./sessionManager.js";
import { initRouter } from "./router.js";
import { createDashboardController } from "./dashboardController.js";
import { createViewEffects } from "./viewEffects.js";
import { createDataIntegrityChecks } from "./dataIntegrityChecks.js";

const RUNTIME_BUILD_TAG = "20260413-prod-hotfix-3";

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

window.__FIREBASE_PROJECT_ID__ = db.app?.options?.projectId || "";
const hostname = window.location.hostname;
const isLocalRuntime = hostname === "localhost" || hostname === "127.0.0.1";
const isStagingProject = window.__FIREBASE_PROJECT_ID__ === "cardetailingapp-e6c95-staging";
const IS_STAGING_RUNTIME = isStagingProject || isLocalRuntime;

const sectionByView = [
  { key: "catalogSyncAdmin", el: catalogSyncSection },
  { key: "gestioneAppuntamenti", el: appointmentManageSection },
  { key: "nuovoAppuntamento", el: appointmentFormSection },
  { key: "gestioneVeicoli", el: vehicleManageSection },
  { key: "gestioneClienti", el: clientManageSection },
  { key: "formClienti", el: clientFormSection },
  { key: "modificaClienti", el: clientEditSection },
];

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

const router = initRouter({ sectionByView, hideAllSections });

const viewEffects = createViewEffects({
  sections: {
    vehicleManageSection,
    clientManageSection,
    appointmentManageSection,
    appointmentFormSection,
    catalogSyncSection,
  },
  runtimeBuildTag: RUNTIME_BUILD_TAG,
  isStagingRuntime: IS_STAGING_RUNTIME,
  router,
  onGoToDashboard: () => {
    void showDashboard();
  },
});

function navigateToView(viewKey) {
  hideAllSections();
  viewEffects.applyCurrentViewEffects(viewKey);
  router.setCurrentView(viewKey);
}

const dashboardController = createDashboardController({
  auth,
  db,
  hideAllSections,
  loginContainer,
  dashboardContainer,
  logoutBtn,
  roleButtons,
  welcomeMsg,
  isStagingRuntime: IS_STAGING_RUNTIME,
  onNavigate: navigateToView,
  hideSteps,
});

const dataIntegrityChecks = createDataIntegrityChecks({ db, alertBanner });

function showLoginState() {
  hideAllSections();
  loginContainer.style.display = "block";
  dashboardContainer.style.display = "none";
  logoutBtn.style.display = "none";
}

function goToDashboard() {
  router.clearCurrentView();
  void showDashboard();
}

function bindDashboardBackButtons() {
  const backToDashboardIds = [
    "backToDashboardCatalogSyncBtn",
    "backToDashboardClientBtn",
    "backToDashboardBtn",
    "backToDashboardClientsBtn",
    "backToDashboardVehiclesBtn",
    "backToDashboardVehicleBtn",
    "backToDashboardAppointmentsBtn",
    "backToDashboardAppointmentBtn",
  ];

  for (const id of backToDashboardIds) {
    const el = document.getElementById(id);
    if (!el) continue;

    el.onclick = (evt) => {
      evt.preventDefault();
      goToDashboard();
    };
  }
}

function updateUI(userInfo) {
  loginContainer.style.display = "none";
  logoutBtn.style.display = "inline-block";

  const restoredView = router.restoreCurrentView();
  if (restoredView) {
    hideAllSections();
    viewEffects.applyCurrentViewEffects(restoredView);
    return;
  }

  void showDashboard(userInfo);
}

const sessionController = initSessionManager({
  auth,
  db,
  loginBtn,
  logoutBtn,
  onAuthenticated: updateUI,
  onLoggedOut: showLoginState,
  onPostAuthCheck: dataIntegrityChecks.checkInvalidContacts,
});

const jsErrorBanner = document.getElementById("jsErrorBanner");
initGlobalErrorHandling({ bannerEl: jsErrorBanner });

window.addEventListener("beforeunload", () => {
  sessionController.teardown();
});

window.addEventListener("beforeunload", () => {
  router.persistCurrentViewFromUI();
});

bindDashboardBackButtons();

// Boot hidden states
showLoginState();
vehicleFormSection.style.display = "none";
clientEditSection.style.display = "none";
alertBanner.style.display = "none";

export async function showDashboard(userInfo = null) {
  await dashboardController.showDashboard(userInfo);
}
