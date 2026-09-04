import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Child } from "./shell";
import { getProject, resolveCommand } from "./projects";
import { run, spawnTracked, UserError, killProcessGroup } from "./shell";
import { openFolderInTerminal } from "./terminal";
import type { ActiveAction, ComposeAction, LocalAction, LocalRun, Project } from "./types";

const LOG_LIMIT = 100_000;
// Both maps live on globalThis: route handlers and server actions are separate
// module instances in production and must see the same runs and processes.
type Listener = { onChunk: (chunk: string) => void; onDone: (status: LocalRun["status"]) => void };
const globalState = globalThis as unknown as { devlaunchLocalRuns?: Map<string, LocalRun>; devlaunchRunChildren?: Map<string, Child>; devlaunchRunListeners?: Map<string, Set<Listener>> };
const localRuns = (globalState.devlaunchLocalRuns ??= new Map());
const runChildren = (globalState.devlaunchRunChildren ??= new Map());
const runListeners = (globalState.devlaunchRunListeners ??= new Map());
const PTY_COLS = 100;
const PTY_ROWS = 30;
const PTY_WRAPPER = path.join(process.cwd(), "scripts", "ptyrun.py");

// Live output for the terminal panel in the browser (see the SSE route).
export function subscribeRun(id: string, listener: Listener) {
  const set = runListeners.get(id) ?? new Set<Listener>();
  set.add(listener);
  runListeners.set(id, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) runListeners.delete(id);
  };
}

function emit(id: string, chunk: string) {
  for (const listener of runListeners.get(id) ?? []) listener.onChunk(chunk);
}

function finish(id: string, status: LocalRun["status"]) {
  for (const listener of runListeners.get(id) ?? []) listener.onDone(status);
  runListeners.delete(id);
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
  const log = (chunk: string) => {
    localRun.log = (localRun.log + chunk).slice(-LOG_LIMIT);
    emit(localRun.id, chunk);
  };

  // Every run gets a pseudo-terminal when possible: tools show colours,
  // progress and their prompts, and the browser terminal can answer them.
  const pty = options.pty !== false && existsSync("/usr/bin/python3");
  const child = pty
    ? spawnTracked("/usr/bin/python3", [PTY_WRAPPER, "/bin/zsh", "-lc", command], undefined, cwd, { TERM: "xterm-256color", PTY_COLS: String(PTY_COLS), PTY_ROWS: String(PTY_ROWS), FORCE_COLOR: "1" })
    : spawnTracked("/bin/zsh", ["-lc", command], undefined, cwd);
  runChildren.set(localRun.id, child);
  const timer = setTimeout(() => {
    killProcessGroup(child, "SIGKILL");
    log(`\r\n✖ Timed out after ${Math.round(timeoutMs / 60_000)} minutes\r\n`);
  }, timeoutMs);
  const onData = (chunk: Buffer) => log(chunk.toString("utf8"));
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  child.on("error", (error) => log(`\r\n✖ ${error.message}\r\n`));
  child.on("close", (code) => {
    clearTimeout(timer);
    runChildren.delete(localRun.id);
    localRun.status = code === 0 ? "success" : "error";
    localRun.finishedAt = new Date().toISOString();
    log(code === 0 ? "\r\n✔ Done\r\n" : `\r\n✖ Exited with code ${code}\r\n`);
    finish(localRun.id, localRun.status);
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
// A typed reply gets a newline; a key (arrow, Enter, Ctrl+C) is sent as-is.
export function writeRunInput(id: string, text: string, raw = false) {
  const localRun = localRuns.get(id);
  const child = runChildren.get(id);
  if (!localRun || localRun.status !== "running" || !child?.stdin || child.stdin.destroyed) throw new UserError("That command is not waiting for input");
  child.stdin.write(raw ? text : `${text.replace(/[\r\n]+$/, "")}\n`);
}

export function stopLocalRun(id: string) {
  const child = runChildren.get(id);
  const localRun = localRuns.get(id);
  if (!child || !localRun || localRun.status !== "running") throw new UserError("That command is not running");
  localRun.log = `${localRun.log}\r\n■ Stopping…\r\n`.slice(-LOG_LIMIT);
  emit(id, "\r\n■ Stopping…\r\n");
  killProcessGroup(child, "SIGTERM");
  setTimeout(() => {
    if (runChildren.has(id)) killProcessGroup(child, "SIGKILL");
  }, 5000);
}
