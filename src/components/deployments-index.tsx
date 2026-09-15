"use client";

import Link from "next/link";
import { ChevronRight, HeartPulse, Rocket, Server } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getAllDeployments } from "@/actions";
import type { Deployment } from "@/lib/types";
import { PageHeader } from "./app-shell";
import { runTone } from "./deployments";
import { LockStrip } from "./projects-view";
import { useStatus } from "./status-provider";
import { Dot, Empty, Spinner, cx, timeAgo } from "./ui";

export function DeploymentsIndex() {
  const { status } = useStatus();
  const [deployments, setDeployments] = useState<Deployment[] | null>(null);
  const activeCount = Object.keys(status.activeDeploys).length;

  const load = useCallback(async () => setDeployments(await getAllDeployments()), []);
  // Reload when a deploy starts or finishes so the status column stays current.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, activeCount]);

  const groups = new Map<string, Deployment[]>();
  for (const deployment of deployments ?? []) {
    const list = groups.get(deployment.projectId) ?? [];
    list.push(deployment);
    groups.set(deployment.projectId, list);
  }
  const own = new Set(Object.values(status.activeDeploys).map((deploy) => deploy.runId));
  const locks = Object.values(status.locks).filter((held) => !own.has(held.lock.runId));

  return (
    <div>
      <PageHeader title="Deployments" subtitle={deployments ? `${deployments.length} across ${groups.size} project${groups.size === 1 ? "" : "s"}` : "Every deployment, across projects."} />

      {locks.length > 0 && (
        <div className="mb-4 space-y-2 [&>div]:mt-0">
          {locks.map((held) => (
            <LockStrip key={held.serverId} held={held} />
          ))}
        </div>
      )}

      {deployments === null ? (
        <Spinner label="Loading…" />
      ) : deployments.length === 0 ? (
        <Empty icon={<Rocket className="size-4" />} title="No deployments yet" hint="Add one on a project page: Deployments → Add." />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([projectId, list]) => (
            <section key={projectId}>
              <h2 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
                <Link href={`/projects/${projectId}`} className="hover:text-accent">
                  {list[0]!.projectName}
                </Link>
                <span className="font-normal text-ink-faint">{list.length}</span>
              </h2>
              <div className="overflow-hidden rounded-card border border-line bg-panel">
                {list.map((deployment) => {
                  const live = status.activeDeploys[deployment.projectId];
                  const running = live?.deploymentId === deployment.id ? live : null;
                  const lastRun = deployment.lastRun;
                  const state = running ? { tone: "warn" as const, label: "Deploying…" } : runTone(lastRun);
                  return (
                    <Link key={deployment.id} href={`/deployments/${deployment.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 transition last:border-b-0 hover:bg-panel-2">
                      <Dot tone={state.tone} pulse={state.tone === "warn"} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                          <span className="font-semibold">{deployment.name}</span>
                          <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-dim">{deployment.mode === "image" ? "Image push" : "Commands"}</span>
                          <span className="flex items-center gap-1 text-[11px] text-ink-dim">
                            <Server className="size-3" /> {deployment.serverName}
                          </span>
                          {deployment.healthUrl && (
                            <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                              <HeartPulse className="size-3" /> health check
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">
                          {deployment.mode === "image" ? `${deployment.imageName}:${deployment.imageTag || "latest"} → ` : ""}
                          {deployment.remotePath}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right text-[11px] sm:block">
                        <p className={cx(state.tone === "success" && "text-success", state.tone === "danger" && "text-danger", state.tone === "warn" && "text-warn", state.tone === "muted" && "text-ink-faint")}>
                          {running ? `${state.label} ${running.phase ?? ""}` : state.label}
                        </p>
                        {lastRun && !running && (
                          <p className="text-ink-faint">
                            {timeAgo(lastRun.startedAt)}
                            {lastRun.username ? ` · ${lastRun.username}` : ""}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-ink-faint" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
