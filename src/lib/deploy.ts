import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { db, now } from "./db";
import { decrypt, encrypt } from "./crypto";
import { notifyFinished } from "./notify";
import { formatBytes } from "./format";
import { getProject } from "./projects";
import { getServerRow, parseLock, sshArgs, writeKey, type ServerRow } from "./servers";
import { killProcessGroup, newControl, run, shQuote, spawnTracked, stream, UserError, waitForExit, type ProcessControl } from "./shell";
import type { ActiveDeploy, DeployLock, DeployMode, DeployRun, DeployRunSummary, Deployment, DeploymentInput, DeploymentSummary, RunKind, UploadProgress } from "./types";

const LOG_LIMIT = 200_000;
const SAFE_IMAGE = /^[a-z0-9][a-z0-9._/-]*$/;
const SAFE_TAG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_RELATIVE = /^[A-Za-z0-9._/-]+$/;
const SAFE_PLATFORM = /^linux\/(amd64|arm64|arm\/v7|386)$/;

type Row = {
  id: string;
  project_id: string;
  server_id: string;
  server_name: string;
  name: string;
  mode: DeployMode;
  image_name: string | null;
  image_tag: string | null;
  build_context: string | null;
  dockerfile: string | null;
  remote_path: string;
  commands: string;
  platform: string | null;
  env_path: string | null;
  env_encrypted: string | null;
  require_clean_git: string | null;
  health_url: string | null;
  health_timeout: string | null;
  auto_rollback: string | null;
  created_at: string;
  updated_at: string;
};

type RunRow = {
  id: string;
  deployment_id: string;
  project_id: string;
  status: DeployRun["status"];
  kind: RunKind | null;
  username: string | null;
  log: string;
  started_at: string;
  finished_at: string | null;
};

// Active runs live in memory while they execute and are persisted on completion.
const globalState = globalThis as unknown as {
  devlaunchRuns?: Map<string, { run: DeployRun; control: ProcessControl; name: string }>;
};
const activeRuns = (globalState.devlaunchRuns ??= new Map());

function summary(run: RunRow | DeployRun): DeployRunSummary {
  return "started_at" in run
    ? { id: run.id, status: run.status, kind: run.kind ?? "deploy", username: run.username, startedAt: run.started_at, finishedAt: run.finished_at }
    : { id: run.id, status: run.status, kind: run.kind, username: run.username, startedAt: run.startedAt, finishedAt: run.finishedAt };
}

export function listRuns(deploymentId: string): DeployRunSummary[] {
  const active = [...activeRuns.values()].filter(({ run }) => run.deploymentId === deploymentId && run.status === "running").map(({ run }) => summary(run));
  const rows = db().prepare("SELECT * FROM deploy_runs WHERE deployment_id = ? ORDER BY started_at DESC LIMIT 10").all(deploymentId) as RunRow[];
  return [...active, ...rows.filter((row) => !active.some((item) => item.id === row.id)).map(summary)];
}

function lastRunFor(deploymentId: string): DeployRunSummary | null {
  for (const { run } of activeRuns.values()) {
    if (run.deploymentId === deploymentId && run.status === "running") return summary(run);
  }
  const row = db()
    .prepare("SELECT * FROM deploy_runs WHERE deployment_id = ? ORDER BY started_at DESC LIMIT 1")
    .get(deploymentId) as RunRow | undefined;
  return row ? summary(row) : null;
}

function fromRow(row: Row): Deployment {
  return {
    id: row.id,
    projectId: row.project_id,
    serverId: row.server_id,
    serverName: row.server_name,
    name: row.name,
    mode: row.mode,
    imageName: row.image_name,
    imageTag: row.image_tag,
    buildContext: row.build_context,
    dockerfile: row.dockerfile,
    remotePath: row.remote_path,
    commands: row.commands,
    platform: row.platform,
    envPath: row.env_path ?? ".env",
    envContent: row.env_encrypted ? decrypt(row.env_encrypted) : "",
    requireCleanGit: row.require_clean_git !== "0",
    healthUrl: row.health_url ?? "",
    healthTimeout: Number(row.health_timeout) || 60,
    autoRollback: row.auto_rollback === "1",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRun: lastRunFor(row.id),
  };
}

const selectDeployment = `
  SELECT deployments.*, servers.name AS server_name
  FROM deployments JOIN servers ON servers.id = deployments.server_id
`;

export function listDeployments(projectId: string): Deployment[] {
  const rows = db()
    .prepare(`${selectDeployment} WHERE deployments.project_id = ? ORDER BY deployments.name COLLATE NOCASE`)
    .all(projectId) as Row[];
  return rows.map(fromRow);
}

export function deploymentSummariesByProject() {
  const rows = db()
    .prepare(`${selectDeployment} ORDER BY deployments.name COLLATE NOCASE`)
    .all() as Row[];
  const result: Record<string, DeploymentSummary[]> = {};
  for (const row of rows) {
    (result[row.project_id] ??= []).push({ id: row.id, name: row.name, serverName: row.server_name, mode: row.mode });
  }
  return result;
}

function getRow(id: string) {
  const row = db().prepare(`${selectDeployment} WHERE deployments.id = ?`).get(id) as Row | undefined;
  if (!row) throw new UserError("Deployment not found");
  return row;
}

export function commandLines(commands: string) {
  return commands
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function validate(input: DeploymentInput) {
  const name = input.name.trim();
  const remotePath = input.remotePath.trim();
  const commands = input.commands.trim();
  if (!name || name.length > 60) throw new UserError("Enter a deployment name (max 60 characters)");
  if (input.mode !== "image" && input.mode !== "commands") throw new UserError("Choose a deployment mode");
  if (!remotePath.startsWith("/") && !remotePath.startsWith("~")) {
    throw new UserError("Enter the absolute project directory on the server");
  }
  if (commandLines(commands).length === 0) throw new UserError("Enter at least one server command");
  if (commands.length > 4000) throw new UserError("The server commands are too long");
  const imageName = input.imageName.trim() || null;
  const imageTag = input.imageTag.trim() || null;
  const buildContext = input.buildContext.trim() || null;
  const dockerfile = input.dockerfile.trim() || null;
  const platform = input.platform.trim() || null;
  if (platform && !SAFE_PLATFORM.test(platform)) throw new UserError("Choose a supported target platform");
  const envPath = input.envPath.trim() || ".env";
  if (!SAFE_RELATIVE.test(envPath) || envPath.includes("..")) throw new UserError("The env file path must be relative to the project directory");
  const envContent = input.envContent.replace(/\r\n/g, "\n");
  if (envContent.length > 64_000) throw new UserError("The env file is too large");
  const healthUrl = input.healthUrl.trim();
  if (healthUrl && !/^https?:\/\/\S+$/.test(healthUrl)) throw new UserError("The health check URL must start with http:// or https://");
  const healthTimeout = Math.round(Number(input.healthTimeout) || 60);
  if (healthTimeout < 5 || healthTimeout > 900) throw new UserError("The health check wait must be between 5 and 900 seconds");
  const autoRollback = Boolean(input.autoRollback && healthUrl && input.mode === "image");
  if (input.mode === "image") {
    if (!imageName || !SAFE_IMAGE.test(imageName)) throw new UserError("Enter a valid lowercase image name");
    if (imageTag && !SAFE_TAG.test(imageTag)) throw new UserError("Enter a valid image tag");
    if (buildContext && !SAFE_RELATIVE.test(buildContext)) throw new UserError("The build context must be a relative folder");
    if (dockerfile && !SAFE_RELATIVE.test(dockerfile)) throw new UserError("The Dockerfile must be a relative path");
  }
  return { name, mode: input.mode, remotePath, commands, imageName, imageTag, buildContext, dockerfile, platform, envPath, envContent, requireCleanGit: input.requireCleanGit, healthUrl, healthTimeout, autoRollback };
}

export function createDeployment(projectId: string, input: DeploymentInput): Deployment {
  if (!getProject(projectId)) throw new UserError("Project not found");
  const server = getServerRow(input.serverId);
  const deployment = validate(input);
  const id = randomUUID();
  const timestamp = now();
  db()
    .prepare(
      `INSERT INTO deployments (id, project_id, server_id, name, mode, image_name, image_tag, build_context, dockerfile, remote_path, commands, platform, env_path, env_encrypted, require_clean_git, health_url, health_timeout, auto_rollback, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      projectId,
      server.id,
      deployment.name,
      deployment.mode,
      deployment.imageName,
      deployment.imageTag,
      deployment.buildContext,
      deployment.dockerfile,
      deployment.remotePath,
      deployment.commands,
      deployment.platform,
      deployment.envPath,
      deployment.envContent ? encrypt(deployment.envContent) : null,
      deployment.requireCleanGit ? "1" : "0",
      deployment.healthUrl || null,
      String(deployment.healthTimeout),
      deployment.autoRollback ? "1" : "0",
      timestamp,
      timestamp,
    );
  return fromRow(getRow(id));
}

export function updateDeployment(id: string, input: DeploymentInput): Deployment {
  getRow(id);
  const server = getServerRow(input.serverId);
  const deployment = validate(input);
  db()
    .prepare(
      `UPDATE deployments SET server_id = ?, name = ?, mode = ?, image_name = ?, image_tag = ?, build_context = ?,
       dockerfile = ?, remote_path = ?, commands = ?, platform = ?, env_path = ?, env_encrypted = ?, require_clean_git = ?,
       health_url = ?, health_timeout = ?, auto_rollback = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      server.id,
      deployment.name,
      deployment.mode,
      deployment.imageName,
      deployment.imageTag,
      deployment.buildContext,
      deployment.dockerfile,
      deployment.remotePath,
      deployment.commands,
      deployment.platform,
      deployment.envPath,
      deployment.envContent ? encrypt(deployment.envContent) : null,
      deployment.requireCleanGit ? "1" : "0",
      deployment.healthUrl || null,
      String(deployment.healthTimeout),
      deployment.autoRollback ? "1" : "0",
      now(),
      id,
    );
  return fromRow(getRow(id));
}

export function deleteDeployment(id: string) {
  const row = getRow(id);
  for (const { run } of activeRuns.values()) {
    if (run.deploymentId === id && run.status === "running") {
      throw new UserError("Stop the running deployment first");
    }
  }
  db().prepare("DELETE FROM deployments WHERE id = ?").run(id);
  return fromRow(row);
}

export function getRun(id: string): DeployRun {
  const active = activeRuns.get(id);
  if (active) return { ...active.run };
  const row = db().prepare("SELECT * FROM deploy_runs WHERE id = ?").get(id) as RunRow | undefined;
  if (!row) throw new UserError("Deployment run not found");
  return {
    id: row.id,
    deploymentId: row.deployment_id,
    projectId: row.project_id,
    status: row.status,
    kind: row.kind ?? "deploy",
    username: row.username,
    log: row.log,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    phase: null,
    upload: null,
  };
}

export function activeDeploysByProject() {
  const result: Record<string, ActiveDeploy> = {};
  for (const { run, name } of activeRuns.values()) {
    if (run.status !== "running") continue;
    result[run.projectId] = { runId: run.id, deploymentId: run.deploymentId, deploymentName: name, phase: run.phase, upload: run.upload, startedAt: run.startedAt };
  }
  return result;
}

function persist(run: DeployRun) {
  const database = db();
  database
    .prepare(
      `INSERT INTO deploy_runs (id, deployment_id, project_id, status, kind, username, log, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(run.id, run.deploymentId, run.projectId, run.status, run.kind, run.username, run.log, run.startedAt, run.finishedAt);
  database
    .prepare(
      `DELETE FROM deploy_runs WHERE deployment_id = ? AND id NOT IN (
         SELECT id FROM deploy_runs WHERE deployment_id = ? ORDER BY started_at DESC LIMIT 10
       )`,
    )
    .run(run.deploymentId, run.deploymentId);
}

async function resolveDockerfile(projectPath: string, context: string, dockerfile: string) {
  for (const candidate of [path.resolve(context, dockerfile), path.resolve(projectPath, dockerfile)]) {
    if (!candidate.startsWith(projectPath)) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next location.
    }
  }
  throw new Error(`Dockerfile not found: ${dockerfile} (looked in the build context and the project root)`);
}

function counter(onChunk: (bytes: number) => void) {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      onChunk(chunk.length);
      callback(null, chunk);
    },
  });
}

// docker save → gzip → ssh "docker load", with byte counters on both sides of
// gzip so the run can report progress (raw bytes vs. image size) and upload
// speed (compressed bytes actually leaving the Mac).
async function pushImage(run: DeployRun, image: string, server: ServerRow, control: ProcessControl, log: (chunk: string) => void) {
  if (control.cancelled) throw new Error("Cancelled");
  const inspect = await run_("docker", ["image", "inspect", "--format", "{{.Size}}", image]);
  const imageBytes = Number(inspect.trim()) || 0;
  const progress: UploadProgress = { imageBytes, readBytes: 0, sentBytes: 0, bytesPerSecond: 0, percent: 0 };
  run.upload = progress;
  log(`  image size ${formatBytes(imageBytes)}\n`);

  const save = spawnTracked("docker", ["save", image], control);
  const ssh = spawnTracked("ssh", [...sshArgs(server), "gunzip | docker load"], control);
  save.stderr?.on("data", (chunk: Buffer) => log(chunk.toString("utf8")));
  ssh.stdout?.on("data", (chunk: Buffer) => log(chunk.toString("utf8")));
  ssh.stderr?.on("data", (chunk: Buffer) => log(chunk.toString("utf8")));

  const startedAt = Date.now();
  let lastSample = { at: startedAt, sent: 0 };
  const ticker = setInterval(() => {
    const at = Date.now();
    const seconds = (at - lastSample.at) / 1000;
    const instant = seconds > 0 ? (progress.sentBytes - lastSample.sent) / seconds : 0;
    progress.bytesPerSecond = progress.bytesPerSecond ? progress.bytesPerSecond * 0.6 + instant * 0.4 : instant;
    progress.percent = imageBytes > 0 ? Math.min(99, Math.round((progress.readBytes / imageBytes) * 100)) : 0;
    lastSample = { at, sent: progress.sentBytes };
  }, 500);

  const timeout = setTimeout(() => {
    for (const child of control.children) killProcessGroup(child, "SIGKILL");
  }, 60 * 60_000);

  try {
    await Promise.all([
      pipeline(
        save.stdout!,
        counter((bytes) => (progress.readBytes += bytes)),
        createGzip({ level: 6 }),
        counter((bytes) => (progress.sentBytes += bytes)),
        ssh.stdin!,
      ),
      waitForExit(save, "docker save"),
      waitForExit(ssh, "ssh"),
    ]);
    const seconds = Math.max(1, (Date.now() - startedAt) / 1000);
    progress.percent = 100;
    log(
      `  uploaded ${formatBytes(progress.readBytes)} (${formatBytes(progress.sentBytes)} compressed) in ${Math.round(seconds)}s · avg ${formatBytes(progress.sentBytes / seconds)}/s\n`,
    );
  } catch (error) {
    if (control.cancelled) throw new Error("Cancelled");
    throw error;
  } finally {
    clearInterval(ticker);
    clearTimeout(timeout);
    run.upload = null;
  }
}

// Compares the image's layer digests locally and on the server so an unchanged
// image is not uploaded again. Layer digests are engine-independent, unlike
// image IDs (Docker Desktop's containerd store and classic overlay2 disagree).
const layersFormat = "{{range .RootFS.Layers}}{{.}} {{end}}";

async function serverHasImage(image: string, server: ServerRow, control: ProcessControl) {
  const local = (await run_("docker", ["image", "inspect", "--format", layersFormat, image])).trim();
  let remote = "";
  try {
    await stream("ssh", [...sshArgs(server), `docker image inspect --format '${layersFormat}' ${shQuote(image)} 2>/dev/null || true`], {
      timeoutMs: 30_000,
      onOutput: (chunk) => (remote += chunk),
      control,
    });
  } catch {
    return false;
  }
  const remoteLayers = remote.trim().split("\n").at(-1)?.trim() ?? "";
  return Boolean(local) && remoteLayers === local;
}

// The image must match the server's CPU architecture, otherwise the container
// starts and immediately dies with an exec format error.
async function detectPlatform(server: ServerRow, control: ProcessControl) {
  let output = "";
  await stream("ssh", [...sshArgs(server), "uname -m"], { timeoutMs: 30_000, onOutput: (chunk) => (output += chunk), control });
  const arch = output.trim().split("\n").at(-1) ?? "";
  if (arch === "x86_64" || arch === "amd64") return "linux/amd64";
  if (arch === "aarch64" || arch === "arm64") return "linux/arm64";
  if (arch.startsWith("armv7")) return "linux/arm/v7";
  throw new Error(`Could not map the server architecture "${arch}" to a Docker platform; set it on the deployment`);
}

async function run_(command: string, args: string[]) {
  const { stdout } = await run(command, args, { timeoutMs: 30_000 });
  return stdout;
}

async function execute(run: DeployRun, config: Row, server: ServerRow, projectPath: string, control: ProcessControl, kind: RunKind) {
  const commandsOnly = kind !== "deploy";
  const log = (chunk: string) => (run.log = (run.log + chunk).slice(-LOG_LIMIT));
  const step = (title: string) => log(`\n▶ ${title}\n`);
  await writeKey(server.id, server.private_key);

  if (config.mode === "image" && !commandsOnly) {
    const image = `${config.image_name}:${config.image_tag || "latest"}`;
    const context = path.resolve(projectPath, config.build_context || ".");
    if (!context.startsWith(projectPath)) throw new Error("The build context must stay inside the project folder");
    const platform = config.platform ?? (await detectPlatform(server, control));
    const args = ["build", "--platform", platform, "-t", image];
    if (config.dockerfile) args.push("-f", await resolveDockerfile(projectPath, context, config.dockerfile));
    args.push(context);

    run.phase = "building";
    step(`Building ${image} for ${platform}${config.platform ? "" : " (detected on the server)"}`);
    await stream("docker", args, { cwd: projectPath, timeoutMs: 30 * 60_000, onOutput: log, control });

    if (await serverHasImage(image, server, control)) {
      step(`${server.name} already has this exact image — skipping the upload`);
    } else {
      // Keep the outgoing image as :previous so a bad deploy can be rolled back.
      await stream("ssh", [...sshArgs(server), `docker tag ${shQuote(image)} ${shQuote(`${config.image_name}:previous`)} 2>/dev/null || true`], { timeoutMs: 30_000, onOutput: log, control });
      run.phase = "uploading";
      step(`Uploading ${image} to ${server.name} over SSH`);
      await pushImage(run, image, server, control, log);
    }
  }
  if (kind === "commands") step("Commands only — no build or upload");
  const retagPrevious = async () => {
    if (config.mode !== "image") throw new Error("Rollback only applies to image deployments");
    const image = `${config.image_name}:${config.image_tag || "latest"}`;
    const previous = `${config.image_name}:previous`;
    step(`Rolling back ${image} to the previous image on ${server.name}`);
    await stream("ssh", [...sshArgs(server), `docker image inspect ${shQuote(previous)} >/dev/null 2>&1 && docker tag ${shQuote(previous)} ${shQuote(image)} || { echo 'No previous image on the server yet'; exit 1; }`], { timeoutMs: 30_000, onOutput: log, control });
  };
  if (kind === "rollback") await retagPrevious();
  if (config.env_encrypted) {
    const envPath = config.env_path || ".env";
    step(`Writing ${envPath} on ${server.name}`);
    const content = decrypt(config.env_encrypted);
    const target = `${config.remote_path.replace(/\/$/, "")}/${envPath}`;
    const b64 = Buffer.from(content, "utf8").toString("base64");
    await stream("ssh", [...sshArgs(server), `mkdir -p $(dirname ${shQuote(target)}) && echo ${shQuote(b64)} | base64 -d > ${shQuote(target)} && chmod 600 ${shQuote(target)}`], { timeoutMs: 30_000, onOutput: log, control });
  }

  const lines = commandLines(config.commands);
  const remote = `cd ${shQuote(config.remote_path)} && ${lines.join(" && ")}`;
  const runCommands = async () => {
    run.phase = "commands";
    step(`Running ${lines.length} command${lines.length === 1 ? "" : "s"} on ${server.name}`);
    for (const line of lines) log(`  $ ${line}\n`);
    await stream("ssh", [...sshArgs(server), remote], { timeoutMs: 20 * 60_000, onOutput: log, control });
  };
  await runCommands();

  if (!config.health_url) return;
  const timeout = Number(config.health_timeout) || 60;
  run.phase = "health";
  step(`Health check: waiting up to ${timeout}s for ${config.health_url}`);
  const first = await healthCheck(config.health_url, timeout, control, log);
  if (first.ok) {
    log(`  ✔ ${first.detail}\n`);
    return;
  }
  const canRollBack = config.auto_rollback === "1" && config.mode === "image" && kind === "deploy";
  if (!canRollBack) throw new Error(`Health check failed: ${first.detail} (${config.health_url})`);

  run.phase = "rollback";
  log(`  ✖ ${first.detail} — rolling back automatically\n`);
  await retagPrevious();
  await runCommands();
  run.phase = "health";
  step(`Health check after rollback: waiting up to ${timeout}s for ${config.health_url}`);
  const second = await healthCheck(config.health_url, timeout, control, log);
  log(second.ok ? `  ✔ ${second.detail}\n` : `  ✖ ${second.detail}\n`);
  throw new Error(`Health check failed (${first.detail}); rolled back to the previous image — ${second.ok ? "the site is up again" : `still failing: ${second.detail}`}`);
}

// Polls the URL every few seconds until it answers with a status below 400 or
// the time runs out. Redirects count as healthy: the site is answering.
async function healthCheck(url: string, timeoutSeconds: number, control: ProcessControl, log: (chunk: string) => void) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  const started = Date.now();
  let attempt = 0;
  let last = "no response";
  while (Date.now() < deadline) {
    if (control.cancelled) throw new Error("Cancelled");
    attempt += 1;
    try {
      const response = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "DevLaunch health check" } });
      last = `HTTP ${response.status}`;
      if (response.status < 400) return { ok: true, detail: `${last} after ${Math.round((Date.now() - started) / 1000)}s (attempt ${attempt})` };
    } catch (error) {
      const cause = (error as { cause?: { code?: string; message?: string; errors?: Array<{ code?: string }> } }).cause;
      const reason = cause?.code ?? cause?.errors?.[0]?.code ?? cause?.message;
      last = error instanceof Error && error.name === "TimeoutError" ? "timed out after 10s" : reason ?? (error instanceof Error ? error.message : "request failed");
    }
    log(`  attempt ${attempt}: ${last}\n`);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(3000, remaining)));
  }
  return { ok: false, detail: `${last} after ${timeoutSeconds}s` };
}

// Refuses to build from a working tree with uncommitted changes or commits not yet
// pulled, so what ships matches the repository. Returns null when there is no git repo.
export async function gitProblems(projectPath: string): Promise<string | null> {
  try {
    const { stdout: top } = await run("git", ["-C", projectPath, "rev-parse", "--show-toplevel"], { timeoutMs: 5000 });
    const repo = top.trim();
    if (!repo) return null;
    const { stdout: porcelain } = await run("git", ["-C", repo, "status", "--porcelain"], { timeoutMs: 10_000 });
    const changed = porcelain.split("\n").filter(Boolean).length;
    let behind = 0;
    try {
      await run("git", ["-C", repo, "fetch", "--quiet"], { timeoutMs: 20_000 });
      const { stdout } = await run("git", ["-C", repo, "rev-list", "--count", "HEAD..@{upstream}"], { timeoutMs: 5000 });
      behind = Number(stdout.trim()) || 0;
    } catch {
      // No upstream or offline: only the local state can be checked.
    }
    const problems = [];
    if (changed > 0) problems.push(`${changed} uncommitted change${changed === 1 ? "" : "s"}`);
    if (behind > 0) problems.push(`${behind} commit${behind === 1 ? "" : "s"} behind origin`);
    return problems.length ? problems.join(" and ") : null;
  } catch {
    return null;
  }
}

const LOCK_FILE = "$HOME/.devlaunch/deploy.lock";

async function readLock(server: ServerRow): Promise<DeployLock | null> {
  const { stdout } = await run("ssh", [...sshArgs(server), `cat ${LOCK_FILE} 2>/dev/null || true`], { timeoutMs: 25_000 });
  return parseLock(stdout);
}

async function writeLock(server: ServerRow, lock: DeployLock) {
  const b64 = Buffer.from(JSON.stringify(lock), "utf8").toString("base64");
  await run("ssh", [...sshArgs(server), `mkdir -p $HOME/.devlaunch && echo ${shQuote(b64)} | base64 -d > ${LOCK_FILE}`], { timeoutMs: 25_000 });
}

// Only removes the lock if it is still ours: a colleague who deployed anyway may have replaced it.
async function releaseLock(server: ServerRow, runId: string) {
  try {
    await run("ssh", [...sshArgs(server), `grep -q ${shQuote(runId)} ${LOCK_FILE} 2>/dev/null && rm -f ${LOCK_FILE}; true`], { timeoutMs: 25_000 });
  } catch {
    // The stale-lock timeout covers this.
  }
}

function describeLock(lock: DeployLock, serverName: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(lock.startedAt).getTime()) / 60_000));
  const verb = { deploy: "deploying", commands: "running commands for", rollback: "rolling back" }[lock.kind];
  const who = lock.user ? `${lock.user} (${lock.machine})` : lock.machine;
  return `${who} is ${verb} ${lock.project} · ${lock.deployment} on ${serverName}, started ${minutes} minute${minutes === 1 ? "" : "s"} ago. Wait for it to finish, or go ahead anyway.`;
}

export async function startRun(
  deploymentId: string,
  options: { kind?: RunKind; force?: boolean; skipGitCheck?: boolean; username?: string } = {},
): Promise<DeployRun> {
  const kind = options.kind ?? "deploy";
  const config = getRow(deploymentId);
  for (const { run } of activeRuns.values()) {
    if (run.deploymentId === deploymentId && run.status === "running") {
      throw new UserError("This deployment is already running");
    }
  }
  const project = getProject(config.project_id);
  if (!project) throw new UserError("Project not found");
  const server = getServerRow(config.server_id);
  if (kind === "deploy" && config.require_clean_git !== "0" && !options.force && !options.skipGitCheck) {
    const problems = await gitProblems(path.resolve(project.path));
    if (problems) throw new UserError(`GIT_CHECK:${project.name} has ${problems}. Commit and pull first, or deploy anyway.`);
  }
  await writeKey(server.id, server.private_key);
  if (!options.force) {
    let lock: DeployLock | null = null;
    try {
      lock = await readLock(server);
    } catch {
      // Unreachable servers fail properly a moment later, with the log to show for it.
    }
    if (lock) throw new UserError(`LOCK:${describeLock(lock, server.name)}`);
  }

  const run: DeployRun = {
    id: randomUUID(),
    deploymentId,
    projectId: config.project_id,
    status: "running",
    kind,
    username: options.username ?? null,
    log: `${{ deploy: "Deploying", commands: "Running commands for", rollback: "Rolling back" }[kind]} ${config.name} → ${server.name} (${server.username}@${server.host})\n`,
    startedAt: now(),
    finishedAt: null,
    phase: null,
    upload: null,
  };
  const control = newControl();
  activeRuns.set(run.id, { run, control, name: config.name });

  const lock: DeployLock = { user: options.username ?? null, machine: hostname().replace(/\.local$/, ""), project: project.name, deployment: config.name, kind, startedAt: run.startedAt, runId: run.id };

  void (async () => {
    let locked = false;
    try {
      try {
        await writeLock(server, lock);
        locked = true;
      } catch {
        run.log += "  (could not write the deploy lock on the server)\n";
      }
      await execute(run, config, server, path.resolve(project.path), control, kind);
      if (locked) await releaseLock(server, run.id);
      locked = false;
      run.status = "success";
      run.log += "\n✔ Deployed\n";
    } catch (error) {
      if (locked) await releaseLock(server, run.id);
      run.status = control.cancelled ? "cancelled" : "error";
      run.log += control.cancelled ? "\n■ Cancelled\n" : `\n✖ ${error instanceof Error ? error.message : "Failed"}\n`;
    } finally {
      run.finishedAt = now();
      run.phase = null;
      const seconds = Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000);
      void notifyFinished(
        `${project.name} · ${config.name}`,
        run.status === "success" ? `${kind === "deploy" ? "Deployed" : kind === "rollback" ? "Rolled back" : "Commands finished"} in ${Math.floor(seconds / 60)}m ${seconds % 60}s` : run.status === "cancelled" ? "Cancelled" : `Failed: ${run.log.trim().split("\n").at(-1) ?? "see the log"}`,
        run.status === "success",
      );
      try {
        persist(run);
      } catch {
        // Keep the in-memory record if persistence fails.
      }
      setTimeout(() => activeRuns.delete(run.id), 60_000);
    }
  })();

  return { ...run };
}

export function cancelRun(id: string) {
  const active = activeRuns.get(id);
  if (!active || active.run.status !== "running") throw new UserError("This run is not in progress");
  active.control.cancelled = true;
  active.run.log += "\n■ Cancelling…\n";
  const children = [...active.control.children];
  for (const child of children) killProcessGroup(child, "SIGTERM");
  setTimeout(() => {
    for (const child of children) if (active.control.children.has(child)) killProcessGroup(child, "SIGKILL");
  }, 5_000);
}
