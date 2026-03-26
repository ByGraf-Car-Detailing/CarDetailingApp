# Documento di Riferimento – Car Detailing App

## 1. Progetto

| Parametro | Valore |
|-----------|--------|
| Tipo | PWA gestionale car detailing (Lugano, Cadenazzo) |
| Stack | HTML5, CSS3, JS vanilla (ES Modules), Firebase Auth/Firestore/Hosting (europe-west6) |
| Repo locale | `I:\My Drive\CarDetailingApp` |
| Firebase Project | `cardetailingapp-e6c95` |
| URL Prod | `https://cardetailingapp-e6c95.web.app` |
| Account dev | bygraf.management@gmail.com |
| Ruoli | Admin (gestione completa), Staff (appuntamenti propri + veicoli) |

### Struttura File

```
public/
├── index.html                  → SPA entry point
├── style.css                   → Unico foglio stili (Premium Dark Theme)
├── critical-ios.css            → Fix iOS specifici
├── admin-tools.html            → Tool admin (init campo active)
├── admin-populate-makes.html   → Popolamento marche da NHTSA
├── admin-populate-models.html  → Popolamento modelli da NHTSA
└── src/
    ├── app.js                  → Core SPA, routing, dashboard
    ├── forms/
    │   ├── clientForm.js       → Wizard 8 step inserimento cliente
    │   ├── clientEdit.js       → Modifica cliente
    │   ├── clientManage.js     → Lista/ricerca clienti
    │   ├── vehicleForm.js      → Inserimento veicoli
    │   ├── vehicleManage.js    → Lista/ricerca veicoli
    │   ├── appointmentForm.js  → Wizard creazione appuntamento (10 step)
    │   └── appointmentManage.js → Gestione appuntamenti
    ├── services/
    │   └── authService.js      → Firebase Auth
    └── utils/
        ├── modal.js            → Sistema modale riutilizzabile
        └── validation.js       → Validazione campi
```

File orfani: `services/dbService.js.old`, `components/Auth.old/`, `utils/serviceWorker.js` (vuoto). Pulizia pre-release.

---

## 2. Firestore Schema

### `clients`

| Campo | Tipo | Note |
|-------|------|------|
| type | string | "person" / "company" |
| firstName, lastName | string | Solo person |
| companyName | string | Solo company |
| email | string | Unico |
| phone | string | Con prefisso internazionale |
| address | object | {street, number, cap, city} |
| fiscalCode | string | CF o P.IVA |
| note | string | Opzionale |
| isContact | boolean | Contatto aziendale |
| companyId | string | Ref a company (se isContact) |
| canActPrivately | boolean | Può agire come privato |
| active | boolean | Soft delete |
| createdBy | string | Email creatore |
| createdAt | timestamp | |

### `cars`

| Campo | Tipo | Note |
|-------|------|------|
| customerId | string | Ref a clients |
| customerType | string | "person" / "company" |
| vehicleType | string | Automobile, Moto, Furgone, ecc. |
| brand, model | string | |
| year | number | |
| color | string | |
| chassisNumber | string | VIN normalizzato (gruppi di 3, min 15 char) |
| licensePlate | string | Targa uppercase |
| notes | string | Opzionale |
| createdBy | string | |
| createdAt, updatedAt | timestamp | |

### `appointments`

| Campo | Tipo | Note |
|-------|------|------|
| customerId | string | Ref cliente |
| customerData | object | Snapshot anagrafica |
| customerType | string | "Privato" / "Azienda" |
| contactPersonId | string | Ref contatto (se azienda) |
| contactPersonData | object | Snapshot contatto |
| vehicleId | string | Ref veicolo |
| vehicleData | object | Snapshot {brand, model, licensePlate, chassisNumber} |
| location | string | "Lugano" / "Cadenazzo" |
| operatorId | string | Email operatore |
| operatorData | object | Snapshot operatore |
| jobTypeId | string | Ref tipo lavoro |
| jobTypeData | object | Snapshot {description, defaultPrice} |
| price | number | Prezzo finale |
| noteInternal | string | Note riservate |
| status | string | programmato → pagato |
| startReception, endReception | string | ISO datetime |
| startWork, endWork | string | ISO datetime (min 2h durata) |
| startDelivery, endDelivery | string | ISO datetime |
| calendarEventReceptionId | string | ⭕ Da implementare |
| calendarEventWorkId | string | ⭕ Da implementare |
| calendarEventDeliveryId | string | ⭕ Da implementare |
| createdBy | string | |
| createdAt, updatedAt | timestamp | |
| history | array | Log modifiche |
| deleted | boolean | Soft delete |

### `jobTypes`

| Campo | Tipo | Note |
|-------|------|------|
| description | string | Nome tipo lavoro |
| defaultPrice | number | Prezzo suggerito |

Gestione manuale via Firebase Console. CRUD UI opzionale.

### `allowedUsers`

| Campo | Tipo | Note |
|-------|------|------|
| (doc ID) | string | Email utente |
| role | string | "admin" / "staff" |
| colorId | number | 1-11, colore Google Calendar |
| displayName | string | Nome visualizzato |

### `vehicleMakes`

```json
{ "name": "Alfa Romeo", "makeId": 440, "active": true, "source": "NHTSA", "addedAt": "..." }
```

~50 marche attive (europee). Solo `active: true` visibili nell'app.

### `vehicleModels`

```json
{ "make": "Alfa Romeo", "name": "Giulia", "source": "NHTSA"|"manual", "addedAt": "..." }
```

Modelli manuali (utente seleziona "Altro") salvati con `source: "manual"`.

---

## 3. Controllo Accessi

| Parametro | Valore |
|-----------|--------|
| Metodo | Firebase Auth (Google provider) + whitelist `allowedUsers` |
| Blocco non autorizzati | Automatico + logout forzato |
| Persistenza | localStorage + onAuthStateChanged |

| Azione | Admin | Staff |
|--------|-------|-------|
| Visualizza tutti appuntamenti | ✅ | ✅ |
| Crea appuntamenti | ✅ | ✅ |
| Modifica propri appuntamenti | ✅ | ✅ |
| Modifica appuntamenti altrui | ✅ | ❌ |
| Cancella appuntamenti (soft delete) | ✅ | ❌ |
| Gestione Clienti | ✅ | ❌ |
| Gestione Veicoli | ✅ | ✅ |

---

## 4. Standards UI/UX

### Mobile (Android + iPhone)

| Elemento | Standard |
|----------|----------|
| Dashboard | `gap:16px`, full-width, `min-height:52px` |
| Tabelle | Email nascosta; Tipo="P"/"D"; Stato="A" verde/"D" rosso |
| Date/Time | Stack verticale, NO separatore "-", `gap:24px`, `height:52px`, `text-align:center` + `line-height:52px` |
| Select "Aggiungi" | `<option value="__ADD__">➕ Aggiungi [entità]</option>`, trigger modal su `change` |

### Desktop

| Elemento | Standard |
|----------|----------|
| Dashboard | `gap:16px`, `min-width:180px` |
| Tabelle | Tutte le colonne, scroll-x se serve |
| Date/Time | Affiancati con "-", label `flex:0 0 100%`, input `max-width:220px` |
| Sezioni | `max-width:1100px` |
| Select | Stesso pattern `__ADD__` |

### Platform-specific

| Piattaforma | Regole |
|-------------|--------|
| iOS | Safe-area padding notch; `font-size:16px` input; `-webkit-appearance:none` date |
| Android | Date picker nativo `color-scheme:dark` |
| Desktop | Date input `max-width:220px` |

### Validazione Input (tutti form/modal)

| Campo | Regola | Quando |
|-------|--------|--------|
| Nome/Cognome/Ragione Sociale/Città | Auto-capitalize parola | input |
| Email | `^[^\s@]+@[^\s@]+\.[^\s@]+$` | input+submit |
| Telefono | `+` iniziale OK + solo `[0-9]` | input (replace) |
| CAP | Solo numeri, min 4 | input (replace) |
| Targa | Uppercase | input |
| Nr. Telaio | Uppercase + `XXX XXX XXX XXX XXX XX` | input |
| CF/P.IVA | Uppercase, obbligatorio se company | input+submit |

### Code Patterns Obbligatori

```javascript
// ✅ SEMPRE arrow wrapper per event listener
btn.addEventListener("click", () => showDashboard());
// ❌ MAI funzione diretta (passa Event come parametro)
btn.addEventListener("click", showDashboard);
```

```javascript
// ✅ Pattern select con "Aggiungi"
select.innerHTML = `<option value="">-- Seleziona --</option><option value="__ADD__">➕ Aggiungi [entità]</option>`;
select.addEventListener("change", () => {
  if (select.value === "__ADD__") { select.value = ""; openQuickModal(cb); return; }
});
```

```javascript
// ✅ Reset standard form inserimento
function resetForm() {
  form.reset(); hideAllSteps(); state = initialState; msgBox.textContent = "";
}
```

### CSS Rules

- `!important` solo in media query per override sicuro
- `-webkit-` prefix per proprietà mobile (appearance, text-size-adjust)
- NO `display:flex` su `<input>` — usare `line-height` + `height` per centrare
- Mobile: `box-sizing:border-box !important` su input date
- Tema dark: usare CSS variables `:root` (--bg, --surface, --gold, --text, ecc.)
- `.field-error` = bordo rosso + sfondo rosa + scroll/focus automatico

---

## 5. Flussi Applicativi

### Wizard Appuntamento (10 step)

Sede → Operatore → Tipo cliente → Cliente [+crea] → [Contatto aziendale +crea] → Veicolo [+crea] → Scheda veicolo → Tipo lavoro + prezzo → Date/orari → Note → Salva

### Stati Appuntamento

programmato → ricezione → attesa → lavorazione → pronto → in consegna → concluso → fatturato → pagato

### Validazioni Date

| Regola | Valore |
|--------|--------|
| Sequenza | Ricezione < Lavorazione < Consegna |
| Durata min lavorazione | 2 ore |
| Durata default ricezione | 30 min |
| Durata default consegna | 30 min |

### Wizard Cliente (8 step)

```
1. Tipo (person/company)
2a. Nome+Cognome (person) → 2b. Ragione Sociale (company)
3. Collegamento Ditta (solo person, select aziende attive)
4. Email (regex + unicità)
5. Telefono (prefisso + min 6 cifre + unicità)
6. Indirizzo (via, n°, CAP numerico→scroll città, città)
7. Extras (P.IVA obbligatoria se company, note)
8. Azioni (Annulla, Salva)
```

Duplicati controllati: nome+tel, nome+indirizzo, email.

### Standard Form

| Principio | Descrizione |
|-----------|-------------|
| Wizard progressivo | Step-by-step con visibilità condizionale |
| Navigazione | "← Torna elenco" + "← Torna Dashboard" |
| Reset | Dati azzerati su uscita |
| Feedback | Messaggi successo/errore + field highlighting |

---

## 6. Job Pendenti

| # | Prior. | Job | Effort | File |
|---|--------|-----|--------|------|
| 11 | P3 | manifest.json (PWA installabile) | 15min | public/ |
| 12 | P-REL | Firestore Rules sicure | 2-4h | firestore.rules |
| 13 | P4 | Google Calendar sync | 8-16h | Cloud Functions |
| 14 | P-FUT | Sync settimanale marche (Cloud Function) | 1-2h | Cloud Functions |
| 15 | P2 | Select ibride autocomplete | ~7h | Tutti form/modal |

### Sessioni Pianificate

| Sessione | Job | Effort | Stato |
|----------|-----|--------|-------|
| E | #11, #12 (pre-release) | ~3-4h | ⬜ |
| F | #13 (Google Calendar) | 8-16h | ⬜ |
| G | #14 (sync marche) | 1-2h | ⬜ |

### Checklist Pre-Release

| # | Task | Stato |
|---|------|-------|
| 1 | Firestore Rules sicure | ⭕ |
| 2 | Test iPhone fisico | ⭕ |
| 3 | Test Android fisico | ⭕ |
| 4 | Test Desktop (Chrome, Firefox, Safari, Edge) | ⭕ |
| 5 | Performance con molti dati | ⭕ |
| 6 | Backup Firestore | ⭕ |
| 7 | Documentazione utente | ⭕ |
| 8 | Rimozione file .old | ⭕ |
| 9 | Review console errors | ⭕ |
| 10 | Test auth edge cases | ⭕ |

### Firestore Rules — Stato Attuale ⚠️

```javascript
allow read, write: if true;  // PERICOLOSO - Fix obbligatorio pre-release
```

Target: auth + ruoli (admin full, staff solo propri appuntamenti).

---

## 7. Decisioni Attive

| Decisione | Motivazione |
|-----------|-------------|
| Arrow function obbligatorie per event listener | Evita bug Event object passato a funzioni con parametri opzionali |
| DB Firestore per marche/modelli | NHTSA API troppo lenta (~10k marche). Firestore con flag `active` |
| Fallback "Altro" sempre presente | Input manuale per modelli/anni non in DB, salvataggio automatico |
| Firestore = MASTER, Calendar = SLAVE | Calendar riceve da Firestore, mai il contrario |
| 3 eventi Calendar per appuntamento | Ricezione, Lavorazione, Consegna separati |
| Service Worker escluso | Conflitti con Firebase Auth. Rivalutare a fine progetto |
| manifest.json sì, service worker no | PWA parziale: solo installabilità |
| `!important` solo in media query | Override sicuro senza side effects |

---

## 8. Archivio

### Moduli Completati

Autenticazione (Google+whitelist) ✅ | Clienti CRUD+wizard 8 step ✅ | Veicoli CRUD+VIN ✅ | Appuntamenti wizard 10 step ✅ | iOS/Safari compat ✅ | Validazione form+field highlighting ✅ | UX Responsive mobile ✅

### Job Completati (Sessioni A-D, 2025-01-26 → 2025-01-28)

A: Fix Safari marca freeze (DB Firestore vehicleMakes/Models) + evidenziazione campo errore
B: CSS/UX mobile (label, phone-row, card veicolo, telaio no-wrap, date-picker, padding)
C: Wizard cliente 8 step + validazione tel/email + modal wizard
D: P.IVA obbligatoria, CAP numerico, iPhone scroll fix, modal bottoni, field errors, capField duplicato fix, reset notifica

### Bug Risolti (2025-01-27)

1. Dashboard duplicata → rimosso `updateUI()` da login handler (app.js)
2. Dashboard vuota post-nav → `showDashboard()` async con fallback Firestore (app.js)
3. Event listener passava Event object → arrow wrapper (vehicleForm.js)

### P3: manifest.json (da implementare)

File: `public/manifest.json`. Icone 192+512px in `public/icons/`. Testare "Aggiungi a Home" iOS/Android.

### P4: Google Calendar (da implementare)

| Parametro | Valore |
|-----------|--------|
| Calendario | "Car Detailing Appuntamenti" |
| Service Account | calendar-service@cardetailingapp-e6c95.iam.gserviceaccount.com |
| Tech | Firebase Cloud Functions + Calendar API v3 |

Logica: Crea 3 eventi (Ricezione/Lavorazione/Consegna) con `colorId` operatore. Salva eventId su Firestore. Modifica aggiorna solo eventi cambiati. Soft delete cancella tutti e 3. Se Calendar API fallisce: salva comunque su Firestore + log in `syncErrors`.

### Job #15: Select Ibride Autocomplete (da implementare)

Componente `src/utils/autocompleteSelect.js`. Input text + hidden value + dropdown filtro real-time. Arrow ↓/↑ navigazione, Enter selezione, Esc chiude. "➕ Aggiungi..." sempre ultima opzione. Select da convertire: Cliente, Contatto, Veicolo, Marca, Modello, Anno, Operatore.

### Procedure Admin Marche/Modelli

- `admin-populate-makes.html` → importa da NHTSA → attivare manualmente `active:true` su Firebase Console
- `admin-populate-models.html` → seleziona marca → importa modelli

### Riferimenti

| Risorsa | Link |
|---------|------|
| Firebase Console | https://console.firebase.google.com/project/cardetailingapp-e6c95 |
| App Prod | https://cardetailingapp-e6c95.web.app |
| Google Calendar | "Car Detailing Appuntamenti" (bygraf.management@gmail.com) |
