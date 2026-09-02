import { getProject } from "./projects";
import { run, UserError } from "./shell";
import { findComposeFile } from "./status";
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

export async function composeAction(id: string, action: ComposeAction) {
  const project = requireProject(id);
  const composeFile = await findComposeFile(project.path);
  if (!composeFile) throw new UserError("This project has no compose file at its root");
  const args =
    action === "start" ? ["up", "-d"] : action === "rebuild" ? ["up", "-d", "--build"] : [action];
  try {
    await run("docker", ["compose", "-f", composeFile, ...args], {
      cwd: project.path,
      timeoutMs: action === "rebuild" ? 15 * 60_000 : 3 * 60_000,
    });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new UserError(stderr ? stderr.split("\n").at(-1) ?? "Docker command failed" : "Docker command failed");
  }
}

export async function composeLogs(id: string, tail = 150) {
  const project = requireProject(id);
  const composeFile = await findComposeFile(project.path);
  if (!composeFile) throw new UserError("This project has no compose file at its root");
  const { stdout, stderr } = await run(
    "docker",
    ["compose", "-f", composeFile, "logs", "--no-color", "--tail", String(Math.min(Math.max(tail, 20), 500))],
    { cwd: project.path, timeoutMs: 20_000 },
  );
  return stdout || stderr || "No logs yet.";
}
