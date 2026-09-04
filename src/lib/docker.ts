import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Child } from "./shell";
import { getProject, resolveCommand } from "./projects";
import { run, spawnTracked, UserError, killProcessGroup } from "./shell";
import { openFolderInTerminal } from "./terminal";
import type { ActiveAction, ComposeAction, LocalAction, LocalRun, Project } from "./types";

const LOG_LIMIT = 100_000;
// Both maps live on globalThis: route handlers and server actions are separate
// module instances in production and must see the same runs and processes.
const globalState = globalThis as unknown as { devlaunchLocalRuns?: Map<string, LocalRun>; devlaunchRunChildren?: Map<string, Child> };
const localRuns = (globalState.devlaunchLocalRuns ??= new Map());
const runChildren = (globalState.devlaunchRunChildren ??= new Map());
const PTY_WRAPPER = path.join(process.cwd(), "scripts", "ptyrun.py");

// Terminal escape sequences and carriage returns from pty-backed runs.
function plainText(chunk: string) {
  return chunk
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

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

export async function openInTerminal(id: string) {
  const project = requireProject(id);
  await openFolderInTerminal(project.path);
}

export function activeActionsByProject() {
  const result: Record<string, ActiveAction> = {};
  for (const localRun of localRuns.values()) {
    if (localRun.status === "running") {
      result[localRun.projectId] = { runId: localRun.id, action: localRun.action, label: localRun.label, command: localRun.command, startedAt: localRun.startedAt };
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
  return launchRun(project, action, command, path.resolve(project.path), action === "rebuild" ? 15 * 60_000 : 3 * 60_000, `$ ${command}\n`);
}

// One tracked local run per project at a time, executed by the user's login
// shell so it gets the same PATH, nvm, git credentials and aliases a terminal has.
export function launchRun(project: Project, action: LocalAction, command: string, cwd: string, timeoutMs: number, intro: string, label: string | null = null, options: { pty?: boolean } = {}): LocalRun {
  if (Object.values(activeActionsByProject()).some((active) => active.runId && localRuns.get(active.runId)?.projectId === project.id)) {
    throw new UserError("Another command is still running for this project");
  }

  const localRun: LocalRun = {
    id: randomUUID(),
    projectId: project.id,
    action,
    label,
    command,
    status: "running",
    log: intro,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  localRuns.set(localRun.id, localRun);
  const log = (chunk: string) => (localRun.log = (localRun.log + chunk).slice(-LOG_LIMIT));

  // A pseudo-terminal makes tools believe a person is there, so they show
  // their prompts; the answers arrive through writeRunInput.
  const child = options.pty
    ? spawnTracked("/usr/bin/python3", [PTY_WRAPPER, "/bin/zsh", "-lc", command], undefined, cwd)
    : spawnTracked("/bin/zsh", ["-lc", command], undefined, cwd);
  runChildren.set(localRun.id, child);
  const timer = setTimeout(() => {
    killProcessGroup(child, "SIGKILL");
    log(`\n✖ Timed out after ${Math.round(timeoutMs / 60_000)} minutes\n`);
  }, timeoutMs);
  const onData = (chunk: Buffer) => log(options.pty ? plainText(chunk.toString("utf8")) : chunk.toString("utf8"));
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  child.on("error", (error) => log(`\n✖ ${error.message}\n`));
  child.on("close", (code) => {
    clearTimeout(timer);
    runChildren.delete(localRun.id);
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

// Sends a line to a running command's stdin (an answer to a prompt).
export function writeRunInput(id: string, text: string) {
  const localRun = localRuns.get(id);
  const child = runChildren.get(id);
  if (!localRun || localRun.status !== "running" || !child?.stdin || child.stdin.destroyed) throw new UserError("That command is not waiting for input");
  child.stdin.write(`${text.replace(/[\r\n]+$/, "")}\n`);
}

export function stopLocalRun(id: string) {
  const child = runChildren.get(id);
  const localRun = localRuns.get(id);
  if (!child || !localRun || localRun.status !== "running") throw new UserError("That command is not running");
  localRun.log = `${localRun.log}\n■ Stopping…\n`.slice(-LOG_LIMIT);
  killProcessGroup(child, "SIGTERM");
  setTimeout(() => {
    if (runChildren.has(id)) killProcessGroup(child, "SIGKILL");
  }, 5000);
}
