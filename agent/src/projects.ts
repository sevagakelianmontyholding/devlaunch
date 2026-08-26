import { execFile as execFileCallback } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  getGitHubIntegrationStatus,
  getGitHubRepositoryStatuses,
} from "./github.js";
import {
  findGitRepositories,
  gitRemote,
  type GitRemote,
  type GitRepository,
} from "./git.js";
import { discoverProxyManager } from "./proxy-manager.js";
import {
  getRegisteredProjectPath,
  listRegisteredProjects,
  PROJECTS_ROOT,
} from "./registry.js";
import type {
  DockerContainerStatus,
  DockerStatus,
  GitStatus,
  GitHubProjectStatus,
  ProjectAction,
  ProjectStatus,
  ProxyDomain,
  RegisteredProject,
  StatusResponse,
} from "./types.js";

const execFile = promisify(execFileCallback);

const composeFileNames = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];

type DockerProjectState = {
  running: boolean;
  containerCount: number;
  ports: Set<number>;
  containers: DockerContainerStatus[];
};

type DetectedRepository = GitRepository & {
  key: string;
  remote: GitRemote | null;
  githubUrl: string | null;
};

async function pathExists(target: string) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveProject(id: string) {
  const target = await getRegisteredProjectPath(id);

  try {
    const projectStat = await stat(target);
    if (!projectStat.isDirectory()) throw new AgentError("Project is not a directory", 404);
  } catch (error) {
    if (error instanceof AgentError) throw error;
    throw new AgentError("Project not found", 404);
  }

  return target;
}

async function findComposeFile(projectPath: string) {
  for (const fileName of composeFileNames) {
    const candidate = path.join(projectPath, fileName);
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

function publishedPorts(value: string) {
  const ports = new Set<number>();
  const expression = /(?:0\.0\.0\.0|127\.0\.0\.1|\[::\]):(\d+)->/g;
  for (const match of value.matchAll(expression)) {
    const port = Number(match[1]);
    if (Number.isInteger(port)) ports.add(port);
  }
  return ports;
}

async function dockerProjects() {
  const projects = new Map<string, DockerProjectState>();

  try {
    const { stdout } = await execFile(
      "docker",
      [
        "ps",
        "-a",
        "--filter",
        "label=com.docker.compose.project.working_dir",
        "--format",
        '{{.ID}}\\t{{.Names}}\\t{{.State}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Label "com.docker.compose.project.working_dir"}}',
      ],
      { timeout: 5000, maxBuffer: 2 * 1024 * 1024 },
    );

    for (const line of stdout.trim().split("\n")) {
      if (!line) continue;
      const [id = "", name = "", state = "", status = "", ports = "", workingDirectory = ""] =
        line.split("\t");
      if (!workingDirectory) continue;

      const normalizedPath = path.resolve(workingDirectory);
      const current = projects.get(normalizedPath) ?? {
        running: false,
        containerCount: 0,
        ports: new Set<number>(),
        containers: [],
      };

      current.running ||= state === "running";
      current.containerCount += 1;
      current.containers.push({ id, name, state, status, ports });
      for (const port of publishedPorts(ports)) current.ports.add(port);
      projects.set(normalizedPath, current);
    }

    return { available: true, projects };
  } catch {
    return { available: false, projects };
  }
}

async function gitStatus(repository: GitRepository): Promise<GitStatus> {
  const repositoryPath = repository.path;

  try {
    const [branchResult, statusResult, commitResult, upstreamResult] = await Promise.all([
      execFile("git", ["-C", repositoryPath, "branch", "--show-current"], {
        timeout: 2500,
        maxBuffer: 256 * 1024,
      }),
      execFile("git", ["-C", repositoryPath, "status", "--porcelain"], {
        timeout: 2500,
        maxBuffer: 1024 * 1024,
      }),
      execFile("git", ["-C", repositoryPath, "log", "-1", "--format=%h%x09%s%x09%aI"], {
        timeout: 2500,
        maxBuffer: 256 * 1024,
      }),
      execFile(
        "git",
        ["-C", repositoryPath, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        { timeout: 2500, maxBuffer: 128 * 1024 },
      ).catch(() => null),
    ]);

    const statusLines = statusResult.stdout.trim().split("\n").filter(Boolean);
    const commitParts = commitResult.stdout.trim().split("\t");
    const commitHash = commitParts.shift() ?? "";
    const authoredAt = commitParts.pop() ?? "";
    const upstream = upstreamResult?.stdout.trim() || null;
    let ahead = 0;
    let behind = 0;
    if (upstream) {
      try {
        const { stdout } = await execFile(
          "git",
          ["-C", repositoryPath, "rev-list", "--left-right", "--count", `HEAD...${upstream}`],
          { timeout: 2500, maxBuffer: 128 * 1024 },
        );
        const [aheadValue, behindValue] = stdout.trim().split(/\s+/).map(Number);
        ahead = Number.isFinite(aheadValue) ? aheadValue! : 0;
        behind = Number.isFinite(behindValue) ? behindValue! : 0;
      } catch {
        // The upstream may not have local tracking data yet.
      }
    }

    return {
      repositoryPath: repository.relativePath,
      branch: branchResult.stdout.trim() || "detached",
      upstream,
      ahead,
      behind,
      dirty: statusLines.length > 0,
      changedFiles: statusLines.length,
      lastCommit: commitHash
        ? { hash: commitHash, message: commitParts.join("\t"), authoredAt }
        : null,
    };
  } catch {
    return {
      repositoryPath: repository.relativePath,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      dirty: false,
      changedFiles: 0,
      lastCommit: null,
    };
  }
}

async function projectStatus(
  project: RegisteredProject,
  dockerState: Map<string, DockerProjectState>,
  domains: ProxyDomain[],
  detectedRepositories: DetectedRepository[],
  githubByRepository: Map<string, GitHubProjectStatus>,
  manuallyLinkedGitHub: GitHubProjectStatus | null,
): Promise<ProjectStatus> {
  const projectPath = path.resolve(project.localPath);
  if (!(await pathExists(projectPath))) {
    return {
      id: project.id,
      exists: false,
      git: null,
      docker: {
        composeAvailable: false,
        running: false,
        containerCount: 0,
        ports: [],
        containers: [],
      },
      github: manuallyLinkedGitHub,
      repositories: [],
      domains,
      localUrls: [],
      checkedAt: new Date().toISOString(),
    };
  }
  const [composeFile, repositories] = await Promise.all([
    findComposeFile(projectPath),
    Promise.all(
      detectedRepositories.map(async (repository) => {
        const git = await gitStatus(repository);
        const github = githubByRepository.get(repository.key) ?? null;
        return {
          relativePath: repository.relativePath,
          remoteUrl: repository.remote?.rawUrl ?? null,
          githubUrl: repository.githubUrl,
          accountHint: github?.account ?? null,
          git,
          github,
        };
      }),
    ),
  ]);
  const git = repositories[0]?.git ?? null;
  const github = repositories.find((repository) => repository.github)?.github ?? manuallyLinkedGitHub;
  const liveDockerState = dockerState.get(projectPath);
  const ports = [...(liveDockerState?.ports ?? [])].sort((left, right) => left - right);
  const docker: DockerStatus = {
    composeAvailable: composeFile !== null,
    running: liveDockerState?.running ?? false,
    containerCount: liveDockerState?.containerCount ?? 0,
    ports,
    containers: [...(liveDockerState?.containers ?? [])].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };

  return {
    id: project.id,
    exists: true,
    git,
    docker,
    github,
    repositories,
    domains,
    localUrls: ports.map((port) => `http://localhost:${port}`),
    checkedAt: new Date().toISOString(),
  };
}

export async function getStatus(): Promise<StatusResponse> {
  const [registry, docker, github] = await Promise.all([
    listRegisteredProjects(),
    dockerProjects(),
    getGitHubIntegrationStatus(),
  ]);
  const repositoryEntries = await Promise.all(
    registry.map(async (project) => {
      const discoveredRepositories = await findGitRepositories(path.resolve(project.localPath));
      const repositories = project.repositoryPaths
        ? project.repositoryPaths
            .map((repositoryPath) =>
              discoveredRepositories.find(
                (repository) => repository.relativePath === repositoryPath,
              ),
            )
            .filter((repository): repository is GitRepository => Boolean(repository))
        : discoveredRepositories;
      const detected = await Promise.all(
        repositories.map(async (repository, index): Promise<DetectedRepository> => {
          const remote = await gitRemote(repository.path);
          return {
            ...repository,
            key: `${project.id}:${repository.relativePath}`,
            remote,
            githubUrl: index === 0 && project.github ? project.github : remote?.githubUrl ?? null,
          };
        }),
      );
      return [project.id, detected] as const;
    }),
  );
  const repositoriesByProject = new Map(repositoryEntries);
  const githubRequests = registry.flatMap((project) => {
    const repositories = repositoriesByProject.get(project.id) ?? [];
    const requests = repositories
      .filter((repository): repository is DetectedRepository & { githubUrl: string } => Boolean(repository.githubUrl))
      .map((repository) => ({
        key: repository.key,
        repositoryUrl: repository.githubUrl,
        hostAlias: repository.remote?.hostAlias ?? null,
      }));
    if (requests.length === 0 && project.github) {
      requests.push({
        key: `${project.id}:manual`,
        repositoryUrl: project.github,
        hostAlias: null,
      });
    }
    return requests;
  });
  const githubByRepository = await getGitHubRepositoryStatuses(githubRequests, github);
  const ids = registry.map((project) => project.id);
  const projectIdByPath = new Map(
    registry.map((project) => [path.resolve(project.localPath), project.id]),
  );
  const containerProjects = new Map<string, string>();
  for (const [projectPath, state] of docker.projects) {
    const projectId = projectIdByPath.get(path.resolve(projectPath)) ?? path.basename(projectPath);
    for (const container of state.containers) containerProjects.set(container.name, projectId);
  }
  const proxyManager = await discoverProxyManager(ids, containerProjects);
  const domainsByProject = new Map<string, ProxyDomain[]>();
  for (const domain of proxyManager.domains) {
    if (!domain.projectId) continue;
    const current = domainsByProject.get(domain.projectId) ?? [];
    current.push(domain);
    domainsByProject.set(domain.projectId, current);
  }
  const projects = await Promise.all(
    registry.map((project) =>
      projectStatus(
        project,
        docker.projects,
        domainsByProject.get(project.id) ?? [],
        repositoriesByProject.get(project.id) ?? [],
        githubByRepository,
        githubByRepository.get(`${project.id}:manual`) ?? null,
      ),
    ),
  );
  const checkedAt = new Date().toISOString();

  return {
    agent: {
      online: true,
      dockerAvailable: docker.available,
      projectsRoot: PROJECTS_ROOT,
      checkedAt,
    },
    github,
    proxyManager,
    registry,
    projects,
  };
}

export async function runProjectAction(id: string, action: ProjectAction) {
  const projectPath = await resolveProject(id);

  if (action === "open-code") {
    if (process.platform === "darwin") {
      await execFile("open", ["-a", "Visual Studio Code", projectPath], { timeout: 5000 });
    } else {
      await execFile("code", [projectPath], { timeout: 5000 });
    }
    return { ok: true, id, action, message: `Opened ${id} in VS Code` };
  }

  if (id === "devlaunch" && (action === "stop" || action === "restart" || action === "rebuild")) {
    throw new AgentError("DevLaunch cannot stop, restart, or rebuild its own frontend", 409);
  }

  const composeFile = await findComposeFile(projectPath);
  if (!composeFile) throw new AgentError("This project has no root Compose file", 409);

  const composeAction =
    action === "start"
      ? ["up", "-d"]
      : action === "rebuild"
        ? ["up", "-d", "--build"]
        : [action];
  await execFile("docker", ["compose", "-f", composeFile, ...composeAction], {
    cwd: projectPath,
    timeout: action === "rebuild" ? 600_000 : 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });

  return {
    ok: true,
    id,
    action,
    message: `${action === "start" ? "Started" : action === "stop" ? "Stopped" : action === "restart" ? "Restarted" : "Rebuilt"} ${id}`,
  };
}

export async function getProjectLogs(id: string, tail = 120) {
  const projectPath = await resolveProject(id);
  const composeFile = await findComposeFile(projectPath);
  if (!composeFile) throw new AgentError("This project has no root Compose file", 409);

  const safeTail = Math.min(Math.max(Math.trunc(tail), 20), 500);
  const { stdout, stderr } = await execFile(
    "docker",
    ["compose", "-f", composeFile, "logs", "--no-color", "--tail", String(safeTail)],
    {
      cwd: projectPath,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );

  return {
    id,
    logs: stdout || stderr || "No logs are available for this project.",
    fetchedAt: new Date().toISOString(),
  };
}

export class AgentError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
