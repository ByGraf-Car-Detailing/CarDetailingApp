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

function Test-NotPlaceholder {
  param([string]$Value)
  return ($Value -and $Value.Trim().Length -gt 0 -and $Value -notmatch '^(N/A|TBD|placeholder|none|unknown)$')
}

function Test-SessionIdFormat {
  param([string]$Value)
  return ($Value -match '^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
}

if (-not $CodexSessionId -or -not $ClaudeSessionId) {
  if (-not $env:CODEX_THREAD_ID) {
    throw "SESSION_ID_SOURCE_MISSING: CODEX_THREAD_ID is required when session ids are not explicitly provided."
  }
  $CodexSessionId = $env:CODEX_THREAD_ID
  $ClaudeSessionId = $env:CODEX_THREAD_ID
}

if ($CodexSessionId -ne $ClaudeSessionId) {
  throw "SESSION_BINDING_MISMATCH: codex_session_id must equal claude_session_id."
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
  throw "codex_session_id is invalid. Must be UUID."
}
if (-not (Test-SessionIdFormat -Value $ClaudeSessionId)) {
  throw "claude_session_id is invalid. Must be UUID."
}

$body = @"
## Summary
- $Summary

## Coworking Trace (Mandatory)
- codex_session_id: $CodexSessionId
- claude_session_id: $ClaudeSessionId
- binding_source: CODEX_THREAD_ID
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
