"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Code2,
  ExternalLink,
  FilePenLine,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  Globe2,
  Hammer,
  LoaderCircle,
  Pencil,
  Power,
  RefreshCw,
  RotateCw,
  SquareTerminal,
  Star,
  Trash2,
  Workflow,
} from "lucide-react";
import type { Project } from "@/config/projects";
import type { ActivityEntry } from "@/types/activity";
import type {
  AgentProjectStatus,
  ProjectAction,
  ProjectLogsResponse,
} from "@/types/agent";

const actionLabels: Record<Exclude<ProjectAction, "open-code">, string> = {
  start: "start",
  stop: "stop",
  restart: "restart",
  rebuild: "rebuild",
};

export function ProjectDetailPage({
  project,
  runtime,
  activity,
  favorite,
  agentOnline,
  busy,
  onClose,
  onAction,
  onProjectUsed,
  onToggleFavorite,
  onEdit,
  onRemove,
}: {
  project: Project;
  runtime?: AgentProjectStatus;
  activity: ActivityEntry[];
  favorite: boolean;
  agentOnline: boolean;
  busy: boolean;
  onClose: () => void;
  onAction: (id: string, action: ProjectAction) => void;
  onProjectUsed: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [logs, setLogs] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<Exclude<ProjectAction, "open-code" | "start"> | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const loadLogs = useCallback(async () => {
    if (!runtime?.docker.composeAvailable) return;
    setLogsLoading(true);
    setLogsError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/logs`, {
        cache: "no-store",
      });
      const result = (await response.json()) as ProjectLogsResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in result && result.error ? result.error : "Logs unavailable");
      }
      setLogs((result as ProjectLogsResponse).logs);
    } catch (error) {
      setLogsError(error instanceof Error ? error.message : "Logs unavailable");
    } finally {
      setLogsLoading(false);
    }
  }, [project.id, runtime?.docker.composeAvailable]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    const initialLogs = window.setTimeout(() => void loadLogs(), 0);

    return () => {
      window.removeEventListener("keydown", handleKey);
      window.clearTimeout(initialLogs);
    };
  }, [loadLogs, onClose]);

  const running = runtime?.docker.running ?? project.status === "running";
  const localUrl = project.links.local ?? runtime?.localUrls[0];
  const branch = runtime?.git?.branch ?? project.branch;
  const github = runtime?.github;
  const repositoryUrl = github?.repositoryUrl ?? project.links.github;

  const runAction = (action: ProjectAction) => {
    onProjectUsed(project.id);
    onAction(project.id, action);
  };

  return (
    <div aria-label={`${project.name} details`}>
      <header className="border-b border-white/[0.065] pb-5">
        <div className="flex w-full items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to projects"
            title="Back to projects"
            className="mr-1 rounded-lg p-2 text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 text-[11px] font-semibold tracking-[0.08em] text-white"
            style={{ background: `linear-gradient(145deg, ${project.accent}55, ${project.accent}15)` }}
          >
            {project.monogram}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold text-zinc-100">{project.name}</h2>
              <span className={`size-1.5 rounded-full ${running ? "bg-emerald-400 shadow-[0_0_7px_#34d399]" : "bg-zinc-600"}`} />
            </div>
            <p className="mt-0.5 truncate font-mono text-[12px] text-zinc-600">{project.localPath}</p>
          </div>
          <button
            type="button"
            onClick={() => onToggleFavorite(project.id)}
            aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${project.name}`}
            className={`rounded-lg p-2 transition hover:bg-white/[0.05] ${favorite ? "text-amber-300" : "text-zinc-600 hover:text-zinc-300"}`}
          >
            <Star className="size-4" fill={favorite ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            aria-label={`Edit ${project.name}`}
            title="Edit project"
            className="rounded-lg p-2 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300 disabled:opacity-40"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            disabled={busy}
            aria-label={`Remove ${project.name} from DevLaunch`}
            title="Remove from DevLaunch"
            className="rounded-lg p-2 text-zinc-600 transition hover:bg-rose-400/[0.07] hover:text-rose-300 disabled:opacity-40"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </header>

      <div className="mt-6">
        <div className="w-full">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div className="min-w-0 space-y-6">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => runAction("open-code")}
                  disabled={!agentOnline || busy}
                  className="flex h-9 items-center justify-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.035] text-[12px] font-medium text-zinc-300 transition hover:bg-white/[0.07] disabled:opacity-40"
                >
                  <Code2 className="size-3.5" /> Code
                </button>
                {runtime?.docker.composeAvailable && project.id !== "devlaunch" ? (
                  <button
                    type="button"
                    onClick={() => (running ? setConfirmAction("stop") : runAction("start"))}
                    disabled={!agentOnline || busy}
                    className={`flex h-9 items-center justify-center gap-2 rounded-lg border text-[12px] font-medium transition disabled:opacity-40 ${running ? "border-rose-400/15 bg-rose-400/[0.06] text-rose-300 hover:bg-rose-400/10" : "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300 hover:bg-emerald-400/10"}`}
                  >
                    {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
                    {running ? "Stop" : "Start"}
                  </button>
                ) : (
                  <span className="flex h-9 items-center justify-center rounded-lg border border-white/[0.05] text-[12px] text-zinc-500">No control</span>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmAction("restart")}
                  disabled={!agentOnline || busy || !runtime?.docker.composeAvailable || project.id === "devlaunch"}
                  className="flex h-9 items-center justify-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.035] text-[12px] font-medium text-zinc-400 transition hover:bg-white/[0.07] disabled:opacity-30"
                >
                  <RotateCw className="size-3.5" /> Restart
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction("rebuild")}
                  disabled={!agentOnline || busy || !runtime?.docker.composeAvailable || project.id === "devlaunch"}
                  className="flex h-9 items-center justify-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.035] text-[12px] font-medium text-zinc-400 transition hover:bg-white/[0.07] disabled:opacity-30"
                >
                  <Hammer className="size-3.5" /> Rebuild
                </button>
              </div>

              {runtime && runtime.repositories.length > 0 && (
                <section>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
                      <GitFork className="size-3.5 text-violet-300" /> Repositories
                    </div>
                    <span className="text-[11px] text-zinc-500">
                      {runtime.repositories.length} detected
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {runtime.repositories.map((repository, index) => (
                      <div
                        key={repository.relativePath}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${repository.git.dirty ? "bg-amber-300" : "bg-emerald-400"}`}
                          />
                          <span className="font-mono text-[12px] text-zinc-300">
                            {repository.relativePath === "." ? "Root folder" : repository.relativePath}
                          </span>
                          {index === 0 && (
                            <span className="rounded border border-white/[0.06] px-1.5 py-0.5 text-[12px] uppercase tracking-[0.1em] text-zinc-500">
                              Primary
                            </span>
                          )}
                          <span className="ml-auto font-mono text-[11px] text-zinc-600">
                            {repository.git.branch ?? "detached"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 pl-3.5">
                          {repository.githubUrl ? (
                            <a
                              href={repository.githubUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-0 flex-1 truncate font-mono text-[11px] text-violet-300 hover:text-violet-200"
                            >
                              {repository.github?.nameWithOwner ?? repository.githubUrl.replace("https://github.com/", "")}
                            </a>
                          ) : (
                            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-500">
                              {repository.remoteUrl ?? "No origin remote"}
                            </span>
                          )}
                          {repository.github?.account && (
                            <span className="max-w-28 truncate text-[12px] text-zinc-500">
                              @{repository.github.account}
                            </span>
                          )}
                          {repository.github?.connected && (
                            <>
                              <a
                                href={`${repository.github.repositoryUrl}/pulls`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[12px] text-zinc-500 hover:text-zinc-300"
                              >
                                {repository.github.pullRequestCount} PR
                              </a>
                              <a
                                href={`${repository.github.repositoryUrl}/issues`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[12px] text-zinc-500 hover:text-zinc-300"
                              >
                                {repository.github.issueCount} issues
                              </a>
                            </>
                          )}
                          <span className={`text-[12px] ${repository.git.dirty ? "text-amber-300/80" : "text-emerald-300/70"}`}>
                            {repository.git.dirty ? `${repository.git.changedFiles} changed` : "Clean"}
                          </span>
                        </div>
                        {repository.github?.error && (
                          <p className="mt-2 pl-3.5 text-[12px] leading-3 text-amber-200/60">
                            {repository.github.error}
                          </p>
                        )}
                        {(repository.git.lastCommit || repository.github?.latestWorkflow) && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.05] pt-2 pl-3.5">
                            {repository.git.lastCommit && (
                              <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-zinc-500">
                                <GitCommitHorizontal className="size-3 shrink-0" />
                                <span className="shrink-0 font-mono text-zinc-400">
                                  {repository.git.lastCommit.hash}
                                </span>
                                <span className="truncate">{repository.git.lastCommit.message}</span>
                                {(repository.git.ahead > 0 || repository.git.behind > 0) && (
                                  <span className="shrink-0 font-mono text-amber-300/80">
                                    {repository.git.ahead > 0 ? `↑${repository.git.ahead}` : ""}
                                    {repository.git.ahead > 0 && repository.git.behind > 0 ? " " : ""}
                                    {repository.git.behind > 0 ? `↓${repository.git.behind}` : ""}
                                  </span>
                                )}
                              </div>
                            )}
                            {repository.github?.latestWorkflow && (
                              <a
                                href={repository.github.latestWorkflow.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex shrink-0 items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300"
                              >
                                <span
                                  className={`size-1.5 rounded-full ${workflowDot(repository.github.latestWorkflow.status, repository.github.latestWorkflow.conclusion)}`}
                                />
                                Actions: {repository.github.latestWorkflow.conclusion || repository.github.latestWorkflow.status}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {repositoryUrl && (!runtime || runtime.repositories.length === 0) && (
                <section className="rounded-xl border border-white/[0.065] bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
                        <GitFork className="size-3.5 text-zinc-200" /> GitHub
                        {github?.connected && (
                          <span className="rounded-md border border-white/[0.06] px-1.5 py-0.5 text-[12px] font-normal text-zinc-600">
                            {github.isPrivate ? "Private" : "Public"}
                          </span>
                        )}
                      </div>
                      <a
                        href={repositoryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 block truncate font-mono text-[12px] text-violet-300 hover:text-violet-200"
                      >
                        {github?.nameWithOwner ?? repositoryUrl.replace("https://github.com/", "")}
                      </a>
                    </div>
                    {github?.connected && github.defaultBranch && (
                      <span className="shrink-0 rounded-md bg-black/20 px-2 py-1 font-mono text-[11px] text-zinc-500">
                        {github.defaultBranch}
                      </span>
                    )}
                  </div>

                  {github?.connected ? (
                    <>
                      <div className="mt-4 grid grid-cols-4 gap-2">
                        <GitHubLink href={repositoryUrl} label="Repo" value="↗" />
                        <GitHubLink
                          href={`${repositoryUrl}/pulls`}
                          label="PRs"
                          value={String(github.pullRequestCount)}
                        />
                        <GitHubLink
                          href={`${repositoryUrl}/issues`}
                          label="Issues"
                          value={String(github.issueCount)}
                        />
                        <GitHubLink href={`${repositoryUrl}/actions`} label="Actions" value="↗" />
                      </div>

                      {github.latestWorkflow && (
                        <a
                          href={github.latestWorkflow.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 flex items-center gap-3 rounded-lg border border-white/[0.055] bg-black/15 px-3 py-2.5 transition hover:bg-white/[0.035]"
                        >
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${workflowDot(github.latestWorkflow.status, github.latestWorkflow.conclusion)}`}
                          />
                          <Workflow className="size-3.5 shrink-0 text-zinc-600" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] text-zinc-400">
                              {github.latestWorkflow.name || "Latest workflow"}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                              {github.latestWorkflow.displayTitle}
                            </p>
                          </div>
                          <span className="text-[11px] capitalize text-zinc-600">
                            {github.latestWorkflow.conclusion || github.latestWorkflow.status}
                          </span>
                        </a>
                      )}

                      {github.pullRequests.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                            <GitPullRequest className="size-3" /> Open pull requests
                          </p>
                          <div className="space-y-1.5">
                            {github.pullRequests.map((pullRequest) => (
                              <a
                                key={pullRequest.number}
                                href={pullRequest.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-lg border border-white/[0.05] px-3 py-2.5 transition hover:bg-white/[0.035]"
                              >
                                <span className="font-mono text-[11px] text-violet-300">
                                  #{pullRequest.number}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-400">
                                  {pullRequest.title}
                                </span>
                                {pullRequest.isDraft && (
                                  <span className="text-[12px] text-zinc-500">Draft</span>
                                )}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {github.issues.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                            Recently updated issues
                          </p>
                          <div className="space-y-1.5">
                            {github.issues.map((issue) => (
                              <a
                                key={issue.number}
                                href={issue.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-lg border border-white/[0.05] px-3 py-2.5 transition hover:bg-white/[0.035]"
                              >
                                <span className="font-mono text-[11px] text-emerald-300">
                                  #{issue.number}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-400">
                                  {issue.title}
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 rounded-lg border border-amber-300/10 bg-amber-300/[0.04] px-3 py-2.5 text-[12px] leading-4 text-amber-200/70">
                      {github?.error ?? "GitHub data is unavailable. Check the repository URL and GitHub CLI session."}
                    </p>
                  )}
                </section>
              )}

              {(!runtime || runtime.repositories.length === 0) && (
                <section className="rounded-xl border border-white/[0.065] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
                      <GitBranch className="size-3.5 text-violet-300" /> Git
                      {runtime?.git?.repositoryPath && runtime.git.repositoryPath !== "." && (
                        <span className="rounded-md border border-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] font-normal text-zinc-600">
                          {runtime.git.repositoryPath}
                        </span>
                      )}
                    </div>
                    <span className="rounded-md bg-black/20 px-2 py-1 font-mono text-[11px] text-zinc-500">{branch}</span>
                  </div>
                  {runtime?.git ? (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-white/[0.05] bg-black/15 p-3">
                        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                          <FilePenLine className="size-3" /> Working tree
                        </div>
                        <p className={`mt-1.5 text-[12px] font-medium ${runtime.git.dirty ? "text-amber-300" : "text-emerald-300"}`}>
                          {runtime.git.dirty ? `${runtime.git.changedFiles} changed files` : "Clean"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/[0.05] bg-black/15 p-3">
                        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                          <GitCommitHorizontal className="size-3" /> Latest commit
                        </div>
                        <p className="mt-1.5 truncate font-mono text-[11px] text-zinc-300">{runtime.git.lastCommit?.hash ?? "—"}</p>
                      </div>
                      {runtime.git.lastCommit && (
                        <div className="col-span-2 border-t border-white/[0.05] pt-3">
                          <p className="truncate text-[11px] text-zinc-400">{runtime.git.lastCommit.message}</p>
                          <p className="mt-1 text-[11px] text-zinc-500">{new Date(runtime.git.lastCommit.authoredAt).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-zinc-600">No Git repository detected at the project root.</p>
                  )}
                </section>
              )}

              <section>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
                      <Boxes className="size-3.5 text-sky-300" /> Containers
                      <span className="text-[11px] text-zinc-500">{runtime?.docker.containerCount ?? 0}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">Live Compose services for this project</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {runtime?.docker.containers.length ? (
                    runtime.docker.containers.map((container) => (
                      <div key={container.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                        <span className={`size-1.5 shrink-0 rounded-full ${container.state === "running" ? "bg-emerald-400" : "bg-zinc-600"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-[12px] text-zinc-300">{container.name}</p>
                          <p className="mt-0.5 truncate text-[11px] text-zinc-600">{container.status}</p>
                        </div>
                        {container.ports && <span className="max-w-32 truncate font-mono text-[12px] text-zinc-500">{container.ports}</span>}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/[0.07] px-4 py-6 text-center text-[12px] text-zinc-600">
                      {runtime?.docker.composeAvailable ? "No containers created yet." : "No root Compose file detected."}
                    </div>
                  )}
                </div>
              </section>

              {runtime?.docker.composeAvailable && (
                <section>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
                      <SquareTerminal className="size-3.5 text-emerald-300" /> Recent logs
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadLogs()}
                      disabled={logsLoading}
                      className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300 disabled:opacity-40"
                      aria-label="Refresh project logs"
                    >
                      <RefreshCw className={`size-3.5 ${logsLoading ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                  <div className="mt-2 max-h-[420px] overflow-auto rounded-xl border border-white/[0.065] bg-black/35 p-3">
                    {logsLoading && !logs ? (
                      <div className="flex min-h-24 items-center justify-center gap-2 text-[12px] text-zinc-600">
                        <LoaderCircle className="size-3.5 animate-spin" /> Loading logs…
                      </div>
                    ) : logsError ? (
                      <p className="py-8 text-center text-[12px] text-rose-300/80">{logsError}</p>
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-zinc-500">{logs ?? "No logs available."}</pre>
                    )}
                  </div>
                </section>
              )}
            </div>

            <div className="min-w-0 space-y-6">
              <section>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Environments</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {localUrl && <EnvironmentLink href={localUrl} label="Local website" icon={Globe2} onUse={() => onProjectUsed(project.id)} />}
                  {project.links.live && <EnvironmentLink href={project.links.live} label="Live website" icon={ExternalLink} onUse={() => onProjectUsed(project.id)} />}
                  {!localUrl && !project.links.live && (
                    <p className="text-[11px] text-zinc-600">No website links configured.</p>
                  )}
                </div>
              </section>

              {runtime?.domains.length ? (
                <section>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
                      <Globe2 className="size-3.5 text-violet-300" /> Proxy routes
                    </div>
                    <span className="text-[11px] text-zinc-500">
                      {runtime.domains.filter((domain) => domain.health?.healthy).length}/
                      {runtime.domains.length} healthy
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {runtime.domains.map((domain) => (
                      <a
                        key={`${domain.id}-${domain.hostname}`}
                        href={domain.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => onProjectUsed(project.id)}
                        className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 transition hover:border-white/[0.11] hover:bg-white/[0.04]"
                      >
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${domain.health?.healthy ? "bg-emerald-400 shadow-[0_0_7px_#34d399]" : domain.enabled ? "bg-rose-400" : "bg-zinc-600"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-[12px] text-zinc-300">{domain.hostname}</p>
                          <p className="mt-0.5 truncate font-mono text-[12px] text-zinc-500">
                            {domain.forwardScheme}://{domain.forwardHost}:{domain.forwardPort}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-[11px] font-medium ${domain.health?.healthy ? "text-emerald-300" : "text-rose-300"}`}>
                            {domain.health?.statusCode ?? "Offline"}
                          </p>
                          {domain.health?.latencyMs !== null && domain.health?.latencyMs !== undefined && (
                            <p className="mt-0.5 text-[12px] text-zinc-500">{domain.health.latencyMs} ms</p>
                          )}
                        </div>
                        <ExternalLink className="size-3 text-zinc-500" />
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Recent activity</p>
                <div className="mt-2 space-y-2">
                  {activity.length ? (
                    activity.slice(0, 6).map((entry) => (
                      <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-white/[0.05] px-3 py-2.5">
                        <span className={`size-1.5 rounded-full ${entry.kind === "success" ? "bg-emerald-400" : "bg-rose-400"}`} />
                        <p className="min-w-0 flex-1 truncate text-[12px] text-zinc-500">{entry.message}</p>
                        <time className="text-[12px] text-zinc-500">{new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-white/[0.06] px-3 py-4 text-center text-[12px] text-zinc-500">No actions recorded yet.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {confirmAction && (
        <div className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-xl rounded-xl border border-amber-300/15 bg-[#191710]/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-zinc-200">Confirm {actionLabels[confirmAction]}</p>
              <p className="mt-1 text-[12px] leading-4 text-zinc-500">
                This will {actionLabels[confirmAction]} the Compose services for {project.name}.
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setConfirmAction(null)} className="rounded-lg border border-white/[0.07] px-3 py-1.5 text-[12px] text-zinc-500 hover:bg-white/[0.04]">Cancel</button>
                <button
                  type="button"
                  onClick={() => {
                    runAction(confirmAction);
                    setConfirmAction(null);
                  }}
                  className="rounded-lg bg-amber-300 px-3 py-1.5 text-[12px] font-semibold text-zinc-950 hover:bg-amber-200"
                >
                  Confirm {actionLabels[confirmAction]}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmRemove && (
        <div className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-xl rounded-xl border border-rose-300/15 bg-[#1b1114]/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <div className="flex gap-3">
            <Trash2 className="mt-0.5 size-4 shrink-0 text-rose-300" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-zinc-200">Remove {project.name}?</p>
              <p className="mt-1 text-[12px] leading-4 text-zinc-500">
                This only removes the project from DevLaunch. The folder and every file at
                <span className="ml-1 break-all font-mono text-zinc-400">{project.localPath}</span> will remain untouched.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="rounded-lg border border-white/[0.07] px-3 py-1.5 text-[12px] text-zinc-500 hover:bg-white/[0.04]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRemove();
                    setConfirmRemove(false);
                  }}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-300 px-3 py-1.5 text-[12px] font-semibold text-zinc-950 hover:bg-rose-200 disabled:opacity-50"
                >
                  {busy && <LoaderCircle className="size-3 animate-spin" />}
                  Remove from DevLaunch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EnvironmentLink({
  href,
  label,
  icon: Icon,
  onUse,
}: {
  href: string;
  label: string;
  icon: typeof Globe2;
  onUse: () => void;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onUse}
      className="flex items-center gap-2 rounded-lg border border-white/[0.065] bg-white/[0.025] px-3 py-2 text-[12px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
    >
      <Icon className="size-3.5" /> {label}
    </a>
  );
}

function GitHubLink({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg border border-white/[0.055] bg-black/15 px-2 py-2 text-center transition hover:bg-white/[0.04]"
    >
      <span className="block text-[11px] font-semibold text-zinc-300">{value}</span>
      <span className="mt-0.5 block text-[12px] text-zinc-500">{label}</span>
    </a>
  );
}

function workflowDot(status: string, conclusion: string) {
  if (status !== "completed") return "animate-pulse bg-amber-300";
  if (conclusion === "success") return "bg-emerald-400 shadow-[0_0_7px_#34d399]";
  if (["failure", "timed_out", "startup_failure", "action_required"].includes(conclusion)) {
    return "bg-rose-400";
  }
  return "bg-zinc-500";
}
