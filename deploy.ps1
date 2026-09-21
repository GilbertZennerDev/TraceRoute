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
Invoke-Step "Building Docker image" {
    # --pull refreshes base layers so a stale local cache doesn't silently
    # skip security patches.
    docker build --pull -t $ImageName ./webapp
}
Invoke-Step "Deploying to server" {
    # Streams the image straight into the server's Docker daemon over SSH —
    # no local .tar file and no separate scp hop. --force-recreate is
    # required: `docker compose up -d` alone only recreates a container when
    # the *resolved compose config* changes, not when a mutable tag like
    # `traceroute-app:latest` starts pointing at different image content.
    # `docker image prune -f` clears the now-dangling previous `:latest`
    # layer so repeated deploys don't slowly fill the server's disk.
    docker save $ImageName | ssh "${ServerUser}@${ServerHost}" "cd $ServerPath && git pull && docker load && docker compose up -d --force-recreate && docker image prune -f"
}

Write-Host "==> Done — https://trace-route.workflowsolved.com" -ForegroundColor Green
