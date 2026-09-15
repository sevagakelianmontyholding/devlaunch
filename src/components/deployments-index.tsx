"use client";

import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getRunHistory } from "@/actions";
import type { RecentRun } from "@/lib/types";
import { PageHeader } from "./app-shell";
import { useStatus } from "./status-provider";
import { Button, Dot, Empty, Segmented, Select, Spinner, cx, timeAgo } from "./ui";

type StatusFilter = "all" | "success" | "error" | "cancelled";
const PAGE = 50;
const kindLabel = { deploy: "Deploy", commands: "Commands", rollback: "Rollback" } as const;

export function DeploymentsIndex() {
  return (
    <div>
      <PageHeader title="Deployments" subtitle="Every run, across all projects. Click one to open its log." />
      <RunHistory />
    </div>
  );
}

function duration(start: string, end: string | null) {
  if (!end) return null;
  const seconds = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const statusLabel = { success: { tone: "success" as const, label: "Succeeded" }, error: { tone: "danger" as const, label: "Failed" }, cancelled: { tone: "muted" as const, label: "Cancelled" }, running: { tone: "warn" as const, label: "Running" } };

function RunHistory() {
  const { status } = useStatus();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [projectId, setProjectId] = useState("");
  const [runs, setRuns] = useState<RecentRun[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const activeCount = Object.keys(status.activeDeploys).length;

  const load = useCallback(async () => {
    const result = await getRunHistory({ status: filter, projectId: projectId || undefined, limit: PAGE, offset: 0 });
    setRuns(result.runs);
    setTotal(result.total);
  }, [filter, projectId]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, activeCount]);

  const more = async () => {
    if (!runs) return;
    setLoadingMore(true);
    const result = await getRunHistory({ status: filter, projectId: projectId || undefined, limit: PAGE, offset: runs.length });
    setRuns([...runs, ...result.runs]);
    setTotal(result.total);
    setLoadingMore(false);
  };

  return (
    <>
      <div className="-mt-2 mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "success", label: "Succeeded" },
            { value: "error", label: "Failed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <Select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="w-auto min-w-[180px]">
          <option value="">All projects</option>
          {status.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
        {runs && (
          <span className="text-[12px] text-ink-dim">
            {total} run{total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {runs === null ? (
        <Spinner label="Loading…" />
      ) : runs.length === 0 ? (
        <Empty icon={<History className="size-4" />} title="No runs" hint="Nothing matches these filters yet." />
      ) : (
        <>
          <div className="overflow-hidden rounded-card border border-line bg-panel">
            {runs.map((run) => {
              const state = statusLabel[run.status];
              const took = duration(run.startedAt, run.finishedAt);
              return (
                <Link key={run.id} href={`/deployments/${run.deploymentId}?run=${run.id}`} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[12px] transition last:border-b-0 hover:bg-panel-2">
                  <Dot tone={state.tone} />
                  <span className={cx("w-[76px] shrink-0", state.tone === "success" && "text-success", state.tone === "danger" && "text-danger", state.tone === "muted" && "text-ink-faint")}>{state.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span className="font-medium text-ink">{run.projectName}</span>
                      <span className="text-ink-dim"> · {run.deploymentName}</span>
                      <span className="text-ink-faint"> → {run.serverName}</span>
                    </p>
                    <p className="truncate text-[11px] text-ink-faint">
                      {kindLabel[run.kind]}
                      {run.username ? ` by ${run.username}` : ""} · {new Date(run.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {took ? ` · ${took}` : ""}
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-[11px] text-ink-faint sm:block">{timeAgo(run.startedAt)}</span>
                  <ChevronRight className="size-4 shrink-0 text-ink-faint" />
                </Link>
              );
            })}
          </div>
          {runs.length < total && (
            <div className="mt-3 flex justify-center">
              <Button onClick={() => void more()} busy={loadingMore}>
                Load more ({total - runs.length} left)
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
