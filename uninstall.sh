#!/usr/bin/env bash

set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="${REPOSITORY_ROOT}/.env"
COMPOSE_FILE="${REPOSITORY_ROOT}/docker-compose.prod.yml"
PLIST_PATH="${HOME}/Library/LaunchAgents/com.devlaunch.agent.plist"
USER_ID="$(id -u)"

if [[ -f "${ENV_FILE}" ]]; then
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" down
else
  docker compose -f "${COMPOSE_FILE}" down
fi

launchctl bootout "gui/${USER_ID}/com.devlaunch.agent" >/dev/null 2>&1 || true
rm -f "${PLIST_PATH}"

echo "DevLaunch frontend and local agent were removed."
echo "Your .env and local project database were preserved."
