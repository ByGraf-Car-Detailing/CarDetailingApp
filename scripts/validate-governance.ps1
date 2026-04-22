param()

$ErrorActionPreference = "Stop"

function Assert-Contains {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Label
  )

  if (-not (Test-Path $Path)) {
    Write-Error "Missing file: $Path"
    exit 1
  }

  $content = Get-Content -Path $Path -Raw
  if ($content -notmatch [regex]::Escape($Pattern)) {
    Write-Error "FAILED [$Label] -> pattern not found: $Pattern"
    exit 1
  }

  Write-Host "PASS   [$Label]"
}

Write-Host "Running app governance checks..."

Assert-Contains -Path "AGENTS.md" -Pattern "Version: 2.2" -Label "AGENTS version"
Assert-Contains -Path "AGENTS.md" -Pattern "SESSION_BINDING_1_TO_1" -Label "AGENTS session binding"
Assert-Contains -Path "AGENTS.md" -Pattern "SESSION_OPEN" -Label "AGENTS session-open binding record"
if ((Get-Content -Path "AGENTS.md" -Raw) -match "019d3dfb-de30-7a80-a253-479e307c56ac") {
  Write-Error "FAILED [AGENTS no hardcoded session id] -> forbidden hardcoded session id found"
  exit 1
}
Write-Host "PASS   [AGENTS no hardcoded session id]"
Assert-Contains -Path "AGENTS.md" -Pattern "CLAUDE_TIMEOUT_MIN_10M" -Label "AGENTS timeout policy"
Assert-Contains -Path "AGENTS.md" -Pattern "PROD_SAFE_FINAL_CONTROL" -Label "AGENTS prod-safe control"
Assert-Contains -Path "AGENTS.md" -Pattern "options_considered" -Label "AGENTS trace field alignment"

Assert-Contains -Path ".github/workflows/ci.yml" -Pattern "quality" -Label "CI quality job"
Assert-Contains -Path ".github/workflows/governance-guard.yml" -Pattern "validate-governance" -Label "Governance guard workflow"
Assert-Contains -Path ".github/workflows/governance-guard.yml" -Pattern "github.rest.pulls.get" -Label "Governance guard live PR body fetch"
Assert-Contains -Path "GOVERNANCE_POLICY.md" -Pattern "validate-governance" -Label "Policy references governance guard"
Assert-Contains -Path "GOVERNANCE_POLICY.md" -Pattern "gen-pr-body.ps1" -Label "Policy references PR body generator"
Assert-Contains -Path "AGENTS.md" -Pattern "gen-pr-body.ps1" -Label "AGENTS PR body generator policy"
Assert-Contains -Path ".github/pull_request_template.md" -Pattern "codex_session_id:" -Label "PR template codex session field"
Assert-Contains -Path ".github/pull_request_template.md" -Pattern "claude_session_id:" -Label "PR template claude session field"
Assert-Contains -Path ".github/pull_request_template.md" -Pattern "timeout_ms:" -Label "PR template timeout field"
Assert-Contains -Path ".github/pull_request_template.md" -Pattern "options_considered:" -Label "PR template options considered field"
if (-not (Test-Path "scripts/gen-pr-body.ps1")) {
  Write-Error "FAILED [PR body generator] -> scripts/gen-pr-body.ps1 is missing"
  exit 1
}
Write-Host "PASS   [PR body generator]"

# Secrets tracked check (.env* tracked files are forbidden)
$trackedEnv = git ls-files | Where-Object { $_ -match '(^|/)\.env' }
if ($trackedEnv) {
  Write-Error "FAILED [Tracked env files] -> forbidden tracked .env* files found: $($trackedEnv -join ', ')"
  exit 1
}
Write-Host "PASS   [Tracked env files]"

Write-Host "All app governance checks passed."
