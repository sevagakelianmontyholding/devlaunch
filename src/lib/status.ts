import { access } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./db";
import { activeDeploysByProject, deploymentSummariesByProject } from "./deploy";
import { activeActionsByProject } from "./docker";
import { repoStatuses } from "./git";
import { activePipelineRunsById, ensureScheduler } from "./pipelines";
import { getTerminalSettings } from "./terminal";
import { ensureUptimeMonitor, uptimeByProject } from "./uptime";
import { listProjects } from "./projects";
import { run } from "./shell";
import type { Container, Project, ProjectRuntime, SessionUser, Status } from "./types";

export async function exists(target: string) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

type DockerGroup = { containers: Container[]; ports: Set<number> };

async function dockerGroups() {
  const groups = new Map<string, DockerGroup>();
  try {
    const { stdout } = await run("docker", [
      "ps",
      "-a",
      "--filter",
      "label=com.docker.compose.project.working_dir",
      "--format",
      '{{.ID}}\t{{.Names}}\t{{.State}}\t{{.Status}}\t{{.Ports}}\t{{.Label "com.docker.compose.project.working_dir"}}',
    ]);
    for (const line of stdout.split("\n")) {
      const [id = "", name = "", state = "", status = "", ports = "", workingDir = ""] = line.split("\t");
      if (!workingDir) continue;
      const key = path.resolve(workingDir);
      const group = groups.get(key) ?? { containers: [], ports: new Set<number>() };
      group.containers.push({ id, name, state, status, ports });
      for (const match of ports.matchAll(/(?:0\.0\.0\.0|127\.0\.0\.1|\[::\]):(\d+)->/g)) {
        group.ports.add(Number(match[1]));
      }
      groups.set(key, group);
    }
    return { available: true, groups };
  } catch {
    return { available: false, groups };
  }
}

async function runtimeFor(project: Project, groups: Map<string, DockerGroup>): Promise<ProjectRuntime> {
  const projectPath = path.resolve(project.path);
  if (!(await exists(projectPath))) {
    return { id: project.id, exists: false, running: false, containers: [], ports: [] };
  }
  const group = groups.get(projectPath);
  const containers = [...(group?.containers ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: project.id,
    exists: true,
    running: containers.some((container) => container.state === "running"),
    containers,
    ports: [...(group?.ports ?? [])].sort((a, b) => a - b),
  };
}

export async function getStatus(user: SessionUser): Promise<Status> {
  ensureScheduler();
  ensureUptimeMonitor();
  const projects = listProjects();
  const docker = await dockerGroups();
  const [runtimes, repos] = await Promise.all([
    Promise.all(projects.map((project) => runtimeFor(project, docker.groups))),
    Promise.all(projects.map(async (project) => [project.id, await repoStatuses(project)] as const)),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    dockerAvailable: docker.available,
    dataDir,
    projects,
    runtimes: Object.fromEntries(runtimes.map((runtime) => [runtime.id, runtime])),
    repos: Object.fromEntries(repos),
    uptime: uptimeByProject(),
    activeDeploys: activeDeploysByProject(),
    activeActions: activeActionsByProject(),
    terminal: getTerminalSettings(),
    deployments: deploymentSummariesByProject(),
    activePipelines: activePipelineRunsById(),
    user,
  };
}
