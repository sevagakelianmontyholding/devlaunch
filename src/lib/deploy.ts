import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { db, now } from "./db";
import { getProject } from "./projects";
import { getServerRow, sshArgs, writeKey, type ServerRow } from "./servers";
import { killProcessGroup, shQuote, stream, UserError, type ProcessControl } from "./shell";
import type { DeployMode, DeployRun, DeployRunSummary, Deployment, DeploymentInput } from "./types";

const LOG_LIMIT = 200_000;
const SAFE_IMAGE = /^[a-z0-9][a-z0-9._/-]*$/;
const SAFE_TAG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_RELATIVE = /^[A-Za-z0-9._/-]+$/;

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
  devlaunchRuns?: Map<string, { run: DeployRun; control: ProcessControl }>;
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
  if (input.mode === "image") {
    if (!imageName || !SAFE_IMAGE.test(imageName)) throw new UserError("Enter a valid lowercase image name");
    if (imageTag && !SAFE_TAG.test(imageTag)) throw new UserError("Enter a valid image tag");
    if (buildContext && !SAFE_RELATIVE.test(buildContext)) throw new UserError("The build context must be a relative folder");
    if (dockerfile && !SAFE_RELATIVE.test(dockerfile)) throw new UserError("The Dockerfile must be a relative path");
  }
  return { name, mode: input.mode, remotePath, commands, imageName, imageTag, buildContext, dockerfile };
}

export function createDeployment(projectId: string, input: DeploymentInput): Deployment {
  if (!getProject(projectId)) throw new UserError("Project not found");
  const server = getServerRow(input.serverId);
  const deployment = validate(input);
  const id = randomUUID();
  const timestamp = now();
  db()
    .prepare(
      `INSERT INTO deployments (id, project_id, server_id, name, mode, image_name, image_tag, build_context, dockerfile, remote_path, commands, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
       dockerfile = ?, remote_path = ?, commands = ?, updated_at = ? WHERE id = ?`,
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
  };
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

async function execute(run: DeployRun, config: Row, server: ServerRow, projectPath: string, control: ProcessControl) {
  const log = (chunk: string) => (run.log = (run.log + chunk).slice(-LOG_LIMIT));
  const step = (title: string) => log(`\n▶ ${title}\n`);
  await writeKey(server.id, server.private_key);

  if (config.mode === "image") {
    const image = `${config.image_name}:${config.image_tag || "latest"}`;
    const context = path.resolve(projectPath, config.build_context || ".");
    if (!context.startsWith(projectPath)) throw new Error("The build context must stay inside the project folder");
    const args = ["build", "-t", image];
    if (config.dockerfile) args.push("-f", await resolveDockerfile(projectPath, context, config.dockerfile));
    args.push(context);

    step(`Building ${image}`);
    await stream("docker", args, { cwd: projectPath, timeoutMs: 30 * 60_000, onOutput: log, control });

    step(`Pushing ${image} to ${server.name} over SSH`);
    const ssh = ["ssh", ...sshArgs(server)].map(shQuote).join(" ");
    const pipeline = `docker save ${shQuote(image)} | gzip | ${ssh} 'gunzip | docker load'`;
    await stream("/bin/sh", ["-c", pipeline], { timeoutMs: 30 * 60_000, onOutput: log, control });
  }

  const lines = commandLines(config.commands);
  const remote = `cd ${shQuote(config.remote_path)} && ${lines.join(" && ")}`;
  step(`Running ${lines.length} command${lines.length === 1 ? "" : "s"} on ${server.name}`);
  for (const line of lines) log(`  $ ${line}\n`);
  await stream("ssh", [...sshArgs(server), remote], { timeoutMs: 20 * 60_000, onOutput: log, control });
}

export async function startRun(deploymentId: string): Promise<DeployRun> {
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
    log: `Deploying ${config.name} → ${server.name} (${server.username}@${server.host})\n`,
    startedAt: now(),
    finishedAt: null,
  };
  const control: ProcessControl = { cancelled: false, child: null };
  activeRuns.set(run.id, { run, control });

  void (async () => {
    try {
      await execute(run, config, server, path.resolve(project.path), control);
      run.status = "success";
      run.log += "\n✔ Deployed\n";
    } catch (error) {
      run.status = control.cancelled ? "cancelled" : "error";
      run.log += control.cancelled ? "\n■ Cancelled\n" : `\n✖ ${error instanceof Error ? error.message : "Failed"}\n`;
    } finally {
      run.finishedAt = now();
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
  const child = active.control.child;
  if (child) {
    killProcessGroup(child, "SIGTERM");
    setTimeout(() => {
      if (active.control.child === child) killProcessGroup(child, "SIGKILL");
    }, 5_000);
  }
}
