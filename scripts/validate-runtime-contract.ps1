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

Write-Host "Running runtime parity/boundary checks..."

# 1) Firebase project aliases must be explicit and stable.
Assert-Contains -Path ".firebaserc" -Pattern '"default": "cardetailingapp-e6c95"' -Label "firebaserc default alias"
Assert-Contains -Path ".firebaserc" -Pattern '"prod": "cardetailingapp-e6c95"' -Label "firebaserc prod alias"
Assert-Contains -Path ".firebaserc" -Pattern '"staging": "cardetailingapp-e6c95-staging"' -Label "firebaserc staging alias"

# 2) Runtime config contract must require complete web config shape.
Assert-Contains -Path "public/src/services/firebaseRuntime.js" -Pattern "REQUIRED_RUNTIME_CONFIG_KEYS" -Label "runtime required-key list"
Assert-Contains -Path "public/src/services/firebaseRuntime.js" -Pattern "assertRuntimeConfigShape(json, ""init.json""" -Label "runtime init.json shape check"
Assert-Contains -Path "public/src/services/firebaseRuntime.js" -Pattern "assertRuntimeConfigShape(PROD_FALLBACK_CONFIG, ""local fallback"")" -Label "runtime local fallback shape check"
Assert-Contains -Path "public/src/services/firebaseRuntime.js" -Pattern '"appId"' -Label "runtime appId key"
Assert-Contains -Path "public/src/services/firebaseRuntime.js" -Pattern '"measurementId"' -Label "runtime measurementId key"

# 3) Staging-only boundary guard must be present in runtime.
Assert-Contains -Path "public/src/app.js" -Pattern "IS_STAGING_RUNTIME" -Label "runtime staging boundary flag"
Assert-Contains -Path "public/src/app.js" -Pattern "addRoleButton(""Catalog Sync Admin""" -Label "catalog button declaration"
Assert-Contains -Path "public/src/app.js" -Pattern "if (IS_STAGING_RUNTIME)" -Label "catalog button staging-only guard"
Assert-Contains -Path "public/src/app.js" -Pattern "if (!IS_STAGING_RUNTIME)" -Label "restore-view prod fallback guard"

# 4) Production hard guard in html entrypoint must exist.
Assert-Contains -Path "public/index.html" -Pattern "isProdHost" -Label "index prod host gate"
Assert-Contains -Path "public/index.html" -Pattern "label === ""catalog sync admin""" -Label "index removes staging-only entry in prod"

Write-Host "All runtime parity/boundary checks passed."
