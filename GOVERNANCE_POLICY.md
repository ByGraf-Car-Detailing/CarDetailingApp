# App Governance Policy

## Mandatory Controls
- `staging-first` execution model.
- `prod-freeze` remains active unless explicit Owner approval is logged.
- No direct pushes to `main`; only PR + squash.

## Required CI Checks on `main`
- `quality`
- `validate-governance`
- `coworking-proof`

`quality` includes runtime parity guard (`scripts/validate-runtime-contract.ps1`) that blocks PRs when:
- Firebase runtime config contract is incomplete/incoherent.
- staging/prod boundary assertions for staging-only lane are missing.
- Auth provider/domain contract diverges from required staging/prod baseline (`scripts/check-auth-domain-contract.mjs` + `config/auth-domain-contract.json`).

`validate-governance` is enforced by `.github/workflows/governance-guard.yml` and must be green on PR and on `main` pushes.

## Identity and Co-Working
- Primary operational identity: `ByGraf-Car-Detailing`.
- Critical decisions require Codex+Claude trace according to manager governance.
- PR body compliance is fail-closed:
  - generate body with `scripts/gen-pr-body.ps1`
  - create PR with `gh pr create --body-file ...`
  - placeholder or missing mandatory trace fields are blocked by `coworking-proof`.
