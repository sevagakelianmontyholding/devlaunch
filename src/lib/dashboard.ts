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
       ORDER BY r.started_at DESC LIMIT 8`,
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
