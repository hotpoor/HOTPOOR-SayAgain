param(
    [string]$HostName = '122.51.169.191',
    [string]$UserName = 'ubuntu',
    [string]$IdentityFile = 'J:\codex_projects\.secrets\xialiwei0.pem'
)
$ErrorActionPreference = 'Stop'
$watchRelease = Join-Path $PSScriptRoot 'build\release'
$watchManifest = Get-Content -LiteralPath (Join-Path $watchRelease 'stable.json') -Raw | ConvertFrom-Json
$watchVersion = $watchManifest.version_name
if ($watchVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version' }
$watchApk = Join-Path $watchRelease ('sayagain-watch-' + $watchVersion + '.apk')
if ((Get-FileHash -LiteralPath $watchApk -Algorithm SHA256).Hash.ToLowerInvariant() -ne $watchManifest.sha256) { throw 'APK SHA256 mismatch' }
$watchStage = '/home/ubuntu/sayagain-update-stage-' + [guid]::NewGuid().ToString('N')
$watchTarget = $UserName + '@' + $HostName
$watchSshArgs = @('-i', $IdentityFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes')
& ssh @watchSshArgs $watchTarget "mkdir -m 700 $watchStage"
if ($LASTEXITCODE -ne 0) { throw 'Cannot create release staging directory' }
& scp @watchSshArgs $watchApk (Join-Path $watchRelease 'stable.json') (Join-Path $PSScriptRoot 'deploy-update.py') ($watchTarget + ':' + $watchStage + '/')
if ($LASTEXITCODE -ne 0) { throw 'Release upload failed' }
& ssh @watchSshArgs $watchTarget "sudo -n python3 $watchStage/deploy-update.py $watchStage"
if ($LASTEXITCODE -ne 0) { throw 'Release deployment failed' }
$watchOnline = Invoke-RestMethod -Uri 'https://api.xialiwei.com/hotpoor/sayagain/updates/android-watch/stable.json' -TimeoutSec 20
if ($watchOnline.sha256 -ne $watchManifest.sha256 -or $watchOnline.version_code -ne $watchManifest.version_code) { throw 'Public manifest verification failed' }
$watchDownloaded = Join-Path $PSScriptRoot 'build\published-verification.apk'
Invoke-WebRequest -Uri $watchOnline.apk_url -OutFile $watchDownloaded -TimeoutSec 30
if ((Get-FileHash -LiteralPath $watchDownloaded -Algorithm SHA256).Hash.ToLowerInvariant() -ne $watchManifest.sha256) { throw 'Public APK verification failed' }
Write-Output ('Public download verified: ' + $watchOnline.version_name)
