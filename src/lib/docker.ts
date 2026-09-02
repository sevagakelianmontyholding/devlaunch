import { spawn } from "node:child_process";
import path from "node:path";
import { getProject, resolveCommand } from "./projects";
import { run, shellEnv, UserError } from "./shell";
import type { ComposeAction } from "./types";

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

// Runs a project command with the user's login shell inside the project folder,
// so PATH, nvm, and aliases behave like a terminal would.
function runInProject(projectPath: string, command: string, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("/bin/zsh", ["-lc", command], { cwd: projectPath, env: shellEnv });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new UserError(`Timed out after ${Math.round(timeoutMs / 60_000)} minutes: ${command}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new UserError(output.trim().split("\n").at(-1) || `Command exited with code ${code}`));
    });
  });
}

export async function composeAction(id: string, action: ComposeAction) {
  const project = requireProject(id);
  const command = resolveCommand(project, action);
  if (!command) throw new UserError(`No ${action} command configured. Set a compose file or a command in the project settings.`);
  await runInProject(path.resolve(project.path), command, action === "rebuild" ? 15 * 60_000 : 3 * 60_000);
  return command;
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
