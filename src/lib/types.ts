export type Section = "work" | "personal";
export type ComposeAction = "start" | "stop" | "restart" | "rebuild";

export type Project = {
  id: string;
  name: string;
  section: Section;
  path: string;
  localUrl: string | null;
  testingUrl: string | null;
  liveUrl: string | null;
  composeFile: string | null;
  commands: Record<ComposeAction, string | null>;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = {
  name: string;
  section: Section;
  path: string;
  localUrl: string;
  testingUrl: string;
  liveUrl: string;
  composeFile: string;
  commands: Record<ComposeAction, string>;
};

export type Container = {
  id: string;
  name: string;
  state: string;
  status: string;
  ports: string;
};

export type ProjectRuntime = {
  id: string;
  exists: boolean;
  running: boolean;
  containers: Container[];
  ports: number[];
};

export type LocalRun = {
  id: string;
  projectId: string;
  action: ComposeAction;
  command: string;
  status: RunStatus;
  log: string;
  startedAt: string;
  finishedAt: string | null;
};

export type ActiveAction = {
  runId: string;
  action: ComposeAction;
  command: string;
  startedAt: string;
};

export type DeploymentSummary = {
  id: string;
  name: string;
  serverName: string;
  mode: DeployMode;
};

export type TerminalApp = "terminal" | "iterm" | "warp" | "ghostty" | "kitty" | "alacritty" | "termius" | "custom";

export type TerminalSettings = {
  app: TerminalApp;
  customCommand: string;
  installed: Array<{ id: Exclude<TerminalApp, "custom">; label: string; note: string | null }>;
};

export type NotificationSettings = {
  desktop: boolean;
  webhookUrl: string;
};

export type ServerHealth = {
  id: string;
  name: string;
  reachable: boolean;
  error: string | null;
  arch: string | null;
  dockerVersion: string | null;
  disk: { used: string; total: string; percent: number } | null;
  memory: { used: string; total: string } | null;
  uptime: string | null;
  containers: Array<{ name: string; status: string; image: string }>;
  lock: DeployLock | null;
  checkedAt: string;
};

// Written to ~/.devlaunch/deploy.lock on the server while a run is in progress,
// so other DevLaunch installs can see someone is mid-deploy.
export type DeployLock = {
  user: string | null;
  machine: string;
  project: string;
  deployment: string;
  kind: RunKind;
  startedAt: string;
  runId: string;
};

export type TemplateProject = {
  section: Section;
  localUrl: string;
  testingUrl: string;
  liveUrl: string;
  composeFile: string;
  commands: Record<ComposeAction, string>;
};

export type TemplateDeployment = Omit<DeploymentInput, "envContent"> & { serverName: string };

export type ProjectTemplate = {
  id: string;
  name: string;
  sourceProject: string;
  project: TemplateProject;
  deployments: TemplateDeployment[];
  createdAt: string;
};

export type PipelineStep = { deploymentId: string };

export type Pipeline = {
  id: string;
  name: string;
  steps: Array<{ deploymentId: string; deploymentName: string; projectId: string; projectName: string; serverName: string }>;
  schedule: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PipelineInput = {
  name: string;
  deploymentIds: string[];
  schedule: string;
  enabled: boolean;
};

export type PipelineRun = {
  id: string;
  pipelineId: string;
  status: RunStatus;
  currentStep: number;
  steps: Array<{ deploymentId: string; deploymentName: string; runId: string | null; status: RunStatus | "pending" }>;
  startedAt: string;
  finishedAt: string | null;
};

export type SessionUser = {
  id: string;
  username: string;
  hasPin: boolean;
};

export type Status = {
  checkedAt: string;
  dockerAvailable: boolean;
  dataDir: string;
  projects: Project[];
  runtimes: Record<string, ProjectRuntime>;
  activeDeploys: Record<string, ActiveDeploy>;
  activeActions: Record<string, ActiveAction>;
  terminal: TerminalSettings;
  deployments: Record<string, DeploymentSummary[]>;
  activePipelines: Record<string, PipelineRun>;
  user: SessionUser;
};

export type Server = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  createdAt: string;
  updatedAt: string;
};

export type ServerInput = {
  name: string;
  host: string;
  port: number;
  username: string;
  privateKey: string;
};

export type DeployMode = "image" | "commands";

export type Deployment = {
  id: string;
  projectId: string;
  serverId: string;
  serverName: string;
  name: string;
  mode: DeployMode;
  imageName: string | null;
  imageTag: string | null;
  buildContext: string | null;
  dockerfile: string | null;
  remotePath: string;
  commands: string;
  platform: string | null;
  envPath: string;
  envContent: string;
  requireCleanGit: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun: DeployRunSummary | null;
};

export type DeploymentInput = {
  serverId: string;
  name: string;
  mode: DeployMode;
  imageName: string;
  imageTag: string;
  buildContext: string;
  dockerfile: string;
  remotePath: string;
  commands: string;
  platform: string;
  envPath: string;
  envContent: string;
  requireCleanGit: boolean;
};

export type RunStatus = "running" | "success" | "error" | "cancelled";

export type RunKind = "deploy" | "commands" | "rollback";

export type DeployRunSummary = {
  id: string;
  status: RunStatus;
  kind: RunKind;
  username: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type UploadProgress = {
  imageBytes: number;
  readBytes: number;
  sentBytes: number;
  bytesPerSecond: number;
  percent: number;
};

export type DeployPhase = "building" | "uploading" | "commands";

export type DeployRun = DeployRunSummary & {
  deploymentId: string;
  projectId: string;
  log: string;
  phase: DeployPhase | null;
  upload: UploadProgress | null;
};

export type ActiveDeploy = {
  runId: string;
  deploymentId: string;
  deploymentName: string;
  phase: DeployPhase | null;
  upload: UploadProgress | null;
  startedAt: string;
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type RecentRun = DeployRunSummary & {
  deploymentId: string;
  deploymentName: string;
  projectId: string;
  projectName: string;
  serverName: string;
};

export type DashboardData = {
  recentRuns: RecentRun[];
  week: { success: number; error: number; cancelled: number };
  servers: Server[];
  pipelines: Pipeline[];
};
