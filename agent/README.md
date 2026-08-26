# DevLaunch local companion agent

The agent is a loopback-only macOS service that gives the Dockerized frontend controlled access to local developer functionality.

It provides:

- the local SQLite project catalog;
- Git repository and working-tree status;
- GitHub CLI repository information;
- Docker and Docker Compose status, controls, and logs;
- Nginx Proxy Manager route discovery;
- VS Code launch and native folder selection.

Install it through the repository root:

```bash
cp .env.example .env
./install.sh
```

The installer generates `~/Library/LaunchAgents/com.devlaunch.agent.plist` from the committed template. No machine-specific plist is stored in the repository.

## Development

```bash
npm ci
npm run dev
```

Build and restart the installed service:

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.devlaunch.agent
```

Configuration comes from the root `.env` file when the service is installed:

- `DEVLAUNCH_PROJECTS_ROOT`
- `DEVLAUNCH_DATABASE_PATH`
- `DEVLAUNCH_AGENT_PORT`
- `DEVLAUNCH_NPM_DB`

The agent binds to `127.0.0.1` and is reached by the frontend through `host.docker.internal`.
