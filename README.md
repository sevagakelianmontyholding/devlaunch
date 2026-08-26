# DevLaunch

DevLaunch is a local developer command center built with Next.js, TypeScript, Tailwind CSS, Docker, and a small optional macOS companion agent.

The production frontend runs in Docker without publishing a host port. Nginx Proxy Manager reaches it through the existing external Docker network configured in `.env`. The companion agent remains on the Mac and provides access to local projects, Git, GitHub CLI accounts, Docker Compose, VS Code, and the native folder picker.

## Requirements

- macOS
- Docker Desktop with Docker Compose
- Node.js and npm
- An existing Nginx Proxy Manager Docker network, normally `npm`
- Visual Studio Code for the Code action
- GitHub CLI for private repository details

## Install on a new Mac

```bash
cp .env.example .env
```

Edit `.env` for that Mac, especially `DEVLAUNCH_PROJECTS_ROOT` and `DEVLAUNCH_NPM_DB`, then run:

```bash
./install.sh
```

The installer:

- verifies Docker and the existing external NPM network;
- builds the local agent;
- generates a machine-specific LaunchAgent outside the repository;
- starts the agent at login;
- builds and starts `docker-compose.prod.yml`;
- verifies that the agent and frontend container are running.

The installer never creates a replacement NPM network and never publishes frontend port 3000 to the host.

In Nginx Proxy Manager, create a proxy host with:

- Domain: `devlaunch.localhost`
- Scheme: `http`
- Forward hostname: the `DEVLAUNCH_CONTAINER_NAME` value
- Forward port: `3000`

## GitHub accounts

Authenticate every GitHub account used by local repository SSH aliases:

```bash
gh auth login --hostname github.com
```

DevLaunch resolves aliases such as `github-work` and `github-personal` through SSH and uses the matching GitHub CLI account per repository without globally switching accounts.

## Local data and privacy

No project catalog, personal path, GitHub token, SSH key, or generated LaunchAgent is committed to the repository.

- `.env` is ignored by Git.
- Project metadata stays in `DEVLAUNCH_DATABASE_PATH`.
- GitHub tokens stay in the macOS keychain through GitHub CLI.
- The generated service definition stays in `~/Library/LaunchAgents`.
- Agent logs stay in `~/Library/Logs/DevLaunch`.

The first run imports folders from `DEVLAUNCH_PROJECTS_ROOT`. Add/Edit Project can then use automatic Git repository detection or an explicit selection of Root, frontend, backend, and other detected repository folders.

## Production commands

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
docker compose --env-file .env -f docker-compose.prod.yml logs -f
docker compose --env-file .env -f docker-compose.prod.yml down
```

After changing agent source:

```bash
cd agent
npm ci
npm run build
launchctl kickstart -k gui/$(id -u)/com.devlaunch.agent
```

## Uninstall

```bash
./uninstall.sh
```

The uninstall script removes the frontend container and LaunchAgent but preserves `.env` and the local project database.

## Local frontend development

```bash
cd frontend
npm ci
npm run dev
```
