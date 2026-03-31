import { getCatalogJob, runCatalogSync } from "./catalogSyncRunner.js";

const TARGET_BY_PROJECT = {
  "cardetailingapp-e6c95-staging": "staging",
  "cardetailingapp-e6c95": "prod",
};

function getCurrentTargetFromRuntime() {
  const projectId = window.__FIREBASE_PROJECT_ID__ || "";
  return TARGET_BY_PROJECT[projectId] || "prod";
}

function appendLine(logEl, message) {
  const ts = new Date().toLocaleTimeString();
  logEl.value = `${logEl.value}[${ts}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setButtonsDisabled(buttons, disabled) {
  for (const btn of buttons) btn.disabled = disabled;
}

function parseMaxWrites(inputEl) {
  const value = Number(inputEl.value);
  if (!Number.isFinite(value) || value <= 0) return 100;
  return Math.floor(value);
}

function validateConfirmation(target, value) {
  return value.trim() === `SYNC ${target.toUpperCase()}`;
}

function resolveMode(button) {
  if (button.id === "syncMakesBtn") return "makes";
  if (button.id === "syncModelsBtn") return "models";
  return "reference";
}

async function startSync({ mode, target, maxWrites, logEl, buttons }) {
  setButtonsDisabled(buttons, true);
  appendLine(logEl, `Start mode=${mode}, target=${target}, maxWrites=${maxWrites}`);
  try {
    const result = await runCatalogSync({ mode, target, maxWrites });
    appendLine(logEl, `OK jobId=${result.jobId} status=${result.status}`);
    appendLine(logEl, `summary=${JSON.stringify(result.summary)}`);
  } catch (err) {
    appendLine(logEl, `ERROR ${err?.message || String(err)}`);
  } finally {
    setButtonsDisabled(buttons, false);
  }
}

function initCatalogSyncUI() {
  const section = document.getElementById("catalogSyncSection");
  const targetSelect = document.getElementById("catalogSyncTarget");
  const maxWritesInput = document.getElementById("catalogSyncMaxWrites");
  const confirmationInput = document.getElementById("catalogSyncConfirmation");
  const makesBtn = document.getElementById("syncMakesBtn");
  const modelsBtn = document.getElementById("syncModelsBtn");
  const referenceBtn = document.getElementById("syncReferenceBtn");
  const checkBtn = document.getElementById("syncJobCheckBtn");
  const checkInput = document.getElementById("syncJobIdInput");
  const logEl = document.getElementById("catalogSyncLog");

  if (!section || !targetSelect || !maxWritesInput || !confirmationInput || !makesBtn || !modelsBtn || !referenceBtn || !logEl) {
    return;
  }

  const currentTarget = getCurrentTargetFromRuntime();
  targetSelect.innerHTML = "";
  const option = document.createElement("option");
  option.value = currentTarget;
  option.textContent = `${currentTarget} (runtime corrente)`;
  targetSelect.appendChild(option);
  targetSelect.value = currentTarget;

  appendLine(logEl, `Runtime target: ${currentTarget}`);
  appendLine(logEl, `Conferma richiesta: SYNC ${currentTarget.toUpperCase()}`);

  const runButtons = [makesBtn, modelsBtn, referenceBtn];
  for (const btn of runButtons) {
    btn.addEventListener("click", async () => {
      const target = targetSelect.value;
      const confirmation = confirmationInput.value || "";
      if (!validateConfirmation(target, confirmation)) {
        appendLine(logEl, `Conferma non valida. Inserisci esattamente: SYNC ${target.toUpperCase()}`);
        return;
      }
      const maxWrites = parseMaxWrites(maxWritesInput);
      await startSync({
        mode: resolveMode(btn),
        target,
        maxWrites,
        logEl,
        buttons: runButtons,
      });
    });
  }

  if (checkBtn && checkInput) {
    checkBtn.addEventListener("click", async () => {
      const jobId = (checkInput.value || "").trim();
      if (!jobId) {
        appendLine(logEl, "Inserisci un jobId.");
        return;
      }
      const job = await getCatalogJob(jobId);
      if (!job) {
        appendLine(logEl, `Job non trovato: ${jobId}`);
        return;
      }
      appendLine(logEl, `Job ${jobId}: ${JSON.stringify(job)}`);
    });
  }
}

export { initCatalogSyncUI };

