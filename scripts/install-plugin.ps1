# Installs (copies) the plugin into the local UlanziDeck Plugins folder, then you can
# restart Ulanzi Studio to load it. Run from the repo root: npm run install:plugin
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot '..\plugin\com.ulanzi.claudelauncher.ulanziPlugin'
$src = (Resolve-Path $src).Path
$dest = Join-Path $env:APPDATA 'Ulanzi\UlanziDeck\Plugins\com.ulanzi.claudelauncher.ulanziPlugin'

if (-not (Test-Path (Split-Path $dest))) {
  Write-Error "UlanziDeck Plugins folder not found at $(Split-Path $dest). Is Ulanzi Studio installed?"
}
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Copy-Item $src $dest -Recurse -Force
Write-Host "Installed -> $dest"
Write-Host "Now fully quit and reopen Ulanzi Studio to load the plugin."
