export function createViewEffects({
  sections,
  runtimeBuildTag,
  isStagingRuntime,
  router,
  onGoToDashboard,
}) {
  function applyCurrentViewEffects(viewKey) {
    if (viewKey === "gestioneVeicoli") {
      sections.vehicleManageSection.style.display = "block";
      import(`./forms/vehicleManage.js?v=${runtimeBuildTag}`).then((m) => m.loadVehicles());
      return;
    }

    if (viewKey === "gestioneClienti") {
      sections.clientManageSection.style.display = "block";
      import(`./forms/clientManage.js?v=${runtimeBuildTag}`).then((m) => m.loadClients());
      return;
    }

    if (viewKey === "gestioneAppuntamenti") {
      sections.appointmentManageSection.style.display = "block";
      import(`./forms/appointmentManage.js?v=${runtimeBuildTag}`).then((m) => m.loadAppointments());
      return;
    }

    if (viewKey === "nuovoAppuntamento") {
      sections.appointmentFormSection.style.display = "block";
      import("./forms/appointmentForm.js").then((m) => m.resetAppointmentForm());
      return;
    }

    if (viewKey === "catalogSyncAdmin") {
      if (!isStagingRuntime) {
        router.clearCurrentView();
        onGoToDashboard();
        return;
      }

      sections.catalogSyncSection.style.display = "block";
      import("./admin/catalogSyncUI.js?v=20260402-2").then((m) => m.initCatalogSyncUI());
    }
  }

  return {
    applyCurrentViewEffects,
  };
}
