import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { db, now } from "./db";
import { formatBytes } from "./format";
import { getProject } from "./projects";
import { getServerRow, sshArgs, writeKey, type ServerRow } from "./servers";
import { killProcessGroup, newControl, run, shQuote, spawnTracked, stream, UserError, waitForExit, type ProcessControl } from "./shell";
import type { ActiveDeploy, DeployMode, DeployRun, DeployRunSummary, Deployment, DeploymentInput, UploadProgress } from "./types";

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
  created_at: string;
  updated_at: string;
};

type RunRow = {
  id: string;
  deployment_id: string;
  project_id: string;
  status: DeployRun["status"];
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
    ? { id: run.id, status: run.status, startedAt: run.started_at, finishedAt: run.finished_at }
    : { id: run.id, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt };
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
  if (input.mode === "image") {
    if (!imageName || !SAFE_IMAGE.test(imageName)) throw new UserError("Enter a valid lowercase image name");
    if (imageTag && !SAFE_TAG.test(imageTag)) throw new UserError("Enter a valid image tag");
    if (buildContext && !SAFE_RELATIVE.test(buildContext)) throw new UserError("The build context must be a relative folder");
    if (dockerfile && !SAFE_RELATIVE.test(dockerfile)) throw new UserError("The Dockerfile must be a relative path");
  }
  return { name, mode: input.mode, remotePath, commands, imageName, imageTag, buildContext, dockerfile, platform };
}

export function createDeployment(projectId: string, input: DeploymentInput): Deployment {
  if (!getProject(projectId)) throw new UserError("Project not found");
  const server = getServerRow(input.serverId);
  const deployment = validate(input);
  const id = randomUUID();
  const timestamp = now();
  db()
    .prepare(
      `INSERT INTO deployments (id, project_id, server_id, name, mode, image_name, image_tag, build_context, dockerfile, remote_path, commands, platform, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
       dockerfile = ?, remote_path = ?, commands = ?, platform = ?, updated_at = ? WHERE id = ?`,
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
      `INSERT INTO deploy_runs (id, deployment_id, project_id, status, log, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(run.id, run.deploymentId, run.projectId, run.status, run.log, run.startedAt, run.finishedAt);
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

// Compares the image content hash locally and on the server so an unchanged
// image is not uploaded again (e.g. when only the server commands changed).
async function serverHasImage(image: string, server: ServerRow, control: ProcessControl) {
  const localId = (await run_("docker", ["image", "inspect", "--format", "{{.Id}}", image])).trim();
  let remote = "";
  try {
    await stream("ssh", [...sshArgs(server), `docker image inspect --format '{{.Id}}' ${shQuote(image)} 2>/dev/null || true`], {
      timeoutMs: 30_000,
      onOutput: (chunk) => (remote += chunk),
      control,
    });
  } catch {
    return false;
  }
  const remoteId = remote.trim().split("\n").at(-1) ?? "";
  return Boolean(localId) && remoteId === localId;
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

async function execute(run: DeployRun, config: Row, server: ServerRow, projectPath: string, control: ProcessControl, commandsOnly: boolean) {
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
      run.phase = "uploading";
      step(`Uploading ${image} to ${server.name} over SSH`);
      await pushImage(run, image, server, control, log);
    }
  }
  if (commandsOnly) step("Commands only — no build or upload");

  const lines = commandLines(config.commands);
  const remote = `cd ${shQuote(config.remote_path)} && ${lines.join(" && ")}`;
  run.phase = "commands";
  step(`Running ${lines.length} command${lines.length === 1 ? "" : "s"} on ${server.name}`);
  for (const line of lines) log(`  $ ${line}\n`);
  await stream("ssh", [...sshArgs(server), remote], { timeoutMs: 20 * 60_000, onOutput: log, control });
}

export async function startRun(deploymentId: string, commandsOnly = false): Promise<DeployRun> {
  const config = getRow(deploymentId);
  for (const { run } of activeRuns.values()) {
    if (run.deploymentId === deploymentId && run.status === "running") {
      throw new UserError("This deployment is already running");
    }
  }
  const project = getProject(config.project_id);
  if (!project) throw new UserError("Project not found");
  const server = getServerRow(config.server_id);

  const run: DeployRun = {
    id: randomUUID(),
    deploymentId,
    projectId: config.project_id,
    status: "running",
    log: `${commandsOnly ? "Running commands for" : "Deploying"} ${config.name} → ${server.name} (${server.username}@${server.host})\n`,
    startedAt: now(),
    finishedAt: null,
    phase: null,
    upload: null,
  };
  const control = newControl();
  activeRuns.set(run.id, { run, control, name: config.name });

  void (async () => {
    try {
      await execute(run, config, server, path.resolve(project.path), control, commandsOnly);
      run.status = "success";
      run.log += "\n✔ Deployed\n";
    } catch (error) {
      run.status = control.cancelled ? "cancelled" : "error";
      run.log += control.cancelled ? "\n■ Cancelled\n" : `\n✖ ${error instanceof Error ? error.message : "Failed"}\n`;
    } finally {
      run.finishedAt = now();
      run.phase = null;
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
