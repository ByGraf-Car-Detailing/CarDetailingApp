# App Governance Policy

## Mandatory Controls
- `staging-first` execution model.
- `prod-freeze` remains active unless explicit Owner approval is logged.
- No direct pushes to `main`; only PR + squash.

## Required CI Checks on `main`
- `quality`
- `validate-governance`
- `coworking-proof`

`validate-governance` is enforced by `.github/workflows/governance-guard.yml` and must be green on PR and on `main` pushes.

## Identity and Co-Working
- Primary operational identity: `ByGraf-Car-Detailing`.
- Critical decisions require Codex+Claude trace according to manager governance.
