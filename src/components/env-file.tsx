"use client";

import { Eye, FileKey2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getEnvFile, saveEnvFile } from "@/actions";
import { parseEnvFile } from "@/lib/dockerfile";
import type { Deployment, EnvFile } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Dialog, IconButton, Spinner, Textarea } from "./ui";

// The deployment's environment file, read from and written to the server so
// everyone deploying the project works on the same file. Contents stay
// hidden until asked for, since they usually hold secrets.
export function EnvFileEditor({ deployment, autoEdit = false, onCancel, reloadSignal = 0 }: { deployment: Deployment; autoEdit?: boolean; onCancel?: () => void; reloadSignal?: number }) {
  const { notify } = useStatus();
  const [file, setFile] = useState<EnvFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(autoEdit);
  const [saving, setSaving] = useState(false);
  const target = `${deployment.remotePath.replace(/\/$/, "")}/${deployment.envPath}`;

  const load = useCallback(async () => {
    setFile(null);
    setError(null);
    const result = await getEnvFile(deployment.id);
    if (!result.ok) return setError(result.error);
    setFile(result.data);
    setDraft(result.data.content);
  }, [deployment.id]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, reloadSignal]);

  const save = async () => {
    setSaving(true);
    const result = await saveEnvFile(deployment.id, draft);
    setSaving(false);
    if (!result.ok) return notify("error", result.error);
    setFile(result.data);
    setDraft(result.data.content);
    if (onCancel) onCancel();
    else setEditing(false);
    notify("success", `Saved ${deployment.envPath} on ${deployment.serverName}`);
  };

  const names = file ? parseEnvFile(file.content).map((item) => item.name) : [];
  const dirty = file !== null && draft !== file.content;

  return (
    <div>
      <p className="mb-2 break-all font-mono text-[11px] text-ink-dim">
        {deployment.serverName}:{target}
      </p>
      {error ? (
        <p className="text-[12px] text-danger">{error}</p>
      ) : file === null ? (
        <Spinner label={`Reading from ${deployment.serverName}…`} />
      ) : editing ? (
        <>
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={autoEdit ? 16 : 12} spellCheck={false} placeholder={"NODE_ENV=production\nAPI_URL=https://api.example.com"} className="font-mono text-[12px]" />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(file.content);
                if (onCancel) onCancel();
                else setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} busy={saving} disabled={!dirty && file.exists}>
              {file.exists ? "Save to server" : "Create on server"}
            </Button>
          </div>
        </>
      ) : (
        <>
          {!file.exists ? (
            <p className="text-[12px] text-ink-faint">No {deployment.envPath} on {deployment.serverName} yet.</p>
          ) : names.length === 0 ? (
            <p className="text-[12px] text-ink-faint">The file is empty.</p>
          ) : (
            <p className="text-[12px]">
              {names.length} variable{names.length === 1 ? "" : "s"}: <span className="font-mono text-[11px] text-ink-dim">{names.join(", ")}</span>
            </p>
          )}
          <p className="mt-2 text-[11px] leading-4 text-ink-faint">
            The container reads it when it starts{deployment.mode === "image" ? ", and image builds get its values too (no Dockerfile changes needed)" : ""}. Anyone deploying this project sees this same file.
          </p>
          <Button size="sm" variant="ghost" icon={<Eye className="size-3.5" />} onClick={() => setEditing(true)} className="mt-2">
            {file.exists ? "Show and edit" : "Create"}
          </Button>
        </>
      )}
    </div>
  );
}

// Card for the deployment page.
export function EnvFileCard({ deployment }: { deployment: Deployment }) {
  const [reloadSignal, setReloadSignal] = useState(0);
  return (
    <Card>
      <CardTitle
        icon={<FileKey2 className="size-4" />}
        aside={
          <IconButton label="Reload from the server" onClick={() => setReloadSignal((n) => n + 1)}>
            <RefreshCw className="size-3.5" />
          </IconButton>
        }
      >
        Environment file
      </CardTitle>
      <EnvFileEditor deployment={deployment} reloadSignal={reloadSignal} />
    </Card>
  );
}

// Dialog for the project page: opens straight into the editor.
export function EnvFileDialog({ deployment, onClose }: { deployment: Deployment; onClose: () => void }) {
  return (
    <Dialog title={`Environment file · ${deployment.name}`} description={`Read from and saved to ${deployment.serverName}. Everyone deploying this project sees this same file.`} onClose={onClose} width="max-w-[640px]">
      <EnvFileEditor deployment={deployment} autoEdit onCancel={onClose} />
    </Dialog>
  );
}
