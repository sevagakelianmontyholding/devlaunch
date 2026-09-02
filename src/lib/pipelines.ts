import { randomUUID } from "node:crypto";
import { db, now } from "./db";
import { getRun, startRun } from "./deploy";
import { getProject } from "./projects";
import { UserError } from "./shell";
import type { Pipeline, PipelineInput, PipelineRun, RunStatus } from "./types";

type Row = {
  id: string;
  name: string;
  steps_json: string;
  schedule: string | null;
  enabled: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

const globalState = globalThis as unknown as { devlaunchPipelineRuns?: Map<string, PipelineRun>; devlaunchScheduler?: ReturnType<typeof setInterval> };
const activePipelineRuns = (globalState.devlaunchPipelineRuns ??= new Map());

function stepsFor(ids: string[]) {
  const lookup = db().prepare(
    `SELECT deployments.id, deployments.name, deployments.project_id, servers.name AS server_name
     FROM deployments JOIN servers ON servers.id = deployments.server_id WHERE deployments.id = ?`,
  );
  return ids.flatMap((id) => {
    const row = lookup.get(id) as { id: string; name: string; project_id: string; server_name: string } | undefined;
    if (!row) return [];
    return [{ deploymentId: row.id, deploymentName: row.name, projectId: row.project_id, projectName: getProject(row.project_id)?.name ?? row.project_id, serverName: row.server_name }];
  });
}

function fromRow(row: Row): Pipeline {
  return {
    id: row.id,
    name: row.name,
    steps: stepsFor(JSON.parse(row.steps_json) as string[]),
    schedule: row.schedule,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listPipelines(): Pipeline[] {
  return (db().prepare("SELECT * FROM pipelines ORDER BY name COLLATE NOCASE").all() as Row[]).map(fromRow);
}

function validate(input: PipelineInput) {
  const name = input.name.trim();
  if (!name || name.length > 60) throw new UserError("Enter a pipeline name (max 60 characters)");
  const ids = input.deploymentIds.filter(Boolean);
  if (ids.length === 0) throw new UserError("Add at least one deployment step");
  const schedule = input.schedule.trim();
  if (schedule && !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule)) throw new UserError("Schedule must be a time like 03:30 (24h)");
  return { name, ids, schedule: schedule || null, enabled: input.enabled };
}

export function savePipeline(id: string | null, input: PipelineInput): Pipeline {
  const pipeline = validate(input);
  const timestamp = now();
  if (id) {
    db()
      .prepare("UPDATE pipelines SET name = ?, steps_json = ?, schedule = ?, enabled = ?, updated_at = ? WHERE id = ?")
      .run(pipeline.name, JSON.stringify(pipeline.ids), pipeline.schedule, pipeline.enabled ? 1 : 0, timestamp, id);
  } else {
    id = randomUUID();
    db()
      .prepare("INSERT INTO pipelines (id, name, steps_json, schedule, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, pipeline.name, JSON.stringify(pipeline.ids), pipeline.schedule, pipeline.enabled ? 1 : 0, timestamp, timestamp);
  }
  return fromRow(db().prepare("SELECT * FROM pipelines WHERE id = ?").get(id) as Row);
}

export function deletePipeline(id: string) {
  const row = db().prepare("SELECT * FROM pipelines WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new UserError("Pipeline not found");
  if ([...activePipelineRuns.values()].some((run) => run.pipelineId === id && run.status === "running")) throw new UserError("Wait for the running pipeline to finish");
  db().prepare("DELETE FROM pipelines WHERE id = ?").run(id);
  return fromRow(row);
}

export function activePipelineRunsById() {
  const result: Record<string, PipelineRun> = {};
  for (const run of activePipelineRuns.values()) result[run.pipelineId] = run;
  return result;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs each step's deployment in order, waiting for each to finish; stops on
// the first failure or cancellation.
export function startPipeline(id: string, username?: string): PipelineRun {
  const row = db().prepare("SELECT * FROM pipelines WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new UserError("Pipeline not found");
  const pipeline = fromRow(row);
  if ([...activePipelineRuns.values()].some((run) => run.pipelineId === id && run.status === "running")) throw new UserError("This pipeline is already running");
  const run: PipelineRun = {
    id: randomUUID(),
    pipelineId: id,
    status: "running",
    currentStep: 0,
    steps: pipeline.steps.map((step) => ({ deploymentId: step.deploymentId, deploymentName: `${step.projectName} · ${step.deploymentName}`, runId: null, status: "pending" })),
    startedAt: now(),
    finishedAt: null,
  };
  activePipelineRuns.set(run.id, run);
  db().prepare("UPDATE pipelines SET last_run_at = ? WHERE id = ?").run(run.startedAt, id);

  void (async () => {
    let finalStatus: RunStatus = "success";
    for (let index = 0; index < run.steps.length; index += 1) {
      const step = run.steps[index]!;
      run.currentStep = index;
      try {
        const deployRun = await startRun(step.deploymentId, { kind: "deploy", force: true, username: username ?? "pipeline" });
        step.runId = deployRun.id;
        step.status = "running";
        let status: RunStatus = "running";
        while (status === "running") {
          await wait(2000);
          status = getRun(deployRun.id).status;
        }
        step.status = status;
        if (status !== "success") {
          finalStatus = status;
          break;
        }
      } catch {
        step.status = "error";
        finalStatus = "error";
        break;
      }
    }
    run.status = finalStatus;
    run.finishedAt = now();
    setTimeout(() => activePipelineRuns.delete(run.id), 10 * 60_000);
  })();

  return { ...run, steps: run.steps.map((step) => ({ ...step })) };
}

// Checks once a minute for enabled pipelines whose HH:MM matches now.
export function ensureScheduler() {
  if (globalState.devlaunchScheduler) return;
  globalState.devlaunchScheduler = setInterval(() => {
    const nowDate = new Date();
    const hhmm = `${String(nowDate.getHours()).padStart(2, "0")}:${String(nowDate.getMinutes()).padStart(2, "0")}`;
    const rows = db().prepare("SELECT * FROM pipelines WHERE enabled = 1 AND schedule = ?").all(hhmm) as Row[];
    for (const row of rows) {
      const last = row.last_run_at ? new Date(row.last_run_at).getTime() : 0;
      if (Date.now() - last < 120_000) continue;
      try {
        startPipeline(row.id, "schedule");
      } catch {
        // Already running or invalid; try again next time.
      }
    }
  }, 60_000);
}
