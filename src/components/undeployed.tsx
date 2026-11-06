"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, GitCommitHorizontal } from "lucide-react";
import { useState } from "react";
import type { Undeployed } from "@/lib/types";
import { useStatus } from "./status-provider";
import { cx, timeAgo } from "./ui";

const commitsLabel = (count: number) => `${count} commit${count === 1 ? "" : "s"}`;

// The deployments of a project that are behind GitHub, minus the one that is
// deploying right now (it is about to catch up).
export function useUndeployed(projectId: string): Undeployed[] {
  const { status } = useStatus();
  const active = status.activeDeploys[projectId]?.deploymentId;
  return (status.undeployed[projectId] ?? []).filter((item) => item.deploymentId !== active);
}

export function useUndeployedFor(projectId: string, deploymentId: string): Undeployed | null {
  return useUndeployed(projectId).find((item) => item.deploymentId === deploymentId) ?? null;
}

// One line for project cards and the dashboard; links to the deployment.
export function UndeployedStrip({ item, projectName }: { item: Undeployed; projectName?: string }) {
  return (
    <Link
      href={`/deployments/${item.deploymentId}`}
      onClick={(event) => event.stopPropagation()}
      className="mt-3 flex min-w-0 items-center gap-1.5 rounded-lg border border-warn/30 bg-warn/[0.08] px-3 py-2 text-[11px] transition hover:border-warn/60"
      title={item.commits.map((commit) => `${commit.hash} ${commit.subject} (${commit.author})`).join("\n")}
    >
      <GitCommitHorizontal className="size-3.5 shrink-0 text-warn" />
      <span className="shrink-0 font-medium text-warn">Pushed, not deployed</span>
      <span className="min-w-0 truncate text-ink-dim">
        · {projectName ? `${projectName} · ` : ""}
        {commitsLabel(item.count)} in {item.repos.join(", ")} since the last deploy to {item.deploymentName}
      </span>
      <span className="ml-auto hidden shrink-0 text-ink-faint sm:inline">deployed {timeAgo(item.deployedAt)}{item.deployedBy ? ` by ${item.deployedBy}` : ""}</span>
    </Link>
  );
}

// The fuller note for a deployment: what is on GitHub but not on the server.
export function UndeployedNote({ item, className }: { item: Undeployed; className?: string }) {
  const [open, setOpen] = useState(false);
  const multiRepo = new Set(item.commits.map((commit) => commit.repo)).size > 1;
  return (
    <div className={cx("rounded-lg border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[12px]", className)}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full min-w-0 items-center gap-1.5 text-left">
        <GitCommitHorizontal className="size-3.5 shrink-0 text-warn" />
        <span className="min-w-0 flex-1">
          <span className="font-medium text-warn">
            {commitsLabel(item.count)} in {item.repos.join(", ")} pushed but not deployed
          </span>
          <span className="text-ink-dim">
            {" "}
            · last deploy {timeAgo(item.deployedAt)}
            {item.deployedBy ? ` by ${item.deployedBy}` : ""}
          </span>
        </span>
        {open ? <ChevronUp className="size-3.5 shrink-0 text-ink-faint" /> : <ChevronDown className="size-3.5 shrink-0 text-ink-faint" />}
      </button>
      {open && (
        <ul className="mt-2 space-y-1 border-t border-warn/20 pt-2">
          {item.commits.map((commit) => (
            <li key={`${commit.repo}:${commit.hash}`} className="flex min-w-0 items-baseline gap-2 text-[11px]">
              <span className="shrink-0 font-mono text-ink-faint">{commit.hash}</span>
              <span className="min-w-0 flex-1 truncate text-ink" title={commit.subject}>
                {multiRepo && <span className="text-ink-faint">{commit.repo}: </span>}
                {commit.subject}
              </span>
              <span className="shrink-0 text-ink-faint">
                {commit.author} · {timeAgo(commit.date)}
              </span>
            </li>
          ))}
          {item.count > item.commits.length && <li className="text-[11px] text-ink-faint">and {item.count - item.commits.length} more</li>}
        </ul>
      )}
    </div>
  );
}
