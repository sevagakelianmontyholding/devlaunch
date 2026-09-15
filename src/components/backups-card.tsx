"use client";

import { DatabaseBackup, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { backupNow, getBackups, removeBackup, restoreFromBackup } from "@/actions";
import { formatBytes } from "@/lib/format";
import type { BackupInfo } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Confirm, IconButton, Spinner, timeAgo } from "./ui";

export function BackupsCard() {
  const { notify } = useStatus();
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BackupInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const load = useCallback(async () => setBackups(await getBackups()), []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const backup = async () => {
    setBusy("now");
    const result = await backupNow();
    setBusy(null);
    if (!result.ok) return notify("error", result.error);
    notify("success", `Backed up (${formatBytes(result.data.size)})`);
    void load();
  };

  const restore = async (item: BackupInfo) => {
    setConfirmRestore(null);
    setBusy(item.file);
    const result = await restoreFromBackup(item.file);
    if (!result.ok) {
      setBusy(null);
      return notify("error", result.error);
    }
    setRestarting(true);
    setTimeout(() => window.location.reload(), 7000);
  };

  const remove = async (file: string) => {
    setConfirmDelete(null);
    const result = await removeBackup(file);
    if (!result.ok) return notify("error", result.error);
    void load();
  };

  const latest = backups?.[0];

  return (
    <Card>
      <CardTitle
        icon={<DatabaseBackup className="size-4" />}
        aside={
          <Button size="sm" onClick={() => void backup()} busy={busy === "now"} disabled={restarting}>
            Back up now
          </Button>
        }
      >
        Backups
      </CardTitle>
      <p className="mb-3 text-[12px] text-ink-dim">
        The database (projects, servers, deployments, actions, history) is copied once a day and kept for 30 days. SSH keys and the encryption secret never change, so they are not included.
      </p>
      {restarting ? (
        <Spinner label="Restoring and restarting DevLaunch… this page reloads in a few seconds." />
      ) : backups === null ? (
        <Spinner label="Loading…" />
      ) : backups.length === 0 ? (
        <p className="text-[12px] text-ink-faint">No backups yet. The first one is taken a few seconds after DevLaunch starts.</p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-ink-faint">
            Latest: {timeAgo(latest!.createdAt)} · {backups.length} kept
          </p>
          <div className="max-h-64 divide-y divide-line overflow-y-auto pr-1">
            {backups.map((item) => (
              <div key={item.file} className="py-2">
                <div className="flex items-center gap-2 text-[12px]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      <span className="text-ink-faint"> · {item.reason} · {formatBytes(item.size)}</span>
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirmRestore(item)} disabled={busy !== null}>
                    Restore
                  </Button>
                  <IconButton label="Delete backup" onClick={() => setConfirmDelete(item.file)} className="size-7 hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
                {confirmRestore?.file === item.file && (
                  <div className="mt-2">
                    <Confirm
                      title={`Restore the backup from ${new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}?`}
                      body="Everything changed since then (projects, deployments, run history, settings) goes back to that state. A copy of the current database is kept first. DevLaunch restarts, then this page reloads."
                      confirmLabel="Restore and restart"
                      onCancel={() => setConfirmRestore(null)}
                      onConfirm={() => void restore(item)}
                    />
                  </div>
                )}
                {confirmDelete === item.file && (
                  <div className="mt-2">
                    <Confirm title="Delete this backup?" body="It cannot be recovered." confirmLabel="Delete" onCancel={() => setConfirmDelete(null)} onConfirm={() => void remove(item.file)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
