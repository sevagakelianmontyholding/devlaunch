"use server";

import { changePassword, createFirstUser, requireUser, setDeployPin, signIn, signOut, verifyDeployPin } from "@/lib/auth";
import { cancelRun, createDeployment, deleteDeployment, listDeployments, startRun, updateDeployment } from "@/lib/deploy";
import { openInEditor, startAction } from "@/lib/docker";
import { createProject, deleteProject, pickFolder, updateProject } from "@/lib/projects";
import { createServer, deleteServer, listServers, testServer, updateServer } from "@/lib/servers";
import { UserError } from "@/lib/shell";
import type {
  ActionResult,
  ComposeAction,
  DeployRun,
  Deployment,
  DeploymentInput,
  LocalRun,
  Project,
  ProjectInput,
  Server,
  ServerInput,
  SessionUser,
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

export async function removeProject(id: string): Promise<ActionResult<Project>> {
  return attempt(() => deleteProject(id));
}

export async function pickProjectFolder(): Promise<ActionResult<string>> {
  return attempt(() => pickFolder());
}

// Docker / editor
export async function runCompose(id: string, action: ComposeAction): Promise<ActionResult<LocalRun>> {
  return attempt(() => startAction(id, action));
}

export async function openProject(id: string): Promise<ActionResult> {
  return attempt(async () => {
    await openInEditor(id);
    return undefined;
  });
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

export async function deploy(deploymentId: string, pin?: string, commandsOnly = false): Promise<ActionResult<DeployRun>> {
  return attempt((user) => {
    verifyDeployPin(user.id, pin);
    return startRun(deploymentId, commandsOnly);
  });
}

export async function stopDeploy(runId: string): Promise<ActionResult> {
  return attempt(() => {
    cancelRun(runId);
    return undefined;
  });
}
