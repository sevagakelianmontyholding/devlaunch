export type GitStatus = {
  repositoryPath: string;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  dirty: boolean;
  changedFiles: number;
  lastCommit: {
    hash: string;
    message: string;
    authoredAt: string;
  } | null;
};

export type GitHubPullRequest = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  headRefName: string;
  reviewDecision: string | null;
  updatedAt: string;
};

export type GitHubIssue = {
  number: number;
  title: string;
  url: string;
  updatedAt: string;
};

export type GitHubWorkflowRun = {
  name: string;
  displayTitle: string;
  status: string;
  conclusion: string;
  url: string;
  headBranch: string;
  createdAt: string;
};

export type GitHubProjectStatus = {
  connected: boolean;
  repositoryUrl: string;
  account: string | null;
  nameWithOwner: string | null;
  isPrivate: boolean | null;
  defaultBranch: string | null;
  pullRequestCount: number;
  pullRequests: GitHubPullRequest[];
  issueCount: number;
  issues: GitHubIssue[];
  latestWorkflow: GitHubWorkflowRun | null;
  error: string | null;
  checkedAt: string;
};

export type GitHubAccountStatus = {
  login: string;
  active: boolean;
};

export type GitHubIntegrationStatus = {
  available: boolean;
  authenticated: boolean;
  account: string | null;
  accounts: GitHubAccountStatus[];
  checkedAt: string;
};

export type ProjectRepositoryStatus = {
  relativePath: string;
  remoteUrl: string | null;
  githubUrl: string | null;
  accountHint: string | null;
  git: GitStatus;
  github: GitHubProjectStatus | null;
};

export type DockerContainerStatus = {
  id: string;
  name: string;
  state: string;
  status: string;
  ports: string;
};

export type DockerStatus = {
  composeAvailable: boolean;
  running: boolean;
  containerCount: number;
  ports: number[];
  containers: DockerContainerStatus[];
};

export type ProxyDomain = {
  id: number;
  hostname: string;
  url: string;
  forwardScheme: string;
  forwardHost: string;
  forwardPort: number;
  enabled: boolean;
  projectId: string | null;
  health: {
    healthy: boolean;
    statusCode: number | null;
    latencyMs: number | null;
    checkedAt: string;
  } | null;
};

export type ProxyManagerStatus = {
  available: boolean;
  dashboardUrl: string;
  hostCount: number;
  healthyCount: number;
  domains: ProxyDomain[];
};

export type ProjectStatus = {
  id: string;
  exists: boolean;
  git: GitStatus | null;
  docker: DockerStatus;
  github: GitHubProjectStatus | null;
  repositories: ProjectRepositoryStatus[];
  domains: ProxyDomain[];
  localUrls: string[];
  checkedAt: string;
};

export type ProjectAction = "open-code" | "start" | "stop" | "restart" | "rebuild";

export type ProjectCategory = "work" | "personal";

export type RegisteredProject = {
  id: string;
  name: string;
  description: string;
  category: ProjectCategory;
  stack: string[];
  localPath: string;
  repositoryPaths: string[] | null;
  github: string | null;
  local: string | null;
  live: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInspection = {
  localPath: string;
  suggestedName: string;
  stack: string[];
  github: string | null;
  repositories: Array<{
    relativePath: string;
    github: string | null;
  }>;
};

export type StatusResponse = {
  agent: {
    online: true;
    dockerAvailable: boolean;
    projectsRoot: string;
    checkedAt: string;
  };
  github: GitHubIntegrationStatus;
  proxyManager: ProxyManagerStatus;
  registry: RegisteredProject[];
  projects: ProjectStatus[];
};
