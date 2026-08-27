"use client";

import {
  Activity,
  Blocks,
  Boxes,
  CircleDot,
  ExternalLink,
  GitFork,
  Globe2,
  Settings,
  Trash2,
  Zap,
} from "lucide-react";
import type { Project } from "@/config/projects";
import type { ActivityEntry } from "@/types/activity";
import type {
  AgentProjectStatus,
  GitHubIntegrationStatus,
  ProxyManagerStatus,
} from "@/types/agent";

function ViewHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-violet-400/80">
          Developer command center
        </p>
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-zinc-50 sm:text-[28px]">
          {title}
        </h1>
        <p className="mt-2 max-w-xl text-[12px] leading-5 text-zinc-500">{subtitle}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function ActivityView({
  activity,
  projects,
  onOpenProject,
  onClear,
}: {
  activity: ActivityEntry[];
  projects: Project[];
  onOpenProject: (id: string) => void;
  onClear: () => void;
}) {
  const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? id;

  return (
    <div>
      <ViewHeader title="Activity" subtitle="Every action DevLaunch ran on this Mac, newest first.">
        {activity.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
          >
            <Trash2 className="size-3" /> Clear history
          </button>
        )}
      </ViewHeader>

      {activity.length > 0 ? (
        <div className="space-y-2">
          {activity.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <span
                className={`size-1.5 shrink-0 rounded-full ${entry.kind === "success" ? "bg-emerald-400" : "bg-rose-400"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-zinc-300">{entry.message}</p>
                <button
                  type="button"
                  onClick={() => onOpenProject(entry.projectId)}
                  className="mt-0.5 text-[11px] text-zinc-500 transition hover:text-violet-300"
                >
                  {projectName(entry.projectId)}
                </button>
              </div>
              <span className="rounded-md border border-white/[0.06] bg-black/20 px-2 py-1 font-mono text-[11px] capitalize text-zinc-500">
                {entry.action}
              </span>
              <time className="shrink-0 text-[11px] text-zinc-500">
                {new Date(entry.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.015] text-center">
          <div>
            <Activity className="mx-auto size-5 text-zinc-500" />
            <p className="mt-3 text-[13px] font-medium text-zinc-400">No activity yet</p>
            <p className="mt-1 text-[11px] text-zinc-600">
              Start, stop, or open a project and the action will show up here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function ServicesView({
  projects,
  runtimeByProject,
  agentOnline,
  onOpenProject,
}: {
  projects: Project[];
  runtimeByProject: Record<string, AgentProjectStatus>;
  agentOnline: boolean;
  onOpenProject: (id: string) => void;
}) {
  const withContainers = projects
    .map((project) => ({ project, runtime: runtimeByProject[project.id] }))
    .filter(
      (entry): entry is { project: Project; runtime: AgentProjectStatus } =>
        Boolean(entry.runtime && entry.runtime.docker.containers.length > 0),
    );
  const runningTotal = withContainers.reduce(
    (total, entry) =>
      total + entry.runtime.docker.containers.filter((container) => container.state === "running").length,
    0,
  );
  const containerTotal = withContainers.reduce(
    (total, entry) => total + entry.runtime.docker.containers.length,
    0,
  );

  return (
    <div>
      <ViewHeader title="Services" subtitle="Every Docker container DevLaunch tracks across your projects.">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-[12px] text-zinc-500">
          <CircleDot className={`size-3 ${runningTotal > 0 ? "text-emerald-400" : "text-zinc-600"}`} />
          {agentOnline ? `${runningTotal}/${containerTotal} running` : "Agent offline"}
        </div>
      </ViewHeader>

      {withContainers.length > 0 ? (
        <div className="space-y-6">
          {withContainers.map(({ project, runtime }) => (
            <section key={project.id}>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  className="flex items-center gap-2.5 text-left"
                >
                  <span
                    className="grid size-7 place-items-center rounded-lg border border-white/10 text-[10px] font-semibold tracking-[0.08em] text-white"
                    style={{
                      background: `linear-gradient(145deg, ${project.accent}55, ${project.accent}15)`,
                    }}
                  >
                    {project.monogram}
                  </span>
                  <span className="text-[13px] font-semibold text-zinc-200 transition hover:text-white">
                    {project.name}
                  </span>
                </button>
                <span className="text-[11px] text-zinc-500">
                  {runtime.docker.containers.filter((container) => container.state === "running").length}/
                  {runtime.docker.containers.length} running
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {runtime.docker.containers.map((container) => (
                  <div
                    key={container.id}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${container.state === "running" ? "bg-emerald-400" : "bg-zinc-600"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[12px] text-zinc-300">{container.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-600">{container.status}</p>
                    </div>
                    {container.ports && (
                      <span className="max-w-48 truncate font-mono text-[12px] text-zinc-500">
                        {container.ports}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.015] text-center">
          <div>
            <Blocks className="mx-auto size-5 text-zinc-500" />
            <p className="mt-3 text-[13px] font-medium text-zinc-400">
              {agentOnline ? "No containers found" : "Agent offline"}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              {agentOnline
                ? "Start a project and its Compose services will appear here."
                : "Start the local agent to see Docker services."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsView({
  agentOnline,
  dockerAvailable,
  lastChecked,
  projectsRoot,
  projectCount,
  github,
  proxyManager,
  onResetPreferences,
}: {
  agentOnline: boolean;
  dockerAvailable: boolean;
  lastChecked: string | null;
  projectsRoot: string | null;
  projectCount: number;
  github: GitHubIntegrationStatus | null;
  proxyManager: ProxyManagerStatus | null;
  onResetPreferences: () => void;
}) {
  return (
    <div>
      <ViewHeader title="Settings" subtitle="How DevLaunch is connected on this Mac." />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-white/[0.065] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
            <Zap className="size-3.5 text-violet-300" /> Local agent
            <span
              className={`ml-auto size-1.5 rounded-full ${agentOnline ? "bg-emerald-400 shadow-[0_0_7px_#34d399]" : "bg-zinc-600"}`}
            />
          </div>
          <dl className="mt-3 space-y-2 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Status</dt>
              <dd className={agentOnline ? "text-emerald-300" : "text-zinc-400"}>
                {agentOnline ? "Online" : "Offline"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Docker</dt>
              <dd className={dockerAvailable ? "text-emerald-300" : "text-zinc-400"}>
                {dockerAvailable ? "Available" : "Unavailable"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-zinc-500">Projects root</dt>
              <dd className="truncate font-mono text-[11px] text-zinc-400">{projectsRoot ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Registered projects</dt>
              <dd className="text-zinc-400">{projectCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Last checked</dt>
              <dd className="text-zinc-400">
                {lastChecked ? new Date(lastChecked).toLocaleTimeString() : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-white/[0.065] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
            <GitFork className="size-3.5 text-zinc-200" /> GitHub accounts
            <span
              className={`ml-auto size-1.5 rounded-full ${github?.authenticated ? "bg-emerald-400" : "bg-zinc-600"}`}
            />
          </div>
          {github?.authenticated && github.accounts.length > 0 ? (
            <div className="mt-3 space-y-2">
              {github.accounts.map((account) => (
                <div
                  key={account.login}
                  className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-black/15 px-3 py-2"
                >
                  <span className="font-mono text-[12px] text-zinc-300">@{account.login}</span>
                  {account.active && (
                    <span className="rounded border border-emerald-400/20 bg-emerald-400/[0.08] px-1.5 py-0.5 text-[11px] text-emerald-300">
                      Active
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[12px] leading-4 text-zinc-500">
              No GitHub CLI session. Run{" "}
              <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px] text-zinc-400">
                gh auth login
              </code>{" "}
              to connect your accounts.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-white/[0.065] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
            <Globe2 className="size-3.5 text-violet-300" /> Nginx Proxy Manager
            <span
              className={`ml-auto size-1.5 rounded-full ${proxyManager?.available ? "bg-emerald-400" : "bg-zinc-600"}`}
            />
          </div>
          {proxyManager?.available ? (
            <dl className="mt-3 space-y-2 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Proxy hosts</dt>
                <dd className="text-zinc-400">
                  {proxyManager.healthyCount}/{proxyManager.hostCount} healthy
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Dashboard</dt>
                <dd>
                  <a
                    href={proxyManager.dashboardUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-violet-300 transition hover:text-violet-200"
                  >
                    Open <ExternalLink className="size-3" />
                  </a>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-[12px] leading-4 text-zinc-500">
              Route discovery is offline. Point the agent at your Nginx Proxy Manager database to see
              proxy hosts here.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-white/[0.065] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
            <Settings className="size-3.5 text-zinc-400" /> Browser data
          </div>
          <p className="mt-3 text-[12px] leading-4 text-zinc-500">
            Favorites, recent projects, sorting, and the activity history live in this browser only.
          </p>
          <button
            type="button"
            onClick={onResetPreferences}
            className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200"
          >
            <Boxes className="size-3" /> Reset local preferences
          </button>
        </section>
      </div>
    </div>
  );
}
