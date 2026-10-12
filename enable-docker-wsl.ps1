$ErrorActionPreference = 'Continue'
$log = Join-Path (Get-Location) 'docker-wsl-setup.log'
"Started: $(Get-Date -Format o)" | Set-Content -LiteralPath $log
try {
  $feature = Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart -ErrorAction Stop
  "Feature: $($feature.State); RestartNeeded: $($feature.RestartNeeded)" | Add-Content -LiteralPath $log
} catch { "FeatureError: $_" | Add-Content -LiteralPath $log }
try {
  $wslOutput = & wsl.exe --install --no-distribution 2>&1
  "WSLExitCode: $LASTEXITCODE" | Add-Content -LiteralPath $log
  $wslOutput | Out-String | Add-Content -LiteralPath $log
} catch { "WSLError: $_" | Add-Content -LiteralPath $log }
"Finished: $(Get-Date -Format o)" | Add-Content -LiteralPath $log
