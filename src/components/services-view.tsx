"use client";

import Link from "next/link";
import { Boxes, Cpu, HardDrive, RefreshCw, Server } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getServerHealth } from "@/actions";
import type { ServerHealth } from "@/lib/types";
import { PageHeader } from "./app-shell";
import { useStatus } from "./status-provider";
import { Card, Dot, Empty, IconButton, Monogram, Spinner, cx } from "./ui";

export function ServicesView() {
  const { status } = useStatus();
  const [health, setHealth] = useState<ServerHealth[] | null>(null);
  const [checking, setChecking] = useState(false);
  const loadHealth = useCallback(async () => {
    setChecking(true);
    setHealth(await getServerHealth());
    setChecking(false);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void loadHealth(), 0);
    return () => clearTimeout(timer);
  }, [loadHealth]);
  const groups = status.projects
    .map((project) => ({ project, runtime: status.runtimes[project.id] }))
    .filter((entry) => entry.runtime && entry.runtime.containers.length > 0);
  const running = groups.reduce((total, entry) => total + entry.runtime!.containers.filter((container) => container.state === "running").length, 0);
  const total = groups.reduce((sum, entry) => sum + entry.runtime!.containers.length, 0);

  return (
    <div>
      <PageHeader title="Services" subtitle={status.dockerAvailable ? `${running} of ${total} containers running across your projects` : "Docker is not running"} />

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-dim">Deploy servers</h2>
          <IconButton label="Re-check servers" onClick={() => void loadHealth()} disabled={checking} className="size-7">
            <RefreshCw className={cx("size-3.5", checking && "animate-spin")} />
          </IconButton>
        </div>
        {health === null ? (
          <Spinner label="Checking servers over SSH…" />
        ) : health.length === 0 ? (
          <p className="text-[12px] text-ink-faint">No deploy servers configured.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {health.map((server) => (
              <Card key={server.id}>
                <div className="flex items-center gap-2">
                  <Server className="size-4 text-accent" />
                  <span className="text-[13px] font-semibold">{server.name}</span>
                  <Dot tone={server.reachable ? "success" : "danger"} />
                  <span className="ml-auto text-[11px] text-ink-faint">{server.reachable ? server.uptime && `up ${server.uptime}` : "unreachable"}</span>
                </div>
                {server.reachable ? (
                  <>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                      <div className="flex items-center gap-1.5 text-ink-dim"><Cpu className="size-3.5" /> {server.arch ?? "?"}</div>
                      <div className="text-ink-dim">Docker {server.dockerVersion ?? "?"}</div>
                      {server.disk && (
                        <div className="col-span-2">
                          <div className="flex items-center gap-1.5 text-ink-dim"><HardDrive className="size-3.5" /> Disk {server.disk.used} of {server.disk.total}
                            <span className={cx("ml-auto font-medium", server.disk.percent >= 90 ? "text-danger" : server.disk.percent >= 75 ? "text-warn" : "text-success")}>{server.disk.percent}%</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                            <div className={cx("h-full rounded-full", server.disk.percent >= 90 ? "bg-danger" : server.disk.percent >= 75 ? "bg-warn" : "bg-accent")} style={{ width: `${server.disk.percent}%` }} />
                          </div>
                        </div>
                      )}
                      {server.memory && <div className="col-span-2 text-ink-dim">Memory {server.memory.used} of {server.memory.total}</div>}
                    </dl>
                    <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-[11px] text-ink-faint">
                      <span>Running containers</span>
                      <span>{server.containers.length}</span>
                    </div>
                    <div className="mt-1 max-h-48 divide-y divide-line overflow-y-auto pr-1">
                      {server.containers.length === 0 && <p className="py-1.5 text-[11px] text-ink-faint">No running containers.</p>}
                      {server.containers.map((container) => (
                        <div key={container.name} className="flex items-center gap-2 py-1.5 text-[11px]">
                          <Dot tone="success" />
                          <span className="truncate font-mono">{container.name}</span>
                          <span className="ml-auto truncate text-ink-faint">{container.status}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-[12px] text-danger">{server.error}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-dim">This Mac</h2>
      {groups.length === 0 ? (
        <Empty icon={<Boxes className="size-4" />} title="No containers" hint={status.dockerAvailable ? "Start a project and its services show up here." : "Start Docker Desktop to see services."} />
      ) : (
        <div className="space-y-4">
          {groups.map(({ project, runtime }) => (
            <Card key={project.id}>
              <div className="mb-3 flex items-center gap-2.5">
                <Monogram name={project.name} size="sm" />
                <Link href={`/projects/${project.id}`} className="text-[13px] font-semibold hover:text-accent">
                  {project.name}
                </Link>
                <span className="ml-auto text-[11px] text-ink-faint">
                  {runtime!.containers.filter((container) => container.state === "running").length}/{runtime!.containers.length} running
                </span>
              </div>
              <div className="divide-y divide-line">
                {runtime!.containers.map((container) => (
                  <div key={container.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Dot tone={container.state === "running" ? "success" : "muted"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[12px]">{container.name}</p>
                      <p className="truncate text-[11px] text-ink-faint">{container.status}</p>
                    </div>
                    {container.ports && <span className="max-w-[260px] truncate font-mono text-[11px] text-ink-dim">{container.ports}</span>}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
