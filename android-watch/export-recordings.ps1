param(
    [Parameter(Mandatory = $true)][string]$Destination,
    [string]$Serial,
    [string]$Adb = (Join-Path $env:TEMP 'codex-adb-check\platform-tools\adb.exe')
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Adb)) { throw 'Set -Adb to your platform-tools/adb.exe.' }
if (-not $Serial) {
    $watchDevices = @(& $Adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '^\S+\s+device$' })
    if ($watchDevices.Count -ne 1) { throw 'Specify -Serial when there is not exactly one authorized device.' }
    $Serial = ($watchDevices[0] -split '\s+')[0]
}
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
& $Adb -s $Serial pull '/sdcard/Android/data/world.hotpoor.sayagain.watch/files/sessions' $Destination
if ($LASTEXITCODE -ne 0) { throw 'Export failed. Check the device and app storage access.' }
Write-Output 'In SayAgain, choose 导入手表录音 and select the session manifest.json.'
