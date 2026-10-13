param(
    [string]$ToolsRoot = 'J:\codex_projects\.tools\android-watch',
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$SdkRoot = $env:ANDROID_SDK_ROOT
)
$ErrorActionPreference = 'Stop'
$watchRoot = $PSScriptRoot
if (-not $JavaHome) {
    $watchJavac = Get-ChildItem -LiteralPath $ToolsRoot -Filter javac.exe -File -Recurse | Select-Object -First 1
    if ($watchJavac) { $JavaHome = Split-Path (Split-Path $watchJavac.FullName -Parent) -Parent }
}
if (-not $SdkRoot) { $SdkRoot = Join-Path $ToolsRoot 'sdk' }
$androidJar = Join-Path $SdkRoot 'platforms\android-35\android.jar'
$buildTools = Join-Path $SdkRoot 'build-tools\35.0.0'
foreach ($required in @((Join-Path $JavaHome 'bin\javac.exe'), $androidJar, (Join-Path $buildTools 'aapt2.exe'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing build dependency: $required. See android-watch/README.md." }
}
function Invoke-WatchTool([string]$Program, [string[]]$ToolArgs) {
    & $Program @ToolArgs
    if ($LASTEXITCODE -ne 0) { throw "Build tool failed ($LASTEXITCODE): $Program" }
}
$watchBuild = Join-Path $watchRoot 'build'
$watchClasses = Join-Path $watchBuild 'classes'
$watchGenerated = Join-Path $watchBuild 'generated'
$watchDex = Join-Path $watchBuild 'dex'
# Never reuse stale classes from an earlier source version.
foreach ($target in @($watchClasses, $watchGenerated, $watchDex)) {
    $resolvedTarget = [IO.Path]::GetFullPath($target)
    $resolvedRoot = [IO.Path]::GetFullPath($watchBuild) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedTarget.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Build cleanup escaped output directory' }
    if (Test-Path -LiteralPath $resolvedTarget) { Remove-Item -LiteralPath $resolvedTarget -Recurse -Force }
    New-Item -ItemType Directory -Path $resolvedTarget -Force | Out-Null
}
$watchManifest = Join-Path $watchBuild 'AndroidManifest.xml'
[xml]$watchXml = Get-Content -LiteralPath (Join-Path $watchRoot 'app\src\main\AndroidManifest.xml') -Raw
$watchXml.manifest.SetAttribute('package', 'world.hotpoor.sayagain.watch')
$androidNs = 'http://schemas.android.com/apk/res/android'
$watchXml.manifest.SetAttribute('versionCode', $androidNs, '4') | Out-Null
$watchXml.manifest.SetAttribute('versionName', $androidNs, '0.3.1') | Out-Null
$watchSdk = $watchXml.CreateElement('uses-sdk')
$watchSdk.SetAttribute('minSdkVersion', $androidNs, '26') | Out-Null
$watchSdk.SetAttribute('targetSdkVersion', $androidNs, '35') | Out-Null
$watchXml.manifest.PrependChild($watchSdk) | Out-Null
$watchXml.Save($watchManifest)
$aapt = Join-Path $buildTools 'aapt2.exe'
$compiledResources = Join-Path $watchBuild 'resources.zip'
Invoke-WatchTool $aapt @('compile', '--dir', (Join-Path $watchRoot 'app\src\main\res'), '-o', $compiledResources)
$watchUnsigned = Join-Path $watchBuild 'unsigned.apk'
Invoke-WatchTool $aapt @('link', '-I', $androidJar, '--manifest', $watchManifest, '--java', $watchGenerated, '-o', $watchUnsigned, $compiledResources)
$watchSources = @(Get-ChildItem -LiteralPath (Join-Path $watchRoot 'app\src\main\java'), $watchGenerated -Filter '*.java' -Recurse -File | ForEach-Object { $_.FullName })
Invoke-WatchTool (Join-Path $JavaHome 'bin\javac.exe') (@('-encoding', 'UTF-8', '-source', '8', '-target', '8', '-Xlint:-options', '-classpath', $androidJar, '-d', $watchClasses) + $watchSources)
$watchClassJar = Join-Path $watchBuild 'classes.jar'
Invoke-WatchTool (Join-Path $JavaHome 'bin\jar.exe') @('cf', $watchClassJar, '-C', $watchClasses, '.')
Invoke-WatchTool (Join-Path $JavaHome 'bin\java.exe') @('-cp', (Join-Path $buildTools 'lib\d8.jar'), 'com.android.tools.r8.D8', '--lib', $androidJar, '--min-api', '26', '--output', $watchDex, $watchClassJar)
Invoke-WatchTool (Join-Path $JavaHome 'bin\jar.exe') @('uf', $watchUnsigned, '-C', $watchDex, 'classes.dex')
$watchAligned = Join-Path $watchBuild 'aligned.apk'
Invoke-WatchTool (Join-Path $buildTools 'zipalign.exe') @('-f', '4', $watchUnsigned, $watchAligned)
$watchKey = Join-Path $watchBuild 'debug.keystore'
if (-not (Test-Path -LiteralPath $watchKey)) {
    Invoke-WatchTool (Join-Path $JavaHome 'bin\keytool.exe') @('-genkeypair', '-keystore', $watchKey, '-storepass', 'android', '-keypass', 'android', '-alias', 'androiddebugkey', '-dname', 'CN=Android Debug,O=Android,C=US', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000')
}
$watchApk = Join-Path $watchBuild 'sayagain-watch-debug.apk'
Invoke-WatchTool (Join-Path $JavaHome 'bin\java.exe') @('-jar', (Join-Path $buildTools 'lib\apksigner.jar'), 'sign', '--ks', $watchKey, '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', $watchApk, $watchAligned)
Invoke-WatchTool (Join-Path $JavaHome 'bin\java.exe') @('-jar', (Join-Path $buildTools 'lib\apksigner.jar'), 'verify', '--verbose', $watchApk)
Write-Output "APK: $watchApk"
