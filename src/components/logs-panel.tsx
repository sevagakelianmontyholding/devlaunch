"use client";

import { RefreshCw, SquareTerminal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Card, CardTitle, IconButton, Spinner } from "./ui";

export function LogsPanel({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const [logs, setLogs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/logs`, { cache: "no-store" });
      const body = (await response.json()) as { logs?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Logs are unavailable");
      setLogs(body.logs ?? "");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Logs are unavailable");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [enabled, load]);

  if (!enabled) return null;

  return (
    <Card>
      <CardTitle
        icon={<SquareTerminal className="size-4" />}
        aside={
          <IconButton label="Refresh logs" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          </IconButton>
        }
      >
        Compose logs
      </CardTitle>
      <div className="max-h-[420px] overflow-auto rounded-lg border border-line bg-bg p-3">
        {loading && logs === null ? (
          <Spinner label="Loading logs…" />
        ) : error ? (
          <p className="text-[12px] text-danger">{error}</p>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-ink-dim">{logs}</pre>
        )}
      </div>
    </Card>
  );
}
