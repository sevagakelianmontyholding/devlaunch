"use client";

import { Zap } from "lucide-react";
import { PageHeader } from "./app-shell";
import { AccountCard } from "./account-card";
import { NotificationsCard } from "./notifications-card";
import { TemplatesCard } from "./templates-card";
import { TerminalCard } from "./terminal-card";
import { ThemeCard } from "./theme";
import { useStatus } from "./status-provider";
import { Card, CardTitle } from "./ui";

export function SettingsView() {
  const { status, online } = useStatus();

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your account and how DevLaunch runs on this Mac." />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <AccountCard />
          <NotificationsCard />
          <TemplatesCard />
        </div>
        <div className="space-y-4">
          <TerminalCard />
          <ThemeCard />
          <Card>
          <CardTitle icon={<Zap className="size-4" />}>This Mac</CardTitle>
          <dl className="space-y-2 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-dim">App</dt>
              <dd className={online ? "text-success" : "text-danger"}>{online ? "Online" : "Unreachable"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-dim">Docker</dt>
              <dd className={status.dockerAvailable ? "text-success" : "text-warn"}>{status.dockerAvailable ? "Ready" : "Not running"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-dim">Projects</dt>
              <dd>{status.projects.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-ink-dim">Data folder</dt>
              <dd className="w-0 flex-1 truncate text-right font-mono text-[11px]" title={status.dataDir}>
                {status.dataDir}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-dim">Last check</dt>
              <dd>{new Date(status.checkedAt).toLocaleTimeString()}</dd>
            </div>
          </dl>
        </Card>
        </div>
      </div>

    </div>
  );
}
