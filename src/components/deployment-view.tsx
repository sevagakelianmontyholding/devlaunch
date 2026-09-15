"use client";

import Link from "next/link";
import { ArrowLeft, HeartPulse, History, Pencil, Rocket, Server, Settings2, Square, TerminalSquare, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { deploy, getDeployRuns, getDeployment, openServerTerminal, removeDeployment, stopDeploy } from "@/actions";
import { formatBytes } from "@/lib/format";
import type { DeployRun, DeployRunSummary, Deployment, RunKind } from "@/lib/types";
import { PageHeader } from "./app-shell";
import { DeploymentDialog, PinPrompt, runTone } from "./deployments";
import { useNavigate } from "./navigate";
import { LockStrip, foreignLocks } from "./projects-view";
import { useStatus } from "./status-provider";
import { TerminalView } from "./terminal-view";
import { Button, Card, CardTitle, Confirm, Dialog, Dot, Empty, IconButton, Spinner, cx } from "./ui";

const kindLabel = { deploy: "Deploy", commands: "Commands", rollback: "Rollback" } as const;

export function DeploymentView({ id }: { id: string }) {
  const { status, notify, refresh } = useStatus();
  const navigate = useNavigate();
  const requestedRun = useSearchParams().get("run");
  const [deployment, setDeployment] = useState<Deployment | null | undefined>(undefined);
  const [runs, setRuns] = useState<DeployRunSummary[] | null>(null);
  const [watched, setWatched] = useState<DeployRun | null>(null);
  const [pinFor, setPinFor] = useState<{ kind: RunKind; force: boolean } | null>(null);
  const [warning, setWarning] = useState<{ message: string; pin?: string; kind: RunKind; reason: "git" | "lock" } | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const [item, history] = await Promise.all([getDeployment(id), getDeployRuns(id)]);
    setDeployment(item);
    setRuns(history);
    // Follow a run already in progress; otherwise the requested run (from the
    // history page) or the latest one.
    const current = (requestedRun && history.find((run) => run.id === requestedRun)) || history[0];
    if (current) {
      setWatched((existing) => {
        if (existing && existing.status === "running") return existing;
        if (existing && existing.id === current.id) return existing;
        void fetch(`/api/deploy-runs/${current.id}`, { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .then((body: { run: DeployRun } | null) => body && setWatched(body.run));
        return existing;
      });
    }
  }, [id, requestedRun]);

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
      if (run.status !== "running") {
        void load();
        void refresh();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [watched, load, refresh]);

  const start = async (pin: string | undefined, kind: RunKind, force = false): Promise<string | null> => {
    const result = await deploy(id, pin, kind, force);
    if (!result.ok) {
      if (result.error.startsWith("GIT_CHECK:")) {
        setPinFor(null);
        setWarning({ message: result.error.slice("GIT_CHECK:".length), pin, kind, reason: "git" });
        return null;
      }
      if (result.error.startsWith("LOCK:")) {
        setPinFor(null);
        setWarning({ message: result.error.slice("LOCK:".length), pin, kind, reason: "lock" });
        return null;
      }
      if (pin === undefined) notify("error", result.error);
      return result.error;
    }
    setPinFor(null);
    setWarning(null);
    setWatched(result.data);
    void load();
    void refresh();
    return null;
  };

  const request = (kind: RunKind) => {
    if (status.user.hasPin) setPinFor({ kind, force: false });
    else void start(undefined, kind);
  };

  const stop = async (runId: string) => {
    const result = await stopDeploy(runId);
    if (!result.ok) notify("error", result.error);
    void load();
    void refresh();
  };

  const showRun = async (run: DeployRunSummary) => {
    const response = await fetch(`/api/deploy-runs/${run.id}`, { cache: "no-store" });
    if (!response.ok) return;
    setWatched(((await response.json()) as { run: DeployRun }).run);
  };

  const remove = async () => {
    if (!deployment) return;
    const result = await removeDeployment(deployment.id);
    if (!result.ok) return notify("error", result.error);
    notify("success", `${result.data.name} removed`);
    void refresh();
    navigate(`/projects/${deployment.projectId}`);
  };

  if (deployment === undefined) return <Spinner label="Loading…" />;
  if (deployment === null) {
    return (
      <Empty
        title="Deployment not found"
        hint="It may have been removed, or its project is in Recently removed."
        action={
          <Link href="/deployments" className="text-[12px] font-medium text-accent hover:underline">
            All deployments
          </Link>
        }
      />
    );
  }

  const live = status.activeDeploys[deployment.projectId]?.deploymentId === deployment.id ? status.activeDeploys[deployment.projectId] : null;
  const runningId = live?.runId ?? (watched?.status === "running" ? watched.id : null);
  const lastRun = watched?.status === "running" ? watched : deployment.lastRun;
  const state = runTone(lastRun);
  const upload = watched?.status === "running" ? watched.upload : null;
  const locks = foreignLocks(status.locks, [deployment], status.activeDeploys);
  const commands = deployment.commands.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  const envCount = deployment.envContent.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#")).length;
  const buildArgNames = deployment.buildArgs.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => line.slice(0, line.indexOf("=")));

  return (
    <div className="fade-up">
      <Link href="/deployments" className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-dim transition hover:text-ink">
        <ArrowLeft className="size-3.5" /> Deployments
      </Link>

      <PageHeader
        title={deployment.name}
        subtitle={undefined}
        actions={
          <>
            <IconButton
              label={`SSH to ${deployment.serverName} in ${deployment.remotePath}`}
              onClick={async () => {
                const result = await openServerTerminal(deployment.serverId, deployment.remotePath);
                if (!result.ok) notify("error", result.error);
              }}
            >
              <TerminalSquare className="size-4" />
            </IconButton>
            <IconButton label="Edit deployment" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
            </IconButton>
            <IconButton label="Remove deployment" onClick={() => setConfirmDelete(true)} className="hover:text-danger">
              <Trash2 className="size-4" />
            </IconButton>
            {runningId ? (
              <Button variant="danger" icon={<Square className="size-3" fill="currentColor" />} onClick={() => void stop(runningId)}>
                Stop
              </Button>
            ) : (
              <>
                {deployment.mode === "image" && (
                  <Button icon={<Undo2 className="size-4" />} onClick={() => request("rollback")} title="Re-tag the previous image on the server and run the commands">
                    Roll back
                  </Button>
                )}
                <Button icon={<TerminalSquare className="size-4" />} onClick={() => request("commands")} title="Run only the server commands — no build, no upload">
                  Run commands
                </Button>
                <Button variant="primary" icon={<Rocket className="size-4" />} onClick={() => request("deploy")}>
                  Deploy
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-dim">
        <Dot tone={state.tone} pulse={state.tone === "warn"} />
        <span className={cx(state.tone === "success" && "text-success", state.tone === "danger" && "text-danger", state.tone === "warn" && "text-warn")}>
          {live ? `Deploying · ${live.phase ?? "starting"}` : state.label}
          {lastRun && !live && ` · ${new Date(lastRun.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}${lastRun.username ? ` by ${lastRun.username}` : ""}`}
        </span>
        <span>·</span>
        <Link href={`/projects/${deployment.projectId}`} className="hover:text-accent">
          {deployment.projectName}
        </Link>
        <span className="flex items-center gap-1">
          <Server className="size-3" /> {deployment.serverName}
        </span>
        <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{deployment.mode === "image" ? "Image push" : "Commands"}</span>
        <span>·</span>
        <Link href={`/projects/${deployment.projectId}#server-logs`} className="hover:text-accent">
          Server logs
        </Link>
      </div>

      {locks.map((held) => (
        <div key={held.serverId} className="mb-4 [&>div]:mt-0">
          <LockStrip held={held} />
        </div>
      ))}

      {upload && (
        <div className="mb-4 rounded-lg border border-accent/20 bg-accent/[0.05] px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
            <span className="font-medium text-accent">Uploading image · {upload.percent}%</span>
            <span className="text-ink-dim">
              {formatBytes(upload.readBytes)} of {formatBytes(upload.imageBytes)}
              <span className="text-ink-faint"> · {formatBytes(upload.sentBytes)} sent compressed</span>
            </span>
            <span className="font-mono text-ink">{formatBytes(upload.bytesPerSecond)}/s</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${upload.percent}%` }} />
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="mb-4 max-w-md">
          <Confirm title={`Remove ${deployment.name}?`} body="Its run history is removed too. The server is not touched." confirmLabel="Remove" onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardTitle
              icon={<TerminalSquare className="size-4" />}
              aside={watched ? <span className="text-[11px] text-ink-faint">{kindLabel[watched.kind]} · {new Date(watched.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{watched.username ? ` · ${watched.username}` : ""}</span> : null}
            >
              Log
            </CardTitle>
            {watched ? <TerminalView text={watched.log || "Waiting for output…"} rows={24} /> : <p className="text-[12px] text-ink-faint">No runs yet. Press Deploy to ship this deployment.</p>}
          </Card>

          <Card>
            <CardTitle icon={<History className="size-4" />} aside={<span className="text-[11px] text-ink-faint">{runs?.length ?? 0} run{runs?.length === 1 ? "" : "s"}</span>}>
              History
            </CardTitle>
            {runs === null ? (
              <Spinner label="Loading…" />
            ) : runs.length === 0 ? (
              <p className="text-[12px] text-ink-faint">No runs yet.</p>
            ) : (
              <div className="divide-y divide-line">
                {runs.map((run) => {
                  const tone = runTone(run);
                  const seconds = run.finishedAt ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000) : null;
                  const selected = watched?.id === run.id;
                  return (
                    <button key={run.id} type="button" onClick={() => void showRun(run)} className={cx("flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-[12px] transition hover:text-ink", selected ? "text-ink" : "text-ink-dim")}>
                      <Dot tone={tone.tone} pulse={tone.tone === "warn"} />
                      <span className={cx("w-20", tone.tone === "success" && "text-success", tone.tone === "danger" && "text-danger", tone.tone === "warn" && "text-warn")}>{tone.label}</span>
                      <span className="w-20">{kindLabel[run.kind]}</span>
                      <span>{new Date(run.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      {seconds !== null && <span className="text-ink-faint">{Math.floor(seconds / 60)}m {seconds % 60}s</span>}
                      {run.username && <span className="ml-auto text-ink-faint">{run.username}</span>}
                      {selected && <span className="text-[11px] text-accent">shown</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardTitle icon={<Settings2 className="size-4" />}>Settings</CardTitle>
            <dl className="space-y-2 text-[12px]">
              <Row label="Server directory">
                <span className="font-mono text-[11px]">{deployment.remotePath}</span>
              </Row>
              {deployment.mode === "image" && (
                <>
                  <Row label="Image">
                    <span className="font-mono text-[11px]">
                      {deployment.imageName}:{deployment.imageTag || "latest"}
                    </span>
                  </Row>
                  <Row label="Build context">
                    <span className="font-mono text-[11px]">{deployment.buildContext || "."}</span>
                  </Row>
                  <Row label="Dockerfile">
                    <span className="font-mono text-[11px]">{deployment.dockerfile || "Dockerfile"}</span>
                  </Row>
                  <Row label="Platform">
                    <span>{deployment.platform || "detected from the server"}</span>
                  </Row>
                  <Row label="Build variables">
                    <span className="font-mono text-[11px]">{buildArgNames.length ? buildArgNames.join(", ") : "—"}</span>
                  </Row>
                </>
              )}
              <Row label="Env file">
                <span>{envCount ? `${deployment.envPath} · ${envCount} variable${envCount === 1 ? "" : "s"}` : "—"}</span>
              </Row>
              <Row label="Health check">
                <span className="flex items-center justify-end gap-1">
                  {deployment.healthUrl ? (
                    <>
                      <HeartPulse className="size-3 text-accent" />
                      <span className="truncate font-mono text-[11px]">{deployment.healthUrl.replace(/^https?:\/\//, "")}</span>
                      {deployment.autoRollback && <span className="text-ink-faint">· auto rollback</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </Row>
              <Row label="Clean git required">
                <span>{deployment.requireCleanGit ? "yes" : "no"}</span>
              </Row>
            </dl>
            <p className="mt-3 text-[11px] font-medium text-ink-dim">Server commands</p>
            <ol className="mt-1 space-y-1">
              {commands.map((line, index) => (
                <li key={index} className="break-all rounded-md bg-bg px-2 py-1 font-mono text-[11px] text-ink">
                  {line}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {pinFor && <PinPrompt deployment={deployment} kind={pinFor.kind} onClose={() => setPinFor(null)} onSubmit={(pin) => start(pin, pinFor.kind, pinFor.force)} />}

      {warning && (
        <Dialog title={warning.reason === "lock" ? "Someone is already deploying" : "Working tree is not clean"} onClose={() => setWarning(null)} width="max-w-[460px]">
          <p className="text-[13px] leading-5 text-ink-dim">{warning.message}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setWarning(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Rocket className="size-3.5" />} onClick={() => void start(warning.pin, warning.kind, true)}>
              {warning.kind === "deploy" ? "Deploy anyway" : "Run anyway"}
            </Button>
          </div>
        </Dialog>
      )}

      {editing && (
        <DeploymentDialog
          projectId={deployment.projectId}
          deployment={deployment}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-dim">{label}</dt>
      <dd className="w-0 flex-1 truncate text-right">{children}</dd>
    </div>
  );
}
