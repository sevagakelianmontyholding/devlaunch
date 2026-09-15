import { db } from "./db";
import { listPipelines } from "./pipelines";
import { listServers } from "./servers";
import type { DashboardData, RecentRun } from "./types";

type RecentRow = {
  id: string;
  deployment_id: string;
  deployment_name: string | null;
  project_id: string;
  project_name: string | null;
  server_name: string | null;
  status: RecentRun["status"];
  kind: RecentRun["kind"] | null;
  username: string | null;
  started_at: string;
  finished_at: string | null;
};

export type RunFilter = { status?: RecentRun["status"] | "all"; projectId?: string; limit?: number; offset?: number };

// Runs across every deployment, newest first, with optional filters.
export function listRunHistory(filter: RunFilter = {}): { runs: RecentRun[]; total: number } {
  const where: string[] = ["r.status != 'running'", "p.deleted_at IS NULL"];
  const params: Array<string | number> = [];
  if (filter.status && filter.status !== "all") {
    where.push("r.status = ?");
    params.push(filter.status);
  }
  if (filter.projectId) {
    where.push("r.project_id = ?");
    params.push(filter.projectId);
  }
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const base = `FROM deploy_runs r
       LEFT JOIN deployments d ON d.id = r.deployment_id
       LEFT JOIN servers s ON s.id = d.server_id
       LEFT JOIN projects p ON p.id = r.project_id
       WHERE ${where.join(" AND ")}`;
  const total = (db().prepare(`SELECT COUNT(*) AS count ${base}`).get(...params) as { count: number }).count;
  const rows = db()
    .prepare(
      `SELECT r.id, r.deployment_id, d.name AS deployment_name, r.project_id, p.name AS project_name, s.name AS server_name,
              r.status, r.kind, r.username, r.started_at, r.finished_at ${base}
       ORDER BY r.started_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as RecentRow[];
  return { runs: rows.map(toRecentRun), total };
}

function toRecentRun(row: RecentRow): RecentRun {
  return {
    id: row.id,
    deploymentId: row.deployment_id,
    deploymentName: row.deployment_name ?? "Removed deployment",
    projectId: row.project_id,
    projectName: row.project_name ?? row.project_id,
    serverName: row.server_name ?? "—",
    status: row.status,
    kind: row.kind ?? "deploy",
    username: row.username,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function getDashboard(): DashboardData {
  const rows = db()
    .prepare(
      `SELECT r.id, r.deployment_id, d.name AS deployment_name, r.project_id, p.name AS project_name, s.name AS server_name,
              r.status, r.kind, r.username, r.started_at, r.finished_at
       FROM deploy_runs r
       LEFT JOIN deployments d ON d.id = r.deployment_id
       LEFT JOIN servers s ON s.id = d.server_id
       LEFT JOIN projects p ON p.id = r.project_id
       WHERE r.status != 'running'
       ORDER BY r.started_at DESC LIMIT 15`,
    )
    .all() as RecentRow[];
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const week = db()
    .prepare(
      `SELECT status, COUNT(*) AS count FROM deploy_runs WHERE started_at >= ? AND status != 'running' GROUP BY status`,
    )
    .all(since) as Array<{ status: RecentRun["status"]; count: number }>;
  const count = (status: RecentRun["status"]) => week.find((item) => item.status === status)?.count ?? 0;
  return {
    recentRuns: rows.map((row) => ({
      id: row.id,
      deploymentId: row.deployment_id,
      deploymentName: row.deployment_name ?? "Removed deployment",
      projectId: row.project_id,
      projectName: row.project_name ?? row.project_id,
      serverName: row.server_name ?? "—",
      status: row.status,
      kind: row.kind ?? "deploy",
      username: row.username,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    })),
    week: { success: count("success"), error: count("error"), cancelled: count("cancelled") },
    servers: listServers(),
    pipelines: listPipelines(),
  };
}
