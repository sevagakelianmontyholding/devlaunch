"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, HeartPulse, History, Rocket, Server } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getAllDeployments, getRunHistory } from "@/actions";
import type { Deployment, RecentRun } from "@/lib/types";
import { PageHeader } from "./app-shell";
import { runTone } from "./deployments";
import { LockStrip } from "./projects-view";
import { useStatus } from "./status-provider";
import { Button, Dot, Empty, Segmented, Select, Spinner, cx, timeAgo } from "./ui";

type View = "deployments" | "history";
type StatusFilter = "all" | "success" | "error" | "cancelled";
const PAGE = 50;
const kindLabel = { deploy: "Deploy", commands: "Commands", rollback: "Rollback" } as const;

export function DeploymentsIndex() {
  const params = useSearchParams();
  const router = useRouter();
  const view: View = params.get("view") === "history" ? "history" : "deployments";
  const setView = (next: View) => router.replace(next === "history" ? "/deployments?view=history" : "/deployments");

  return (
    <div>
      <PageHeader title="Deployments" actions={<Segmented value={view} onChange={setView} options={[{ value: "deployments", label: "Deployments" }, { value: "history", label: "Run history" }]} />} />
      {view === "history" ? <RunHistory /> : <DeploymentList />}
    </div>
  );
}

function DeploymentList() {
  const { status } = useStatus();
  const [deployments, setDeployments] = useState<Deployment[] | null>(null);
  const activeCount = Object.keys(status.activeDeploys).length;

  const load = useCallback(async () => setDeployments(await getAllDeployments()), []);
  // Reload when a deploy starts or finishes so the status column stays current.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, activeCount]);

  const groups = new Map<string, Deployment[]>();
  for (const deployment of deployments ?? []) {
    const list = groups.get(deployment.projectId) ?? [];
    list.push(deployment);
    groups.set(deployment.projectId, list);
  }
  const own = new Set(Object.values(status.activeDeploys).map((deploy) => deploy.runId));
  const locks = Object.values(status.locks).filter((held) => !own.has(held.lock.runId));

  return (
    <>
      {deployments && <p className="-mt-4 mb-5 text-[13px] text-ink-dim">{deployments.length} across {groups.size} project{groups.size === 1 ? "" : "s"}</p>}

      {locks.length > 0 && (
        <div className="mb-4 space-y-2 [&>div]:mt-0">
          {locks.map((held) => (
            <LockStrip key={held.serverId} held={held} />
          ))}
        </div>
      )}

      {deployments === null ? (
        <Spinner label="Loading…" />
      ) : deployments.length === 0 ? (
        <Empty icon={<Rocket className="size-4" />} title="No deployments yet" hint="Add one on a project page: Deployments → Add." />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([projectId, list]) => (
            <section key={projectId}>
              <h2 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
                <Link href={`/projects/${projectId}`} className="hover:text-accent">
                  {list[0]!.projectName}
                </Link>
                <span className="font-normal text-ink-faint">{list.length}</span>
              </h2>
              <div className="overflow-hidden rounded-card border border-line bg-panel">
                {list.map((deployment) => {
                  const live = status.activeDeploys[deployment.projectId];
                  const running = live?.deploymentId === deployment.id ? live : null;
                  const lastRun = deployment.lastRun;
                  const state = running ? { tone: "warn" as const, label: "Deploying…" } : runTone(lastRun);
                  return (
                    <Link key={deployment.id} href={`/deployments/${deployment.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 transition last:border-b-0 hover:bg-panel-2">
                      <Dot tone={state.tone} pulse={state.tone === "warn"} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                          <span className="font-semibold">{deployment.name}</span>
                          <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-dim">{deployment.mode === "image" ? "Image push" : "Commands"}</span>
                          <span className="flex items-center gap-1 text-[11px] text-ink-dim">
                            <Server className="size-3" /> {deployment.serverName}
                          </span>
                          {deployment.healthUrl && (
                            <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                              <HeartPulse className="size-3" /> health check
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">
                          {deployment.mode === "image" ? `${deployment.imageName}:${deployment.imageTag || "latest"} → ` : ""}
                          {deployment.remotePath}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right text-[11px] sm:block">
                        <p className={cx(state.tone === "success" && "text-success", state.tone === "danger" && "text-danger", state.tone === "warn" && "text-warn", state.tone === "muted" && "text-ink-faint")}>
                          {running ? `${state.label} ${running.phase ?? ""}` : state.label}
                        </p>
                        {lastRun && !running && (
                          <p className="text-ink-faint">
                            {timeAgo(lastRun.startedAt)}
                            {lastRun.username ? ` · ${lastRun.username}` : ""}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-ink-faint" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function duration(start: string, end: string | null) {
  if (!end) return null;
  const seconds = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const statusLabel = { success: { tone: "success" as const, label: "Succeeded" }, error: { tone: "danger" as const, label: "Failed" }, cancelled: { tone: "muted" as const, label: "Cancelled" }, running: { tone: "warn" as const, label: "Running" } };

function RunHistory() {
  const { status } = useStatus();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [projectId, setProjectId] = useState("");
  const [runs, setRuns] = useState<RecentRun[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const activeCount = Object.keys(status.activeDeploys).length;

  const load = useCallback(async () => {
    const result = await getRunHistory({ status: filter, projectId: projectId || undefined, limit: PAGE, offset: 0 });
    setRuns(result.runs);
    setTotal(result.total);
  }, [filter, projectId]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, activeCount]);

  const more = async () => {
    if (!runs) return;
    setLoadingMore(true);
    const result = await getRunHistory({ status: filter, projectId: projectId || undefined, limit: PAGE, offset: runs.length });
    setRuns([...runs, ...result.runs]);
    setTotal(result.total);
    setLoadingMore(false);
  };

  return (
    <>
      <div className="-mt-2 mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "success", label: "Succeeded" },
            { value: "error", label: "Failed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <Select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="w-auto min-w-[180px]">
          <option value="">All projects</option>
          {status.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
        {runs && (
          <span className="text-[12px] text-ink-dim">
            {total} run{total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {runs === null ? (
        <Spinner label="Loading…" />
      ) : runs.length === 0 ? (
        <Empty icon={<History className="size-4" />} title="No runs" hint="Nothing matches these filters yet." />
      ) : (
        <>
          <div className="overflow-hidden rounded-card border border-line bg-panel">
            {runs.map((run) => {
              const state = statusLabel[run.status];
              const took = duration(run.startedAt, run.finishedAt);
              return (
                <Link key={run.id} href={`/deployments/${run.deploymentId}?run=${run.id}`} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[12px] transition last:border-b-0 hover:bg-panel-2">
                  <Dot tone={state.tone} />
                  <span className={cx("w-[76px] shrink-0", state.tone === "success" && "text-success", state.tone === "danger" && "text-danger", state.tone === "muted" && "text-ink-faint")}>{state.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span className="font-medium text-ink">{run.projectName}</span>
                      <span className="text-ink-dim"> · {run.deploymentName}</span>
                      <span className="text-ink-faint"> → {run.serverName}</span>
                    </p>
                    <p className="truncate text-[11px] text-ink-faint">
                      {kindLabel[run.kind]}
                      {run.username ? ` by ${run.username}` : ""} · {new Date(run.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {took ? ` · ${took}` : ""}
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-[11px] text-ink-faint sm:block">{timeAgo(run.startedAt)}</span>
                  <ChevronRight className="size-4 shrink-0 text-ink-faint" />
                </Link>
              );
            })}
          </div>
          {runs.length < total && (
            <div className="mt-3 flex justify-center">
              <Button onClick={() => void more()} busy={loadingMore}>
                Load more ({total - runs.length} left)
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
