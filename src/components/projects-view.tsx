"use client";

import Link from "next/link";
import { useNavigate } from "./navigate";
import { Code2, ExternalLink, FileCode2, FlaskConical, FolderKanban, Globe2, Plus, Power, Rocket, Search } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { useMemo, useState } from "react";
import { openProject, runCompose } from "@/actions";
import type { ActiveDeploy, Project, ProjectRuntime, Section } from "@/lib/types";
import { PageHeader } from "./app-shell";
import { ProjectDialog } from "./project-dialog";
import { useStatus } from "./status-provider";
import { Button, Dot, Empty, IconButton, Input, Monogram, Segmented, cx } from "./ui";

type Filter = "all" | Section;
type Sort = "name" | "running";

export function ProjectsView() {
  const { status, refresh, notify } = useStatus();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("running");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return status.projects
      .filter((project) => filter === "all" || project.section === filter)
      .filter(
        (project) =>
          !needle ||
          project.name.toLowerCase().includes(needle) ||
          project.stack.some((item) => item.toLowerCase().includes(needle)) ||
          project.path.toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        if (sort === "running") {
          const diff = Number(status.runtimes[b.id]?.running ?? false) - Number(status.runtimes[a.id]?.running ?? false);
          if (diff !== 0) return diff;
        }
        return a.name.localeCompare(b.name);
      });
  }, [status, query, filter, sort]);

  const toggleCompose = async (project: Project, runtime: ProjectRuntime | undefined) => {
    setBusyId(project.id);
    const result = await runCompose(project.id, runtime?.running ? "stop" : "start");
    notify(result.ok ? "success" : "error", result.ok ? `${runtime?.running ? "Stopped" : "Started"} ${project.name} · ${result.data}` : result.error);
    await refresh();
    setBusyId(null);
  };

  const open = async (project: Project) => {
    const result = await openProject(project.id);
    if (!result.ok) notify("error", result.error);
  };

  const sections: Array<{ id: Section; label: string }> = [
    { id: "work", label: "Work" },
    { id: "personal", label: "Personal" },
  ];

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${status.projects.length} registered · ${Object.values(status.runtimes).filter((runtime) => runtime.running).length} running`}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            Add project
          </Button>
        }
      />

      {status.projects.length === 0 ? (
        <Empty
          icon={<FolderKanban className="size-4" />}
          title="No projects yet"
          hint="Register any folder on this Mac to see its Docker status here."
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add your first project
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, stack, or path" className="pl-9" />
            </div>
            <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "work", label: "Work" }, { value: "personal", label: "Personal" }]} />
            <Segmented value={sort} onChange={setSort} options={[{ value: "running", label: "Running first" }, { value: "name", label: "A–Z" }]} />
          </div>

          {visible.length === 0 ? (
            <Empty icon={<Search className="size-4" />} title="No matches" hint="Try another name, stack, or path." />
          ) : (
            <div className="space-y-8">
              {sections
                .filter((section) => filter === "all" || filter === section.id)
                .map((section) => {
                  const projects = visible.filter((project) => project.section === section.id);
                  if (projects.length === 0) return null;
                  return (
                    <section key={section.id}>
                      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
                        {section.label} <span className="ml-1 font-normal text-ink-faint">{projects.length}</span>
                      </h2>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {projects.map((project) => (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            runtime={status.runtimes[project.id]}
                            deploy={status.activeDeploys[project.id]}
                            busy={busyId === project.id}
                            dockerAvailable={status.dockerAvailable}
                            onToggle={() => void toggleCompose(project, status.runtimes[project.id])}
                            onOpen={() => void open(project)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
            </div>
          )}
        </>
      )}

      {adding && <ProjectDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function ProjectCard({
  project,
  runtime,
  deploy,
  busy,
  dockerAvailable,
  onToggle,
  onOpen,
}: {
  project: Project;
  runtime: ProjectRuntime | undefined;
  deploy: ActiveDeploy | undefined;
  busy: boolean;
  dockerAvailable: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const navigate = useNavigate();
  const state = !runtime?.exists
    ? { label: "Folder missing", tone: "danger" as const }
    : runtime.running
      ? { label: "Running", tone: "success" as const }
      : project.composeFile || project.commands.start
        ? { label: "Stopped", tone: "muted" as const }
        : { label: "No commands", tone: "muted" as const };
  const localUrl = project.localUrl ?? (runtime?.ports[0] ? `http://localhost:${runtime.ports[0]}` : null);

  return (
    <article
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a")) return;
        navigate(`/projects/${project.id}`);
      }}
      className="group flex cursor-pointer flex-col rounded-card border border-line bg-panel p-4 transition hover:border-line-strong hover:bg-panel-2"
    >
      <div className="flex items-start gap-3">
        <Monogram name={project.name} />
        <div className="min-w-0 flex-1">
          <Link href={`/projects/${project.id}`} className="block truncate text-[14px] font-semibold hover:text-accent">
            {project.name}
          </Link>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-dim">
            <Dot tone={state.tone} /> {state.label}
            {runtime?.running && runtime.containers.length > 0 && (
              <span className="text-ink-faint">· {runtime.containers.filter((container) => container.state === "running").length} containers</span>
            )}
          </p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-[12px] leading-5 text-ink-dim">{project.description || <span className="text-ink-faint">No description</span>}</p>

      {project.stack.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {project.stack.map((item) => (
            <span key={item} className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-ink-dim">
              {item}
            </span>
          ))}
        </div>
      )}

      {deploy && <DeployStrip deploy={deploy} />}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-faint">
          <FileCode2 className="size-3 shrink-0" />
          <span className="truncate font-mono">{project.composeFile ?? (project.commands.start ? "custom commands" : "not configured")}</span>
        </span>
        <div className="flex items-center gap-0.5">
          {(project.composeFile || project.commands.start) && (
            <IconButton
              label={runtime?.running ? "Stop" : "Start"}
              onClick={onToggle}
              disabled={busy || (!project.commands.start && !dockerAvailable)}
              className={cx(runtime?.running ? "text-success hover:text-danger" : "text-accent")}
            >
              <Power className={cx("size-4", busy && "animate-pulse")} />
            </IconButton>
          )}
          <IconButton label="Open in VS Code" onClick={onOpen}>
            <Code2 className="size-4" />
          </IconButton>
          {localUrl && (
            <a href={localUrl} target="_blank" rel="noreferrer" aria-label="Open local site" title={localUrl} className="grid size-8 place-items-center rounded-lg text-ink-dim transition hover:bg-white/[0.06] hover:text-ink">
              <Globe2 className="size-4" />
            </a>
          )}
          {project.testingUrl && (
            <a href={project.testingUrl} target="_blank" rel="noreferrer" aria-label="Open testing site" title={project.testingUrl} className="grid size-8 place-items-center rounded-lg text-ink-dim transition hover:bg-white/[0.06] hover:text-ink">
              <FlaskConical className="size-4" />
            </a>
          )}
          {project.liveUrl && (
            <a href={project.liveUrl} target="_blank" rel="noreferrer" aria-label="Open live site" title={project.liveUrl} className="grid size-8 place-items-center rounded-lg text-ink-dim transition hover:bg-white/[0.06] hover:text-ink">
              <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

const phaseLabel = { building: "Building image", uploading: "Uploading image", commands: "Running server commands" } as const;

function DeployStrip({ deploy }: { deploy: ActiveDeploy }) {
  const upload = deploy.phase === "uploading" ? deploy.upload : null;
  return (
    <div className="mt-3 rounded-lg border border-accent/25 bg-accent/[0.07] px-3 py-2 text-[11px]">
      <div className="flex items-center gap-1.5">
        <Rocket className="size-3 animate-pulse text-accent" />
        <span className="font-medium text-accent">Deploying</span>
        <span className="truncate text-ink-dim">· {deploy.deploymentName}</span>
        <span className="ml-auto shrink-0 text-ink-dim">{deploy.phase ? phaseLabel[deploy.phase] : "Starting"}{upload ? ` ${upload.percent}%` : "…"}</span>
      </div>
      {upload && (
        <>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${upload.percent}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-ink-faint">
            <span>
              {formatBytes(upload.readBytes)} of {formatBytes(upload.imageBytes)}
            </span>
            <span className="font-mono">{formatBytes(upload.bytesPerSecond)}/s</span>
          </div>
        </>
      )}
    </div>
  );
}
