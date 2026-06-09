# Builds an importable Ulanzi Dial profile (.ulanziDeckProfile) that pre-places the Window
# Control actions: knob = Window Switcher; keys = Window Filter + a komorebi cluster.
#
# A .ulanziDeckProfile is a "#Version: 2" header line followed by a ZIP of a <guid>.ulanziProfile
# folder (root manifest + Profiles/<page>/manifest.json + Files/ + Images/ + translator.json + icon).
# Import it in Ulanzi Studio (with the Dial selected). Run: powershell -File scripts\build-profile.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pluginIcon = Join-Path $root 'plugin\com.ulanzi.windowcontrol.ulanziPlugin\resources\pluginIcon.png'
$outDir = Join-Path $root 'profiles'
$dialUuid = '425031523436350E01061C365603E778'   # the user's Ulanzi Dial (from device_source.json)

$P = "com.ulanzi.ulanzistudio.windowcontrol"
function Guid { [guid]::NewGuid().ToString() }
function Key($action, $name, $param, $view) {
  [ordered]@{
    Action = "$P.$action"; ActionID = (Guid); ActionParam = $param; LinkedTitle = $true;
    Name = $name; Plugin = @{}; State = 0; ViewParam = @(@{ IconRel = ''; Name = $view })
  }
}

$page = Guid
$profileGuid = Guid
$profileFolder = "$profileGuid.ulanziProfile"

# the dial: Encoder slot 0_2 = knob; Keypad slots 0_0..2_1 = the 7 buttons
$encoder = [ordered]@{ Type = 'Encoder'; Actions = [ordered]@{
  '0_2' = (Key 'switcher' 'Window Switcher' (@{}) 'Windows')
} }
$keypad = [ordered]@{ Type = 'Keypad'; Actions = [ordered]@{
  '0_0' = (Key 'filter'  'Window Filter'    (@{})                              'Filter')
  '0_1' = (Key 'komocmd' 'komorebi Command' (@{ komoCmd = 'retile' })          'komorebi')
  '1_0' = (Key 'komocmd' 'komorebi Command' (@{ komoCmd = 'toggle-float' })    'komorebi')
  '1_1' = (Key 'komocmd' 'komorebi Command' (@{ komoCmd = 'toggle-pause' })    'komorebi')
  '1_2' = (Key 'komocmd' 'komorebi Command' (@{ komoCmd = 'toggle-monocle' })  'komorebi')
  '2_0' = (Key 'komocmd' 'komorebi Command' (@{ komoCmd = 'change-layout grid' }) 'komorebi')
  '2_1' = (Key 'komocmd' 'komorebi Command' (@{ komoCmd = 'change-layout bsp' })  'komorebi')
} }
$pageManifest = [ordered]@{ Controllers = @($encoder, $keypad); Icon = ''; Name = '' }
$rootManifest = [ordered]@{
  Device = [ordered]@{ Model = 'Dial'; UUID = $dialUuid }
  Icon = 'icon.png'; Name = 'Window Control'
  Pages = [ordered]@{ Current = $page; Pages = @($page) }
  Version = '2.0'
}

# stage the folder tree (repo-local temp so it works under a restricted sandbox)
$stage = Join-Path $root '.tmp_profile'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
$pdir = Join-Path $stage $profileFolder
$pages = Join-Path $pdir "Profiles\$page"
New-Item -ItemType Directory -Force -Path (Join-Path $pages 'Files'), (Join-Path $pages 'Images') | Out-Null
$rootManifest | ConvertTo-Json -Depth 12 -Compress | Set-Content (Join-Path $pdir 'manifest.json') -Encoding UTF8
$pageManifest | ConvertTo-Json -Depth 12 -Compress | Set-Content (Join-Path $pages 'manifest.json') -Encoding UTF8
'{}' | Set-Content (Join-Path $pdir 'translator.json') -Encoding UTF8
if (Test-Path $pluginIcon) { Copy-Item $pluginIcon (Join-Path $pdir 'icon.png') -Force }

# zip the folder (so the .ulanziProfile dir is at the zip root), then prepend the version header
$zip = Join-Path $stage 'p.zip'
Compress-Archive -Path $pdir -DestinationPath $zip -Force
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir 'Window-Control.ulanziDeckProfile'
$header = [System.Text.Encoding]::UTF8.GetBytes("#Version: 2`r`n")
$zipBytes = [System.IO.File]::ReadAllBytes($zip)
[System.IO.File]::WriteAllBytes($out, $header + $zipBytes)
Remove-Item $stage -Recurse -Force

Write-Host "Built -> $out"
Write-Host "Profile GUID $profileGuid / page $page  (Device Model=Dial)"
