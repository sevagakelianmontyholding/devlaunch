import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { launchRun } from "./docker";
import { getProject } from "./projects";
import { run, shQuote, UserError } from "./shell";
import type { GitAction, LocalRun, Project, RepoStatus } from "./types";

const MAX_REPOS = 12;
const SKIP = new Set(["node_modules", "vendor", "dist", "build", ".next"]);

async function isRepo(dir: string) {
  try {
    await stat(path.join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

// The project folder itself and its immediate subfolders (plus any extra
// folders the user listed). Nothing deeper, nothing outside the project.
export async function discoverRepos(project: Project): Promise<Array<{ path: string; name: string; abs: string }>> {
  const root = path.resolve(project.path);
  const found: Array<{ path: string; name: string; abs: string }> = [];
  if (await isRepo(root)) found.push({ path: ".", name: path.basename(root), abs: root });
  let entries: Dirent[] = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
    const abs = path.join(root, entry.name);
    if (await isRepo(abs)) found.push({ path: entry.name, name: entry.name, abs });
  }
  for (const extra of project.repoPaths) {
    const abs = path.resolve(root, extra);
    if (!abs.startsWith(root) || found.some((repo) => repo.abs === abs)) continue;
    if (await isRepo(abs)) found.push({ path: extra, name: extra, abs });
  }
  return found.slice(0, MAX_REPOS);
}

function git(abs: string, args: string[], timeoutMs = 5000) {
  return run("git", ["-C", abs, ...args], { timeoutMs });
}

async function statusFor(repo: { path: string; name: string; abs: string }): Promise<RepoStatus> {
  const base = { path: repo.path, name: repo.name };
  try {
    const [branchResult, porcelain, counts, last] = await Promise.all([
      git(repo.abs, ["symbolic-ref", "--short", "-q", "HEAD"]).catch(() => ({ stdout: "" })),
      git(repo.abs, ["status", "--porcelain"]),
      git(repo.abs, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]).catch(() => null),
      git(repo.abs, ["log", "-1", "--format=%h%x1f%s%x1f%cI"]).catch(() => ({ stdout: "" })),
    ]);
    let branch = branchResult.stdout.trim();
    if (!branch) {
      const head = await git(repo.abs, ["rev-parse", "--short", "HEAD"]).catch(() => ({ stdout: "" }));
      branch = head.stdout.trim() ? `detached ${head.stdout.trim()}` : "no commits";
    }
    const [ahead = "0", behind = "0"] = (counts?.stdout ?? "").trim().split(/\s+/);
    const [hash = "", subject = "", date = ""] = last.stdout.trim().split("\x1f");
    return {
      ...base,
      branch,
      changed: porcelain.stdout.split("\n").filter(Boolean).length,
      ahead: counts ? Number(ahead) || 0 : 0,
      behind: counts ? Number(behind) || 0 : 0,
      upstream: counts !== null,
      lastCommit: hash ? { hash, subject, date } : null,
      error: null,
    };
  } catch (error) {
    return { ...base, branch: "", changed: 0, ahead: 0, behind: 0, upstream: false, lastCommit: null, error: error instanceof Error ? error.message.split("\n")[0]! : "git failed" };
  }
}

export async function repoStatuses(project: Project): Promise<RepoStatus[]> {
  const repos = await discoverRepos(project);
  return Promise.all(repos.map(statusFor));
}

// Deploy pre-check across every repo of the project: uncommitted changes or
// commits not yet pulled. Returns null when there is nothing to complain about.
export async function gitProblems(project: Project): Promise<string | null> {
  const repos = await discoverRepos(project);
  const problems: string[] = [];
  for (const repo of repos) {
    try {
      await git(repo.abs, ["fetch", "--quiet"], 20_000);
    } catch {
      // No upstream or offline: only the local state can be checked.
    }
    const status = await statusFor(repo);
    const parts: string[] = [];
    if (status.changed > 0) parts.push(`${status.changed} uncommitted change${status.changed === 1 ? "" : "s"}`);
    if (status.behind > 0) parts.push(`${status.behind} commit${status.behind === 1 ? "" : "s"} behind origin`);
    if (parts.length) problems.push(`${status.name} has ${parts.join(" and ")}`);
  }
  return problems.length ? problems.join("; ") : null;
}

const verbs: Record<GitAction, string> = { fetch: "Fetching", pull: "Pulling", push: "Pushing", commit: "Committing and pushing" };

// Runs one git action on one repo, or on every repo of the project when
// repoPath is null, as a tracked local run whose output streams to the UI.
export async function startGitRun(projectId: string, repoPath: string | null, action: GitAction, message = ""): Promise<LocalRun> {
  const project = getProject(projectId);
  if (!project) throw new UserError("Project not found");
  const all = await discoverRepos(project);
  if (all.length === 0) throw new UserError("No git repositories found in this project");
  const repos = repoPath === null ? all : all.filter((repo) => repo.path === repoPath);
  if (repos.length === 0) throw new UserError("That repository is no longer in the project");
  const statuses = await Promise.all(repos.map(statusFor));
  const trimmed = message.trim();
  if (action === "commit" && (!trimmed || trimmed.length > 500)) throw new UserError("Enter a commit message (max 500 characters)");

  const steps: string[] = [];
  for (const [index, repo] of repos.entries()) {
    const status = statuses[index]!;
    let command: string | null = null;
    if (action === "fetch") command = "git fetch --prune";
    if (action === "pull") {
      if (status.changed > 0) throw new UserError(`${repo.name} has ${status.changed} uncommitted change${status.changed === 1 ? "" : "s"} — commit or stash before pulling`);
      command = "git pull --ff-only";
    }
    if (action === "push") command = status.upstream ? "git push" : "git push -u origin HEAD";
    if (action === "commit") {
      const push = status.upstream ? "git push" : "git push -u origin HEAD";
      if (status.changed > 0) command = `git add -A && git commit -m ${shQuote(trimmed)} && ${push}`;
      else if (status.ahead > 0 || !status.upstream) command = push;
      else if (repos.length === 1) throw new UserError(`Nothing to commit or push in ${repo.name}`);
    }
    if (!command) continue;
    steps.push(`echo "▶ ${repo.name.replaceAll('"', "")}" && (cd ${shQuote(repo.abs)} && ${command})`);
  }
  if (steps.length === 0) throw new UserError("Nothing to commit or push");
  const label = repos.length === 1 ? `${verbs[action]} ${repos[0]!.name}` : `${verbs[action]} ${repos.length} repositories`;
  return launchRun(project, action, steps.join(" && "), path.resolve(project.path), 5 * 60_000, `${label}\n`);
}
