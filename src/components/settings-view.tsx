"use client";

import { KeyRound, Pencil, Plus, Server, Trash2, Wifi, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { checkServer, getServers, removeServer, saveServer } from "@/actions";
import type { Server as DeployServer } from "@/lib/types";
import { PageHeader } from "./app-shell";
import { AccountCard } from "./account-card";
import { TerminalCard } from "./terminal-card";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Confirm, Dialog, ErrorNote, Field, IconButton, Input, Spinner, Textarea, cx } from "./ui";

export function SettingsView() {
  const { status, online, notify } = useStatus();
  const [servers, setServers] = useState<DeployServer[] | null>(null);
  const [editing, setEditing] = useState<DeployServer | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => setServers(await getServers()), []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

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
      <PageHeader title="Settings" subtitle="Deploy targets and how DevLaunch runs on this Mac." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Card>
          <CardTitle
            icon={<Server className="size-4" />}
            aside={
              <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
                Add server
              </Button>
            }
          >
            Deploy servers
          </CardTitle>
          <p className="mb-3 text-[12px] text-ink-dim">VPS targets for one-click deployments. Keys never leave this Mac; they are only used for SSH.</p>

          {servers === null ? (
            <Spinner label="Loading…" />
          ) : servers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[12px] text-ink-faint">No servers yet. Add a VPS with its SSH key to enable deployments.</p>
          ) : (
            <div className="space-y-2">
              {servers.map((server) => (
                <div key={server.id} className="rounded-lg border border-line bg-bg p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{server.name}</span>
                    <span className="font-mono text-[11px] text-ink-dim">
                      {server.username}@{server.host}:{server.port}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button size="sm" icon={<Wifi className="size-3.5" />} onClick={() => void test(server)} busy={testing === server.id}>
                        Test
                      </Button>
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
                      <Confirm title="Remove this server?" body="Its stored SSH key is deleted from this Mac." confirmLabel="Remove" onCancel={() => setConfirmDelete(null)} onConfirm={() => void remove(server.id)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
        <AccountCard />
        <TerminalCard />
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
              <dd className="truncate font-mono text-[11px]" title={status.dataDir}>
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

      {editing && (
        <ServerDialog
          server={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(server) => {
            setEditing(null);
            notify("success", `${server.name} saved`);
            void load();
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
