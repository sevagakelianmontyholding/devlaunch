"use client";

import { Cpu, HardDrive, KeyRound, Lock, Pencil, Plus, RefreshCw, Server, TerminalSquare, Trash2, Wifi } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { checkServer, getServerHealth, getServers, openServerTerminal, removeServer, saveServer } from "@/actions";
import type { Server as DeployServer, ServerHealth } from "@/lib/types";
import { PageHeader } from "./app-shell";
import { useStatus } from "./status-provider";
import { Button, Card, Confirm, Dialog, Dot, Empty, ErrorNote, Field, IconButton, Input, Spinner, Textarea, cx } from "./ui";

export function ServersView() {
  const { notify, status } = useStatus();
  const [servers, setServers] = useState<DeployServer[] | null>(null);
  const [health, setHealth] = useState<Record<string, ServerHealth>>({});
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState<DeployServer | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => setServers(await getServers()), []);
  const loadHealth = useCallback(async () => {
    setChecking(true);
    const list = await getServerHealth();
    setHealth(Object.fromEntries(list.map((item) => [item.id, item])));
    setChecking(false);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      void loadHealth();
    }, 0);
    return () => clearTimeout(timer);
  }, [load, loadHealth]);

  const test = async (server: DeployServer) => {
    setTesting(server.id);
    setTestResult(null);
    const result = await checkServer(server.id);
    setTestResult({ id: server.id, ok: result.ok, text: result.ok ? result.data : result.error });
    setTesting(null);
  };

  const remove = async (id: string) => {
    const result = await removeServer(id);
    if (!result.ok) return notify("error", result.error);
    setConfirmDelete(null);
    notify("success", `${result.data.name} removed`);
    void load();
  };

  return (
    <div>
      <PageHeader
        title="Servers"
        subtitle="VPS targets for deployments, checked over SSH. Keys never leave this Mac."
        actions={
          <>
            <Button icon={<RefreshCw className={cx("size-4", checking && "animate-spin")} />} onClick={() => void loadHealth()} disabled={checking}>
              Re-check
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
              Add server
            </Button>
          </>
        }
      />

      {servers === null ? (
        <Spinner label="Loading…" />
      ) : servers.length === 0 ? (
        <Empty icon={<Server className="size-4" />} title="No servers yet" hint="Add a VPS with its SSH key to enable deployments." action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Add server</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {servers.map((server) => {
            const info = health[server.id];
            return (
              <Card key={server.id} className="flex flex-col">
                <div className="flex items-center gap-2">
                  <Server className="size-4 text-accent" />
                  <span className="text-[13px] font-semibold">{server.name}</span>
                  {info && <Dot tone={info.reachable ? "success" : "danger"} />}
                  <span className="ml-auto truncate font-mono text-[11px] text-ink-dim">
                    {server.username}@{server.host}:{server.port}
                  </span>
                </div>

                {!info ? (
                  <div className="mt-3"><Spinner label="Checking over SSH…" /></div>
                ) : info.reachable ? (
                  <>
                    {info.lock && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/[0.07] px-3 py-2 text-[11px]">
                        <Lock className="size-3.5 shrink-0 text-warn" />
                        <span className="text-warn">Deploy in progress</span>
                        <span className="truncate text-ink-dim">
                          {info.lock.project} · {info.lock.deployment}{info.lock.user ? ` by ${info.lock.user}` : ""} from {info.lock.machine}
                        </span>
                      </div>
                    )}
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                      <div className="flex items-center gap-1.5 text-ink-dim"><Cpu className="size-3.5" /> {info.arch ?? "?"}</div>
                      <div className="text-ink-dim">Docker {info.dockerVersion ?? "?"}</div>
                      {info.disk && (
                        <div className="col-span-2">
                          <div className="flex items-center gap-1.5 text-ink-dim"><HardDrive className="size-3.5" /> Disk {info.disk.used} of {info.disk.total}
                            <span className={cx("ml-auto font-medium", info.disk.percent >= 90 ? "text-danger" : info.disk.percent >= 75 ? "text-warn" : "text-success")}>{info.disk.percent}%</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                            <div className={cx("h-full rounded-full", info.disk.percent >= 90 ? "bg-danger" : info.disk.percent >= 75 ? "bg-warn" : "bg-accent")} style={{ width: `${info.disk.percent}%` }} />
                          </div>
                        </div>
                      )}
                      {info.memory && <div className="text-ink-dim">Memory {info.memory.used} of {info.memory.total}</div>}
                      {info.uptime && <div className="text-right text-ink-faint">up {info.uptime}</div>}
                    </dl>
                    <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-[11px] text-ink-faint">
                      <span>Running containers</span>
                      <span>{info.containers.length}</span>
                    </div>
                    <div className="mt-1 max-h-48 divide-y divide-line overflow-y-auto pr-1">
                      {info.containers.length === 0 && <p className="py-1.5 text-[11px] text-ink-faint">No running containers.</p>}
                      {info.containers.map((container) => (
                        <div key={container.name} className="flex items-center gap-2 py-1.5 text-[11px]">
                          <Dot tone="success" />
                          <span className="truncate font-mono">{container.name}</span>
                          <span className="ml-auto truncate text-ink-faint">{container.status}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-[12px] text-danger">
                    {info.error}
                    {status.vpn.state === "disconnected" && <span className="block text-ink-dim">Not reachable from here — connect the office VPN (dashboard or Settings → VPN).</span>}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-1 border-t border-line pt-3">
                  <Button size="sm" icon={<Wifi className="size-3.5" />} onClick={() => void test(server)} busy={testing === server.id}>
                    Test
                  </Button>
                  <Button
                    size="sm"
                    icon={<TerminalSquare className="size-3.5" />}
                    title="Open an SSH session in your terminal"
                    onClick={async () => {
                      const result = await openServerTerminal(server.id);
                      if (!result.ok) notify("error", result.error);
                    }}
                  >
                    SSH
                  </Button>
                  <div className="ml-auto flex items-center gap-1">
                    <IconButton label="Edit server" onClick={() => setEditing(server)}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton label="Remove server" onClick={() => setConfirmDelete(server.id)} className="hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                </div>
                {testResult?.id === server.id && (
                  <pre className={cx("mt-2 whitespace-pre-wrap break-words rounded-lg border px-3 py-2 font-mono text-[11px] leading-4", testResult.ok ? "border-success/20 bg-success/[0.06] text-success" : "border-danger/20 bg-danger/[0.08] text-danger")}>
                    {testResult.text}
                  </pre>
                )}
                {confirmDelete === server.id && (
                  <div className="mt-2">
                    <Confirm title="Remove this server?" body="Its stored SSH key is deleted from this Mac. Deployments using it must be removed first." confirmLabel="Remove" onCancel={() => setConfirmDelete(null)} onConfirm={() => void remove(server.id)} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <ServerDialog
          server={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(server) => {
            setEditing(null);
            notify("success", `${server.name} saved`);
            void load();
            void loadHealth();
          }}
        />
      )}
    </div>
  );
}

function ServerDialog({ server, onClose, onSaved }: { server: DeployServer | null; onClose: () => void; onSaved: (server: DeployServer) => void }) {
  const [name, setName] = useState(server?.name ?? "");
  const [host, setHost] = useState(server?.host ?? "");
  const [port, setPort] = useState(String(server?.port ?? 22));
  const [username, setUsername] = useState(server?.username ?? "");
  const [privateKey, setPrivateKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveServer(server?.id ?? null, { name, host, port: Number(port) || 22, username, privateKey });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onSaved(result.data);
  };

  return (
    <Dialog title={server ? `Edit ${server.name}` : "Add a deploy server"} onClose={onClose} width="max-w-[640px]">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Production VPS" autoFocus />
          </Field>
          <Field label="SSH user">
            <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="deploy" className="font-mono text-[12px]" />
          </Field>
          <Field label="Host or IP">
            <Input value={host} onChange={(event) => setHost(event.target.value)} placeholder="203.0.113.10" className="font-mono text-[12px]" />
          </Field>
          <Field label="SSH port">
            <Input value={port} onChange={(event) => setPort(event.target.value)} inputMode="numeric" placeholder="22" className="font-mono text-[12px]" />
          </Field>
        </div>
        <Field label="Private SSH key" hint={server ? "leave empty to keep the current key" : undefined}>
          <Textarea value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} rows={6} spellCheck={false} placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----"} className="font-mono text-[11px]" />
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
            <KeyRound className="size-3" /> Stored in the local data folder with owner-only permissions.
          </p>
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={saving} disabled={!name.trim() || !host.trim() || !username.trim() || (!server && !privateKey.trim())}>
            {server ? "Save" : "Add server"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
