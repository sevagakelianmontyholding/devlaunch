import { db } from "./db";
import { commitsSince, deploymentRepos, matchRecorded } from "./git";
import { shippedKey } from "./deploy";
import { shippedOn } from "./locks";
import type { DeployedCommit, DeployMode, Project, Undeployed, UndeployedCommit } from "./types";

// "Pushed but not deployed": for every deployment, the commits on the remote
// branch (GitHub) that its last deploy did not ship. The remote branches are
// kept current by the background fetch, so a push from this Mac or from a
// colleague shows up within a few minutes.
//
// "Its last deploy" is the newest of three sources, so a colleague's deploy
// from another Mac counts too:
//   - this Mac's run history (exact commits since this feature exists),
//   - the shipped record on the server, written by any up-to-date DevLaunch
//     after a deploy (exact commits),
//   - the build time of the image on the server (image deployments only; a
//     time, for deploys that left no record).

const TTL_MS = 30_000;
const globalState = globalThis as unknown as { devlaunchUndeployed?: Map<string, { at: number; key: string; value: Undeployed | null }> };
const cache = (globalState.devlaunchUndeployed ??= new Map());

type DeploymentRow = { id: string; project_id: string; server_id: string; name: string; mode: DeployMode; build_context: string | null; image_name: string | null; image_tag: string | null; remote_path: string; server_name: string };
type RunRow = { id: string; started_at: string; finished_at: string | null; commits: string | null; username: string | null };
// What the comparison starts from: exact commits, or only a time.
type Basis = { at: string; since: string; commits: DeployedCommit[]; by: string | null };

function lastShipped(deployment: DeploymentRow) {
  // An image deployment ships code with a full deploy; "Run commands" only
  // reruns the server commands. A commands deployment ships with either.
  const kinds = deployment.mode === "image" ? "(kind IS NULL OR kind = 'deploy')" : "(kind IS NULL OR kind IN ('deploy', 'commands'))";
  return db()
    .prepare(`SELECT id, started_at, finished_at, commits, username FROM deploy_runs WHERE deployment_id = ? AND status = 'success' AND ${kinds} ORDER BY started_at DESC LIMIT 1`)
    .get(deployment.id) as RunRow | undefined;
}

function parseCommits(text: string | null): DeployedCommit[] {
  try {
    const value = text ? (JSON.parse(text) as DeployedCommit[]) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function basisFor(deployment: DeploymentRow): Basis | null {
  const candidates: Basis[] = [];
  const run = lastShipped(deployment);
  if (run) candidates.push({ at: run.finished_at ?? run.started_at, since: run.started_at, commits: parseCommits(run.commits), by: run.username });
  const state = shippedOn(deployment.server_id);
  const record = state?.records.get(shippedKey(deployment.mode, deployment.image_name, deployment.remote_path));
  if (record) candidates.push({ at: record.at, since: record.at, commits: Array.isArray(record.commits) ? record.commits : [], by: record.user ?? record.machine });
  if (deployment.mode === "image" && deployment.image_name) {
    const created = state?.images.get(`${deployment.image_name}:${deployment.image_tag || "latest"}`);
    // Built moments before the upload, so a deploy's own record or run
    // (finished later) wins over it; a newer build means someone else deployed.
    if (created) candidates.push({ at: created, since: created, commits: [], by: null });
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((best, item) => (Date.parse(item.at) > Date.parse(best.at) ? item : best));
}

async function compute(project: Project, deployment: DeploymentRow, basis: Basis): Promise<Undeployed | null> {
  const repos = await deploymentRepos(project, deployment.mode, deployment.build_context);
  let count = 0;
  const commits: UndeployedCommit[] = [];
  const names: string[] = [];
  for (const repo of repos) {
    // With commits recorded, only the recorded repos count; otherwise every repo, by time.
    const entry = basis.commits.length ? await matchRecorded(repo, basis.commits) : null;
    if (basis.commits.length > 0 && !entry) continue;
    const result = await commitsSince(repo, entry, basis.since);
    if (!result || result.count === 0) continue;
    count += result.count;
    commits.push(...result.commits);
    names.push(repo.name);
  }
  if (count === 0) return null;
  commits.sort((a, b) => b.date.localeCompare(a.date));
  return {
    deploymentId: deployment.id,
    deploymentName: deployment.name,
    serverName: deployment.server_name,
    count,
    commits: commits.slice(0, 8),
    repos: names,
    deployedAt: basis.at,
    deployedBy: basis.by,
  };
}

export async function undeployedByProject(projects: Project[]): Promise<Record<string, Undeployed[]>> {
  const rows = db()
    .prepare(
      `SELECT deployments.id, deployments.project_id, deployments.server_id, deployments.name, deployments.mode, deployments.build_context,
              deployments.image_name, deployments.image_tag, deployments.remote_path, servers.name AS server_name
       FROM deployments JOIN servers ON servers.id = deployments.server_id ORDER BY deployments.name COLLATE NOCASE`,
    )
    .all() as DeploymentRow[];
  const byId = new Map(projects.map((project) => [project.id, project]));
  const result: Record<string, Undeployed[]> = {};
  await Promise.all(
    rows.map(async (deployment) => {
      const project = byId.get(deployment.project_id);
      if (!project) return;
      const basis = basisFor(deployment);
      if (!basis) return; // Never deployed: nothing to compare with.
      const key = `${basis.at}:${basis.commits.length}:${project.path}`;
      const cached = cache.get(deployment.id);
      let value: Undeployed | null;
      if (cached && cached.key === key && Date.now() - cached.at < TTL_MS) value = cached.value;
      else {
        value = await compute(project, deployment, basis).catch(() => null);
        cache.set(deployment.id, { at: Date.now(), key, value });
      }
      if (value) (result[project.id] ??= []).push(value);
    }),
  );
  return result;
}
