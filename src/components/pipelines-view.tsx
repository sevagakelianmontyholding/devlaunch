"use client";

import { ArrowDown, Clock, Pencil, Play, Plus, Trash2, Workflow } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getPipelines, removePipeline, runPipeline, savePipelineAction } from "@/actions";
import type { Pipeline } from "@/lib/types";
import { PageHeader } from "./app-shell";
import { PinPrompt } from "./deployments";
import { useStatus } from "./status-provider";
import { Button, Card, Confirm, Dialog, Dot, Empty, ErrorNote, Field, IconButton, Input, Select, Spinner, cx } from "./ui";

export function PipelinesView() {
  const { status, refresh, notify } = useStatus();
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [editing, setEditing] = useState<Pipeline | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<Pipeline | null>(null);

  const load = useCallback(async () => {
    setPipelines((await getPipelines()).pipelines);
  }, []);
  // Live progress arrives with the status poll (fast while anything runs).
  const active = status.activePipelines;
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const start = async (pipeline: Pipeline, pin?: string): Promise<string | null> => {
    const result = await runPipeline(pipeline.id, pin);
    if (!result.ok) {
      if (pin === undefined) notify("error", result.error);
      return result.error;
    }
    setPinFor(null);
    notify("success", `Running ${pipeline.name}`);
    await refresh();
    return null;
  };

  const remove = async (id: string) => {
    const result = await removePipeline(id);
    if (!result.ok) return notify("error", result.error);
    setConfirmDelete(null);
    void load();
  };

  return (
    <div>
      <PageHeader
        title="Pipelines"
        subtitle="Run several deployments in order with one click, or on a daily schedule."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            New pipeline
          </Button>
        }
      />
      {pipelines === null ? (
        <Spinner label="Loading…" />
      ) : pipelines.length === 0 ? (
        <Empty icon={<Workflow className="size-4" />} title="No pipelines yet" hint="Chain deployments — e.g. backend then frontend — and optionally run them every day at a set time." />
      ) : (
        <div className="space-y-3">
          {pipelines.map((pipeline) => {
            const run = active[pipeline.id];
            const running = run?.status === "running";
            return (
              <Card key={pipeline.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Workflow className="size-4 text-accent" />
                  <span className="text-[14px] font-semibold">{pipeline.name}</span>
                  {pipeline.schedule && (
                    <span className={cx("flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11px]", pipeline.enabled ? "text-ink-dim" : "text-ink-faint line-through")}>
                      <Clock className="size-3" /> daily at {pipeline.schedule}
                    </span>
                  )}
                  {pipeline.lastRunAt && <span className="text-[11px] text-ink-faint">last run {new Date(pipeline.lastRunAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                  <div className="ml-auto flex items-center gap-1">
                    <IconButton label="Edit pipeline" onClick={() => setEditing(pipeline)}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton label="Remove pipeline" onClick={() => setConfirmDelete(pipeline.id)} className="hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </IconButton>
                    <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} disabled={running} onClick={() => (status.user.hasPin ? setPinFor(pipeline) : void start(pipeline))}>
                      {running ? "Running…" : "Run"}
                    </Button>
                  </div>
                </div>
                <ol className="mt-3 space-y-1.5">
                  {pipeline.steps.map((step, index) => {
                    const state = run?.steps[index]?.status ?? "pending";
                    const tone = state === "success" ? "success" : state === "error" || state === "cancelled" ? "danger" : state === "running" ? "warn" : "muted";
                    return (
                      <li key={`${step.deploymentId}-${index}`} className="flex items-center gap-2 text-[12px]">
                        <span className="w-4 text-right text-[11px] text-ink-faint">{index + 1}</span>
                        <Dot tone={tone} pulse={state === "running"} />
                        <span className="font-medium">{step.projectName}</span>
                        <span className="text-ink-dim">· {step.deploymentName}</span>
                        <span className="text-[11px] text-ink-faint">→ {step.serverName}</span>
                        {run && <span className={cx("ml-auto text-[11px] capitalize", tone === "success" && "text-success", tone === "danger" && "text-danger", tone === "warn" && "text-warn", tone === "muted" && "text-ink-faint")}>{state}</span>}
                        {index < pipeline.steps.length - 1 && <ArrowDown className="size-3 text-ink-faint" />}
                      </li>
                    );
                  })}
                </ol>
                {confirmDelete === pipeline.id && (
                  <div className="mt-3">
                    <Confirm title="Remove this pipeline?" body="Deployments themselves are not affected." confirmLabel="Remove" onCancel={() => setConfirmDelete(null)} onConfirm={() => void remove(pipeline.id)} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <PipelineDialog
          pipeline={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {pinFor && <PinPrompt deployment={{ name: pinFor.name, serverName: `${pinFor.steps.length} step${pinFor.steps.length === 1 ? "" : "s"}` }} kind="pipeline" onClose={() => setPinFor(null)} onSubmit={(pin) => start(pinFor, pin)} />}
    </div>
  );
}

function PipelineDialog({ pipeline, onClose, onSaved }: { pipeline: Pipeline | null; onClose: () => void; onSaved: () => void }) {
  const { status } = useStatus();
  const [name, setName] = useState(pipeline?.name ?? "");
  const [ids, setIds] = useState<string[]>(pipeline?.steps.map((step) => step.deploymentId) ?? []);
  const [schedule, setSchedule] = useState(pipeline?.schedule ?? "");
  const [enabled, setEnabled] = useState(pipeline?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = status.projects.flatMap((project) =>
    (status.deployments[project.id] ?? []).map((deployment) => ({ id: deployment.id, label: `${project.name} · ${deployment.name} → ${deployment.serverName}` })),
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await savePipelineAction(pipeline?.id ?? null, { name, deploymentIds: ids, schedule, enabled });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onSaved();
  };

  return (
    <Dialog title={pipeline ? `Edit ${pipeline.name}` : "New pipeline"} description="Steps run one after another and stop at the first failure." onClose={onClose} width="max-w-[560px]">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Release MyMonty" autoFocus />
        </Field>
        <Field label="Steps" hint="in order">
          <div className="space-y-2">
            {ids.map((id, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-4 text-right text-[11px] text-ink-faint">{index + 1}</span>
                <Select value={id} onChange={(event) => setIds(ids.map((item, i) => (i === index ? event.target.value : item)))}>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <IconButton label="Remove step" onClick={() => setIds(ids.filter((_, i) => i !== index))}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
            ))}
            <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => options[0] && setIds([...ids, options[0].id])} disabled={options.length === 0}>
              Add step
            </Button>
            {options.length === 0 && <p className="text-[11px] text-ink-faint">Add a deployment to a project first.</p>}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Daily at" hint="optional, 24h — e.g. 03:30">
            <Input value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="03:30" className="font-mono text-[12px]" />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2.5 text-[12px]">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="accent-[#2dd4bf]" />
            Schedule enabled
          </label>
        </div>
        <p className="text-[11px] leading-4 text-ink-faint">Scheduled runs happen while DevLaunch is running on this Mac (it starts at login). They skip the passphrase and the git check.</p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={saving} disabled={!name.trim() || ids.length === 0}>
            {pipeline ? "Save" : "Create pipeline"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
