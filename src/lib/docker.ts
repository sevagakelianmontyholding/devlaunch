import { randomUUID } from "node:crypto";
import path from "node:path";
import { getProject, resolveCommand } from "./projects";
import { run, spawnTracked, UserError, killProcessGroup } from "./shell";
import type { ActiveAction, ComposeAction, LocalRun } from "./types";

const LOG_LIMIT = 100_000;
const globalState = globalThis as unknown as { devlaunchLocalRuns?: Map<string, LocalRun> };
const localRuns = (globalState.devlaunchLocalRuns ??= new Map());

function requireProject(id: string) {
  const project = getProject(id);
  if (!project) throw new UserError("Project not found");
  return project;
}

export async function openInEditor(id: string) {
  const project = requireProject(id);
  if (process.platform === "darwin") {
    await run("open", ["-a", "Visual Studio Code", project.path]);
  } else {
    await run("code", [project.path]);
  }
}

export function activeActionsByProject() {
  const result: Record<string, ActiveAction> = {};
  for (const localRun of localRuns.values()) {
    if (localRun.status === "running") {
      result[localRun.projectId] = { runId: localRun.id, action: localRun.action, command: localRun.command, startedAt: localRun.startedAt };
    }
  }
  return result;
}

export function getLocalRun(id: string): LocalRun {
  const localRun = localRuns.get(id);
  if (!localRun) throw new UserError("That command is no longer tracked");
  return { ...localRun };
}

// Starts a project command and returns immediately; the run streams its output
// into memory so the UI can follow it, and completes in the background.
export function startAction(id: string, action: ComposeAction): LocalRun {
  const project = requireProject(id);
  const command = resolveCommand(project, action);
  if (!command) throw new UserError(`No ${action} command configured. Set a compose file or a command in the project settings.`);
  if (Object.values(activeActionsByProject()).some((active) => active.runId && localRuns.get(active.runId)?.projectId === id)) {
    throw new UserError("Another command is still running for this project");
  }

  const localRun: LocalRun = {
    id: randomUUID(),
    projectId: id,
    action,
    command,
    status: "running",
    log: `$ ${command}\n`,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  localRuns.set(localRun.id, localRun);
  const log = (chunk: string) => (localRun.log = (localRun.log + chunk).slice(-LOG_LIMIT));

  // The user's login shell gives the command the same PATH, nvm, and aliases a terminal has.
  const child = spawnTracked("/bin/zsh", ["-lc", command], undefined, path.resolve(project.path));
  const timeoutMs = action === "rebuild" ? 15 * 60_000 : 3 * 60_000;
  const timer = setTimeout(() => {
    killProcessGroup(child, "SIGKILL");
    log(`\n✖ Timed out after ${Math.round(timeoutMs / 60_000)} minutes\n`);
  }, timeoutMs);
  child.stdout?.on("data", (chunk: Buffer) => log(chunk.toString("utf8")));
  child.stderr?.on("data", (chunk: Buffer) => log(chunk.toString("utf8")));
  child.on("error", (error) => log(`\n✖ ${error.message}\n`));
  child.on("close", (code) => {
    clearTimeout(timer);
    localRun.status = code === 0 ? "success" : "error";
    localRun.finishedAt = new Date().toISOString();
    log(code === 0 ? "\n✔ Done\n" : `\n✖ Exited with code ${code}\n`);
    setTimeout(() => localRuns.delete(localRun.id), 10 * 60_000);
  });

  return { ...localRun };
}

export async function composeLogs(id: string, tail = 150) {
  const project = requireProject(id);
  if (!project.composeFile) throw new UserError("Set the project's compose file to read logs");
  const { stdout, stderr } = await run(
    "docker",
    ["compose", "-f", project.composeFile, "--project-directory", ".", "logs", "--no-color", "--tail", String(Math.min(Math.max(tail, 20), 500))],
    { cwd: project.path, timeoutMs: 20_000 },
  );
  return stdout || stderr || "No logs yet.";
}
