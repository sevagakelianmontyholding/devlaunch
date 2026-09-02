"use server";

import { cancelRun, createDeployment, deleteDeployment, listDeployments, startRun, updateDeployment } from "@/lib/deploy";
import { composeAction, openInEditor } from "@/lib/docker";
import { createProject, deleteProject, pickFolder, updateProject } from "@/lib/projects";
import { createServer, deleteServer, listServers, testServer, updateServer } from "@/lib/servers";
import { UserError } from "@/lib/shell";
import type {
  ActionResult,
  ComposeAction,
  DeployRun,
  Deployment,
  DeploymentInput,
  Project,
  ProjectInput,
  Server,
  ServerInput,
} from "@/lib/types";

async function attempt<T>(work: () => Promise<T> | T): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" };
  }
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
export async function runCompose(id: string, action: ComposeAction): Promise<ActionResult> {
  return attempt(async () => {
    await composeAction(id, action);
    return undefined;
  });
}

export async function openProject(id: string): Promise<ActionResult> {
  return attempt(async () => {
    await openInEditor(id);
    return undefined;
  });
}

// Servers
export async function getServers(): Promise<Server[]> {
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

export async function deploy(deploymentId: string): Promise<ActionResult<DeployRun>> {
  return attempt(() => startRun(deploymentId));
}

export async function stopDeploy(runId: string): Promise<ActionResult> {
  return attempt(() => {
    cancelRun(runId);
    return undefined;
  });
}
