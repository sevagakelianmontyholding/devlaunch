"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getTrash, purgeTrashedProject, restoreTrashedProject } from "@/actions";
import type { TrashedProject } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Confirm, IconButton, timeAgo } from "./ui";

// Projects removed in the last 30 days. Hidden entirely when there are none.
export function TrashCard() {
  const { status, refresh, notify } = useStatus();
  const [items, setItems] = useState<TrashedProject[] | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setItems(await getTrash()), []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, status.projects.length]);

  const restore = async (item: TrashedProject) => {
    setBusy(item.id);
    const result = await restoreTrashedProject(item.id);
    setBusy(null);
    if (!result.ok) return notify("error", result.error);
    notify("success", `${result.data.name} restored`);
    await refresh();
    void load();
  };

  const purge = async (id: string) => {
    setBusy(id);
    const result = await purgeTrashedProject(id);
    setBusy(null);
    setConfirmPurge(null);
    if (!result.ok) return notify("error", result.error);
    notify("success", `${result.data.name} deleted for good`);
    void load();
  };

  if (!items || items.length === 0) return null;

  return (
    <Card>
      <CardTitle icon={<Trash2 className="size-4" />}>Recently removed</CardTitle>
      <p className="mb-3 text-[12px] text-ink-dim">Removed projects stay here for 30 days with their deployments, actions and history.</p>
      <div className="divide-y divide-line">
        {items.map((item) => (
          <div key={item.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{item.name}</p>
                <p className="truncate text-[11px] text-ink-faint">
                  <span className="font-mono">{item.path.replace(/^\/Users\/[^/]+/, "~")}</span> · {item.deployments} deployment{item.deployments === 1 ? "" : "s"} · removed {timeAgo(item.deletedAt)} · gone {timeAgo(item.expiresAt).replace(" ago", "").replace(/^(\d+)([dh])$/, "in $1$2")}
                </p>
              </div>
              <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => void restore(item)} busy={busy === item.id}>
                Restore
              </Button>
              <IconButton label="Delete for good" onClick={() => setConfirmPurge(item.id)} className="hover:text-danger">
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
            {confirmPurge === item.id && (
              <div className="mt-2">
                <Confirm title={`Delete ${item.name} for good?`} body="Its deployments, actions and run history go with it. The folder on disk is not touched." confirmLabel="Delete" busy={busy === item.id} onCancel={() => setConfirmPurge(null)} onConfirm={() => void purge(item.id)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
