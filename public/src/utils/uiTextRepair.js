const CANONICAL_TEXT_BY_ID = {
  backToAdminCatalogSyncBtn: "Torna indietro",
  backToDashboardCatalogSyncBtn: "Torna alla Dashboard",
  backToAdminRuntimeConfigBtn: "Torna indietro",
  backToDashboardRuntimeConfigBtn: "Torna alla Dashboard",
  backToListClientBtn: "Torna all'elenco",
  backToDashboardClientBtn: "Torna alla Dashboard",
  backToDashboardBtn: "Torna alla Dashboard",
  backToDashboardClientsBtn: "Torna alla Dashboard",
  showAddClientBtn: "Aggiungi Cliente",
  backToDashboardVehiclesBtn: "Torna alla Dashboard",
  showAddVehicleBtn: "Aggiungi Veicolo",
  backToListVehicleBtn: "Torna all'elenco",
  backToDashboardVehicleBtn: "Torna alla Dashboard",
  backToDashboardAppointmentsBtn: "Torna alla Dashboard",
  showAppointmentFormFromListBtn: "Nuovo appuntamento",
  backToListAppointmentBtn: "Torna all'elenco",
  backToDashboardAppointmentBtn: "Torna alla Dashboard",
};

const CANONICAL_SECTION_TITLES = [
  { selector: "#clientManageSection > h3", text: "Gestione Clienti" },
  { selector: "#vehicleManageSection > h3", text: "Gestione Veicoli" },
  { selector: "#appointmentManageSection > h3", text: "Gestione Appuntamenti" },
  { selector: "#appointmentFormTitle", text: "Nuovo appuntamento" },
  { selector: "#clientFormSection > h3", text: "Aggiungi Cliente / Azienda" },
  { selector: "#vehicleFormSection > h3", text: "Aggiungi Veicolo" },
];

const MOJIBAKE_SNIPPETS = [
  "â†",
  "âž•",
  "ðŸ",
  "Ã",
  "âœ",
  "â€“",
  "â€”",
];

function stripLeadingMojibake(text) {
  if (!text) return text;
  let repaired = text;
  for (const token of MOJIBAKE_SNIPPETS) {
    repaired = repaired.replaceAll(token, "");
  }
  return repaired.replace(/\s{2,}/g, " ").trim();
}

export function applyUITextRepair() {
  for (const [id, canonicalText] of Object.entries(CANONICAL_TEXT_BY_ID)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const current = (el.textContent || "").trim();
    if (!current || current !== canonicalText) {
      const repaired = stripLeadingMojibake(current);
      el.textContent = repaired === canonicalText ? repaired : canonicalText;
    }
  }

  for (const item of CANONICAL_SECTION_TITLES) {
    const el = document.querySelector(item.selector);
    if (!el) continue;
    const current = (el.textContent || "").trim();
    if (!current || current !== item.text) {
      const repaired = stripLeadingMojibake(current);
      el.textContent = repaired === item.text ? repaired : item.text;
    }
  }
}
