"use client";

import { Play, RefreshCw, ScrollText, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { followLogs, getServerContainers, stopAction } from "@/actions";
import type { LocalRun, ServerContainer } from "@/lib/types";
import { useStatus } from "./status-provider";
import { TerminalView } from "./terminal-view";
import { Button, Card, CardTitle, Dot, IconButton, Select, Spinner, cx } from "./ui";

// Live `docker logs -f` from a container on the deployment's server.
export function ServerLogsCard({ projectId, serverId, serverName, hint }: { projectId: string; serverId: string; serverName: string; hint: string | null }) {
  const { notify } = useStatus();
  const [containers, setContainers] = useState<ServerContainer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [container, setContainer] = useState("");
  const [tail, setTail] = useState("200");
  const [run, setRun] = useState<LocalRun | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const result = await getServerContainers(serverId);
    if (!result.ok) {
      setContainers([]);
      setError(result.error);
      return;
    }
    setContainers(result.data);
    setContainer((current) => {
      if (current && result.data.some((item) => item.name === current)) return current;
      // Prefer the container that looks like this deployment's own.
      const guess = hint ? result.data.find((item) => item.running && (item.name.includes(hint) || item.image.includes(hint))) : null;
      return (guess ?? result.data.find((item) => item.running) ?? result.data[0])?.name ?? "";
    });
  }, [serverId, hint]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  // Keep the run's state current so Stop/Follow flip when it ends by itself.
  useEffect(() => {
    if (!run || run.status !== "running") return;
    const interval = setInterval(async () => {
      const response = await fetch(`/api/local-runs/${run.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const { run: next } = (await response.json()) as { run: LocalRun };
      if (next.status !== "running") setRun(next);
    }, 3000);
    return () => clearInterval(interval);
  }, [run]);

  const follow = async () => {
    setBusy(true);
    const result = await followLogs(projectId, serverId, container, Number(tail));
    setBusy(false);
    if (!result.ok) return notify("error", result.error);
    setRun(result.data);
  };

  const stop = async () => {
    if (!run) return;
    const result = await stopAction(run.id);
    if (!result.ok) notify("error", result.error);
  };

  const following = run?.status === "running";

  return (
    <Card>
      <CardTitle
        icon={<ScrollText className="size-4" />}
        aside={
          <IconButton label="Refresh container list" onClick={() => void load()} disabled={containers === null}>
            <RefreshCw className={cx("size-3.5", containers === null && "animate-spin")} />
          </IconButton>
        }
      >
        Server logs
      </CardTitle>
      {containers === null ? (
        <Spinner label={`Listing containers on ${serverName}…`} />
      ) : error ? (
        <p className="text-[12px] text-danger">{error}</p>
      ) : containers.length === 0 ? (
        <p className="text-[12px] text-ink-faint">No containers on {serverName}.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={container} onChange={(event) => setContainer(event.target.value)} disabled={following} className="w-auto min-w-[220px] flex-1">
            {containers.map((item) => (
              <option key={item.name} value={item.name}>
                {item.running ? "● " : "○ "}
                {item.name} · {item.status}
              </option>
            ))}
          </Select>
          <Select value={tail} onChange={(event) => setTail(event.target.value)} disabled={following} className="w-auto">
            <option value="200">last 200 lines</option>
            <option value="1000">last 1000 lines</option>
            <option value="5000">last 5000 lines</option>
          </Select>
          {following ? (
            <Button variant="danger" icon={<Square className="size-3" fill="currentColor" />} onClick={() => void stop()}>
              Stop
            </Button>
          ) : (
            <Button variant="primary" icon={<Play className="size-3.5" />} onClick={() => void follow()} busy={busy} disabled={!container}>
              Follow
            </Button>
          )}
        </div>
      )}

      {run && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] text-ink-dim">
            <Dot tone={following ? "success" : "muted"} pulse={following} />
            {run.label}
            {following ? " · live" : " · stopped"}
          </div>
          <TerminalView runId={run.id} rows={22} interactive={false} />
        </div>
      )}
    </Card>
  );
}
