# DEV/TEST Reference (CarDetailingApp_LOCAL)

Scopo: poter riprendere rapidamente l’ambiente DEV/Test, rieseguire i test in modo riproducibile, trovare i report finali, e avere una lista **completa** dei test ancora da implementare (basata sul codice nello zip).

## 1) Comandi di esecuzione

### 1.1 Entrypoint (PowerShell, root progetto)

```powershell
# ENTRYPOINT (PowerShell) - root progetto
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path ".\test-results" | Out-Null

# Output pulito (no ANSI) + UTF-8
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

Remove-Item Env:NO_COLOR -ErrorAction SilentlyContinue
$env:FORCE_COLOR = "0"
$env:PW_BASE_URL = "http://127.0.0.1:5000"

$cmd = '.\node_modules\.bin\firebase.cmd emulators:exec --only auth,firestore,hosting "node scripts/seed-emulators.mjs && npx playwright test --max-failures=0"'

cmd /d /s /c "chcp 65001>nul & $cmd 2>&1" |
  ForEach-Object { $_ -replace "`e\[[0-9;]*m","" } |
  Tee-Object -FilePath .\test-results\run.log |
  Where-Object { $_ -notmatch 'hosting:' -and $_ -notmatch '127\.0\.0\.1 - - \[' }

$exitCode = $LASTEXITCODE

# Genera sempre la lista bug (anche se i test falliscono)
if (Test-Path .\test-results\report.json) {
  node .\scripts\extract-bugs.mjs .\test-results\report.json | Out-Host
}

if ($exitCode -ne 0) { exit $exitCode }
```

### 1.2 Dove trovo il report finale?

- HTML report Playwright: cartella `playwright-report/` (aprilo con `npx playwright show-report`)
- Report machine-readable: `test-results/report.json`
- JUnit: `test-results/junit.xml`
- Lista bug “umana” generata: `test-results/bugs.md`
- Lista bug JSON: `test-results/bugs.json`
- Log completo run: `test-results/run.log`

## 2) Playwright config consigliato (deduplicato)

> Nota: il file che mi hai mostrato aveva **due** chiavi `reporter` (l’ultima sovrascrive la prima). Qui sotto una versione completa e coerente.

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PW_BASE_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  "http://127.0.0.1:5000";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",

  timeout: 30_000,
  expect: { timeout: 15_000 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/report.json" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],

  use: {
    baseURL,
    headless: true,

    actionTimeout: 10_000,
    navigationTimeout: 30_000,

    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

## 3) Stato attuale test già presenti

Presenti in `tests/`:
- `smoke.spec.ts` (home load + page errors)
- `smoke-assets.spec.ts` (manifest)
- `auth-admin.spec.ts`, `auth-staff.spec.ts` (login utenti seed)
- `auth-whitelist.spec.ts` (utente non autorizzato)
- `dashboard-nav.spec.ts` (visibilità bottoni dashboard)
- `currentview.spec.ts` (persistenza sezione su reload)

Nota: da codice (`public/src/app.js`) risulta che `localStorage.removeItem("currentView")` viene fatto al load → quindi la “persistenza currentView” **non è supportata** e quel test va riconsiderato (o modificato per verificare il comportamento opposto).

---

## 4) Backlog completo dei test da implementare

Questa lista copre **tutte** le feature visibili in UI e la logica nei moduli JS sotto `public/src/`:

### 6.1 Auth / Access control

1) **Logout effettivo**
- dopo click logout: `loginBtn` visibile, `dashboardContainer` nascosto
- localStorage ripulito (almeno `userRole`, `userEmail`, `username`, `userSurname`)

2) **Utente NON in allowedUsers viene negato** (bug attuale)
- login con utente non presente in `allowedUsers` → ritorno alla schermata login con messaggio errore (o comunque nessuna dashboard)
- verificare che non resti “dashboard vuota”

3) **Utente in allowedUsers ma role = staff**
- vede solo i bottoni staff
- non vede bottoni admin

4) **Utente in allowedUsers role = admin**
- vede bottoni admin + staff

5) **Sessione persistente (onAuthStateChanged)**
- ricarico pagina da loggato → dashboard torna coerente con ruolo

### 6.2 Dashboard / Navigazione SPA

UI in `public/index.html`:
- `#dashboardContainer`, `#welcomeTitle`, `#welcomeSubtitle`
- sezioni: `#dashboardSection`, `#clientManageSection`, `#vehicleManageSection`, `#appointmentManageSection`, `#clientFormSection`, `#vehicleFormSection`, `#appointmentFormSection`, `#clientEditSection`

Test:
1) click sui bottoni → mostra la sezione corretta e nasconde le altre
2) `#backToDashboardBtn` e `#backToDashboardBtnVehicle` funzionano
3) ricarico pagina: comportamento **atteso** per sezione attiva (attualmente reset)

### 4.3 Clienti (creazione + gestione + modifica)

Moduli: `clientForm.js`, `clientEdit.js`

**Creazione (clientForm)**
1) apertura sezione “Nuovo Cliente”
2) validazioni obbligatorie (nome, cognome, telefono, email, ecc.)
3) switch tipo cliente (Privato/Azienda) → campi specifici e validazioni
4) inserimento dati validi → crea doc su Firestore (collezione clienti)
5) gestione prefissi telefono (se presente UI)
6) edge: email duplicata / telefono duplicato (se logica presente)
7) reset form dopo salvataggio

**Gestione (clientManageSection)**
1) lista clienti visibile e popolata dopo seed/creazione
2) ricerca / filtro (se presente)
3) selezione cliente → apre “Modifica Cliente”

**Modifica (clientEdit)**
1) carica dati cliente correttamente
2) update campi → persist su Firestore
3) annulla → non modifica
4) ritorno dashboard

### 4.4 Veicoli (creazione + gestione + modifica + delete)

Moduli: `vehicleForm.js`, `vehicleManage.js`

**Creazione (vehicleForm)**
1) apertura sezione “Nuovo Veicolo”
2) validazioni obbligatorie (targa, marca, modello, ecc.)
3) associare a cliente (se UI prevede dropdown/lookup)
4) salva → doc creato su Firestore (collezione veicoli)
5) edge: targa/vin duplicati (se logica presente)

**Gestione (vehicleManage)**
1) lista veicoli visibile e caricata
2) filtro per testo (targa, marca, modello, cliente) se implementato
3) “Modifica” apre modal con valori precompilati
4) update in modal → refresh lista
5) “Elimina” (solo admin) → conferma e doc rimosso
6) vincoli ruolo:
   - staff: **no delete**
   - staff: edit solo se `createdBy === currentUserEmail` (come da codice)

### 4.5 Appuntamenti (creazione + gestione + filtri + edit/delete)

Moduli: `appointmentForm.js`, `appointmentManage.js`

**Creazione (appointmentForm)**
1) apertura sezione “Nuovo Appuntamento”
2) selezione cliente e veicolo (coerenza cliente-veicolo)
3) validazioni: data/ora, tipo lavoro, note (se richieste)
4) salva → doc in Firestore con `createdBy` e campi base

**Gestione (appointmentManage)**
1) lista appuntamenti caricata
2) filtri: status (`#appointmentStatusFilter`), date from/to (`#dateFromFilter`, `#dateToFilter`), testo (`#textSearchFilter`)
3) ricerca testo deve matchare: cliente, targa, telaio, operatore, jobType (come da codice)
4) edit:
   - admin: può editare tutto
   - staff: può editare solo se `createdBy === currentUserEmail`
5) delete:
   - admin: può cancellare
   - staff: non può cancellare (come da codice)
6) transizioni status (se UI/logic previste): pending → accepted → completed/cancelled

### 4.6 Persistenza / Storage / Robustezza

1) localStorage coerente:
- se `userRole/userEmail` mancano → fallback su `auth.currentUser`
- se `auth.currentUser` nullo → deve tornare login (qui c’è un punto debole che genera “dashboard vuota”)

2) error handling UI:
- operazioni Firestore fallite → mostra modal/errore e non lascia UI in stato incoerente

### 4.7 Non-regressione base

1) nessun `pageerror`/console error durante navigazione base
2) `manifest.json` 200 (già coperto)
3) performance smoke: home load < soglia (opzionale)

---

## 5) Note su “currentView”

Nel codice (`public/src/app.js`) al load viene eseguito:
- `localStorage.removeItem("currentView")`

Quindi:
- se il comportamento “non persiste al reload” è **voluto**, il test `currentview.spec.ts` va cambiato per verificare che **si resetta** al reload (non il contrario).


---

## 6) Extra (opzionali, ma utili)

### 6.1 admin-tools.html
Nel progetto esiste `public/admin-tools.html` (strumenti admin). Se questa pagina viene usata:
- accesso consentito solo ad admin
- azioni disponibili funzionano contro emulatori
- nessuna azione disponibile per utenti non-admin

### 6.2 Verifiche “non funzionali” minime
- nessun `pageerror`/console error su `page.goto("/")` (oltre allo smoke test)
- tempi medi dei test (trend) e flakiness (retry count)
- pulizia dati tra test (seed + eventuale teardown) per evitare dipendenze tra test
