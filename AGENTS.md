# AGENTS.md - CarDetailing App Governance

Version: 2.1
Status: Mandatory
Scope: `C:\CarDetailingApp_LOCAL\CarDetailingApp_LOCAL`

## Identity and Scope
- Repository: `CarDetailingApp`
- Environment model: `staging-first`, `prod-freeze unless explicit Owner approval`
- Primary operational identity: `ByGraf-Car-Detailing`

## Non-Bypassable Co-Working Controls
- `SESSION_BINDING_1_TO_1` is mandatory.
- `CLAUDE_TIMEOUT_MIN_10M` is mandatory (`timeout_ms >= 600000`).
- `PROD_SAFE_FINAL_CONTROL` is mandatory for production-impacting changes.
- Any critical decision (`G2/G3/G4`) requires decision trace in manager `DECISION_LOG.md`.

## Release Contract
- No direct push to `main`; only PR + squash.
- Required checks on `main`: `quality` and `validate-governance`.
- `main` deploys staging only.
- Production deploy remains tag-gated and owner-approved.
