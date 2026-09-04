import { randomUUID } from "node:crypto";
import path from "node:path";
import { db, now } from "./db";
import { createDeployment, listDeployments } from "./deploy";
import { getProject } from "./projects";
import { UserError } from "./shell";
import type { ComposeAction, ProjectInput, ProjectTemplate, TemplateDeployment, TemplateProject } from "./types";

type Row = { id: string; name: string; project_json: string; deployments_json: string; created_at: string };

const actions: ComposeAction[] = ["start", "stop", "restart", "rebuild"];

export type PlaceholderVars = { slug: string; folder: string; name: string };

// {slug}, {folder} and {name} stand in for the project when a template is applied.
export function fill(text: string, vars: PlaceholderVars) {
  return text.replaceAll("{slug}", vars.slug).replaceAll("{folder}", vars.folder).replaceAll("{name}", vars.name);
}

// The reverse: turn a project's own identifiers back into placeholders when saving it as a template.
function abstract(text: string, vars: PlaceholderVars) {
  let result = text;
  for (const [key, value] of [["folder", vars.folder], ["slug", vars.slug]] as const) {
    if (value.length >= 3) result = result.replaceAll(value, `{${key}}`);
  }
  return result;
}

function fromRow(row: Row): ProjectTemplate {
  const stored = JSON.parse(row.project_json) as TemplateProject & { sourceProject?: string };
  const { sourceProject = "", ...project } = stored;
  return { id: row.id, name: row.name, sourceProject, project, deployments: JSON.parse(row.deployments_json) as TemplateDeployment[], createdAt: row.created_at };
}

export function listTemplates(): ProjectTemplate[] {
  return (db().prepare("SELECT * FROM templates ORDER BY name COLLATE NOCASE").all() as Row[]).map(fromRow);
}

export function getTemplate(id: string): ProjectTemplate {
  const row = db().prepare("SELECT * FROM templates WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new UserError("Template not found");
  return fromRow(row);
}

export function createTemplateFromProject(projectId: string, rawName: string): ProjectTemplate {
  const project = getProject(projectId);
  if (!project) throw new UserError("Project not found");
  const name = rawName.trim();
  if (!name || name.length > 60) throw new UserError("Enter a template name (max 60 characters)");
  if (db().prepare("SELECT 1 FROM templates WHERE name = ? COLLATE NOCASE").get(name)) throw new UserError("A template with that name already exists");
  const vars: PlaceholderVars = { slug: project.id, folder: path.basename(project.path), name: project.name };
  const stored: TemplateProject & { sourceProject: string } = {
    sourceProject: project.name,
    section: project.section,
    localUrl: abstract(project.localUrl ?? "", vars),
    testingUrl: abstract(project.testingUrl ?? "", vars),
    liveUrl: abstract(project.liveUrl ?? "", vars),
    composeFile: abstract(project.composeFile ?? "", vars),
    commands: Object.fromEntries(actions.map((action) => [action, abstract(project.commands[action] ?? "", vars)])) as Record<ComposeAction, string>,
  };
  // Env file contents are secrets and stay with the original deployment.
  const deployments: TemplateDeployment[] = listDeployments(projectId).map((deployment) => ({
    serverId: deployment.serverId,
    serverName: deployment.serverName,
    name: deployment.name,
    mode: deployment.mode,
    imageName: abstract(deployment.imageName ?? "", vars),
    imageTag: abstract(deployment.imageTag ?? "", vars),
    buildContext: abstract(deployment.buildContext ?? "", vars),
    dockerfile: abstract(deployment.dockerfile ?? "", vars),
    remotePath: abstract(deployment.remotePath, vars),
    commands: abstract(deployment.commands, vars),
    platform: deployment.platform ?? "",
    envPath: abstract(deployment.envPath, vars),
    requireCleanGit: deployment.requireCleanGit,
  }));
  const id = randomUUID();
  db()
    .prepare("INSERT INTO templates (id, name, project_json, deployments_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, name, JSON.stringify(stored), JSON.stringify(deployments), now());
  return getTemplate(id);
}

export function deleteTemplate(id: string) {
  const template = getTemplate(id);
  db().prepare("DELETE FROM templates WHERE id = ?").run(id);
  return template;
}

export function fillProjectInput(input: ProjectInput, vars: PlaceholderVars): ProjectInput {
  return {
    ...input,
    localUrl: fill(input.localUrl, vars),
    testingUrl: fill(input.testingUrl, vars),
    liveUrl: fill(input.liveUrl, vars),
    composeFile: fill(input.composeFile, vars),
    commands: Object.fromEntries(actions.map((action) => [action, fill(input.commands[action] ?? "", vars)])) as Record<ComposeAction, string>,
  };
}

// Creates the template's deployments on a freshly added project. Deployments whose
// server no longer exists, or that fail validation, are reported rather than thrown.
export function applyTemplateDeployments(projectId: string, template: ProjectTemplate, vars: PlaceholderVars) {
  let created = 0;
  const skipped: string[] = [];
  for (const item of template.deployments) {
    try {
      createDeployment(projectId, {
        serverId: item.serverId,
        name: item.name,
        mode: item.mode,
        imageName: fill(item.imageName, vars),
        imageTag: fill(item.imageTag, vars),
        buildContext: fill(item.buildContext, vars),
        dockerfile: fill(item.dockerfile, vars),
        remotePath: fill(item.remotePath, vars),
        commands: fill(item.commands, vars),
        platform: item.platform,
        envPath: fill(item.envPath, vars),
        envContent: "",
        requireCleanGit: item.requireCleanGit,
      });
      created += 1;
    } catch (error) {
      skipped.push(`${item.name}: ${error instanceof Error ? error.message : "could not be created"}`);
    }
  }
  return { created, skipped };
}
