"use client";

import { useEffect, useState } from "react";
import {
  Check,
  FolderOpen,
  GitFork,
  LoaderCircle,
  Pencil,
  Plus,
  Tags,
  WandSparkles,
  X,
} from "lucide-react";
import type { Project } from "@/config/projects";
import type {
  AddProjectRequest,
  AddProjectResponse,
  ProjectInspection,
  RegisteredProject,
} from "@/types/agent";

type ProjectFormDialogProps = {
  project?: Project;
  onClose: () => void;
  onSaved: (project: RegisteredProject) => void;
};

type LinkField = "github" | "local" | "live";
type RepositoryChoice = ProjectInspection["repositories"][number];

const linkFields: Array<{ id: LinkField; label: string; placeholder: string }> = [
  { id: "github", label: "Primary GitHub override", placeholder: "https://github.com/…" },
  { id: "local", label: "Local URL", placeholder: "http://project.localhost" },
  { id: "live", label: "Live URL", placeholder: "https://example.com" },
];

function nameFromPath(localPath: string) {
  const segments = localPath.replace(/\/$/, "").split("/");
  const folder = segments.at(-1) ?? "";
  return folder
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function ProjectFormDialog({ project, onClose, onSaved }: ProjectFormDialogProps) {
  const editing = Boolean(project);
  const [localPath, setLocalPath] = useState(project?.localPath ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [category, setCategory] = useState<"work" | "personal">(
    project?.category ?? "work",
  );
  const [stackText, setStackText] = useState(project?.stack.join(", ") ?? "");
  const [repositoryMode, setRepositoryMode] = useState<"auto" | "custom">(
    project?.repositoryPaths ? "custom" : "auto",
  );
  const [repositoryPaths, setRepositoryPaths] = useState<string[]>(
    project?.repositoryPaths ?? [],
  );
  const [detectedRepositories, setDetectedRepositories] = useState<RepositoryChoice[]>(
    (project?.repositoryPaths ?? []).map((relativePath) => ({ relativePath, github: null })),
  );
  const [links, setLinks] = useState<Record<LinkField, string>>({
    github: project?.links.github ?? "",
    local: project?.links.local ?? "",
    live: project?.links.live ?? "",
  });
  const [browsing, setBrowsing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const canSubmit =
    Boolean(localPath.trim() && name.trim()) &&
    (repositoryMode === "auto" || repositoryPaths.length > 0) &&
    !submitting;

  const updateProjectFolder = (value: string) => {
    setLocalPath(value);
    setDetectedRepositories([]);
    setRepositoryPaths([]);
    setRepositoryMode("auto");
  };

  const browse = async () => {
    setBrowsing(true);
    setError(null);
    try {
      const response = await fetch("/api/projects/select-folder", { method: "POST" });
      const result = (await response.json()) as { localPath?: string; error?: string };
      if (!response.ok || !result.localPath) {
        throw new Error(result.error ?? "Could not select a folder");
      }
      updateProjectFolder(result.localPath);
      setName((current) => current || nameFromPath(result.localPath!));
    } catch (browseError) {
      setError(browseError instanceof Error ? browseError.message : "Could not select a folder");
    } finally {
      setBrowsing(false);
    }
  };

  const inspectFolder = async (applyDetails: boolean) => {
    if (!localPath.trim()) {
      setError("Enter or browse to a project folder first");
      return;
    }
    setDetecting(true);
    setError(null);
    try {
      const response = await fetch("/api/projects/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localPath }),
      });
      const result = (await response.json()) as ProjectInspection | { error?: string };
      if (!response.ok || !("localPath" in result)) {
        throw new Error("error" in result && result.error ? result.error : "Detection failed");
      }
      setLocalPath(result.localPath);
      setDetectedRepositories(result.repositories);
      setRepositoryPaths((current) =>
        current.length > 0 ? current : result.repositories.map((repository) => repository.relativePath),
      );
      if (applyDetails) {
        setName((current) => current || result.suggestedName);
        setStackText(result.stack.join(", "));
      }
      if (applyDetails && result.github) {
        setLinks((current) => ({ ...current, github: current.github || result.github! }));
      }
    } catch (detectError) {
      setError(detectError instanceof Error ? detectError.message : "Detection failed");
    } finally {
      setDetecting(false);
    }
  };

  const chooseRepositoryMode = (mode: "auto" | "custom") => {
    setRepositoryMode(mode);
    if (mode === "custom" && detectedRepositories.length === 0) {
      void inspectFolder(false);
    }
  };

  const toggleRepository = (relativePath: string) => {
    setRepositoryPaths((current) =>
      current.includes(relativePath)
        ? current.filter((repositoryPath) => repositoryPath !== relativePath)
        : [...current, relativePath],
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const body: AddProjectRequest = {
      localPath: localPath.trim(),
      name: name.trim(),
      description: description.trim() || undefined,
      category,
      stack: stackText.split(",").map((item) => item.trim()).filter(Boolean),
      repositoryPaths: repositoryMode === "custom" ? repositoryPaths : undefined,
      github: links.github.trim() || undefined,
      local: links.local.trim() || undefined,
      live: links.live.trim() || undefined,
    };

    try {
      const response = await fetch(
        editing ? `/api/projects/${encodeURIComponent(project!.id)}` : "/api/projects",
        {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        },
      );
      const result = (await response.json()) as AddProjectResponse | { error?: string };
      if (!response.ok || !("project" in result)) {
        throw new Error("error" in result && result.error ? result.error : "Could not add project");
      }
      onSaved(result.project);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not add project");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center px-4 py-6">
      <button
        type="button"
        aria-label="Close add project dialog"
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={() => !submitting && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-project-title"
        className="relative flex max-h-[calc(100vh-3rem)] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#101115] shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
      >
        <div className="shrink-0 border-b border-white/[0.065] px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
              {editing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            </span>
            <div>
              <h2 id="add-project-title" className="text-[15px] font-semibold text-zinc-100">
                {editing ? `Edit ${project!.name}` : "Add a project"}
              </h2>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                {editing
                  ? "Update the folder, metadata, stack, and environment links saved in DevLaunch."
                  : "Add any folder on this Mac and decide exactly what appears in DevLaunch."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="Close"
              className="ml-auto rounded-lg p-2 text-zinc-600 transition hover:bg-white/5 hover:text-zinc-300 disabled:opacity-40"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <form onSubmit={submit} className="min-h-0 overflow-y-auto p-5 sm:p-6">
          <div>
            <label htmlFor="project-path" className="mb-2 block text-[12px] font-medium uppercase tracking-[0.12em] text-zinc-600">
              Project folder
            </label>
            <div className="flex gap-2">
              <input
                id="project-path"
                value={localPath}
                onChange={(event) => updateProjectFolder(event.target.value)}
                placeholder="/Users/you/code/my-project"
                autoFocus
                className="h-11 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-[#0b0c0f] px-3 font-mono text-[11px] text-zinc-200 outline-none transition placeholder:text-zinc-500 focus:border-violet-400/40 focus:ring-2 focus:ring-violet-500/10"
              />
              <button
                type="button"
                onClick={() => void browse()}
                disabled={browsing || submitting}
                className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 text-[11px] font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40"
              >
                {browsing ? <LoaderCircle className="size-3.5 animate-spin" /> : <FolderOpen className="size-3.5" />}
                Browse
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[11px] leading-4 text-zinc-500">The folder can be anywhere. Nothing is scanned automatically.</p>
              <button
                type="button"
                onClick={() => void inspectFolder(true)}
                disabled={detecting || submitting || !localPath.trim()}
                className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-violet-300 transition hover:text-violet-200 disabled:text-zinc-500"
              >
                {detecting ? <LoaderCircle className="size-3 animate-spin" /> : <WandSparkles className="size-3" />}
                Detect details
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-start gap-3">
              <GitFork className="mt-0.5 size-4 shrink-0 text-violet-300" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-zinc-200">Git repository folders</p>
                <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                  Keep the project folder above as the root. Choose which Git repositories inside it DevLaunch should track.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["auto", "custom"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => chooseRepositoryMode(mode)}
                  disabled={detecting || submitting}
                  className={`flex min-h-10 items-center justify-between rounded-lg border px-3 text-left text-[11px] transition ${repositoryMode === mode ? "border-violet-400/25 bg-violet-500/[0.08] text-violet-200" : "border-white/[0.07] bg-black/15 text-zinc-500 hover:text-zinc-300"}`}
                >
                  <span>
                    {mode === "auto" ? "Auto-detect" : "Choose folders"}
                    {mode === "auto" && <span className="ml-1 text-zinc-500">(recommended)</span>}
                  </span>
                  {repositoryMode === mode && <Check className="size-3.5" />}
                </button>
              ))}
            </div>

            {repositoryMode === "auto" ? (
              <p className="mt-3 text-[11px] leading-4 text-zinc-500">
                DevLaunch will track Root and nested repositories such as frontend and backend automatically.
              </p>
            ) : (
              <div className="mt-3">
                {detecting ? (
                  <p className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <LoaderCircle className="size-3.5 animate-spin" /> Detecting Git folders…
                  </p>
                ) : detectedRepositories.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {detectedRepositories.map((repository) => {
                      const selected = repositoryPaths.includes(repository.relativePath);
                      return (
                        <button
                          key={repository.relativePath}
                          type="button"
                          onClick={() => toggleRepository(repository.relativePath)}
                          className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition ${selected ? "border-emerald-400/20 bg-emerald-400/[0.06]" : "border-white/[0.06] bg-black/15 opacity-60"}`}
                        >
                          <span className={`grid size-4 shrink-0 place-items-center rounded border ${selected ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-300" : "border-white/10 text-transparent"}`}>
                            <Check className="size-3" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-[11px] text-zinc-300">
                              {repository.relativePath === "." ? "Root folder" : repository.relativePath}
                            </span>
                            {repository.github && (
                              <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                                {repository.github.replace("https://github.com/", "")}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void inspectFolder(false)}
                    className="text-[11px] font-medium text-violet-300 hover:text-violet-200"
                  >
                    Detect repository folders
                  </button>
                )}
                {repositoryPaths.length === 0 && (
                  <p className="mt-2 text-[11px] text-amber-300/80">Choose at least one repository folder.</p>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="project-name" className="mb-2 block text-[12px] font-medium uppercase tracking-[0.12em] text-zinc-600">
                Display name
              </label>
              <input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My Project"
                className="h-11 w-full rounded-lg border border-white/[0.08] bg-[#0b0c0f] px-3 text-[12px] text-zinc-200 outline-none transition placeholder:text-zinc-500 focus:border-violet-400/40 focus:ring-2 focus:ring-violet-500/10"
              />
            </div>
            <div>
              <span className="mb-2 block text-[12px] font-medium uppercase tracking-[0.12em] text-zinc-600">Section</span>
              <div className="grid grid-cols-2 gap-2">
                {(["work", "personal"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={`flex h-11 items-center justify-between rounded-lg border px-3 text-[11px] capitalize transition ${category === item ? "border-violet-400/25 bg-violet-500/[0.08] text-violet-200" : "border-white/[0.07] bg-white/[0.02] text-zinc-600 hover:text-zinc-400"}`}
                  >
                    {item}
                    {category === item && <Check className="size-3.5" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="project-description" className="mb-2 block text-[12px] font-medium uppercase tracking-[0.12em] text-zinc-600">
              Description <span className="normal-case tracking-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this project is for"
              maxLength={300}
              className="h-11 w-full rounded-lg border border-white/[0.08] bg-[#0b0c0f] px-3 text-[12px] text-zinc-200 outline-none transition placeholder:text-zinc-500 focus:border-violet-400/40 focus:ring-2 focus:ring-violet-500/10"
            />
          </div>

          <div className="mt-4">
            <label htmlFor="project-stack" className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.12em] text-zinc-600">
              <Tags className="size-3" /> Stack badges
              <span className="normal-case tracking-normal text-zinc-500">(comma separated)</span>
            </label>
            <input
              id="project-stack"
              value={stackText}
              onChange={(event) => setStackText(event.target.value)}
              placeholder="Next.js, TypeScript, Docker"
              className="h-11 w-full rounded-lg border border-white/[0.08] bg-[#0b0c0f] px-3 text-[12px] text-zinc-200 outline-none transition placeholder:text-zinc-500 focus:border-violet-400/40 focus:ring-2 focus:ring-violet-500/10"
            />
          </div>

          <div className="mt-5 border-t border-white/[0.06] pt-5">
            <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.12em] text-zinc-600">
              Project links <span className="normal-case tracking-normal text-zinc-500">(optional)</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {linkFields.map((field) => (
                <div key={field.id}>
                  <label htmlFor={`project-${field.id}`} className="mb-1.5 block text-[12px] text-zinc-600">
                    {field.label}
                  </label>
                  <input
                    id={`project-${field.id}`}
                    value={links[field.id]}
                    onChange={(event) =>
                      setLinks((current) => ({ ...current, [field.id]: event.target.value }))
                    }
                    placeholder={field.placeholder}
                    inputMode="url"
                    className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0b0c0f] px-2.5 text-[12px] text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/40"
                  />
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div role="alert" className="mt-4 rounded-lg border border-red-400/15 bg-red-500/[0.07] px-3 py-2.5 text-[12px] leading-4 text-red-300">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-9 rounded-lg px-3 text-[11px] font-medium text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex h-9 items-center gap-2 rounded-lg bg-zinc-100 px-3.5 text-[11px] font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : editing ? (
                <Pencil className="size-3.5" />
              ) : (
                <Plus className="size-3.5" />
              )}
              {editing ? "Save changes" : "Add project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
