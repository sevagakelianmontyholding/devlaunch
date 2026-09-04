"use server";

import { changePassword, createFirstUser, requireUser, setDeployPin, signIn, signOut, verifyDeployPin } from "@/lib/auth";
import { getDashboard as loadDashboard } from "@/lib/dashboard";
import { cancelRun, createDeployment, deleteDeployment, listDeployments, listRuns, startRun, updateDeployment } from "@/lib/deploy";
import { getNotificationSettings, saveNotificationSettings, sendTestNotification } from "@/lib/notify";
import { activePipelineRunsById, deletePipeline, listPipelines, savePipeline, startPipeline } from "@/lib/pipelines";
import { openInEditor, openInTerminal, startAction } from "@/lib/docker";
import { startGitRun } from "@/lib/git";
import { checkSite } from "@/lib/uptime";
import { getProject } from "@/lib/projects";
import { saveTerminalSettings } from "@/lib/terminal";
import { createProject, deleteProject, pickFolder, saveNotes, uniqueId, updateProject } from "@/lib/projects";
import { applyTemplateDeployments, createTemplateFromProject, deleteTemplate, fillProjectInput, getTemplate, listTemplates } from "@/lib/templates";
import path from "node:path";
import { createServer, deleteServer, listServers, serverHealth, testServer, updateServer } from "@/lib/servers";
import { UserError } from "@/lib/shell";
import type {
  ActionResult,
  ComposeAction,
  DashboardData,
  DeployRun,
  DeployRunSummary,
  Deployment,
  DeploymentInput,
  GitAction,
  LocalRun,
  NotificationSettings,
  Pipeline,
  PipelineInput,
  PipelineRun,
  Project,
  ProjectTemplate,
  RunKind,
  ServerHealth,
  ProjectInput,
  Server,
  ServerInput,
  SessionUser,
  TerminalApp,
  TerminalSettings,
  UptimeStatus,
} from "@/lib/types";

async function attempt<T>(work: (user: SessionUser) => Promise<T> | T, options: { public?: boolean } = {}): Promise<ActionResult<T>> {
  try {
    const user = options.public ? ({} as SessionUser) : await requireUser();
    return { ok: true, data: await work(user) };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" };
  }
}

// Account
export async function setupAccount(username: string, password: string): Promise<ActionResult<SessionUser>> {
  return attempt(() => createFirstUser(username, password), { public: true });
}

export async function login(username: string, password: string): Promise<ActionResult<SessionUser>> {
  return attempt(() => signIn(username, password), { public: true });
}

export async function logout(): Promise<ActionResult> {
  return attempt(async () => {
    await signOut();
    return undefined;
  });
}

export async function updatePassword(currentPassword: string, nextPassword: string): Promise<ActionResult> {
  return attempt((user) => {
    changePassword(user.id, currentPassword, nextPassword);
    return undefined;
  });
}

export async function updateDeployPin(password: string, pin: string | null): Promise<ActionResult<SessionUser>> {
  return attempt((user) => setDeployPin(user.id, password, pin));
}

// Projects
export async function saveProject(id: string | null, input: ProjectInput): Promise<ActionResult<Project>> {
  return attempt(() => (id ? updateProject(id, input) : createProject(input)));
}

export async function saveProjectNotes(id: string, notes: string): Promise<ActionResult<Project>> {
  return attempt(() => saveNotes(id, notes));
}

export async function removeProject(id: string): Promise<ActionResult<Project>> {
  return attempt(() => deleteProject(id));
}

export async function pickProjectFolder(): Promise<ActionResult<string>> {
  return attempt(() => pickFolder());
}

// Templates
export async function getTemplates(): Promise<ProjectTemplate[]> {
  await requireUser();
  return listTemplates();
}

export async function saveTemplate(projectId: string, name: string): Promise<ActionResult<ProjectTemplate>> {
  return attempt(() => createTemplateFromProject(projectId, name));
}

export async function removeTemplate(id: string): Promise<ActionResult<ProjectTemplate>> {
  return attempt(() => deleteTemplate(id));
}

export async function createProjectFromTemplate(
  input: ProjectInput,
  templateId: string,
): Promise<ActionResult<{ project: Project; created: number; skipped: string[] }>> {
  return attempt(async () => {
    const template = getTemplate(templateId);
    const vars = { slug: uniqueId(input.name.trim()), folder: path.basename(input.path.trim().replace(/\/$/, "")), name: input.name.trim() };
    const project = await createProject(fillProjectInput(input, vars));
    return { project, ...applyTemplateDeployments(project.id, template, { ...vars, slug: project.id }) };
  });
}

// Docker / editor
export async function runCompose(id: string, action: ComposeAction): Promise<ActionResult<LocalRun>> {
  return attempt(() => startAction(id, action));
}

export async function runGit(projectId: string, repoPath: string | null, action: GitAction, message?: string): Promise<ActionResult<LocalRun>> {
  return attempt(() => startGitRun(projectId, repoPath, action, message));
}

export async function checkLiveSite(projectId: string): Promise<ActionResult<UptimeStatus>> {
  return attempt(() => {
    const project = getProject(projectId);
    if (!project?.liveUrl) throw new UserError("This project has no live URL");
    return checkSite(project.id, project.name, project.liveUrl);
  });
}

export async function openProject(id: string): Promise<ActionResult> {
  return attempt(async () => {
    await openInEditor(id);
    return undefined;
  });
}

export async function openProjectTerminal(id: string): Promise<ActionResult> {
  return attempt(async () => {
    await openInTerminal(id);
    return undefined;
  });
}

export async function updateTerminalSettings(app: TerminalApp, customCommand: string): Promise<ActionResult<TerminalSettings>> {
  return attempt(() => saveTerminalSettings(app, customCommand));
}

// Dashboard
export async function getDashboard(): Promise<DashboardData> {
  await requireUser();
  return loadDashboard();
}

// Servers
export async function getServers(): Promise<Server[]> {
  await requireUser();
  return listServers();
}

export async function saveServer(id: string | null, input: ServerInput): Promise<ActionResult<Server>> {
  return attempt(() => (id ? updateServer(id, input) : createServer(input)));
}

export async function removeServer(id: string): Promise<ActionResult<Server>> {
  return attempt(() => deleteServer(id));
}

export async function checkServer(id: string): Promise<ActionResult<string>> {
  return attempt(() => testServer(id));
}

// Deployments
export async function getDeployments(projectId: string): Promise<Deployment[]> {
  await requireUser();
  return listDeployments(projectId);
}

export async function saveDeployment(
  projectId: string,
  id: string | null,
  input: DeploymentInput,
): Promise<ActionResult<Deployment>> {
  return attempt(() => (id ? updateDeployment(id, input) : createDeployment(projectId, input)));
}

export async function removeDeployment(id: string): Promise<ActionResult<Deployment>> {
  return attempt(() => deleteDeployment(id));
}

export async function deploy(deploymentId: string, pin?: string, kind: RunKind = "deploy", force = false): Promise<ActionResult<DeployRun>> {
  return attempt((user) => {
    verifyDeployPin(user.id, pin);
    return startRun(deploymentId, { kind, force, username: user.username });
  });
}

export async function getDeployRuns(deploymentId: string): Promise<DeployRunSummary[]> {
  await requireUser();
  return listRuns(deploymentId);
}

// Servers health
export async function getServerHealth(): Promise<ServerHealth[]> {
  await requireUser();
  return serverHealth();
}

// Notifications
export async function getNotifications(): Promise<NotificationSettings> {
  await requireUser();
  return getNotificationSettings();
}

export async function updateNotifications(input: NotificationSettings): Promise<ActionResult<NotificationSettings>> {
  return attempt(() => saveNotificationSettings(input));
}

export async function testNotification(): Promise<ActionResult> {
  return attempt(async () => {
    await sendTestNotification();
    return undefined;
  });
}

// Pipelines
export async function getPipelines(): Promise<{ pipelines: Pipeline[]; active: Record<string, PipelineRun> }> {
  await requireUser();
  return { pipelines: listPipelines(), active: activePipelineRunsById() };
}

export async function savePipelineAction(id: string | null, input: PipelineInput): Promise<ActionResult<Pipeline>> {
  return attempt(() => savePipeline(id, input));
}

export async function removePipeline(id: string): Promise<ActionResult<Pipeline>> {
  return attempt(() => deletePipeline(id));
}

export async function runPipeline(id: string, pin?: string): Promise<ActionResult<PipelineRun>> {
  return attempt((user) => {
    verifyDeployPin(user.id, pin);
    return startPipeline(id, user.username);
  });
}

export async function stopDeploy(runId: string): Promise<ActionResult> {
  return attempt(() => {
    cancelRun(runId);
    return undefined;
  });
}
