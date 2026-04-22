# AGENTS.md - CarDetailing App Governance

Version: 2.2
Status: Mandatory
Effective Date: 2026-04-20
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

## Dynamic Session Binding Standard
- At session start, record `SESSION_OPEN` in manager `00_MASTER_CONTROL/DECISION_LOG.md` with:
  - `codex_session_id`
  - `claude_session_id`
  - `started_at_utc`
- Binding source of truth is runtime `CODEX_THREAD_ID` (UUID).
- Mandatory equality contract: `codex_session_id == claude_session_id == CODEX_THREAD_ID`.
- If `CODEX_THREAD_ID` is unavailable, coworking and PR creation are blocked (`SESSION_ID_SOURCE_MISSING`).
- The bound `claude_session_id` must remain unchanged for the full Codex session lifecycle.
- Hardcoded session IDs in governance or runbook documents are forbidden.
- Any session binding change requires explicit Owner approval and same-turn decision log trace.

## Token-Saver Trace Minimum (Mandatory)
- Required fields:
  - `codex_session_id`
  - `claude_session_id`
  - `binding_source`
  - `timeout_ms`
  - `question`
  - `options_considered`
  - `recommendation`
  - `residual_risk`
- Placeholder values are forbidden (`TBD`, `N/A`, `none`, `unknown`, `placeholder`).

## PR Body Compliance (Mandatory, Non-Bypassable)
- PR creation must use `scripts/gen-pr-body.ps1` followed by `gh pr create --body-file`.
- Manual PR body authoring is not accepted for governance closure.
- Preflight before `gh pr create`:
  - `codex_session_id` and `claude_session_id` are valid UUID values and equal.
  - `binding_source` must be `CODEX_THREAD_ID`.
  - `timeout_ms >= 600000`.
  - `question`, `options_considered`, `recommendation`, `residual_risk` are non-empty and non-placeholder.
- `coworking-proof` failure due to body non-compliance blocks merge (no exception path).

## Release Contract
- No direct push to `main`; only PR + squash.
- Required checks on `main`: `quality` and `validate-governance`.
- `main` deploys staging only.
- Production deploy remains tag-gated and owner-approved.
- Any prod-impacting exception must be logged in manager `DECISION_LOG.md` and `PROD_CHANGE_REGISTER.md`.
