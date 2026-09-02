import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { db, now } from "./db";
import { run, UserError } from "./shell";
import type { ComposeAction, Project, ProjectInput, Section } from "./types";

const actions: ComposeAction[] = ["start", "stop", "restart", "rebuild"];

type Row = {
  id: string;
  name: string;
  section: Section;
  description: string;
  stack_json: string;
  path: string;
  local_url: string | null;
  testing_url: string | null;
  live_url: string | null;
  compose_file: string | null;
  start_command: string | null;
  stop_command: string | null;
  restart_command: string | null;
  rebuild_command: string | null;
  created_at: string;
  updated_at: string;
};

function fromRow(row: Row): Project {
  return {
    id: row.id,
    name: row.name,
    section: row.section,
    description: row.description,
    stack: JSON.parse(row.stack_json) as string[],
    path: row.path,
    localUrl: row.local_url,
    testingUrl: row.testing_url,
    liveUrl: row.live_url,
    composeFile: row.compose_file,
    commands: { start: row.start_command, stop: row.stop_command, restart: row.restart_command, rebuild: row.rebuild_command },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProjects(): Project[] {
  return (db().prepare("SELECT * FROM projects ORDER BY name COLLATE NOCASE").all() as Row[]).map(fromRow);
}

export function getProject(id: string): Project | null {
  const row = db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
  return row ? fromRow(row) : null;
}

function optionalUrl(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new UserError(`${label} must be a valid http(s) URL`);
  }
}

async function resolveFolder(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new UserError("Choose the project folder");
  const expanded = trimmed === "~" || trimmed.startsWith("~/") ? path.join(homedir(), trimmed.slice(2)) : trimmed;
  if (!path.isAbsolute(expanded)) throw new UserError("The project folder must be an absolute path");
  try {
    const resolved = await realpath(expanded);
    if (!(await stat(resolved)).isDirectory()) throw new UserError("The project path is not a folder");
    return resolved;
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError("That folder does not exist");
  }
}

async function validate(input: ProjectInput) {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new UserError("Enter a project name (max 80 characters)");
  if (input.section !== "work" && input.section !== "personal") throw new UserError("Choose a section");
  const description = input.description.trim().slice(0, 300);
  const stack = [...new Set(input.stack.map((item) => item.trim()).filter(Boolean))].slice(0, 8);
  if (stack.some((item) => item.length > 30)) throw new UserError("Stack labels must be 30 characters or fewer");
  const composeFile = input.composeFile.trim() || null;
  if (composeFile && (!/^[A-Za-z0-9._/-]+$/.test(composeFile) || composeFile.includes(".."))) {
    throw new UserError("The compose file must be a path relative to the project, like docker/compose.yml");
  }
  const commands = Object.fromEntries(
    actions.map((action) => {
      const command = input.commands[action]?.trim() || null;
      if (command && command.length > 500) throw new UserError(`The ${action} command is too long`);
      return [action, command];
    }),
  ) as Record<ComposeAction, string | null>;
  return {
    composeFile,
    commands,
    name,
    section: input.section,
    description,
    stack,
    path: await resolveFolder(input.path),
    localUrl: optionalUrl(input.localUrl, "Local URL"),
    testingUrl: optionalUrl(input.testingUrl, "Testing URL"),
    liveUrl: optionalUrl(input.liveUrl, "Live URL"),
  };
}

function slug(name: string) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "project";
}

function uniqueId(name: string) {
  const base = slug(name);
  const exists = db().prepare("SELECT 1 FROM projects WHERE id = ?");
  if (!exists.get(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    if (!exists.get(`${base}-${suffix}`)) return `${base}-${suffix}`;
  }
  return randomUUID();
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const project = await validate(input);
  if (db().prepare("SELECT 1 FROM projects WHERE path = ?").get(project.path)) {
    throw new UserError("This folder is already registered");
  }
  const id = uniqueId(project.name);
  const timestamp = now();
  db()
    .prepare(
      `INSERT INTO projects (id, name, section, description, stack_json, path, local_url, testing_url, live_url, compose_file, start_command, stop_command, restart_command, rebuild_command, created_at, updated_at)
       VALUES (@id, @name, @section, @description, @stack, @path, @localUrl, @testingUrl, @liveUrl, @composeFile, @start, @stop, @restart, @rebuild, @createdAt, @updatedAt)`,
    )
    .run({
      id,
      name: project.name,
      section: project.section,
      description: project.description,
      stack: JSON.stringify(project.stack),
      path: project.path,
      localUrl: project.localUrl,
      testingUrl: project.testingUrl,
      liveUrl: project.liveUrl,
      composeFile: project.composeFile,
      ...project.commands,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  return getProject(id)!;
}

export async function updateProject(id: string, input: ProjectInput): Promise<Project> {
  if (!getProject(id)) throw new UserError("Project not found");
  const project = await validate(input);
  if (db().prepare("SELECT 1 FROM projects WHERE path = ? AND id != ?").get(project.path, id)) {
    throw new UserError("Another project already uses this folder");
  }
  db()
    .prepare(
      `UPDATE projects SET name = @name, section = @section, description = @description, stack_json = @stack,
       path = @path, local_url = @localUrl, testing_url = @testingUrl, live_url = @liveUrl, compose_file = @composeFile,
       start_command = @start, stop_command = @stop, restart_command = @restart, rebuild_command = @rebuild, updated_at = @updatedAt WHERE id = @id`,
    )
    .run({
      id,
      name: project.name,
      section: project.section,
      description: project.description,
      stack: JSON.stringify(project.stack),
      path: project.path,
      localUrl: project.localUrl,
      testingUrl: project.testingUrl,
      liveUrl: project.liveUrl,
      composeFile: project.composeFile,
      ...project.commands,
      updatedAt: now(),
    });
  return getProject(id)!;
}

export function deleteProject(id: string) {
  const project = getProject(id);
  if (!project) throw new UserError("Project not found");
  db().prepare("DELETE FROM projects WHERE id = ?").run(id);
  return project;
}

// Native macOS folder picker. Only the path comes back; nothing is scanned.
export async function pickFolder() {
  if (process.platform !== "darwin") throw new UserError("The folder picker is only available on macOS");
  try {
    const { stdout } = await run(
      "/usr/bin/osascript",
      ["-e", 'POSIX path of (choose folder with prompt "Choose a project folder")'],
      { timeoutMs: 120_000 },
    );
    return resolveFolder(stdout.trim());
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError("Folder selection was cancelled");
  }
}

// The command DevLaunch runs for an action: the project's own command, else the
// docker compose default when a compose file is configured, else nothing.
export function resolveCommand(project: Project, action: ComposeAction): string | null {
  const custom = project.commands[action];
  if (custom) return custom;
  if (!project.composeFile) return null;
  const compose = `docker compose -f ${JSON.stringify(project.composeFile)} --project-directory .`;
  return { start: `${compose} up -d`, stop: `${compose} stop`, restart: `${compose} restart`, rebuild: `${compose} up -d --build` }[action];
}
