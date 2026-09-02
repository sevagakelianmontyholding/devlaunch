export type Section = "work" | "personal";
export type ComposeAction = "start" | "stop" | "restart" | "rebuild";

export type Project = {
  id: string;
  name: string;
  section: Section;
  description: string;
  stack: string[];
  path: string;
  localUrl: string | null;
  testingUrl: string | null;
  liveUrl: string | null;
  composeFile: string | null;
  commands: Record<ComposeAction, string | null>;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = {
  name: string;
  section: Section;
  description: string;
  stack: string[];
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
};

export type RunStatus = "running" | "success" | "error" | "cancelled";

export type DeployRunSummary = {
  id: string;
  status: RunStatus;
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
