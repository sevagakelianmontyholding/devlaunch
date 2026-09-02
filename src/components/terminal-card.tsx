"use client";

import { TerminalSquare } from "lucide-react";
import { useState } from "react";
import { updateTerminalSettings } from "@/actions";
import type { TerminalApp } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, ErrorNote, Field, Input, Select } from "./ui";

export function TerminalCard() {
  const { status, refresh, notify } = useStatus();
  const [app, setApp] = useState<TerminalApp>(status.terminal.app);
  const [command, setCommand] = useState(status.terminal.customCommand);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = status.terminal.installed.find((item) => item.id === app);
  const dirty = app !== status.terminal.app || command !== status.terminal.customCommand;

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await updateTerminalSettings(app, command);
    setSaving(false);
    if (!result.ok) return setError(result.error);
    notify("success", "Terminal preference saved");
    await refresh();
  };

  return (
    <Card>
      <CardTitle icon={<TerminalSquare className="size-4" />}>Terminal</CardTitle>
      <p className="mb-3 text-[12px] text-ink-dim">Which app the Terminal button opens a project folder in.</p>
      <Field label="App">
        <Select value={app} onChange={(event) => setApp(event.target.value as TerminalApp)}>
          {status.terminal.installed.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
          <option value="custom">Custom command…</option>
        </Select>
      </Field>
      {selected?.note && <p className="mt-2 text-[11px] text-warn">{selected.note}</p>}
      {app === "custom" && (
        <Field label="Command" hint="{path} is replaced with the project folder" className="mt-3">
          <Input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="open -a iTerm {path}" className="font-mono text-[12px]" />
        </Field>
      )}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {dirty && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="primary" onClick={() => void save()} busy={saving}>
            Save
          </Button>
        </div>
      )}
    </Card>
  );
}
