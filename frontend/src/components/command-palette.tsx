"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Code2,
  GitFork,
  Globe2,
  LoaderCircle,
  Power,
  Search,
  Star,
  X,
} from "lucide-react";
import type { Project } from "@/config/projects";
import type { AgentProjectStatus, ProjectAction } from "@/types/agent";

export function CommandPalette({
  projects,
  runtimeByProject,
  favoriteIds,
  agentOnline,
  pendingProject,
  onClose,
  onAction,
  onProjectUsed,
  onToggleFavorite,
}: {
  projects: Project[];
  runtimeByProject: Record<string, AgentProjectStatus>;
  favoriteIds: Set<string>;
  agentOnline: boolean;
  pendingProject: string | null;
  onClose: () => void;
  onAction: (id: string, action: ProjectAction) => void;
  onProjectUsed: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = normalizedQuery
      ? projects.filter((project) =>
          [project.name, project.id, project.branch, ...project.stack]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : projects;

    return matches.slice(0, 10);
  }, [projects, query]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const openCode = (project: Project) => {
    onProjectUsed(project.id);
    if (agentOnline) {
      onAction(project.id, "open-code");
    } else if (project.links.code) {
      window.location.href = project.links.code;
    }
    onClose();
  };

  const selectedProject = results[selectedIndex];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="DevLaunch command palette"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.11] bg-[#111216]/98 shadow-[0_28px_100px_rgba(0,0,0,0.62),0_1px_0_rgba(255,255,255,0.05)_inset]"
      >
        <div className="flex h-14 items-center gap-3 border-b border-white/[0.07] px-4">
          <Search className="size-4 shrink-0 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((current) => Math.min(current + 1, results.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((current) => Math.max(current - 1, 0));
              }
              if (event.key === "Enter" && selectedProject) {
                event.preventDefault();
                openCode(selectedProject);
              }
            }}
            placeholder="Search projects or type a stack…"
            aria-label="Search command palette"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="rounded-md border border-white/[0.07] bg-white/[0.03] p-1.5 text-zinc-600 transition hover:text-zinc-300"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="max-h-[56vh] overflow-y-auto p-2">
          {results.length > 0 ? (
            results.map((project, index) => {
              const runtime = runtimeByProject[project.id];
              const isRunning = runtime?.docker.running ?? project.status === "running";
              const isSelected = selectedIndex === index;
              const busy = pendingProject === project.id;

              return (
                <div
                  key={project.id}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${isSelected ? "border-white/[0.08] bg-white/[0.07]" : "border-transparent hover:bg-white/[0.035]"}`}
                >
                  <button
                    type="button"
                    onClick={() => openCode(project)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 text-[12px] font-semibold tracking-[0.08em] text-white"
                      style={{
                        background: `linear-gradient(145deg, ${project.accent}55, ${project.accent}15)`,
                      }}
                    >
                      {project.monogram}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[12px] font-medium text-zinc-200">{project.name}</span>
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${isRunning ? "bg-emerald-400 shadow-[0_0_7px_#34d399]" : "bg-zinc-700"}`}
                        />
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-zinc-600">
                        {project.category} · {project.stack.join(" · ")} · {project.branch}
                      </span>
                    </span>
                  </button>

                  <div className={`flex items-center gap-1 ${isSelected ? "opacity-100" : "opacity-40 group-hover:opacity-100"}`}>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(project.id)}
                      aria-label={`${favoriteIds.has(project.id) ? "Unfavorite" : "Favorite"} ${project.name}`}
                      title={favoriteIds.has(project.id) ? "Remove favorite" : "Add favorite"}
                      className={`grid size-7 place-items-center rounded-md transition hover:bg-white/[0.08] ${favoriteIds.has(project.id) ? "text-amber-300" : "text-zinc-600 hover:text-zinc-300"}`}
                    >
                      <Star className="size-3.5" fill={favoriteIds.has(project.id) ? "currentColor" : "none"} />
                    </button>
                    {runtime?.docker.composeAvailable && project.id !== "devlaunch" && (
                      <button
                        type="button"
                        onClick={() => {
                          onProjectUsed(project.id);
                          onAction(project.id, isRunning ? "stop" : "start");
                        }}
                        disabled={!agentOnline || busy}
                        aria-label={`${isRunning ? "Stop" : "Start"} ${project.name}`}
                        title={isRunning ? "Stop" : "Start"}
                        className={`grid size-7 place-items-center rounded-md transition hover:bg-white/[0.08] disabled:opacity-30 ${isRunning ? "text-emerald-400" : "text-violet-300"}`}
                      >
                        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openCode(project)}
                      aria-label={`Open ${project.name} in VS Code`}
                      title="Open in VS Code"
                      className="grid size-7 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-200"
                    >
                      <Code2 className="size-3.5" />
                    </button>
                    {project.links.local && (
                      <a
                        href={project.links.local}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => onProjectUsed(project.id)}
                        aria-label={`Open ${project.name} locally`}
                        title="Open local URL"
                        className="grid size-7 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-200"
                      >
                        <Globe2 className="size-3.5" />
                      </a>
                    )}
                    {project.links.github && (
                      <a
                        href={project.links.github}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => onProjectUsed(project.id)}
                        aria-label={`Open ${project.name} on GitHub`}
                        title="Open GitHub"
                        className="grid size-7 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-200"
                      >
                        <GitFork className="size-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="grid min-h-36 place-items-center text-center">
              <div>
                <Search className="mx-auto size-5 text-zinc-500" />
                <p className="mt-3 text-[12px] text-zinc-400">No matching projects</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-zinc-600">
          <span><kbd className="font-mono text-zinc-500">↑↓</kbd> Navigate</span>
          <span><kbd className="font-mono text-zinc-500">↵</kbd> Open Code</span>
          <span><kbd className="font-mono text-zinc-500">esc</kbd> Close</span>
          <span className="ml-auto">{results.length} results</span>
        </div>
      </div>
    </div>
  );
}
