param(
  [string]$DeployHost = $env:DOCS_DEPLOY_HOST,
  [string]$DeployUser = $env:DOCS_DEPLOY_USER,
  [string]$DeployPath = $(if ($env:DOCS_DEPLOY_PATH) { $env:DOCS_DEPLOY_PATH } else { '/var/www/vhosts/my-mik.de/cmh-chatbot.my-mik.de' }),
  [int]$DeployPort = $(if ($env:DOCS_DEPLOY_PORT) { [int]$env:DOCS_DEPLOY_PORT } else { 22 }),
  [string]$SshKeyPath = $env:DOCS_DEPLOY_SSH_KEY_PATH,
  [switch]$RunOnce,
  [switch]$NoCleanRemote
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$docsPath = Join-Path $repoRoot 'docs'
$distPath = Join-Path $repoRoot 'docs\.vitepress\dist'

function Assert-Config {
  if ([string]::IsNullOrWhiteSpace($DeployHost) -or [string]::IsNullOrWhiteSpace($DeployUser) -or [string]::IsNullOrWhiteSpace($DeployPath)) {
    throw "Missing deploy config. Required: DOCS_DEPLOY_HOST, DOCS_DEPLOY_USER, DOCS_DEPLOY_PATH"
  }

  if ($SshKeyPath -and -not (Test-Path $SshKeyPath)) {
    throw "SSH key file not found: $SshKeyPath"
  }
}

function Get-SshArgs {
  $args = @('-p', "$DeployPort")
  if (-not [string]::IsNullOrWhiteSpace($SshKeyPath)) {
    $args += @('-i', $SshKeyPath)
  }
  return $args
}

function Invoke-Deploy {
  Write-Host "[docs-auto-deploy] Building docs..."
  & pnpm --dir $repoRoot run docs:build
  if ($LASTEXITCODE -ne 0) {
    throw "docs:build failed"
  }

  if (-not (Test-Path $distPath)) {
    throw "Dist not found: $distPath"
  }

  $sshArgs = Get-SshArgs
  $remote = "$DeployUser@$DeployHost"

  Write-Host "[docs-auto-deploy] Ensuring remote path..."
  & ssh @sshArgs $remote "mkdir -p '$DeployPath'"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create remote path"
  }

  if (-not $NoCleanRemote) {
    Write-Host "[docs-auto-deploy] Cleaning remote path..."
    & ssh @sshArgs $remote "find '$DeployPath' -mindepth 1 -delete"
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to clean remote path"
    }
  }

  Write-Host "[docs-auto-deploy] Uploading dist..."
  $scpArgs = @('-P', "$DeployPort")
  if (-not [string]::IsNullOrWhiteSpace($SshKeyPath)) {
    $scpArgs += @('-i', $SshKeyPath)
  }

  $uploadSource = Join-Path $distPath '*'
  & scp @scpArgs -r $uploadSource "$remote`:$DeployPath/"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload dist files"
  }

  Write-Host "[docs-auto-deploy] Deploy completed." -ForegroundColor Green
}

function Start-Watch {
  $fsw = New-Object System.IO.FileSystemWatcher
  $fsw.Path = $docsPath
  $fsw.IncludeSubdirectories = $true
  $fsw.EnableRaisingEvents = $true
  $fsw.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, DirectoryName'

  $debounceMs = 1200
  $script:lastTrigger = [DateTime]::MinValue

  $onChange = {
    $now = Get-Date
    if (($now - $script:lastTrigger).TotalMilliseconds -lt $debounceMs) {
      return
    }
    $script:lastTrigger = $now

    try {
      Invoke-Deploy
    }
    catch {
      Write-Host "[docs-auto-deploy] ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
  }

  Register-ObjectEvent -InputObject $fsw -EventName Changed -Action $onChange | Out-Null
  Register-ObjectEvent -InputObject $fsw -EventName Created -Action $onChange | Out-Null
  Register-ObjectEvent -InputObject $fsw -EventName Deleted -Action $onChange | Out-Null
  Register-ObjectEvent -InputObject $fsw -EventName Renamed -Action $onChange | Out-Null

  Write-Host "[docs-auto-deploy] Watching: $docsPath"
  Write-Host "[docs-auto-deploy] Press Ctrl+C to stop."

  while ($true) {
    Start-Sleep -Seconds 1
  }
}

Assert-Config

if ($RunOnce) {
  Invoke-Deploy
  exit 0
}

Start-Watch
