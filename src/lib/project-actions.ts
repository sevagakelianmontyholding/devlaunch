import { randomUUID } from "node:crypto";
import path from "node:path";
import { db, now } from "./db";
import { launchRun } from "./docker";
import { getProject } from "./projects";
import { getServerRow, sshArgs, writeKey } from "./servers";
import { shQuote, UserError } from "./shell";
import type { LocalRun, ProjectAction, ProjectActionInput } from "./types";

type Row = {
  id: string;
  project_id: string;
  name: string;
  command: string;
  server_id: string | null;
  server_name: string | null;
  working_dir: string | null;
  confirm: number;
  position: number;
  created_at: string;
  updated_at: string;
};

const select = `
  SELECT project_actions.*, servers.name AS server_name
  FROM project_actions LEFT JOIN servers ON servers.id = project_actions.server_id
`;

function fromRow(row: Row): ProjectAction {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    command: row.command,
    serverId: row.server_id,
    serverName: row.server_name,
    workingDir: row.working_dir ?? "",
    confirm: row.confirm === 1,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProjectActions(projectId: string): ProjectAction[] {
  return (db().prepare(`${select} WHERE project_id = ? ORDER BY position, name COLLATE NOCASE`).all(projectId) as Row[]).map(fromRow);
}

export function actionsByProject(): Record<string, ProjectAction[]> {
  const result: Record<string, ProjectAction[]> = {};
  for (const row of db().prepare(`${select} ORDER BY position, name COLLATE NOCASE`).all() as Row[]) {
    (result[row.project_id] ??= []).push(fromRow(row));
  }
  return result;
}

export function getProjectAction(id: string): ProjectAction {
  const row = db().prepare(`${select} WHERE project_actions.id = ?`).get(id) as Row | undefined;
  if (!row) throw new UserError("Action not found");
  return fromRow(row);
}

export function commandLines(command: string) {
  return command
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function validate(input: ProjectActionInput) {
  const name = input.name.trim();
  if (!name || name.length > 40) throw new UserError("Enter an action name (max 40 characters)");
  const command = input.command.replace(/\r\n/g, "\n").trim();
  if (commandLines(command).length === 0) throw new UserError("Enter at least one command");
  if (command.length > 4000) throw new UserError("The command is too long");
  const serverId = input.serverId?.trim() || null;
  if (serverId) getServerRow(serverId);
  const workingDir = input.workingDir.trim();
  if (serverId) {
    if (!workingDir || (!workingDir.startsWith("/") && !workingDir.startsWith("~"))) throw new UserError("Enter the absolute directory on the server where the command runs");
  } else if (workingDir && (!/^[A-Za-z0-9._ /-]+$/.test(workingDir) || workingDir.includes(".."))) {
    throw new UserError("The working directory must be a path relative to the project folder");
  }
  return { name, command, serverId, workingDir, confirm: Boolean(input.confirm) };
}

export function saveProjectAction(projectId: string, id: string | null, input: ProjectActionInput): ProjectAction {
  if (!getProject(projectId)) throw new UserError("Project not found");
  const action = validate(input);
  const timestamp = now();
  if (id) {
    getProjectAction(id);
    db()
      .prepare("UPDATE project_actions SET name = ?, command = ?, server_id = ?, working_dir = ?, confirm = ?, updated_at = ? WHERE id = ? AND project_id = ?")
      .run(action.name, action.command, action.serverId, action.workingDir, action.confirm ? 1 : 0, timestamp, id, projectId);
    return getProjectAction(id);
  }
  const position = ((db().prepare("SELECT MAX(position) AS max FROM project_actions WHERE project_id = ?").get(projectId) as { max: number | null }).max ?? -1) + 1;
  const newId = randomUUID();
  db()
    .prepare("INSERT INTO project_actions (id, project_id, name, command, server_id, working_dir, confirm, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(newId, projectId, action.name, action.command, action.serverId, action.workingDir, action.confirm ? 1 : 0, position, timestamp, timestamp);
  return getProjectAction(newId);
}

export function deleteProjectAction(id: string) {
  const action = getProjectAction(id);
  db().prepare("DELETE FROM project_actions WHERE id = ?").run(id);
  return action;
}

// Local actions run in the project folder through the login shell; server
// actions run the same lines over SSH in the given directory. Both stream
// their output as a tracked local run, like start/stop and git.
export async function runProjectAction(id: string): Promise<LocalRun> {
  const action = getProjectAction(id);
  const project = getProject(action.projectId);
  if (!project) throw new UserError("Project not found");
  const lines = commandLines(action.command);
  if (action.serverId) {
    const server = getServerRow(action.serverId);
    await writeKey(server.id, server.private_key);
    const remote = `cd ${shQuote(action.workingDir)} && ${lines.join(" && ")}`;
    const command = ["ssh", ...sshArgs(server).map(shQuote), shQuote(remote)].join(" ");
    return launchRun(project, "custom", command, path.resolve(project.path), 20 * 60_000, `${action.name} → ${server.name} (${server.username}@${server.host}) in ${action.workingDir}\n${lines.map((line) => `  $ ${line}`).join("\n")}\n\n`, action.name);
  }
  const cwd = path.resolve(project.path, action.workingDir || ".");
  if (!cwd.startsWith(path.resolve(project.path))) throw new UserError("The working directory must stay inside the project folder");
  return launchRun(project, "custom", lines.join(" && "), cwd, 20 * 60_000, `${action.name} on this Mac in ${cwd}\n${lines.map((line) => `  $ ${line}`).join("\n")}\n\n`, action.name);
}
