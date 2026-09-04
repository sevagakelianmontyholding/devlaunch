"use client";

import Link from "next/link";
import { Activity, ArrowRight, Boxes, Clock, FolderKanban, Globe2, Plus, Power, Rocket, Server, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getDashboard, getServerHealth, runCompose } from "@/actions";
import { formatBytes } from "@/lib/format";
import { actionRunning } from "@/lib/labels";
import type { ActiveAction, ActiveDeploy, DashboardData, PipelineRun, RecentRun, ServerHealth, UptimeStatus } from "@/lib/types";
import { PageHeader } from "./app-shell";
import { ProjectDialog } from "./project-dialog";
import { LockStrip } from "./projects-view";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Dot, IconButton, Monogram, cx, timeAgo } from "./ui";

function greeting(username: string) {
  const hour = new Date().getHours();
  const word = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${word}, ${username}`;
}

function duration(start: string, end: string | null) {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

const runStatus = {
  success: { tone: "success" as const, label: "Succeeded" },
  error: { tone: "danger" as const, label: "Failed" },
  cancelled: { tone: "muted" as const, label: "Cancelled" },
  running: { tone: "warn" as const, label: "Running" },
};
const kindLabel = { deploy: "Deploy", commands: "Commands", rollback: "Rollback" } as const;
const phaseLabel = { building: "Building", uploading: "Uploading", commands: "Server commands", health: "Health check", rollback: "Rolling back" } as const;

export function DashboardView() {
  const { status, refresh, notify } = useStatus();
  const [data, setData] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<Record<string, ServerHealth> | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeCount = Object.keys(status.activeDeploys).length + Object.values(status.activePipelines).filter((run) => run.status === "running").length;
  const load = useCallback(async () => setData(await getDashboard()), []);
  const loadHealth = useCallback(async () => {
    const list = await getServerHealth();
    setHealth(Object.fromEntries(list.map((item) => [item.id, item])));
  }, []);
  // Reload the history whenever something finishes (the active count drops).
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, activeCount]);
  useEffect(() => {
    const timer = setTimeout(() => void loadHealth(), 0);
    return () => clearTimeout(timer);
  }, [loadHealth]);

  const projects = status.projects;
  const runtimes = status.runtimes;
  const running = projects.filter((project) => runtimes[project.id]?.running);
  const containers = Object.values(runtimes).flatMap((runtime) => runtime.containers);
  const runningContainers = containers.filter((container) => container.state === "running").length;
  const week = data?.week ?? { success: 0, error: 0, cancelled: 0 };
  const weekTotal = week.success + week.error + week.cancelled;
  const reachable = health ? Object.values(health).filter((item) => item.reachable).length : null;
  const deployments = Object.values(status.deployments).flat().length;

  const now = useMemo(() => {
    const items: Array<{ key: string; node: React.ReactNode }> = [];
    for (const [projectId, deploy] of Object.entries(status.activeDeploys)) {
      const project = projects.find((item) => item.id === projectId);
      items.push({ key: `deploy:${deploy.runId}`, node: <ActiveDeployRow projectId={projectId} projectName={project?.name ?? projectId} deploy={deploy} /> });
    }
    for (const [projectId, action] of Object.entries(status.activeActions)) {
      const project = projects.find((item) => item.id === projectId);
      items.push({ key: `action:${action.runId}`, node: <ActiveActionRow projectId={projectId} projectName={project?.name ?? projectId} action={action} /> });
    }
    const own = new Set(Object.values(status.activeDeploys).map((deploy) => deploy.runId));
    for (const held of Object.values(status.locks)) {
      if (own.has(held.lock.runId)) continue;
      items.push({ key: `lock:${held.serverId}`, node: <div className="[&>div]:mt-0"><LockStrip held={held} /></div> });
    }
    for (const [projectId, uptime] of Object.entries(status.uptime)) {
      if (uptime.up !== false) continue;
      const project = projects.find((item) => item.id === projectId);
      items.push({ key: `down:${projectId}`, node: <DownSiteRow projectId={projectId} projectName={project?.name ?? projectId} uptime={uptime} /> });
    }
    for (const run of Object.values(status.activePipelines)) {
      if (run.status !== "running") continue;
      const pipeline = data?.pipelines.find((item) => item.id === run.pipelineId);
      items.push({ key: `pipeline:${run.id}`, node: <ActivePipelineRow name={pipeline?.name ?? "Pipeline"} run={run} /> });
    }
    return items;
  }, [status.activeDeploys, status.activeActions, status.activePipelines, status.uptime, status.locks, projects, data]);

  const toggle = async (projectId: string, isRunning: boolean) => {
    setBusyId(projectId);
    const result = await runCompose(projectId, isRunning ? "stop" : "start");
    if (!result.ok) notify("error", result.error);
    await refresh();
    setBusyId(null);
  };

  return (
    <div className="fade-up">
      <PageHeader
        title={greeting(status.user.username)}
        subtitle={new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            Add project
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat href="/projects" icon={<FolderKanban className="size-4" />} label="Projects" value={projects.length} detail={`${running.length} running locally`} />
        <Stat href="/services" icon={<Boxes className="size-4" />} label="Containers" value={runningContainers} detail={status.dockerAvailable ? `${containers.length - runningContainers} stopped · Docker ready` : "Docker is not running"} tone={status.dockerAvailable ? undefined : "warn"} />
        <Stat
          icon={<Rocket className="size-4" />}
          label="Deploys · 7 days"
          value={weekTotal}
          detail={
            weekTotal === 0 ? (
              `${deployments} deployment${deployments === 1 ? "" : "s"} configured`
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-success">{week.success} ok</span>
                {week.error > 0 && <span className="text-danger">{week.error} failed</span>}
                {week.cancelled > 0 && <span>{week.cancelled} cancelled</span>}
              </span>
            )
          }
        />
        <Stat
          href="/servers"
          icon={<Server className="size-4" />}
          label="Servers"
          value={data?.servers.length ?? "–"}
          detail={reachable === null ? "Checking over SSH…" : `${reachable} of ${data?.servers.length ?? 0} reachable`}
          tone={reachable !== null && data && reachable < data.servers.length ? "danger" : undefined}
        />
      </div>

      <Card className="mt-3">
        <CardTitle icon={<Activity className="size-4" />} aside={now.length > 0 ? <Dot tone="accent" pulse /> : null}>
          Happening now
        </CardTitle>
        {now.length === 0 ? (
          <p className="text-[12px] text-ink-faint">All quiet. Nothing is deploying here or from another Mac, and every live site is answering.</p>
        ) : (
          <div className="space-y-2">{now.map((item) => <div key={item.key}>{item.node}</div>)}</div>
        )}
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle icon={<Rocket className="size-4" />}>Recent deployments</CardTitle>
          {!data ? (
            <p className="text-[12px] text-ink-faint">Loading…</p>
          ) : data.recentRuns.length === 0 ? (
            <p className="text-[12px] text-ink-faint">No deployments yet. Add one on a project page and press Deploy.</p>
          ) : (
            <div className="divide-y divide-line">
              {data.recentRuns.map((run) => (
                <RecentRunRow key={run.id} run={run} />
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <Card>
            <CardTitle
              icon={<Server className="size-4" />}
              aside={
                <Link href="/servers" className="flex items-center gap-1 text-[11px] text-ink-dim hover:text-accent">
                  All <ArrowRight className="size-3" />
                </Link>
              }
            >
              Servers
            </CardTitle>
            {!data ? (
              <p className="text-[12px] text-ink-faint">Loading…</p>
            ) : data.servers.length === 0 ? (
              <p className="text-[12px] text-ink-faint">No servers yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.servers.map((server) => {
                  const info = health?.[server.id];
                  return (
                    <li key={server.id} className="flex items-center gap-2.5 text-[12px]">
                      <Dot tone={!health ? "muted" : info?.reachable ? "success" : "danger"} pulse={!health} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{server.name}</p>
                        <p className="truncate font-mono text-[11px] text-ink-faint">{server.username}@{server.host}</p>
                      </div>
                      <span className={cx("shrink-0 text-right text-[11px]", health && !info?.reachable ? "text-danger" : "text-ink-faint")}>
                        {!health ? "checking…" : info?.reachable ? <>{info.lock ? <span className="text-warn">deploying: {info.lock.user ?? info.lock.machine}</span> : <>{info.containers.length} containers</>}{info.disk && <><br />disk {info.disk.percent}%</>}</> : "unreachable"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle
              icon={<Workflow className="size-4" />}
              aside={
                <Link href="/pipelines" className="flex items-center gap-1 text-[11px] text-ink-dim hover:text-accent">
                  All <ArrowRight className="size-3" />
                </Link>
              }
            >
              Pipelines
            </CardTitle>
            {!data ? (
              <p className="text-[12px] text-ink-faint">Loading…</p>
            ) : data.pipelines.length === 0 ? (
              <p className="text-[12px] text-ink-faint">No pipelines yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.pipelines.map((pipeline) => {
                  const run = status.activePipelines[pipeline.id];
                  return (
                    <li key={pipeline.id} className="flex items-center gap-2 text-[12px]">
                      <Dot tone={run?.status === "running" ? "warn" : pipeline.enabled && pipeline.schedule ? "accent" : "muted"} pulse={run?.status === "running"} />
                      <span className="font-medium">{pipeline.name}</span>
                      <span className="text-[11px] text-ink-faint">{pipeline.steps.length} steps</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-ink-faint">
                        {pipeline.schedule && pipeline.enabled ? (
                          <>
                            <Clock className="size-3" /> daily {pipeline.schedule}
                          </>
                        ) : pipeline.lastRunAt ? (
                          `ran ${timeAgo(pipeline.lastRunAt)}`
                        ) : (
                          "never run"
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-3">
        <CardTitle
          icon={<FolderKanban className="size-4" />}
          aside={
            <Link href="/projects" className="flex items-center gap-1 text-[11px] text-ink-dim hover:text-accent">
              All projects <ArrowRight className="size-3" />
            </Link>
          }
        >
          Projects
        </CardTitle>
        {projects.length === 0 ? (
          <p className="text-[12px] text-ink-faint">
            No projects yet.{" "}
            <button type="button" className="text-accent hover:underline" onClick={() => setAdding(true)}>
              Add your first project
            </button>
            .
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {[...projects]
              .sort((a, b) => Number(Boolean(runtimes[b.id]?.running)) - Number(Boolean(runtimes[a.id]?.running)) || a.name.localeCompare(b.name))
              .map((project) => {
                const runtime = runtimes[project.id];
                const isRunning = Boolean(runtime?.running);
                const canToggle = Boolean(project.composeFile || project.commands.start);
                const active = status.activeActions[project.id];
                const deploy = status.activeDeploys[project.id];
                return (
                  <div key={project.id} className="flex items-center gap-3 rounded-lg border border-line bg-bg px-3 py-2.5 transition hover:border-line-strong">
                    <Monogram name={project.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/projects/${project.id}`} className="block truncate text-[13px] font-medium hover:text-accent">
                        {project.name}
                      </Link>
                      <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                        <Dot tone={!runtime?.exists ? "danger" : deploy ? "accent" : active ? "warn" : isRunning ? "success" : "muted"} pulse={Boolean(deploy || active)} />
                        {deploy ? "Deploying" : active ? actionRunning[active.action] : !runtime?.exists ? "Folder missing" : isRunning ? `${runtime.containers.filter((container) => container.state === "running").length} containers running` : canToggle ? "Stopped" : "No commands"}
                      </p>
                    </div>
                    {canToggle && (
                      <IconButton
                        label={isRunning ? "Stop containers" : "Start containers"}
                        onClick={() => void toggle(project.id, isRunning)}
                        disabled={busyId === project.id || Boolean(active) || (!project.commands.start && !status.dockerAvailable)}
                        className={cx("size-7", isRunning ? "text-success hover:text-danger" : "text-accent")}
                      >
                        <Power className={cx("size-3.5", (busyId === project.id || active) && "animate-pulse")} />
                      </IconButton>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </Card>

      {adding && <ProjectDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function Stat({ href, icon, label, value, detail, tone }: { href?: string; icon: React.ReactNode; label: string; value: number | string; detail: React.ReactNode; tone?: "warn" | "danger" }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-[12px] font-medium text-ink-dim">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
      <div className={cx("mt-2 text-[11px]", tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-ink-faint")}>{detail}</div>
    </>
  );
  const className = "block rounded-card border border-line bg-panel p-4 transition";
  return href ? (
    <Link href={href} className={cx(className, "hover:border-line-strong hover:bg-panel-2")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function ActiveDeployRow({ projectId, projectName, deploy }: { projectId: string; projectName: string; deploy: ActiveDeploy }) {
  const upload = deploy.phase === "uploading" ? deploy.upload : null;
  return (
    <Link href={`/projects/${projectId}`} className="block rounded-lg border border-accent/25 bg-accent/[0.07] px-3 py-2 text-[12px] transition hover:border-accent/50">
      <div className="flex items-center gap-2">
        <Rocket className="size-3.5 animate-pulse text-accent" />
        <span className="font-medium">{projectName}</span>
        <span className="truncate text-ink-dim">· {deploy.deploymentName}</span>
        <span className="ml-auto shrink-0 text-[11px] text-ink-dim">
          {deploy.phase ? phaseLabel[deploy.phase] : "Starting"}
          {upload ? ` ${upload.percent}%` : "…"} · {duration(deploy.startedAt, null)}
        </span>
      </div>
      {upload && (
        <>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${upload.percent}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-ink-faint">
            <span>
              {formatBytes(upload.readBytes)} of {formatBytes(upload.imageBytes)}
            </span>
            <span className="font-mono">{formatBytes(upload.bytesPerSecond)}/s</span>
          </div>
        </>
      )}
    </Link>
  );
}

function ActiveActionRow({ projectId, projectName, action }: { projectId: string; projectName: string; action: ActiveAction }) {
  return (
    <Link href={`/projects/${projectId}`} className="flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/[0.07] px-3 py-2 text-[12px] transition hover:border-warn/50">
      <Dot tone="warn" pulse />
      <span className="font-medium">{projectName}</span>
      <span className="text-warn">{action.label ?? actionRunning[action.action]}…</span>
      <span className="truncate font-mono text-[11px] text-ink-dim">{action.command}</span>
      <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{duration(action.startedAt, null)}</span>
    </Link>
  );
}

function DownSiteRow({ projectId, projectName, uptime }: { projectId: string; projectName: string; uptime: UptimeStatus }) {
  return (
    <Link href={`/projects/${projectId}`} className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12px] transition hover:border-danger/60">
      <Globe2 className="size-3.5 animate-pulse text-danger" />
      <span className="font-medium">{projectName}</span>
      <span className="text-danger">live site is down</span>
      <span className="truncate font-mono text-[11px] text-ink-dim">{uptime.url.replace(/^https?:\/\//, "")} · {uptime.error}</span>
      <span className="ml-auto shrink-0 text-[11px] text-ink-faint">since {timeAgo(uptime.since).replace(" ago", "")}</span>
    </Link>
  );
}

function ActivePipelineRow({ name, run }: { name: string; run: PipelineRun }) {
  const step = run.steps[run.currentStep];
  return (
    <Link href="/pipelines" className="flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/[0.07] px-3 py-2 text-[12px] transition hover:border-accent/50">
      <Workflow className="size-3.5 animate-pulse text-accent" />
      <span className="font-medium">{name}</span>
      <span className="truncate text-ink-dim">
        · step {run.currentStep + 1} of {run.steps.length}
        {step ? ` — ${step.deploymentName}` : ""}
      </span>
      <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{duration(run.startedAt, null)}</span>
    </Link>
  );
}

function RecentRunRow({ run }: { run: RecentRun }) {
  const state = runStatus[run.status];
  return (
    <Link href={`/projects/${run.projectId}`} className="flex items-center gap-3 py-2.5 text-[12px] transition first:pt-0 last:pb-0 hover:text-accent">
      <Dot tone={state.tone} />
      <div className="min-w-0 flex-1">
        <p className="truncate">
          <span className="font-medium text-ink">{run.projectName}</span>
          <span className="text-ink-dim"> · {run.deploymentName}</span>
          <span className="text-ink-faint"> → {run.serverName}</span>
        </p>
        <p className="truncate text-[11px] text-ink-faint">
          {kindLabel[run.kind]}
          {run.username ? ` by ${run.username}` : ""} · {timeAgo(run.startedAt)} · {duration(run.startedAt, run.finishedAt)}
        </p>
      </div>
      <span className={cx("shrink-0 text-[11px]", state.tone === "success" && "text-success", state.tone === "danger" && "text-danger", state.tone === "muted" && "text-ink-faint")}>{state.label}</span>
    </Link>
  );
}
