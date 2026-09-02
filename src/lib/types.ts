export type Section = "work" | "personal";

export type Project = {
  id: string;
  name: string;
  section: Section;
  description: string;
  stack: string[];
  path: string;
  localUrl: string | null;
  liveUrl: string | null;
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
  liveUrl: string;
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
  composeFile: string | null;
  running: boolean;
  containers: Container[];
  ports: number[];
};

export type Status = {
  checkedAt: string;
  dockerAvailable: boolean;
  dataDir: string;
  projects: Project[];
  runtimes: Record<string, ProjectRuntime>;
};

export type ComposeAction = "start" | "stop" | "restart" | "rebuild";

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
};

export type RunStatus = "running" | "success" | "error" | "cancelled";

export type DeployRunSummary = {
  id: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
};

export type DeployRun = DeployRunSummary & {
  deploymentId: string;
  projectId: string;
  log: string;
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
