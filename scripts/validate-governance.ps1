param()
$ErrorActionPreference = 'Stop'

function Assert-Exists {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path $Path)) {
    Write-Error "FAILED [$Label] -> missing: $Path"
    exit 1
  }
  Write-Host "PASS   [$Label]"
}

Write-Host "Running App runtime contract checks..."

Assert-Exists -Path "firebase.json" -Label "Firebase config"
Assert-Exists -Path "firestore.rules" -Label "Firestore rules"
Assert-Exists -Path "firestore.rules.prod.freeze" -Label "Prod freeze rules"
Assert-Exists -Path ".firebaserc" -Label "Firebase RC"
Assert-Exists -Path "config/auth-domain-contract.json" -Label "Auth domain contract"

Write-Host "All runtime contract checks passed."