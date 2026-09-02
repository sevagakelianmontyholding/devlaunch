# DevLaunch

A local developer command center for macOS. One Next.js app running on your Mac that shows every registered project with its Docker Compose status, starts and stops services, opens folders in VS Code, and deploys to your own servers over SSH with one click.

Everything lives on this Mac. There is no cloud and no scanning: projects are only what you add, and DevLaunch only runs the commands you configure. A local account (created on first run) protects the UI, with an optional 4-digit passphrase on Deploy.

## Requirements

- macOS with Node.js 22+ and npm
- Docker Desktop (for Compose controls and image builds)
- Visual Studio Code (for the Code button)

## Install

```bash
git clone <this repo> devlaunch
cd devlaunch
npm ci
npm run build
npm run service:install
```

`service:install` registers a LaunchAgent that starts DevLaunch at login on `http://127.0.0.1:3000`. Open that URL, or put it behind your reverse proxy (see below).

Optional settings go in `.env` (copy `.env.example`): the port, and where the data folder lives.

## Update

```bash
git pull
npm ci
npm run build
npm run service:install
```

## Uninstall

```bash
npm run service:uninstall
```

The `data/` folder (database and SSH keys) is left in place; delete it yourself if you want a clean slate.

## Serving it as devlaunch.localhost

If Nginx Proxy Manager (or any reverse proxy) runs in Docker, add a proxy host for `devlaunch.localhost` that forwards to `host.docker.internal` on port `3000` over HTTP. `host.docker.internal` is how a container reaches the Mac itself.

## Local commands

Per project you set an optional **compose file** (relative path) and optional **start / stop / restart / rebuild commands**. With a compose file, the defaults are `docker compose -f <file> up -d`, `stop`, `restart`, and `up -d --build`; a custom command replaces the default for that action. Commands run in the project folder with your login shell. Nothing is detected automatically.

## Deployments

1. **Settings → Deploy servers → Add server**: name, host, SSH user, and the private key (paste it). Use **Test** to confirm SSH and Docker work on the server.
2. **Project → Deployments → Add**: pick the server and a mode:
   - **Image push** builds a Docker image locally, ships it over SSH (`docker save | ssh docker load`, no registry needed), then runs your commands.
   - **Commands only** just runs your commands on the server.
3. The commands are always yours — one per line, executed in order inside the project directory on the server, stopping at the first failure. Nothing runs automatically.

Click **Deploy** to run it; the log streams live and a running deployment can be stopped.

## Where things are stored

- `data/devlaunch.sqlite` — projects, servers, deployments, and the last ten runs per deployment
- `data/keys/` — server private keys, owner-only permissions

Both are git-ignored.

## Development

```bash
npm run dev
```
