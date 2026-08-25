# Builds the TraceRoute web app image locally, ships it to the Hetzner server, and starts it there —
# avoids building on the low-RAM server. Run from the repo root in PowerShell.
#
# One-time setup on the server, before the first deploy:
#   1. This repo must be `git clone`d into $ServerPath already (this script
#      runs `git pull` there, it doesn't clone).
#   2. Add the block from Caddyfile (this repo) into
#      ../feierblum-networking/Caddyfile on the server and reload it — this
#      stack joins that Caddy's "feierblum_default" network, it runs no
#      Caddy of its own (see docker-compose.yml).
#
# Usage: .\deploy.ps1

$ErrorActionPreference = "Stop"

$ServerUser = "root"
$ServerHost = "89.167.25.230"
$ServerPath = "/opt/TraceRoute"
$ImageName  = "traceroute-app:latest"
$TarFile    = "traceroute-app.tar"

function Invoke-Step {
    param([string]$Description, [scriptblock]$Command)
    Write-Host "==> $Description" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✘ Failed: $Description (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Invoke-Step "Pulling latest code" { git pull }
Invoke-Step "Building Docker image" { docker build -t $ImageName ./webapp }
Invoke-Step "Saving image to $TarFile" { docker save -o $TarFile $ImageName }
Invoke-Step "Copying to server" { scp $TarFile "${ServerUser}@${ServerHost}:${ServerPath}/" }
Invoke-Step "Loading image and restarting container on server" {
    # --force-recreate is required: `docker compose up -d` alone only
    # recreates a container when the *resolved compose config* changes, not
    # when a mutable tag like `traceroute-app:latest` starts pointing at
    # different image content — without it, `docker load` silently updates
    # the local image while the running container keeps serving the old one.
    ssh "${ServerUser}@${ServerHost}" "cd $ServerPath && git pull && docker load -i $TarFile && docker compose up -d --force-recreate && rm $TarFile"
}

if (Test-Path $TarFile) {
    Write-Host "==> Cleaning up local tar" -ForegroundColor Cyan
    Remove-Item $TarFile
}

Write-Host "==> Done — https://trace-route.workflowsolved.com" -ForegroundColor Green
