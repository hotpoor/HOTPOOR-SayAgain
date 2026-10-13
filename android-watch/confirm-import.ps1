param(
    [string]$DataDirectory = (Join-Path $env:APPDATA 'HOTPOOR SayAgain\data'),
    [string]$Serial,
    [string]$Adb = (Join-Path $env:TEMP 'codex-adb-check\platform-tools\adb.exe'),
    [string]$Node
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Adb)) { throw 'Set -Adb to platform-tools/adb.exe.' }
if (-not $Serial) {
    $receiptDevices = @(& $Adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '^\S+\s+device$' })
    if ($receiptDevices.Count -ne 1) { throw 'Specify -Serial when there is not exactly one authorized device.' }
    $Serial = ($receiptDevices[0] -split '\s+')[0]
}
if (-not $Node) {
    $bundledReceiptNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $bundledReceiptNode) { $Node = $bundledReceiptNode }
    else { $Node = (Get-Command node -ErrorAction Stop).Source }
}
$receiptVersion = & $Node --version
if ($LASTEXITCODE -ne 0 -or $receiptVersion -notmatch '^v(\d+)\.(\d+)\.' -or [int]$Matches[1] -lt 22 -or ([int]$Matches[1] -eq 22 -and [int]$Matches[2] -lt 13)) { throw 'The receipt exporter needs Node >=22.13.' }
$receiptWork = Join-Path $env:TEMP ('sayagain-receipts-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $receiptWork | Out-Null
$receiptRemote = '/sdcard/Android/data/world.hotpoor.sayagain.watch/files/sync-receipts.json'
try {
    $receiptPrevious = Join-Path $receiptWork 'previous.json'
    $receiptOutput = Join-Path $receiptWork 'confirmed.json'
    $receiptScript = Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts\watch-receipts.cjs'
    $receiptArguments = @($receiptScript, '--data-dir', $DataDirectory, '--output', $receiptOutput)
    & $Adb -s $Serial shell test -f $receiptRemote
    if ($LASTEXITCODE -eq 0) {
        & $Adb -s $Serial pull $receiptRemote $receiptPrevious
        if ($LASTEXITCODE -ne 0) { throw 'Could not read previous watch receipts; they were not replaced.' }
        $receiptArguments += @('--merge', $receiptPrevious)
    }
    & $Node @receiptArguments
    if ($LASTEXITCODE -ne 0) { throw 'Receipt validation failed; no new confirmation was sent to the watch.' }
    & $Adb -s $Serial push $receiptOutput ($receiptRemote + '.tmp')
    if ($LASTEXITCODE -ne 0) { throw 'Receipt transfer failed.' }
    & $Adb -s $Serial shell mv ($receiptRemote + '.tmp') $receiptRemote
    if ($LASTEXITCODE -ne 0) { throw 'Could not activate the receipt file.' }
    Write-Output 'Confirmed client storage has been returned to the watch. The pending count refreshes in a few seconds.'
} finally {
    $receiptResolvedWork = [IO.Path]::GetFullPath($receiptWork)
    $receiptResolvedTemp = [IO.Path]::GetFullPath($env:TEMP) + [IO.Path]::DirectorySeparatorChar
    if ($receiptResolvedWork.StartsWith($receiptResolvedTemp, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $receiptResolvedWork -Leaf).StartsWith('sayagain-receipts-')) {
        Remove-Item -LiteralPath $receiptResolvedWork -Recurse -Force
    }
}
