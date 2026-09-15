"use client";

import { Play, RefreshCw, ScrollText, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { followLogs, getServerContainers, stopAction } from "@/actions";
import type { LocalRun, ServerContainer } from "@/lib/types";
import { useStatus } from "./status-provider";
import { TerminalView } from "./terminal-view";
import { Button, Card, CardTitle, Dot, IconButton, Select, Spinner, cx } from "./ui";

// Follow / Stop for one container's logs, streamed into a terminal panel.
// Used on the Servers page (per container) and inside ServerLogsCard.
export function LogFollower({ projectId, serverId, container, onClose, autoStart = true }: { projectId: string | null; serverId: string; container: string; onClose?: () => void; autoStart?: boolean }) {
  const { notify } = useStatus();
  const [tail, setTail] = useState("200");
  const [run, setRun] = useState<LocalRun | null>(null);
  const [busy, setBusy] = useState(false);
  const following = run?.status === "running";
  // The unmount cleanup below runs once, so it reads the latest run from a ref.
  const runRef = useRef<LocalRun | null>(null);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const follow = useCallback(async (lines: number) => {
    setBusy(true);
    const result = await followLogs(projectId, serverId, container, lines);
    setBusy(false);
    if (!result.ok) return notify("error", result.error);
    setRun(result.data);
  }, [projectId, serverId, container, notify]);

  // Start straight away when opened from a container row.
  useEffect(() => {
    if (!autoStart) return;
    const timer = setTimeout(() => void follow(200), 0);
    return () => clearTimeout(timer);
  }, [autoStart, follow]);

  // Stop the stream when the panel goes away.
  useEffect(() => {
    return () => {
      const current = runRef.current;
      if (current?.status === "running") void stopAction(current.id);
    };
  }, []);

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

  const stop = async () => {
    if (!run) return;
    const result = await stopAction(run.id);
    if (!result.ok) notify("error", result.error);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[12px]">
          <Dot tone={following ? "success" : "muted"} pulse={following} />
          <span className="font-mono">{container}</span>
          <span className="text-ink-faint">{following ? "· live" : run ? "· stopped" : ""}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select value={tail} onChange={(event) => setTail(event.target.value)} disabled={following} className="w-auto">
            <option value="200">last 200 lines</option>
            <option value="1000">last 1000 lines</option>
            <option value="5000">last 5000 lines</option>
          </Select>
          {following ? (
            <Button size="sm" variant="danger" icon={<Square className="size-3" fill="currentColor" />} onClick={() => void stop()} className="shrink-0 whitespace-nowrap">
              Stop
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} onClick={() => void follow(Number(tail))} busy={busy} className="shrink-0 whitespace-nowrap">
              {run ? "Follow again" : "Follow"}
            </Button>
          )}
          {onClose && (
            <IconButton label="Close logs" onClick={onClose} className="size-7">
              <X className="size-3.5" />
            </IconButton>
          )}
        </div>
      </div>
      {run && <TerminalView runId={run.id} rows={22} interactive={false} className="mt-2" />}
    </div>
  );
}

// Container picker plus follower, for the project page.
export function ServerLogsCard({ id, projectId, serverId, serverName, hint }: { id?: string; projectId: string; serverId: string; serverName: string; hint: string | null }) {
  const [containers, setContainers] = useState<ServerContainer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [container, setContainer] = useState("");
  const [open, setOpen] = useState(false);

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
      const guess = hint ? result.data.find((item) => item.running && (item.name.includes(hint) || item.image.includes(hint))) : null;
      return (guess ?? result.data.find((item) => item.running) ?? result.data[0])?.name ?? "";
    });
  }, [serverId, hint]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <Card>
      <div id={id} className="-mt-24 pt-24" aria-hidden="true" />
      <CardTitle
        icon={<ScrollText className="size-4" />}
        aside={
          <IconButton label="Refresh container list" onClick={() => void load()} disabled={containers === null}>
            <RefreshCw className={cx("size-3.5", containers === null && "animate-spin")} />
          </IconButton>
        }
      >
        Server logs · {serverName}
      </CardTitle>
      {containers === null ? (
        <Spinner label={`Listing containers on ${serverName}…`} />
      ) : error ? (
        <p className="text-[12px] text-danger">{error}</p>
      ) : containers.length === 0 ? (
        <p className="text-[12px] text-ink-faint">No containers on {serverName}.</p>
      ) : open ? (
        <LogFollower key={container} projectId={projectId} serverId={serverId} container={container} onClose={() => setOpen(false)} autoStart />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={container} onChange={(event) => setContainer(event.target.value)} className="w-auto min-w-[220px] flex-1">
            {containers.map((item) => (
              <option key={item.name} value={item.name}>
                {item.running ? "● " : "○ "}
                {item.name} · {item.status}
              </option>
            ))}
          </Select>
          <Button variant="primary" icon={<Play className="size-3.5" />} onClick={() => setOpen(true)} disabled={!container}>
            Follow
          </Button>
        </div>
      )}
    </Card>
  );
}
