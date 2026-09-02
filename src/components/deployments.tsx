"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, Pencil, Plus, Rocket, Server, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { deploy, getDeployments, getServers, removeDeployment, saveDeployment, stopDeploy } from "@/actions";
import type { DeployMode, DeployRun, DeployRunSummary, Deployment, Server as DeployServer } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Confirm, Dialog, Dot, ErrorNote, Field, IconButton, Input, Select, Spinner, Textarea, cx } from "./ui";
import { formatBytes } from "@/lib/format";

function runTone(run: DeployRunSummary | null) {
  if (!run) return { tone: "muted" as const, label: "Never deployed" };
  return {
    running: { tone: "warn" as const, label: "Deploying…" },
    success: { tone: "success" as const, label: "Deployed" },
    error: { tone: "danger" as const, label: "Failed" },
    cancelled: { tone: "muted" as const, label: "Cancelled" },
  }[run.status];
}

export function Deployments({ projectId }: { projectId: string }) {
  const { notify } = useStatus();
  const [deployments, setDeployments] = useState<Deployment[] | null>(null);
  const [editing, setEditing] = useState<Deployment | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [watched, setWatched] = useState<DeployRun | null>(null);
  const [logOpen, setLogOpen] = useState(true);
  const logRef = useRef<HTMLPreElement | null>(null);

  const load = useCallback(async () => setDeployments(await getDeployments(projectId)), [projectId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!watched || watched.status !== "running") return;
    const interval = setInterval(async () => {
      const response = await fetch(`/api/deploy-runs/${watched.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const { run } = (await response.json()) as { run: DeployRun };
      setWatched(run);
      if (run.status !== "running") void load();
    }, 2000);
    return () => clearInterval(interval);
  }, [watched, load]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [watched?.log]);

  const start = async (deployment: Deployment) => {
    const result = await deploy(deployment.id);
    if (!result.ok) return notify("error", result.error);
    setWatched(result.data);
    setLogOpen(true);
    void load();
  };

  const stop = async (runId: string) => {
    const result = await stopDeploy(runId);
    if (!result.ok) notify("error", result.error);
    void load();
  };

  const showRun = async (run: DeployRunSummary) => {
    const response = await fetch(`/api/deploy-runs/${run.id}`, { cache: "no-store" });
    if (!response.ok) return;
    setWatched(((await response.json()) as { run: DeployRun }).run);
    setLogOpen(true);
  };

  const remove = async (id: string) => {
    const result = await removeDeployment(id);
    if (!result.ok) return notify("error", result.error);
    setConfirmDelete(null);
    notify("success", `${result.data.name} removed`);
    void load();
  };

  return (
    <Card>
      <CardTitle
        icon={<Rocket className="size-4" />}
        aside={
          <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
            Add
          </Button>
        }
      >
        Deployments
      </CardTitle>

      {deployments === null ? (
        <Spinner label="Loading…" />
      ) : deployments.length === 0 ? (
        <p className="text-[12px] text-ink-faint">
          No deployments. Add one to ship this project to a server with one click — servers are managed in{" "}
          <Link href="/settings" className="text-accent hover:underline">
            Settings
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-2">
          {deployments.map((deployment) => {
            const live = watched?.deploymentId === deployment.id ? watched : null;
            const lastRun: DeployRunSummary | null = live ?? deployment.lastRun;
            const state = runTone(lastRun);
            const runningId = lastRun?.status === "running" ? lastRun.id : null;
            return (
              <div key={deployment.id} className="rounded-lg border border-line bg-bg p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Dot tone={state.tone} pulse={state.tone === "warn"} />
                  <span className="text-[13px] font-medium">{deployment.name}</span>
                  <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-dim">{deployment.mode === "image" ? "Image push" : "Commands"}</span>
                  <span className="flex items-center gap-1 text-[11px] text-ink-dim">
                    <Server className="size-3" /> {deployment.serverName}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <IconButton label="Edit deployment" onClick={() => setEditing(deployment)}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton label="Remove deployment" onClick={() => setConfirmDelete(deployment.id)} className="hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </IconButton>
                    {runningId ? (
                      <Button size="sm" variant="danger" icon={<Square className="size-3" fill="currentColor" />} onClick={() => void stop(runningId)}>
                        Stop
                      </Button>
                    ) : (
                      <Button size="sm" variant="primary" icon={<Rocket className="size-3.5" />} onClick={() => void start(deployment)}>
                        Deploy
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-3.5 text-[11px] text-ink-faint">
                  <span className="font-mono">{deployment.remotePath}</span>
                  {deployment.mode === "image" && (
                    <span className="font-mono">
                      {deployment.imageName}:{deployment.imageTag || "latest"}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!lastRun}
                    onClick={() => lastRun && void showRun(lastRun)}
                    className={cx("disabled:cursor-default", lastRun && "hover:underline", state.tone === "success" && "text-success", state.tone === "danger" && "text-danger", state.tone === "warn" && "text-warn")}
                  >
                    {state.label}
                    {lastRun && ` · ${new Date(lastRun.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                  </button>
                </div>

                {live?.upload && (
                  <div className="mt-2 rounded-lg border border-accent/20 bg-accent/[0.05] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
                      <span className="font-medium text-accent">Uploading image · {live.upload.percent}%</span>
                      <span className="text-ink-dim">
                        {formatBytes(live.upload.readBytes)} of {formatBytes(live.upload.imageBytes)}
                        <span className="text-ink-faint"> · {formatBytes(live.upload.sentBytes)} sent compressed</span>
                      </span>
                      <span className="font-mono text-ink">{formatBytes(live.upload.bytesPerSecond)}/s</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${live.upload.percent}%` }} />
                    </div>
                  </div>
                )}

                {live && (
                  <div className="mt-2 border-t border-line pt-2">
                    <button type="button" onClick={() => setLogOpen((open) => !open)} className="flex items-center gap-1 text-[11px] text-ink-dim hover:text-ink">
                      {logOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />} Log
                    </button>
                    {logOpen && (
                      <pre ref={logRef} className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-black/40 p-3 font-mono text-[11px] leading-4 text-ink-dim">
                        {live.log || "Waiting for output…"}
                      </pre>
                    )}
                  </div>
                )}

                {confirmDelete === deployment.id && (
                  <div className="mt-2">
                    <Confirm title="Remove this deployment?" body="Its run history is removed too. The server is not touched." confirmLabel="Remove" onCancel={() => setConfirmDelete(null)} onConfirm={() => void remove(deployment.id)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <DeploymentDialog
          projectId={projectId}
          deployment={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </Card>
  );
}

function DeploymentDialog({ projectId, deployment, onClose, onSaved }: { projectId: string; deployment: Deployment | null; onClose: () => void; onSaved: () => void }) {
  const [servers, setServers] = useState<DeployServer[] | null>(null);
  const [name, setName] = useState(deployment?.name ?? "");
  const [serverId, setServerId] = useState(deployment?.serverId ?? "");
  const [mode, setMode] = useState<DeployMode>(deployment?.mode ?? "image");
  const [imageName, setImageName] = useState(deployment?.imageName ?? "");
  const [imageTag, setImageTag] = useState(deployment?.imageTag ?? "latest");
  const [buildContext, setBuildContext] = useState(deployment?.buildContext ?? "");
  const [dockerfile, setDockerfile] = useState(deployment?.dockerfile ?? "");
  const [remotePath, setRemotePath] = useState(deployment?.remotePath ?? "");
  const [commands, setCommands] = useState(deployment?.commands ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const list = await getServers();
      setServers(list);
      setServerId((current) => current || list[0]?.id || "");
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveDeployment(projectId, deployment?.id ?? null, { serverId, name, mode, imageName, imageTag, buildContext, dockerfile, remotePath, commands });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onSaved();
  };

  const mono = "font-mono text-[12px]";

  return (
    <Dialog title={deployment ? `Edit ${deployment.name}` : "Add a deployment"} description="Nothing runs on the server except the commands you write below." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Production" autoFocus />
          </Field>
          <Field label="Server">
            <Select value={serverId} onChange={(event) => setServerId(event.target.value)}>
              {servers === null && <option value="">Loading…</option>}
              {servers?.length === 0 && <option value="">No servers — add one in Settings</option>}
              {servers?.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} · {server.username}@{server.host}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Mode">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "image", title: "Image push", hint: "Build the image here, ship it over SSH, then run your commands." },
                { value: "commands", title: "Commands only", hint: "Only run your commands on the server (e.g. git pull + compose)." },
              ] as const
            ).map((option) => (
              <button key={option.value} type="button" onClick={() => setMode(option.value)} className={cx("rounded-lg border p-3 text-left transition", mode === option.value ? "border-accent/50 bg-accent/[0.06]" : "border-line bg-bg hover:border-line-strong")}>
                <span className={cx("block text-[13px] font-medium", mode === option.value ? "text-accent" : "text-ink")}>{option.title}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-ink-dim">{option.hint}</span>
              </button>
            ))}
          </div>
        </Field>

        {mode === "image" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Image name">
              <Input value={imageName} onChange={(event) => setImageName(event.target.value)} placeholder={`${projectId}-web`} className={mono} />
            </Field>
            <Field label="Tag">
              <Input value={imageTag} onChange={(event) => setImageTag(event.target.value)} placeholder="latest" className={mono} />
            </Field>
            <Field label="Build context" hint="relative to the project">
              <Input value={buildContext} onChange={(event) => setBuildContext(event.target.value)} placeholder="." className={mono} />
            </Field>
            <Field label="Dockerfile" hint="relative to the context">
              <Input value={dockerfile} onChange={(event) => setDockerfile(event.target.value)} placeholder="Dockerfile" className={mono} />
            </Field>
          </div>
        )}

        <Field label="Project directory on the server">
          <Input value={remotePath} onChange={(event) => setRemotePath(event.target.value)} placeholder={`/home/deploy/${projectId}`} className={mono} />
        </Field>

        <Field label="Server commands" hint="one per line, run in order inside that directory; stops at the first failure">
          <Textarea
            value={commands}
            onChange={(event) => setCommands(event.target.value)}
            rows={5}
            spellCheck={false}
            placeholder={mode === "image" ? `docker compose up -d ${imageName || "web"}\ndocker image prune -f` : "git pull --ff-only\ndocker compose up -d --build"}
            className={mono}
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={saving} disabled={!name.trim() || !serverId || !remotePath.trim() || !commands.trim()}>
            {deployment ? "Save" : "Add deployment"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
