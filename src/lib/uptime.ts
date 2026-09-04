import { notifyFinished } from "./notify";
import { listProjects } from "./projects";
import type { UptimeStatus } from "./types";

// Live URLs are checked from this Mac every few minutes. A site counts as down
// after two failed checks in a row (so one hiccup doesn't page anyone) and up
// again on the first success; both transitions send a notification.
const INTERVAL_MS = 3 * 60_000;
const FAILURES_BEFORE_DOWN = 2;

type Entry = UptimeStatus & { failures: number; checking: boolean };

const globalState = globalThis as unknown as { devlaunchUptime?: Map<string, Entry>; devlaunchUptimeTimer?: ReturnType<typeof setInterval> };
const entries = (globalState.devlaunchUptime ??= new Map());

async function probe(url: string): Promise<{ ok: boolean; status: number | null; latencyMs: number; error: string | null }> {
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "DevLaunch uptime check" } });
    return { ok: response.status < 400, status: response.status, latencyMs: Date.now() - started, error: response.status < 400 ? null : `HTTP ${response.status}` };
  } catch (error) {
    const cause = (error as { cause?: { code?: string; errors?: Array<{ code?: string }> } }).cause;
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out after 15s" : cause?.code ?? cause?.errors?.[0]?.code ?? (error instanceof Error ? error.message : "request failed");
    return { ok: false, status: null, latencyMs: Date.now() - started, error: reason };
  }
}

export async function checkSite(projectId: string, name: string, url: string): Promise<UptimeStatus> {
  const previous = entries.get(projectId);
  if (previous?.checking && previous.url === url) return previous;
  const now = new Date().toISOString();
  const entry: Entry = previous?.url === url ? { ...previous, checking: true } : { projectId, url, up: null, status: null, latencyMs: null, error: null, checkedAt: null, since: now, failures: 0, checking: true };
  entries.set(projectId, entry);
  const result = await probe(url);
  entry.checking = false;
  entry.checkedAt = new Date().toISOString();
  entry.status = result.status;
  entry.latencyMs = result.latencyMs;
  entry.error = result.error;
  const wasUp = entry.up;
  if (result.ok) {
    entry.failures = 0;
    entry.up = true;
  } else {
    entry.failures += 1;
    if (entry.failures >= FAILURES_BEFORE_DOWN || wasUp === null) entry.up = false;
  }
  if (wasUp !== null && wasUp !== entry.up) {
    entry.since = entry.checkedAt;
    void notifyFinished(`${name} · live site`, entry.up ? `${url} is back up (${result.latencyMs} ms)` : `${url} is down: ${result.error}`, entry.up === true);
  }
  return snapshot(entry);
}

function snapshot(entry: Entry): UptimeStatus {
  return { projectId: entry.projectId, url: entry.url, up: entry.up, status: entry.status, latencyMs: entry.latencyMs, error: entry.error, checkedAt: entry.checkedAt, since: entry.since };
}

async function checkAll() {
  const projects = listProjects().filter((project) => project.liveUrl);
  for (const [id] of entries) if (!projects.some((project) => project.id === id)) entries.delete(id);
  await Promise.all(projects.map((project) => checkSite(project.id, project.name, project.liveUrl!)));
}

export function ensureUptimeMonitor() {
  if (globalState.devlaunchUptimeTimer) return;
  globalState.devlaunchUptimeTimer = setInterval(() => void checkAll(), INTERVAL_MS);
  void checkAll();
}

export function uptimeByProject(): Record<string, UptimeStatus> {
  const result: Record<string, UptimeStatus> = {};
  for (const project of listProjects()) {
    if (!project.liveUrl) continue;
    const entry = entries.get(project.id);
    if (entry && entry.url === project.liveUrl) {
      result[project.id] = snapshot(entry);
    } else {
      // New or changed live URL: check it now rather than at the next tick.
      void checkSite(project.id, project.name, project.liveUrl);
      result[project.id] = snapshot(entries.get(project.id)!);
    }
  }
  return result;
}
