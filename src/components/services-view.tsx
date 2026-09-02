"use client";

import Link from "next/link";
import { Boxes } from "lucide-react";
import { PageHeader } from "./app-shell";
import { useStatus } from "./status-provider";
import { Card, Dot, Empty, Monogram } from "./ui";

export function ServicesView() {
  const { status } = useStatus();
  const groups = status.projects
    .map((project) => ({ project, runtime: status.runtimes[project.id] }))
    .filter((entry) => entry.runtime && entry.runtime.containers.length > 0);
  const running = groups.reduce((total, entry) => total + entry.runtime!.containers.filter((container) => container.state === "running").length, 0);
  const total = groups.reduce((sum, entry) => sum + entry.runtime!.containers.length, 0);

  return (
    <div>
      <PageHeader title="Services" subtitle={status.dockerAvailable ? `${running} of ${total} containers running across your projects` : "Docker is not running"} />

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
