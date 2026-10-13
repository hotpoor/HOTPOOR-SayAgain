param(
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$ToolsRoot = 'J:\codex_projects\.tools\android-watch'
)
$ErrorActionPreference = 'Stop'
if (-not $JavaHome) {
    $watchJavac = Get-ChildItem -LiteralPath $ToolsRoot -Filter javac.exe -File -Recurse | Select-Object -First 1
    if ($watchJavac) { $JavaHome = Split-Path (Split-Path $watchJavac.FullName -Parent) -Parent }
}
$watchRoot = Split-Path $PSScriptRoot -Parent
$watchClasses = Join-Path $watchRoot 'build\summary-test-classes'
$resolvedClasses = [IO.Path]::GetFullPath($watchClasses)
$resolvedBuildRoot = [IO.Path]::GetFullPath((Join-Path $watchRoot 'build')) + [IO.Path]::DirectorySeparatorChar
if (-not $resolvedClasses.StartsWith($resolvedBuildRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Test cleanup escaped build directory' }
if (Test-Path -LiteralPath $resolvedClasses) { Remove-Item -LiteralPath $resolvedClasses -Recurse -Force }
New-Item -ItemType Directory -Path $resolvedClasses -Force | Out-Null
$watchSource = Join-Path $watchRoot 'app\src\main\java\world\hotpoor\sayagain\watch'
$sources = @('WavFile.java', 'SessionStore.java', 'SyncReceipts.java', 'LocalSummary.java') | ForEach-Object { Join-Path $watchSource $_ }
& (Join-Path $JavaHome 'bin\javac.exe') -encoding UTF-8 -source 8 -target 8 '-Xlint:-options' -d $watchClasses @sources (Join-Path $PSScriptRoot 'WatchSummaryTest.java')
if ($LASTEXITCODE -ne 0) { throw "Summary test compilation failed ($LASTEXITCODE)" }
& (Join-Path $JavaHome 'bin\java.exe') -cp $watchClasses world.hotpoor.sayagain.watch.WatchSummaryTest
if ($LASTEXITCODE -ne 0) { throw "Summary tests failed ($LASTEXITCODE)" }
