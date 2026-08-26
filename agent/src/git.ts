import { execFile as execFileCallback } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const preferredFolders = ["frontend", "backend", "app", "web", "client", "api", "server"];
const workspaceFolders = new Set(["apps", "packages"]);

async function pathExists(target: string) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export type GitRepository = {
  path: string;
  relativePath: string;
};

export type GitRemote = {
  rawUrl: string;
  githubUrl: string | null;
  hostAlias: string | null;
};

async function childDirectories(parent: string) {
  try {
    return (await readdir(parent, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function findGitRepositories(projectPath: string): Promise<GitRepository[]> {
  const repositories: GitRepository[] = [];
  if (await pathExists(path.join(projectPath, ".git"))) {
    repositories.push({ path: projectPath, relativePath: "." });
  }

  const children = await childDirectories(projectPath);
  const orderedChildren = [...children].sort((left, right) => {
    const leftPriority = preferredFolders.indexOf(left);
    const rightPriority = preferredFolders.indexOf(right);
    if (leftPriority !== -1 || rightPriority !== -1) {
      return (leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority) -
        (rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority);
    }
    return left.localeCompare(right);
  });

  for (const child of orderedChildren) {
    const candidate = path.join(projectPath, child);
    if (await pathExists(path.join(candidate, ".git"))) {
      repositories.push({ path: candidate, relativePath: child });
    }
    if (!workspaceFolders.has(child)) continue;
    for (const workspaceChild of await childDirectories(candidate)) {
      const nestedRelativePath = path.join(child, workspaceChild);
      const nestedCandidate = path.join(projectPath, nestedRelativePath);
      if (await pathExists(path.join(nestedCandidate, ".git"))) {
        repositories.push({ path: nestedCandidate, relativePath: nestedRelativePath });
      }
    }
  }

  return repositories;
}

export async function findGitRepository(projectPath: string): Promise<GitRepository | null> {
  return (await findGitRepositories(projectPath))[0] ?? null;
}

function normalizeGitHubRemote(remote: string) {
  const trimmed = remote.trim();
  const scpRemote = trimmed.match(/^git@([^:]+):(.+)$/);
  if (scpRemote) {
    const host = scpRemote[1];
    const repository = scpRemote[2];
    if (host && repository && (host === "github.com" || host.startsWith("github-"))) {
      return `https://github.com/${repository.replace(/\.git$/, "")}`;
    }
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname === "github.com") {
      return `https://github.com/${url.pathname.replace(/^\//, "").replace(/\.git$/, "")}`;
    }
  } catch {
    // This remote is not a GitHub URL DevLaunch recognizes.
  }
  return null;
}

export async function gitRemote(repositoryPath: string): Promise<GitRemote | null> {
  try {
    const { stdout } = await execFile(
      "git",
      ["-C", repositoryPath, "remote", "get-url", "origin"],
      { timeout: 2500, maxBuffer: 128 * 1024 },
    );
    const rawUrl = stdout.trim();
    if (!rawUrl) return null;
    const scpRemote = rawUrl.match(/^git@([^:]+):/);
    let hostAlias = scpRemote?.[1] ?? null;
    if (!hostAlias) {
      try {
        hostAlias = new URL(rawUrl).hostname || null;
      } catch {
        // Not every valid Git remote is URL-shaped.
      }
    }
    return { rawUrl, githubUrl: normalizeGitHubRemote(rawUrl), hostAlias };
  } catch {
    return null;
  }
}

export async function githubRemote(projectPath: string) {
  const repository = await findGitRepository(projectPath);
  if (!repository) return null;
  return (await gitRemote(repository.path))?.githubUrl ?? null;
}
