"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Code2,
  ExternalLink,
  GitFork,
  Globe2,
  GitBranch,
  LoaderCircle,
  Power,
  Star,
} from "lucide-react";
import type { Project } from "@/config/projects";
import type { AgentProjectStatus, ProjectAction } from "@/types/agent";

const actionMeta = {
  code: { label: "Code", icon: Code2 },
  github: { label: "GitHub", icon: GitFork },
  local: { label: "Local", icon: Globe2 },
  live: { label: "Live", icon: ExternalLink },
} as const;

const statusMeta = {
  running: { label: "Running", dot: "bg-emerald-400", text: "text-emerald-300" },
  idle: { label: "Idle", dot: "bg-amber-300", text: "text-amber-200" },
  offline: { label: "Offline", dot: "bg-zinc-500", text: "text-zinc-400" },
} as const;

export function ProjectCard({
  project,
  runtime,
  agentOnline,
  busy,
  favorite,
  onAction,
  onProjectUsed,
  onToggleFavorite,
  onOpenDetails,
}: {
  project: Project;
  runtime?: AgentProjectStatus;
  agentOnline: boolean;
  busy: boolean;
  favorite: boolean;
  onAction: (id: string, action: ProjectAction) => void;
  onProjectUsed: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenDetails: (id: string) => void;
}) {
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  const repoMenuRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!repoMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!repoMenuRef.current?.contains(event.target as Node)) setRepoMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRepoMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [repoMenuOpen]);

  const liveProjectStatus = runtime
    ? runtime.exists
      ? runtime.docker.running
        ? "running"
        : "idle"
      : "offline"
    : project.status;
  const status = statusMeta[liveProjectStatus];
  const branch = runtime?.git?.branch ?? project.branch;
  const localUrl = project.links.local ?? runtime?.localUrls[0];
  const links = { ...project.links, local: localUrl };
  const githubRepositories = (runtime?.repositories ?? []).filter(
    (repository) => repository.githubUrl,
  );

  return (
    <article
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a")) return;
        onOpenDetails(project.id);
      }}
      className="group relative flex min-h-[256px] cursor-pointer flex-col rounded-2xl border border-white/[0.075] bg-[#111216]/90 p-5 shadow-[0_1px_0_rgba(255,255,255,0.035)_inset,0_22px_60px_rgba(0,0,0,0.2)] transition duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-[#131419]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div
          className="absolute -right-8 -top-12 h-32 w-32 rounded-full opacity-[0.08] blur-3xl transition-opacity duration-300 group-hover:opacity-[0.16]"
          style={{ backgroundColor: project.accent }}
        />
      </div>

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <div
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 text-[12px] font-semibold tracking-[0.08em] text-white shadow-[0_8px_22px_rgba(0,0,0,0.24)]"
            style={{
              background: `linear-gradient(145deg, ${project.accent}55, ${project.accent}15)`,
            }}
          >
            {project.monogram}
          </div>
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onOpenDetails(project.id)}
              className="block max-w-full truncate text-left text-[15px] font-semibold tracking-[-0.01em] text-zinc-100 hover:text-white"
            >
              {project.name}
            </button>
            <div className={`mt-1 flex items-center gap-1.5 text-[11px] font-medium ${status.text}`}>
              <span
                className={`size-1.5 rounded-full ${status.dot} ${liveProjectStatus === "running" ? "shadow-[0_0_8px_currentColor]" : ""}`}
              />
              {status.label}
              {runtime?.domains.length ? (
                <span className="font-normal text-zinc-600">
                  · {runtime.domains.filter((domain) => domain.health?.healthy).length}/
                  {runtime.domains.length} routes
                </span>
              ) : null}
              {runtime?.github?.connected ? (
                <span className="font-normal text-zinc-600">
                  · {runtime.github.pullRequestCount} PR
                  {runtime.github.pullRequestCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onToggleFavorite(project.id)}
            aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${project.name}`}
            title={favorite ? "Remove favorite" : "Add favorite"}
            className={`rounded-lg p-1.5 transition hover:bg-white/[0.05] ${favorite ? "text-amber-300" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            <Star className="size-3.5" fill={favorite ? "currentColor" : "none"} />
          </button>
          {project.links.github && (
            <a
              href={project.links.github}
              target="_blank"
              rel="noreferrer"
              onClick={() => onProjectUsed(project.id)}
              aria-label={`Open ${project.name} on GitHub`}
              className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300"
            >
              <ArrowUpRight className="size-4" />
            </a>
          )}
        </div>
      </div>

      <p className="relative mt-4 min-h-10 text-[13px] leading-5 text-zinc-500">
        {project.description}
      </p>

      <div className="relative mt-3 flex flex-wrap gap-1.5">
        {project.stack.map((technology) => (
          <span
            key={technology}
            className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[12px] font-medium text-zinc-400"
          >
            {technology}
          </span>
        ))}
      </div>

      <div className="relative mt-auto flex items-end justify-between gap-3 pt-5">
        <div className="min-w-0 text-[12px] leading-4 text-zinc-600">
          <div className="flex items-center gap-1.5">
            <GitBranch className="size-3" />
            <span className="max-w-32 truncate font-mono">{branch}</span>
            {runtime?.git?.dirty && (
              <span className="size-1.5 rounded-full bg-amber-300" title="Uncommitted changes" />
            )}
            {runtime?.git && (runtime.git.ahead > 0 || runtime.git.behind > 0) && (
              <span
                className="font-mono text-[11px] text-zinc-600"
                title={`Upstream ${runtime.git.upstream ?? "branch"}`}
              >
                {runtime.git.ahead > 0 ? `↑${runtime.git.ahead}` : ""}
                {runtime.git.ahead > 0 && runtime.git.behind > 0 ? " " : ""}
                {runtime.git.behind > 0 ? `↓${runtime.git.behind}` : ""}
              </span>
            )}
          </div>
          <p className="mt-0.5 pl-[18px]">{project.updatedAt}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-black/20 p-1">
          {runtime?.docker.composeAvailable && project.id !== "devlaunch" && (
            <button
              type="button"
              onClick={() => {
                onProjectUsed(project.id);
                onAction(project.id, runtime.docker.running ? "stop" : "start");
              }}
              disabled={!agentOnline || busy}
              aria-label={`${runtime.docker.running ? "Stop" : "Start"} ${project.name}`}
              title={runtime.docker.running ? "Stop containers" : "Start containers"}
              className={`grid size-7 place-items-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40 ${runtime.docker.running ? "text-emerald-400 hover:bg-rose-400/10 hover:text-rose-300" : "text-violet-300 hover:bg-violet-400/10 hover:text-violet-200"}`}
            >
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
            </button>
          )}
          {(Object.keys(actionMeta) as Array<keyof typeof actionMeta>).map((key) => {
            const action = actionMeta[key];
            const href = links[key];
            const Icon = action.icon;

            if (key === "code" && agentOnline) {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onProjectUsed(project.id);
                    onAction(project.id, "open-code");
                  }}
                  disabled={busy}
                  aria-label={`${action.label}: ${project.name}`}
                  title="Open in VS Code"
                  className="grid size-7 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-wait disabled:opacity-40"
                >
                  <Icon className="size-3.5" />
                </button>
              );
            }

            if (key === "github" && githubRepositories.length > 1) {
              return (
                <span
                  key={key}
                  ref={repoMenuRef}
                  onClick={(event) => event.stopPropagation()}
                  className="relative"
                >
                  <button
                    type="button"
                    onClick={() => setRepoMenuOpen((open) => !open)}
                    aria-label={`GitHub: ${project.name} (${githubRepositories.length} repositories)`}
                    aria-expanded={repoMenuOpen}
                    title={`GitHub · ${githubRepositories.length} repositories`}
                    className={`relative grid size-7 place-items-center rounded-md transition hover:bg-white/[0.08] hover:text-zinc-100 ${repoMenuOpen ? "bg-white/[0.08] text-zinc-100" : "text-zinc-500"}`}
                  >
                    <Icon className="size-3.5" />
                    <span className="absolute -right-0.5 -top-0.5 grid size-3 place-items-center rounded-full bg-zinc-700 text-[8px] font-semibold text-zinc-200">
                      {githubRepositories.length}
                    </span>
                  </button>
                  {repoMenuOpen && (
                    <div className="absolute bottom-full right-0 z-20 mb-2 min-w-44 rounded-xl border border-white/10 bg-[#16171c] p-1 shadow-[0_18px_48px_rgba(0,0,0,0.5)]">
                      {githubRepositories.map((repository) => (
                        <a
                          key={repository.relativePath}
                          href={repository.githubUrl!}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => {
                            setRepoMenuOpen(false);
                            onProjectUsed(project.id);
                          }}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-zinc-300 transition hover:bg-white/[0.06] hover:text-zinc-100"
                        >
                          <GitFork className="size-3 shrink-0 text-zinc-500" />
                          <span className="truncate font-mono">
                            {repository.relativePath === "." ? "Root folder" : repository.relativePath}
                          </span>
                          {repository.git.dirty && (
                            <span
                              className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-300"
                              title="Uncommitted changes"
                            />
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </span>
              );
            }

            if (!href) {
              return (
                <span
                  key={key}
                  aria-label={`${action.label} unavailable`}
                  title={`${action.label} unavailable`}
                  className="grid size-7 cursor-not-allowed place-items-center rounded-md text-zinc-600"
                >
                  <Icon className="size-3.5" />
                </span>
              );
            }

            return (
              <a
                key={key}
                href={href}
                target={key === "code" ? undefined : "_blank"}
                rel={key === "code" ? undefined : "noreferrer"}
                onClick={() => onProjectUsed(project.id)}
                aria-label={`${action.label}: ${project.name}`}
                title={action.label}
                className="grid size-7 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-100"
              >
                <Icon className="size-3.5" />
              </a>
            );
          })}
        </div>
      </div>
    </article>
  );
}
