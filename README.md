# DevLaunch

A local developer command center for macOS. One Next.js app running on your Mac that shows every registered project with its Docker Compose status, starts and stops services, opens folders in VS Code, and deploys to your own servers over SSH with one click.

Everything lives on this Mac. There is no cloud and no scanning: projects are only what you add, and DevLaunch only runs the commands you configure. A local account (created on first run) protects the UI, with an optional 4-digit passphrase on Deploy.

## Requirements

- macOS (Apple Silicon or Intel) with **Node.js 22+** and npm
- **Docker Desktop** — for Compose controls and image builds. On Apple Silicon, keep *Settings → General → Use Rosetta for x86_64/amd64 emulation* enabled so images for Intel servers build quickly.
- **Visual Studio Code** — for the Code button
- Access to this repository (it is private; ask to be added as a collaborator and sign in to `git`)

## Install on a Mac

```bash
git clone https://github.com/sevagakelianmontyholding/devlaunch.git ~/projects/devlaunch
cd ~/projects/devlaunch
npm ci
npm run build
npm run service:install
```

`service:install` registers a LaunchAgent that starts DevLaunch at login on `http://127.0.0.1:3000`. Open that URL.

Optional settings go in `.env` (copy `.env.example`): the port, and where the data folder lives.

## First run

1. **Create your account** — the first visit asks for a username and password. It lives only in this Mac's local database.
2. **Settings → Account → Deploy passphrase** (optional) — set 4 digits; every Deploy click then asks for them before anything runs.
3. **Add your projects** — *Add project*, Browse to the folder on this Mac, give it a name and section, and set its local commands (below). Every install has its own database, so each person adds the projects they work on.

## Local commands

Per project you set an optional **compose file** (relative path) and optional **start / stop / restart / rebuild commands**. With a compose file, the defaults are `docker compose -f <file> up -d`, `stop`, `restart`, and `up -d --build`; a custom command replaces the default for that action. Commands run in the project folder with your login shell, and their output streams live on the project page. Nothing is detected automatically.

## Deploy servers

Each person should use their **own** SSH key — never share private keys.

1. Generate a key on your Mac (no passphrase, so deployments run unattended):

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/devlaunch -N "" -C "devlaunch-<your name>"
   ```

2. Authorize it on the VPS by adding the contents of `~/.ssh/devlaunch.pub` to `~/.ssh/authorized_keys` there (or `ssh-copy-id -i ~/.ssh/devlaunch.pub user@host` if you can already log in).
3. In DevLaunch, **Settings → Deploy servers → Add server**: name, host, SSH user, and paste the private key (`cat ~/.ssh/devlaunch`). Click **Test** — it should report the connection and the server's Docker versions.

Keys are stored in `data/keys/` with owner-only permissions and are used solely for SSH from this Mac.

## Deployments

**Project → Deployments → Add**: pick the server and a mode.

- **Image push** builds a Docker image locally for the server's CPU architecture (detected over SSH, or set explicitly), ships it with `docker save | ssh docker load` (no registry needed), then runs your commands. If the server already has that exact image, the upload is skipped.
- **Commands only** just runs your commands on the server.

The commands are always yours — one per line, executed in order inside the project directory on the server, stopping at the first failure. Nothing runs automatically.

Buttons on each deployment:

- **Deploy** — the full flow. Progress shows on the project page and on the project's card (build → upload with size, percent and speed → commands). A running deployment can be stopped.
- **Run commands** — only the server commands, no build or upload. Use it after fixing a command, or to restart something on the server.
- **Roll back** (image deployments) — the previous image is kept on the server as `<image>:previous` before each upload; rollback re-tags it and runs your commands.
- **History** — the last ten runs with status, kind, duration, and who ran them; click one to read its log.

Extras per deployment: an optional **environment file** (stored encrypted on this Mac, written to the server before your commands) and a **clean git tree check** that refuses to deploy uncommitted or un-pulled code unless you choose "Deploy anyway".

## Pipelines

**Pipelines** chain deployments in order (for example backend, then frontend) behind one Run button, stopping at the first failure. A pipeline can also run daily at a set time while DevLaunch is running.

## Notifications

Settings → Notifications: a macOS notification and/or a Slack or Discord webhook whenever a deployment finishes or fails.

## Everything else

- **Services** shows the containers on this Mac and the health of every deploy server (reachability, CPU architecture, Docker version, disk, memory, uptime, running containers).
- **Notes** on each project page for the things you always forget.
- **⌘K** opens a command palette: jump to a project or page, start/stop, open in VS Code or a terminal.
- Settings → Appearance switches between dark and light.

## Serving it as devlaunch.localhost

DevLaunch listens on `127.0.0.1:3000`. To reach it as `http://devlaunch.localhost` through Nginx Proxy Manager (NPM) running in Docker:

1. Open the NPM admin UI (usually `http://npm.localhost` or `http://localhost:81`).
2. **Hosts → Proxy Hosts → Add Proxy Host** and fill in:

   | Field | Value |
   |---|---|
   | Domain Names | `devlaunch.localhost` |
   | Scheme | `http` |
   | Forward Hostname / IP | `host.docker.internal` |
   | Forward Port | `3000` |
   | Websockets Support | on |
   | Block Common Exploits | on (optional) |

   Leave SSL off — it's local only.
3. **Save**, then open `http://devlaunch.localhost`.

`host.docker.internal` is the address of the Mac itself as seen from inside a container, which is why NPM forwards there instead of to a service name: DevLaunch runs on the Mac, not in Docker. Docker Desktop provides that hostname automatically. (If NPM ever runs on a Linux host instead, add `extra_hosts: ["host.docker.internal:host-gateway"]` to its compose service.)

Browsers resolve any `*.localhost` name to your own machine, so no DNS or `/etc/hosts` entry is needed. If a tool refuses to resolve it, add `127.0.0.1 devlaunch.localhost` to `/etc/hosts`.

## Update

```bash
cd ~/projects/devlaunch
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

## Where things are stored

- `data/devlaunch.sqlite` — account, projects, servers, deployments, and the last ten runs per deployment
- `data/keys/` — server private keys, owner-only permissions

Both are git-ignored and never leave the Mac.

## Development

```bash
npm run dev
```
