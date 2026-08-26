#!/usr/bin/env bash

set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="${REPOSITORY_ROOT}/.env"
COMPOSE_FILE="${REPOSITORY_ROOT}/docker-compose.prod.yml"
AGENT_DIRECTORY="${REPOSITORY_ROOT}/agent"
PLIST_TEMPLATE="${AGENT_DIRECTORY}/launchd/com.devlaunch.agent.plist.template"
PLIST_PATH="${HOME}/Library/LaunchAgents/com.devlaunch.agent.plist"
LOG_DIRECTORY="${HOME}/Library/Logs/DevLaunch"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "DevLaunch's local companion agent currently requires macOS."
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${REPOSITORY_ROOT}/.env.example" "${ENV_FILE}"
  echo "Created ${ENV_FILE}"
  echo "Review its paths, then run ./install.sh again."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

DEVLAUNCH_NPM_NETWORK="${DEVLAUNCH_NPM_NETWORK:-npm}"
DEVLAUNCH_AGENT_PORT="${DEVLAUNCH_AGENT_PORT:-47821}"
DEVLAUNCH_PROJECTS_ROOT="${DEVLAUNCH_PROJECTS_ROOT:-${HOME}/projects}"
DEVLAUNCH_DATABASE_PATH="${DEVLAUNCH_DATABASE_PATH:-${HOME}/Library/Application Support/DevLaunch/devlaunch.sqlite}"
DEVLAUNCH_NPM_DB="${DEVLAUNCH_NPM_DB:-${HOME}/projects/nginx-proxy-manager/data/database.sqlite}"

required_commands=(node npm docker curl)
missing_commands=()
for command_name in "${required_commands[@]}"; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    missing_commands+=("${command_name}")
  fi
done
if (( ${#missing_commands[@]} > 0 )); then
  echo "Missing required commands: ${missing_commands[*]}"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but is not running. Start Docker Desktop and try again."
  exit 1
fi

if ! docker network inspect "${DEVLAUNCH_NPM_NETWORK}" >/dev/null 2>&1; then
  echo "The external Docker network '${DEVLAUNCH_NPM_NETWORK}' does not exist."
  echo "Start your existing Nginx Proxy Manager stack before installing DevLaunch."
  exit 1
fi

if [[ ! -d "${DEVLAUNCH_PROJECTS_ROOT}" ]]; then
  echo "Projects root does not exist: ${DEVLAUNCH_PROJECTS_ROOT}"
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Warning: GitHub CLI is not installed. GitHub details will stay offline until it is installed."
fi

echo "Building the local companion agent..."
(cd "${AGENT_DIRECTORY}" && npm ci && npm run build)

mkdir -p "$(dirname "${DEVLAUNCH_DATABASE_PATH}")" "${LOG_DIRECTORY}" "$(dirname "${PLIST_PATH}")"

xml_escape() {
  printf '%s' "$1" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e 's/"/\&quot;/g' \
    -e "s/'/\&apos;/g"
}

NODE_PATH="$(command -v node)"
NODE_DIRECTORY="$(dirname "${NODE_PATH}")"
AGENT_PATH="${NODE_DIRECTORY}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PLIST_CONTENT="$(<"${PLIST_TEMPLATE}")"
PLIST_CONTENT="${PLIST_CONTENT//__NODE_PATH__/$(xml_escape "${NODE_PATH}")}"
PLIST_CONTENT="${PLIST_CONTENT//__AGENT_ENTRY__/$(xml_escape "${AGENT_DIRECTORY}/dist/index.js")}"
PLIST_CONTENT="${PLIST_CONTENT//__AGENT_DIRECTORY__/$(xml_escape "${AGENT_DIRECTORY}")}"
PLIST_CONTENT="${PLIST_CONTENT//__AGENT_PATH__/$(xml_escape "${AGENT_PATH}")}"
PLIST_CONTENT="${PLIST_CONTENT//__PROJECTS_ROOT__/$(xml_escape "${DEVLAUNCH_PROJECTS_ROOT}")}"
PLIST_CONTENT="${PLIST_CONTENT//__DATABASE_PATH__/$(xml_escape "${DEVLAUNCH_DATABASE_PATH}")}"
PLIST_CONTENT="${PLIST_CONTENT//__AGENT_PORT__/$(xml_escape "${DEVLAUNCH_AGENT_PORT}")}"
PLIST_CONTENT="${PLIST_CONTENT//__NPM_DATABASE_PATH__/$(xml_escape "${DEVLAUNCH_NPM_DB}")}"
PLIST_CONTENT="${PLIST_CONTENT//__LOG_PATH__/$(xml_escape "${LOG_DIRECTORY}/agent.log")}"
PLIST_CONTENT="${PLIST_CONTENT//__ERROR_LOG_PATH__/$(xml_escape "${LOG_DIRECTORY}/agent.error.log")}"
printf '%s\n' "${PLIST_CONTENT}" > "${PLIST_PATH}"
plutil -lint "${PLIST_PATH}" >/dev/null

USER_ID="$(id -u)"
launchctl bootout "gui/${USER_ID}/com.devlaunch.agent" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${USER_ID}" "${PLIST_PATH}"
launchctl kickstart -k "gui/${USER_ID}/com.devlaunch.agent"

echo "Waiting for the local companion agent..."
agent_ready=false
for _attempt in {1..20}; do
  if curl --silent --fail --max-time 2 "http://127.0.0.1:${DEVLAUNCH_AGENT_PORT}/health" >/dev/null; then
    agent_ready=true
    break
  fi
  sleep 1
done
if [[ "${agent_ready}" != "true" ]]; then
  echo "The agent did not become ready. Check ${LOG_DIRECTORY}/agent.error.log"
  exit 1
fi

echo "Building and starting the production frontend..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --build

container_name="${DEVLAUNCH_CONTAINER_NAME:-devlaunch-frontend}"
container_state="$(docker inspect --format '{{.State.Status}}' "${container_name}" 2>/dev/null || true)"
if [[ "${container_state}" != "running" ]]; then
  echo "Frontend container is not running. Check: docker compose -f docker-compose.prod.yml logs"
  exit 1
fi

echo
echo "DevLaunch installed successfully."
echo "Agent: http://127.0.0.1:${DEVLAUNCH_AGENT_PORT}"
echo "Container: ${container_name} (${container_state})"
echo "Network: ${DEVLAUNCH_NPM_NETWORK} (external)"
echo
echo "In Nginx Proxy Manager, point devlaunch.localhost to ${container_name}:3000 using HTTP."
