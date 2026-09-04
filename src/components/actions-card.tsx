"use client";

import { Pencil, Play, Plus, Server, Trash2, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getServers, removeAction, runAction, saveAction } from "@/actions";
import type { LocalRun, Project, ProjectAction, Server as DeployServer } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Confirm, Dialog, Dot, ErrorNote, Field, IconButton, Input, Select, Textarea, cx } from "./ui";

export function ActionsCard({ project, actions }: { project: Project; actions: ProjectAction[] }) {
  const { status, refresh, notify } = useStatus();
  const [run, setRun] = useState<LocalRun | null>(null);
  const [editing, setEditing] = useState<ProjectAction | "new" | null>(null);
  const [manage, setManage] = useState(false);
  const [confirming, setConfirming] = useState<ProjectAction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);
  const notifiedRef = useRef<string | null>(null);
  const otherRunning = Boolean(status.activeActions[project.id]) && status.activeActions[project.id]?.runId !== run?.id;
  const running = run?.status === "running" || otherRunning;

  useEffect(() => {
    if (!run || run.status !== "running") return;
    const interval = setInterval(async () => {
      const response = await fetch(`/api/local-runs/${run.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const { run: next } = (await response.json()) as { run: LocalRun };
      setRun(next);
    }, 1000);
    return () => clearInterval(interval);
  }, [run]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [run?.log]);

  useEffect(() => {
    if (!run || run.status === "running" || notifiedRef.current === run.id) return;
    notifiedRef.current = run.id;
    notify(run.status === "success" ? "success" : "error", `${run.label ?? "Action"} ${run.status === "success" ? "finished" : "failed"} — ${project.name}`);
    void refresh();
  }, [run, notify, refresh, project.name]);

  const start = async (action: ProjectAction) => {
    setConfirming(null);
    setBusy(action.id);
    const result = await runAction(action.id);
    setBusy(null);
    if (!result.ok) return notify("error", result.error);
    setRun(result.data);
    void refresh();
  };

  const remove = async (id: string) => {
    const result = await removeAction(id);
    if (!result.ok) return notify("error", result.error);
    setConfirmDelete(null);
    notify("success", `${result.data.name} removed`);
    void refresh();
  };

  return (
    <Card>
      <CardTitle
        icon={<Zap className="size-4" />}
        aside={
          <>
            {actions.length > 0 && (
              <button type="button" onClick={() => setManage((current) => !current)} className={cx("text-[11px] hover:text-ink", manage ? "text-accent" : "text-ink-dim")}>
                {manage ? "Done" : "Edit"}
              </button>
            )}
            <IconButton label="Add action" onClick={() => setEditing("new")} className="size-7">
              <Plus className="size-3.5" />
            </IconButton>
          </>
        }
      >
        Actions
      </CardTitle>

      {actions.length === 0 ? (
        <p className="text-[12px] text-ink-faint">
          Your own buttons for this project: run migrations, clear a cache, restart a queue — on this Mac or on a server.{" "}
          <button type="button" onClick={() => setEditing("new")} className="text-accent hover:underline">
            Add one
          </button>
          .
        </p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map((action) => (
            <div key={action.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => (action.confirm ? setConfirming(action) : void start(action))}
                disabled={running || busy === action.id}
                title={`${action.serverName ? `On ${action.serverName} in ${action.workingDir}` : `On this Mac${action.workingDir ? ` in ${action.workingDir}` : ""}`}\n${action.command}`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-left text-[12px] transition hover:border-accent/50 hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play className={cx("size-3.5 shrink-0 text-accent", busy === action.id && "animate-pulse")} />
                <span className="truncate font-medium">{action.name}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-ink-faint">
                  {action.serverName ? (
                    <>
                      <Server className="size-3" /> {action.serverName}
                    </>
                  ) : (
                    "this Mac"
                  )}
                </span>
              </button>
              {manage && (
                <>
                  <IconButton label="Edit action" onClick={() => setEditing(action)} className="size-7">
                    <Pencil className="size-3.5" />
                  </IconButton>
                  <IconButton label="Remove action" onClick={() => setConfirmDelete(action.id)} className="size-7 hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="mt-3">
          <Confirm title="Remove this action?" body="Only the button is removed." confirmLabel="Remove" onCancel={() => setConfirmDelete(null)} onConfirm={() => void remove(confirmDelete)} />
        </div>
      )}

      {confirming && (
        <div className="mt-3">
          <Confirm
            title={`Run ${confirming.name}?`}
            body={
              <>
                {confirming.serverName ? `On ${confirming.serverName} in ${confirming.workingDir}` : "On this Mac"}:
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-ink">{confirming.command}</pre>
              </>
            }
            confirmLabel="Run"
            tone="primary"
            onCancel={() => setConfirming(null)}
            onConfirm={() => void start(confirming)}
          />
        </div>
      )}

      {run && (
        <div className={cx("mt-3 rounded-lg border p-3", run.status === "running" ? "border-warn/25 bg-warn/[0.05]" : run.status === "success" ? "border-success/20 bg-success/[0.04]" : "border-danger/20 bg-danger/[0.05]")}>
          <div className="flex items-center gap-2 text-[12px]">
            <Dot tone={run.status === "running" ? "warn" : run.status === "success" ? "success" : "danger"} pulse={run.status === "running"} />
            <span className="font-medium">
              {run.label ?? "Action"} {run.status === "running" ? "running…" : run.status === "success" ? "finished" : "failed"}
            </span>
            {run.status !== "running" && (
              <button type="button" onClick={() => setRun(null)} className="ml-auto text-[11px] text-ink-dim hover:text-ink">
                Dismiss
              </button>
            )}
          </div>
          <pre ref={logRef} className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-black/40 p-3 font-mono text-[11px] leading-4 text-ink-dim">
            {run.log}
          </pre>
        </div>
      )}

      {editing && <ActionDialog projectId={project.id} action={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function ActionDialog({ projectId, action, onClose }: { projectId: string; action: ProjectAction | null; onClose: () => void }) {
  const { refresh, notify } = useStatus();
  const [servers, setServers] = useState<DeployServer[]>([]);
  const [name, setName] = useState(action?.name ?? "");
  const [where, setWhere] = useState(action?.serverId ?? "");
  const [workingDir, setWorkingDir] = useState(action?.workingDir ?? "");
  const [command, setCommand] = useState(action?.command ?? "");
  const [confirm, setConfirm] = useState(action?.confirm ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getServers().then((list) => {
      if (!cancelled) setServers(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveAction(projectId, action?.id ?? null, { name, command, serverId: where || null, workingDir, confirm });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    notify("success", `${result.data.name} ${action ? "updated" : "added"}`);
    await refresh();
    onClose();
  };

  const mono = "font-mono text-[12px]";
  return (
    <Dialog title={action ? `Edit ${action.name}` : "Add an action"} description="A button that runs your commands, one per line, stopping at the first failure." onClose={onClose} width="max-w-[560px]">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Run migrations" maxLength={40} autoFocus />
          </Field>
          <Field label="Where">
            <Select value={where} onChange={(event) => setWhere(event.target.value)}>
              <option value="">This Mac</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} · {server.username}@{server.host}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={where ? "Directory on the server" : "Directory"} hint={where ? "absolute" : "optional, relative to the project folder"}>
          <Input value={workingDir} onChange={(event) => setWorkingDir(event.target.value)} placeholder={where ? "/home/deploy/my-app" : "backend"} className={mono} />
        </Field>
        <Field label="Commands" hint="one per line">
          <Textarea value={command} onChange={(event) => setCommand(event.target.value)} rows={4} spellCheck={false} placeholder={where ? "docker compose exec backend php artisan migrate --force" : "npm run migrate"} className={mono} />
        </Field>
        <label className="flex items-start gap-2 text-[12px]">
          <input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} className="mt-0.5 accent-[#2dd4bf]" />
          <span>
            <span className="font-medium">Ask before running</span>
            <span className="block text-[11px] text-ink-dim">Shows the commands and waits for a confirmation. Use it for anything destructive.</span>
          </span>
        </label>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={saving} disabled={!name.trim() || !command.trim() || (Boolean(where) && !workingDir.trim())}>
            {action ? "Save changes" : "Add action"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
