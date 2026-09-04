"use client";

import Link from "next/link";
import { ArrowLeft, Boxes, Code2, ExternalLink, FlaskConical, FolderOpen, Globe2, Hammer, LayoutTemplate, Link2, Pencil, Power, RefreshCw, RotateCw, TerminalSquare, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { checkLiveSite, openProject, openProjectTerminal, removeProject, runCompose } from "@/actions";
import type { ComposeAction, LocalRun } from "@/lib/types";
import { Deployments } from "./deployments";
import { LogsPanel } from "./logs-panel";
import { NotesCard } from "./notes-card";
import { useNavigate } from "./navigate";
import { ProjectDialog } from "./project-dialog";
import { ReposCard } from "./repos-card";
import { LiveStatus } from "./projects-view";
import { actionDone, actionRunning as runningLabel } from "@/lib/labels";
import { SaveTemplateDialog } from "./templates-card";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Confirm, Dot, Empty, IconButton, Monogram, cx } from "./ui";

const confirmCopy: Record<Exclude<ComposeAction, "start">, { title: string; body: string; label: string }> = {
  stop: { title: "Stop containers?", body: "docker compose stop will stop every service of this project.", label: "Stop" },
  restart: { title: "Restart containers?", body: "docker compose restart will briefly interrupt every service.", label: "Restart" },
  rebuild: { title: "Rebuild and restart?", body: "docker compose up -d --build rebuilds images and recreates services. This can take a while.", label: "Rebuild" },
};

export function ProjectView({ id }: { id: string }) {
  const { status, refresh, notify } = useStatus();
  const navigate = useNavigate();
  const project = status.projects.find((item) => item.id === id);
  const runtime = status.runtimes[id];
  const [editing, setEditing] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [confirming, setConfirming] = useState<Exclude<ComposeAction, "start"> | "remove" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionRun, setActionRun] = useState<LocalRun | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);
  const notifiedRef = useRef<string | null>(null);

  // Follow a running start/stop/restart/rebuild until it finishes.
  useEffect(() => {
    if (!actionRun || actionRun.status !== "running") return;
    const interval = setInterval(async () => {
      const response = await fetch(`/api/local-runs/${actionRun.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const { run } = (await response.json()) as { run: LocalRun };
      setActionRun(run);
    }, 1000);
    return () => clearInterval(interval);
  }, [actionRun]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [actionRun?.log]);

  useEffect(() => {
    if (!actionRun || actionRun.status === "running" || notifiedRef.current === actionRun.id) return;
    notifiedRef.current = actionRun.id;
    const verb = actionDone[actionRun.action];
    notify(actionRun.status === "success" ? "success" : "error", actionRun.status === "success" ? `${verb} ${project?.name ?? "project"}` : `${actionRun.action} failed — see the output below`);
    void refresh();
  }, [actionRun, notify, refresh, project?.name]);

  if (!project) {
    return (
      <Empty
        title="Project not found"
        hint="It may have been removed."
        action={
          <Link href="/projects" className="text-[12px] font-medium text-accent hover:underline">
            Back to projects
          </Link>
        }
      />
    );
  }

  const actionRunning = actionRun?.status === "running";

  const compose = async (action: ComposeAction) => {
    setConfirming(null);
    setBusy(action);
    const result = await runCompose(project.id, action);
    setBusy(null);
    if (!result.ok) return notify("error", result.error);
    setActionRun(result.data);
    void refresh();
  };

  const remove = async () => {
    setBusy("remove");
    const result = await removeProject(project.id);
    if (!result.ok) {
      notify("error", result.error);
      setBusy(null);
      return;
    }
    notify("success", `${project.name} removed from DevLaunch`);
    await refresh();
    navigate("/projects");
  };

  const open = async () => {
    const result = await openProject(project.id);
    if (!result.ok) notify("error", result.error);
  };

  const openTerminal = async () => {
    const result = await openProjectTerminal(project.id);
    if (!result.ok) notify("error", result.error);
  };

  const localUrl = project.localUrl ?? (runtime?.ports[0] ? `http://localhost:${runtime.ports[0]}` : null);
  const can = (action: ComposeAction) => !actionRunning && Boolean(project.commands[action] || (project.composeFile && status.dockerAvailable));
  const configured = Boolean(project.composeFile || project.commands.start);

  return (
    <div className="fade-up">
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-dim transition hover:text-ink">
        <ArrowLeft className="size-3.5" /> Projects
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <Monogram name={project.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[20px] font-semibold tracking-tight">{project.name}</h1>
            <Dot tone={!runtime?.exists ? "danger" : runtime.running ? "success" : "muted"} />
          </div>
          <p className="mt-0.5 truncate font-mono text-[12px] text-ink-faint">{project.path}</p>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Edit project" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label="Save as template" onClick={() => setSavingTemplate(true)}>
            <LayoutTemplate className="size-4" />
          </IconButton>
          <IconButton label="Remove from DevLaunch" onClick={() => setConfirming("remove")} className="hover:text-danger">
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button icon={<Code2 className="size-4" />} onClick={open}>
          Code
        </Button>
        <Button icon={<TerminalSquare className="size-4" />} onClick={openTerminal}>
          Terminal
        </Button>
        {runtime?.running ? (
          <Button icon={<Power className="size-4 text-danger" />} onClick={() => setConfirming("stop")} disabled={!can("stop")} busy={busy === "stop"}>
            Stop
          </Button>
        ) : (
          <Button icon={<Power className="size-4 text-success" />} onClick={() => void compose("start")} disabled={!can("start")} busy={busy === "start"}>
            Start
          </Button>
        )}
        <Button icon={<RotateCw className="size-4" />} onClick={() => setConfirming("restart")} disabled={!can("restart")} busy={busy === "restart"}>
          Restart
        </Button>
        <Button icon={<Hammer className="size-4" />} onClick={() => setConfirming("rebuild")} disabled={!can("rebuild")} busy={busy === "rebuild"}>
          Rebuild
        </Button>
        {!configured && (
          <button type="button" onClick={() => setEditing(true)} className="self-center text-[12px] text-ink-faint hover:text-accent hover:underline">
            No commands configured — set a compose file or commands
          </button>
        )}
      </div>

      {actionRun && (
        <div className={cx("mt-3 rounded-lg border p-3", actionRun.status === "running" ? "border-warn/25 bg-warn/[0.05]" : actionRun.status === "success" ? "border-success/20 bg-success/[0.04]" : "border-danger/20 bg-danger/[0.05]")}>
          <div className="flex items-center gap-2 text-[12px]">
            <Dot tone={actionRun.status === "running" ? "warn" : actionRun.status === "success" ? "success" : "danger"} pulse={actionRun.status === "running"} />
            <span className="font-medium">
              {actionRun.status === "running"
                ? runningLabel[actionRun.action] + "…"
                : actionRun.status === "success"
                  ? actionDone[actionRun.action]
                  : `${actionRun.action} failed`}
            </span>
            <span className="truncate font-mono text-[11px] text-ink-dim">{actionRun.command}</span>
            {actionRun.status !== "running" && (
              <button type="button" onClick={() => setActionRun(null)} className="ml-auto text-[11px] text-ink-dim hover:text-ink">
                Dismiss
              </button>
            )}
          </div>
          <pre ref={logRef} className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-black/40 p-3 font-mono text-[11px] leading-4 text-ink-dim">
            {actionRun.log}
          </pre>
        </div>
      )}

      {confirming && confirming !== "remove" && (
        <div className="mt-3 max-w-md">
          <Confirm title={confirmCopy[confirming].title} body={confirmCopy[confirming].body} confirmLabel={confirmCopy[confirming].label} tone={confirming === "stop" ? "danger" : "primary"} onCancel={() => setConfirming(null)} onConfirm={() => void compose(confirming)} />
        </div>
      )}
      {confirming === "remove" && (
        <div className="mt-3 max-w-md">
          <Confirm
            title={`Remove ${project.name}?`}
            body={
              <>
                Only the DevLaunch entry and its deployments are removed. The folder <span className="font-mono text-ink">{project.path}</span> is not touched.
              </>
            }
            confirmLabel="Remove"
            busy={busy === "remove"}
            onCancel={() => setConfirming(null)}
            onConfirm={() => void remove()}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-4">
          <ReposCard project={project} repos={status.repos[project.id] ?? []} />
          <Deployments projectId={project.id} />

          <Card>
            <CardTitle icon={<Boxes className="size-4" />} aside={<span className="text-[11px] text-ink-faint">{runtime?.containers.length ?? 0}</span>}>
              Containers
            </CardTitle>
            {runtime?.containers.length ? (
              <div className="divide-y divide-line">
                {runtime.containers.map((container) => (
                  <div key={container.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Dot tone={container.state === "running" ? "success" : "muted"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[12px]">{container.name}</p>
                      <p className="truncate text-[11px] text-ink-faint">{container.status}</p>
                    </div>
                    {container.ports && <span className="max-w-[200px] truncate font-mono text-[11px] text-ink-dim">{container.ports}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-ink-faint">{configured ? "No containers yet. Start the project to create them." : "Containers created by docker compose from this folder appear here."}</p>
            )}
          </Card>

          <LogsPanel projectId={project.id} enabled={Boolean(project.composeFile)} />
        </div>

        <div className="space-y-4">
          <NotesCard project={project} />

          <Card>
            <CardTitle icon={<Link2 className="size-4" />}>Links</CardTitle>
            <div className="space-y-1.5">
              {localUrl && <LinkRow href={localUrl} icon={<Globe2 className="size-3.5" />} label="Local" />}
              {project.testingUrl && <LinkRow href={project.testingUrl} icon={<FlaskConical className="size-3.5" />} label="Testing" />}
              {project.liveUrl && <LinkRow href={project.liveUrl} icon={<ExternalLink className="size-3.5" />} label="Live" />}
              {project.liveUrl && (
                <div className="flex items-center gap-2 px-1 text-[11px]">
                  {status.uptime[project.id] ? <LiveStatus uptime={status.uptime[project.id]!} long /> : <span className="text-ink-faint">· Live site not checked yet</span>}
                  <IconButton
                    label="Check the live site now"
                    className="ml-auto size-6"
                    disabled={busy === "uptime"}
                    onClick={async () => {
                      setBusy("uptime");
                      const result = await checkLiveSite(project.id);
                      setBusy(null);
                      if (!result.ok) return notify("error", result.error);
                      notify(result.data.up ? "success" : "error", result.data.up ? `${project.name} live site is up (${result.data.latencyMs} ms)` : `${project.name} live site is down: ${result.data.error}`);
                      void refresh();
                    }}
                  >
                    <RefreshCw className={cx("size-3", busy === "uptime" && "animate-spin")} />
                  </IconButton>
                </div>
              )}
              {!localUrl && !project.testingUrl && !project.liveUrl && <p className="text-[12px] text-ink-faint">No URLs yet — add them by editing the project.</p>}
            </div>
          </Card>


          <Card>
            <CardTitle icon={<FolderOpen className="size-4" />}>Folder</CardTitle>
            <dl className="space-y-2 text-[12px]">
              <Row label="Section">
                <span className="capitalize">{project.section}</span>
              </Row>
              <Row label="Compose file">
                <span className="font-mono">{project.composeFile ?? "—"}</span>
              </Row>
              {(Object.keys(project.commands) as ComposeAction[]).filter((action) => project.commands[action]).map((action) => (
                <Row key={action} label={`${action[0]!.toUpperCase()}${action.slice(1)}`}>
                  <span className="font-mono text-[11px]" title={project.commands[action]!}>{project.commands[action]}</span>
                </Row>
              ))}
              <Row label="Added">
                <span>{new Date(project.createdAt).toLocaleDateString()}</span>
              </Row>
            </dl>
          </Card>
        </div>
      </div>

      {savingTemplate && <SaveTemplateDialog projectId={project.id} projectName={project.name} onClose={() => setSavingTemplate(false)} />}
      {editing && <ProjectDialog project={project} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-dim">{label}</dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}

function LinkRow({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-[12px] transition hover:border-line-strong">
      <span className="text-accent">{icon}</span>
      <span className="text-ink-dim">{label}</span>
      <span className="ml-auto truncate font-mono text-ink">{href.replace(/^https?:\/\//, "")}</span>
    </a>
  );
}
