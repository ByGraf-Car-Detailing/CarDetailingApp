param(
  [Parameter(Mandatory = $true)][string]$Summary,
  [Parameter(Mandatory = $true)][string]$Question,
  [Parameter(Mandatory = $true)][string]$OptionsConsidered,
  [Parameter(Mandatory = $true)][string]$Recommendation,
  [Parameter(Mandatory = $true)][string]$ResidualRisk,
  [string]$CodexSessionId,
  [string]$ClaudeSessionId,
  [int]$TimeoutMs = 600000,
  [string]$Validation = "quality=pending; validate-governance=pending; staging evidence=pending",
  [string]$RollbackNotes = "N/A",
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

function New-CsSessionId {
  return "CS-{0}" -f (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
}

function Test-NotPlaceholder {
  param([string]$Value)
  return ($Value -and $Value.Trim().Length -gt 0 -and $Value -notmatch '^(N/A|TBD|placeholder|none|unknown)$')
}

function Test-SessionIdFormat {
  param([string]$Value)
  return ($Value -match '^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|CS-\d{8}-\d{6})$')
}

if (-not $CodexSessionId) { $CodexSessionId = New-CsSessionId }
if (-not $ClaudeSessionId) { $ClaudeSessionId = New-CsSessionId }
if ($CodexSessionId -eq $ClaudeSessionId) {
  Start-Sleep -Seconds 1
  $ClaudeSessionId = New-CsSessionId
}

if ($TimeoutMs -lt 600000) {
  throw "timeout_ms must be >= 600000. Provided: $TimeoutMs"
}

$requiredValues = @{
  "Summary"            = $Summary
  "Question"           = $Question
  "OptionsConsidered"  = $OptionsConsidered
  "Recommendation"     = $Recommendation
  "ResidualRisk"       = $ResidualRisk
}

foreach ($entry in $requiredValues.GetEnumerator()) {
  if (-not (Test-NotPlaceholder -Value $entry.Value)) {
    throw "$($entry.Key) is empty or placeholder."
  }
}

if (-not (Test-SessionIdFormat -Value $CodexSessionId)) {
  throw "codex_session_id is invalid. Use UUID or CS-YYYYMMDD-HHMMSS."
}
if (-not (Test-SessionIdFormat -Value $ClaudeSessionId)) {
  throw "claude_session_id is invalid. Use UUID or CS-YYYYMMDD-HHMMSS."
}

$body = @"
## Summary
- $Summary

## Coworking Trace (Mandatory)
- codex_session_id: $CodexSessionId
- claude_session_id: $ClaudeSessionId
- timeout_ms: $TimeoutMs
- question: $Question
- options_considered: $OptionsConsidered
- recommendation: $Recommendation
- residual_risk: $ResidualRisk

## Validation
- $Validation

## Rollback
- rollback_notes: $RollbackNotes
"@

if ($OutputPath) {
  Set-Content -Path $OutputPath -Value $body -Encoding UTF8
  Write-Host "PR body generated at: $OutputPath"
} else {
  Write-Output $body
}
