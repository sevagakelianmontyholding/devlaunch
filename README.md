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

## Git

DevLaunch finds git repositories in the project folder and its immediate subfolders (so a project with `frontend/` and `backend/` repos shows both); deeper ones can be listed in the project form. Repos with an upstream are fetched in the background every five minutes (non-interactively, so a repo needing a password is simply skipped), so the counts stay current. The project card shows a badge per repo (branch, changed files, commits behind/ahead), and the project page has a **Repositories** card with Fetch, Pull (fast-forward only, refused while there are uncommitted changes), Push, and **Commit & push** (stages everything, commits with your message, pushes). All of it runs your own `git` with your usual credentials; nothing talks to GitHub directly. The clean-tree check before a deploy covers every repo of the project.

## Actions

Each project can have its own buttons: **Actions → Add** on the project page. An action is a name and one or more command lines (run in order, stopping at the first failure), executed either on this Mac in the project folder (or a subfolder) or on a deploy server in the directory you give. Tick *Ask before running* for anything destructive. Actions run with streamed output like start/stop, and appear in ⌘K as "Run migrations · Comium". They run inside a pseudo-terminal, so a command that asks a question (`php artisan migrate` without `--force`, for example) shows its prompt in the output and you answer it in the reply box underneath; for menu-style prompts (Laravel Prompts, for instance) there are Yes / No / Enter / arrow-key buttons that send the exact keystroke. For anything more interactive (an editor, a menu), tick *Open in a terminal window* and the action runs in your terminal app instead.

## Deploy servers

Each person should use their **own** SSH key — never share private keys.

1. Generate a key on your Mac (no passphrase, so deployments run unattended):

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/devlaunch -N "" -C "devlaunch-<your name>"
   ```

2. Authorize it on the VPS by adding the contents of `~/.ssh/devlaunch.pub` to `~/.ssh/authorized_keys` there (or `ssh-copy-id -i ~/.ssh/devlaunch.pub user@host` if you can already log in).
3. In DevLaunch, **Servers → Add server**: name, host, SSH user, and paste the private key (`cat ~/.ssh/devlaunch`). Click **Test** — it should report the connection and the server's Docker versions.

Keys are stored in `data/keys/` with owner-only permissions and are used solely for SSH from this Mac. The **SSH** button on a server card, and the terminal icon on a deployment, open an interactive session in your terminal app (landing in the project directory for a deployment).

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

Extras per deployment: an optional **health check URL** (polled from this Mac after the commands finish, for up to the time you set; the run only succeeds once it answers) with optional **automatic rollback** for image deployments (re-tags the previous image, reruns your commands, checks again, and reports the run as failed either way); an optional **environment file** (stored encrypted on this Mac, written to the server before your commands) and a **clean git tree check** that refuses to deploy uncommitted or un-pulled code unless you choose "Deploy anyway".

## Deploy locks

While a run is in progress, DevLaunch writes `~/.devlaunch/deploy.lock` on the server (in the SSH user's home). If a colleague's DevLaunch starts a run against the same server while that lock exists, they are told who is deploying what, and can wait or go ahead anyway. The lock is removed when the run finishes or is stopped; a lock older than three hours is ignored. While a lock is held by someone else, it shows on the project card, on the project page above the deployments, on the dashboard under Happening now, and on the Servers page (checked every minute).

## Templates

On a project page, **Save as template** keeps its section, URLs, compose file, local commands and deployments (env file contents excluded). When adding the next project, choose the template at the top of the form: the fields are filled in and the deployments are created on the new project. Wherever the original project's id or folder name appeared (image name, server path, URLs), the template uses `{slug}` or `{folder}` so the new project gets its own values; `{name}` is available too. Templates are listed in Settings.

## Pipelines

**Pipelines** chain deployments in order (for example backend, then frontend) behind one Run button, stopping at the first failure. A pipeline can also run daily at a set time while DevLaunch is running.

## Notifications

Settings → Notifications: a macOS notification and/or a Slack or Discord webhook whenever a deployment finishes or fails. macOS notifications come from a small "DevLaunch" helper app (built into `data/` by `service:install`) so they show the DevLaunch icon; allow it the first time macOS asks.

## Everything else

- The **Dashboard** (home page) shows what is happening right now, the last deployments, server reachability, pipelines, and a quick start/stop list of your projects.
- **Servers** shows the health of every deploy server (reachability, CPU architecture, Docker version, disk, memory, uptime, running containers) next to its Test/Edit/Remove controls; **Services** shows the containers on this Mac.
- **Live site checks**: every project with a live URL is checked from this Mac every three minutes. The card shows "Live up" or "Live down", the project page shows the response time with a Check now button, the dashboard lists sites that are down, and a notification goes out when a site goes down (after two failed checks in a row) or comes back.
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
