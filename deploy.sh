#!/usr/bin/env bash
set -euo pipefail

IDENTITY_FILE="${IDENTITY_FILE:-$HOME/.ssh/pic_allier_id_rsa}"

step() {
    local desc="$1"; shift
    echo -e "\033[0;36m==> ${desc}\033[0m"
    if ! eval "$1"; then
        echo -e "\033[0;31m✘ Failed: ${desc}\033[0m" >&2
        exit 1
    fi
}

SERVER_USER="root"
SERVER_HOST="89.167.25.230"
SERVER_PATH="/opt/TraceRoute"
IMAGE_NAME="traceroute-app:latest"

step "Pulling latest code" 'git pull'
# matching-engine is a private repo the image's pip install clones from —
# passed to the build as a BuildKit secret (never baked into a layer),
# sourced from the local gh CLI's token so nothing is hardcoded here.
export GH_TOKEN="$(gh auth token)"
step "Building Docker image" 'docker build --pull --secret id=gh_token,env=GH_TOKEN -t "$IMAGE_NAME" ./webapp'
step "Deploying to server" 'docker save "$IMAGE_NAME" | ssh "${SERVER_USER}@${SERVER_HOST}" "cd $SERVER_PATH && git pull && docker load && docker compose up -d --force-recreate && docker image prune -f"'

echo -e "\033[0;32m==> Done — https://trace-route.workflowsolved.com\033[0m"
