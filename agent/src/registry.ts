import { execFile as execFileCallback } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { queryDatabase, runDatabase, sqlText } from "./database.js";
import { findGitRepositories, gitRemote, githubRemote } from "./git.js";
import type {
  ProjectCategory,
  ProjectInspection,
  RegisteredProject,
} from "./types.js";

const execFile = promisify(execFileCallback);

export const PROJECTS_ROOT = path.resolve(
  process.env.DEVLAUNCH_PROJECTS_ROOT ?? path.join(homedir(), "projects"),
);

let registrySeeded = false;

type ProjectRow = {
  id: string;
  folder_name: string;
  local_path: string | null;
  name: string;
  description: string;
  category: ProjectCategory;
  stack_json: string | null;
  repository_paths_json: string | null;
  github_url: string | null;
  local_url: string | null;
  live_url: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectMutationInput = {
  localPath: string;
  name: string;
  description?: string;
  category: ProjectCategory;
  stack?: string[];
  repositoryPaths?: string[];
  github?: string;
  local?: string;
  live?: string;
};

export class RegistryError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function pathExists(target: string) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function displayName(id: string) {
  return id
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function projectPath(id: string) {
  const target = path.resolve(PROJECTS_ROOT, id);
  if (path.dirname(target) !== PROJECTS_ROOT) {
    throw new RegistryError("Project is outside the workspace", 403);
  }
  return target;
}

export async function detectStack(localPath: string) {
  const stack: string[] = [];
  const add = (value: string) => {
    if (!stack.includes(value)) stack.push(value);
  };

  const composeFiles = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
  if ((await Promise.all(composeFiles.map((file) => pathExists(path.join(localPath, file))))).some(Boolean)) {
    add("Docker");
  }

  for (const packageDirectory of [localPath, path.join(localPath, "frontend"), path.join(localPath, "app")]) {
    try {
      const packageJson = JSON.parse(
        await readFile(path.join(packageDirectory, "package.json"), "utf8"),
      ) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (dependencies.next) add("Next.js");
      if (dependencies.nuxt) add("Nuxt");
      if (dependencies.vue) add("Vue");
      if (dependencies.react) add("React");
      if (dependencies.typescript) add("TypeScript");
      if (dependencies.vite) add("Vite");
      if (dependencies.strapi || dependencies["@strapi/strapi"]) add("Strapi");
      if (stack.length === 0) add("Node.js");
    } catch {
      // This location is not a JavaScript workspace.
    }
  }

  if (await pathExists(path.join(localPath, "artisan"))) add("Laravel");
  if (await pathExists(path.join(localPath, "wp-config.php"))) add("WordPress");
  if (await pathExists(path.join(localPath, "go.mod"))) add("Go");
  if (await pathExists(path.join(localPath, "Cargo.toml"))) add("Rust");
  if (
    (await pathExists(path.join(localPath, "pyproject.toml"))) ||
    (await pathExists(path.join(localPath, "requirements.txt")))
  ) {
    add("Python");
  }

  return stack.length > 0 ? stack.slice(0, 4) : ["Local"];
}

function parseStack(value: string | null) {
  if (!value) return null;
  try {
    const stack = JSON.parse(value) as unknown;
    return Array.isArray(stack)
      ? stack.filter((item): item is string => typeof item === "string").slice(0, 8)
      : null;
  } catch {
    return null;
  }
}

function optionalUrl(value: string | undefined, field: string) {
  const normalized = value?.trim();
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new RegistryError(`${field} must be a valid http or https URL`, 400);
  }
}

function normalizeStack(stack: string[] | undefined) {
  const normalized = (stack ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 8);
  if (normalized.some((item) => item.length > 30)) {
    throw new RegistryError("Stack labels must be 30 characters or fewer", 400);
  }
  return normalized.length > 0 ? normalized : ["Local"];
}

async function resolveLocalPath(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new RegistryError("Enter a project folder path", 400);
  const expanded = trimmed === "~" || trimmed.startsWith("~/")
    ? path.join(homedir(), trimmed.slice(2))
    : trimmed;
  if (!path.isAbsolute(expanded)) {
    throw new RegistryError("Project path must be an absolute path", 400);
  }
  try {
    const resolved = await realpath(expanded);
    const projectStat = await stat(resolved);
    if (!projectStat.isDirectory()) throw new RegistryError("Project path is not a directory", 400);
    return resolved;
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    throw new RegistryError("Project folder does not exist", 404);
  }
}

async function validateProjectInput(input: ProjectMutationInput) {
  if (input.category !== "work" && input.category !== "personal") {
    throw new RegistryError("Choose Work or Personal", 400);
  }
  const localPath = await resolveLocalPath(input.localPath);
  const name = input.name.trim();
  if (!name) throw new RegistryError("Enter a project name", 400);
  if (name.length > 100) {
    throw new RegistryError("Project name must be 100 characters or fewer", 400);
  }
  const description = input.description?.trim() ?? "";
  if (description.length > 300) {
    throw new RegistryError("Description must be 300 characters or fewer", 400);
  }
  let repositoryPaths: string[] | null = null;
  if (input.repositoryPaths !== undefined) {
    repositoryPaths = input.repositoryPaths
      .map((repositoryPath) => repositoryPath.trim())
      .filter(Boolean)
      .filter((repositoryPath, index, items) => items.indexOf(repositoryPath) === index);
    if (repositoryPaths.length === 0) {
      throw new RegistryError("Choose at least one Git repository folder", 400);
    }
    const detectedPaths = new Set(
      (await findGitRepositories(localPath)).map((repository) => repository.relativePath),
    );
    const invalidPath = repositoryPaths.find((repositoryPath) => !detectedPaths.has(repositoryPath));
    if (invalidPath) {
      throw new RegistryError(
        `${invalidPath === "." ? "Project root" : invalidPath} is not a detected Git repository`,
        400,
      );
    }
  }
  return {
    localPath,
    name,
    description,
    category: input.category,
    stack: normalizeStack(input.stack),
    repositoryPaths,
    github: optionalUrl(input.github, "GitHub URL"),
    local: optionalUrl(input.local, "Local URL"),
    live: optionalUrl(input.live, "Live URL"),
  };
}

function idFromPath(localPath: string) {
  const base = path.basename(localPath)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return base || "project";
}

async function uniqueProjectId(localPath: string) {
  const base = idFromPath(localPath);
  const rows = await queryDatabase<{ id: string }>(
    `SELECT id FROM projects WHERE id = ${sqlText(base)} OR id LIKE ${sqlText(`${base}-%`)}`,
  );
  const ids = new Set(rows.map((row) => row.id));
  if (!ids.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!ids.has(candidate)) return candidate;
  }
  throw new RegistryError("Could not create a unique project id", 409);
}

async function enrichRow(row: ProjectRow): Promise<RegisteredProject> {
  const localPath = row.local_path ? path.resolve(row.local_path) : projectPath(row.folder_name);
  const stack = parseStack(row.stack_json) ?? (await detectStack(localPath));
  return {
    id: row.id,
    name: row.name,
    description: row.description || `${stack.join(" · ")} project in the local workspace.`,
    category: row.category,
    stack,
    localPath,
    repositoryPaths: parseStack(row.repository_paths_json),
    github: row.github_url ?? (await githubRemote(localPath)),
    local: row.local_url,
    live: row.live_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function discoverProjectFolders() {
  const entries = await readdir(PROJECTS_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function seedRegistry() {
  if (registrySeeded) return;
  const [seedMarker] = await queryDatabase<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = 'catalog_seeded' LIMIT 1",
  );
  if (seedMarker) {
    registrySeeded = true;
    return;
  }
  const [existing] = await queryDatabase<{ count: number }>("SELECT COUNT(*) AS count FROM projects");
  if ((existing?.count ?? 0) > 0) {
    await runDatabase(`
      UPDATE projects
      SET local_path = ${sqlText(`${PROJECTS_ROOT}/`)} || folder_name
      WHERE local_path IS NULL OR local_path = ''
    `);
    await runDatabase(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('catalog_seeded', '1')",
    );
    registrySeeded = true;
    return;
  }

  const now = new Date().toISOString();
  const ids = await discoverProjectFolders();
  if (ids.length > 0) {
    const values = ids
      .map(
        (id) =>
          `(${sqlText(id)}, ${sqlText(id)}, ${sqlText(projectPath(id))}, ${sqlText(displayName(id))}, '', 'work', ${sqlText(now)}, ${sqlText(now)})`,
      )
      .join(",\n");
    await runDatabase(`
      INSERT OR IGNORE INTO projects
        (id, folder_name, local_path, name, description, category, created_at, updated_at)
      VALUES ${values}
    `);
  }
  await runDatabase(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('catalog_seeded', '1')",
  );
  registrySeeded = true;
}

export async function listRegisteredProjects() {
  await seedRegistry();
  const rows = await queryDatabase<ProjectRow>(
    "SELECT * FROM projects ORDER BY name COLLATE NOCASE",
  );
  return Promise.all(rows.map(enrichRow));
}

export async function getRegisteredProjectPath(id: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new RegistryError("Invalid project id", 400);
  }
  await seedRegistry();
  const [row] = await queryDatabase<{ local_path: string | null; folder_name: string }>(
    `SELECT local_path, folder_name FROM projects WHERE id = ${sqlText(id)} LIMIT 1`,
  );
  if (!row) throw new RegistryError("Project is not registered", 404);
  return row.local_path ? path.resolve(row.local_path) : projectPath(row.folder_name);
}

export async function inspectProjectPath(input: string): Promise<ProjectInspection> {
  const localPath = await resolveLocalPath(input);
  const repositories = await Promise.all(
    (await findGitRepositories(localPath)).map(async (repository) => ({
      relativePath: repository.relativePath,
      github: (await gitRemote(repository.path))?.githubUrl ?? null,
    })),
  );
  return {
    localPath,
    suggestedName: displayName(path.basename(localPath)),
    stack: await detectStack(localPath),
    github: repositories[0]?.github ?? null,
    repositories,
  };
}

export async function selectProjectFolder() {
  if (process.platform !== "darwin") {
    throw new RegistryError("Native folder browsing is currently available on macOS", 409);
  }
  try {
    const { stdout } = await execFile(
      "/usr/bin/osascript",
      ["-e", 'POSIX path of (choose folder with prompt "Choose a DevLaunch project folder")'],
      { timeout: 120_000, maxBuffer: 128 * 1024 },
    );
    return { localPath: await resolveLocalPath(stdout.trim()) };
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    throw new RegistryError("Folder selection was cancelled", 409);
  }
}

export async function addProject(input: ProjectMutationInput) {
  const project = await validateProjectInput(input);
  const { localPath, name, description, category, stack, repositoryPaths, github, local, live } = project;
  const [registeredPath] = await queryDatabase<{ id: string }>(
    `SELECT id FROM projects WHERE local_path = ${sqlText(localPath)} LIMIT 1`,
  );
  if (registeredPath) throw new RegistryError("This folder is already registered", 409);
  const id = await uniqueProjectId(localPath);
  const now = new Date().toISOString();
  try {
    await runDatabase(`
      INSERT INTO projects
        (id, folder_name, local_path, name, description, category, stack_json, repository_paths_json, github_url, local_url, live_url, created_at, updated_at)
      VALUES (
        ${sqlText(id)},
        ${sqlText(id)},
        ${sqlText(localPath)},
        ${sqlText(name)},
        ${sqlText(description)},
        ${sqlText(category)},
        ${sqlText(JSON.stringify(stack))},
        ${repositoryPaths ? sqlText(JSON.stringify(repositoryPaths)) : "NULL"},
        ${github ? sqlText(github) : "NULL"},
        ${local ? sqlText(local) : "NULL"},
        ${live ? sqlText(live) : "NULL"},
        ${sqlText(now)},
        ${sqlText(now)}
      )
    `);
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    throw new RegistryError("This project is already registered", 409);
  }

  return enrichRow({
    id,
    folder_name: id,
    local_path: localPath,
    name,
    description,
    category,
    stack_json: JSON.stringify(stack),
    repository_paths_json: repositoryPaths ? JSON.stringify(repositoryPaths) : null,
    github_url: github,
    local_url: local,
    live_url: live,
    created_at: now,
    updated_at: now,
  });
}

export async function updateProject(id: string, input: ProjectMutationInput) {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new RegistryError("Invalid project id", 400);
  await seedRegistry();
  const [current] = await queryDatabase<ProjectRow>(
    `SELECT * FROM projects WHERE id = ${sqlText(id)} LIMIT 1`,
  );
  if (!current) throw new RegistryError("Project is not registered", 404);

  const project = await validateProjectInput(input);
  const { localPath, name, description, category, stack, repositoryPaths, github, local, live } = project;
  const [pathConflict] = await queryDatabase<{ id: string }>(
    `SELECT id FROM projects WHERE local_path = ${sqlText(localPath)} AND id != ${sqlText(id)} LIMIT 1`,
  );
  if (pathConflict) throw new RegistryError("This folder is already registered", 409);

  const now = new Date().toISOString();
  await runDatabase(`
    UPDATE projects
    SET
      local_path = ${sqlText(localPath)},
      name = ${sqlText(name)},
      description = ${sqlText(description)},
      category = ${sqlText(category)},
      stack_json = ${sqlText(JSON.stringify(stack))},
      repository_paths_json = ${repositoryPaths ? sqlText(JSON.stringify(repositoryPaths)) : "NULL"},
      github_url = ${github ? sqlText(github) : "NULL"},
      local_url = ${local ? sqlText(local) : "NULL"},
      live_url = ${live ? sqlText(live) : "NULL"},
      updated_at = ${sqlText(now)}
    WHERE id = ${sqlText(id)}
  `);

  return enrichRow({
    ...current,
    local_path: localPath,
    name,
    description,
    category,
    stack_json: JSON.stringify(stack),
    repository_paths_json: repositoryPaths ? JSON.stringify(repositoryPaths) : null,
    github_url: github,
    local_url: local,
    live_url: live,
    updated_at: now,
  });
}

export async function removeProject(id: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new RegistryError("Invalid project id", 400);
  await seedRegistry();
  const [project] = await queryDatabase<{ name: string; local_path: string | null }>(
    `SELECT name, local_path FROM projects WHERE id = ${sqlText(id)} LIMIT 1`,
  );
  if (!project) throw new RegistryError("Project is not registered", 404);
  await runDatabase(`DELETE FROM projects WHERE id = ${sqlText(id)}`);
  return {
    ok: true,
    id,
    name: project.name,
    localPath: project.local_path,
    message: `${project.name} was removed from DevLaunch. Its folder was not deleted.`,
  };
}
