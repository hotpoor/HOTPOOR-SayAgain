param([string]$JavaHome = $env:JAVA_HOME, [string]$ToolsRoot = 'J:\codex_projects\.tools\android-watch')
$ErrorActionPreference = 'Stop'
if (-not $JavaHome) {
    $watchJavac = Get-ChildItem -LiteralPath $ToolsRoot -Filter javac.exe -File -Recurse | Select-Object -First 1
    $JavaHome = Split-Path (Split-Path $watchJavac.FullName -Parent) -Parent
}
$watchRoot = Split-Path $PSScriptRoot -Parent
$watchClasses = Join-Path $watchRoot 'build\update-test-classes'
New-Item -ItemType Directory -Path $watchClasses -Force | Out-Null
$watchSource = Join-Path $watchRoot 'app\src\main\java\world\hotpoor\sayagain\watch'
$sources = @('WavFile.java', 'SessionStore.java', 'UpdateRelease.java') | ForEach-Object { Join-Path $watchSource $_ }
& (Join-Path $JavaHome 'bin\javac.exe') -encoding UTF-8 -source 8 -target 8 '-Xlint:-options' -d $watchClasses @sources (Join-Path $PSScriptRoot 'WatchUpdateTest.java')
if ($LASTEXITCODE -ne 0) { throw 'Update test compilation failed' }
& (Join-Path $JavaHome 'bin\java.exe') -cp $watchClasses world.hotpoor.sayagain.watch.WatchUpdateTest
if ($LASTEXITCODE -ne 0) { throw 'Update tests failed' }
