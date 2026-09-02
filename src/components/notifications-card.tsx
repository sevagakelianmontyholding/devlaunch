"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { getNotifications, testNotification, updateNotifications } from "@/actions";
import type { NotificationSettings } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, ErrorNote, Field, Input } from "./ui";

export function NotificationsCard() {
  const { notify } = useStatus();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [draft, setDraft] = useState<NotificationSettings>({ desktop: true, webhookUrl: "" });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const current = await getNotifications();
      setSettings(current);
      setDraft(current);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const dirty = settings !== null && (settings.desktop !== draft.desktop || settings.webhookUrl !== draft.webhookUrl);

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await updateNotifications(draft);
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setSettings(result.data);
    notify("success", "Notification settings saved");
  };

  const test = async () => {
    setTesting(true);
    const result = await testNotification();
    setTesting(false);
    notify(result.ok ? "success" : "error", result.ok ? "Test notification sent" : result.error);
  };

  return (
    <Card>
      <CardTitle icon={<Bell className="size-4" />}>Notifications</CardTitle>
      <p className="mb-3 text-[12px] text-ink-dim">Get told when a deployment finishes or fails, even when DevLaunch is in another tab.</p>
      <label className="flex items-center gap-2 text-[12px]">
        <input type="checkbox" checked={draft.desktop} onChange={(event) => setDraft({ ...draft, desktop: event.target.checked })} className="accent-[#2dd4bf]" />
        macOS notification
      </label>
      <Field label="Webhook URL" hint="optional — Slack or Discord incoming webhook" className="mt-3">
        <Input value={draft.webhookUrl} onChange={(event) => setDraft({ ...draft, webhookUrl: event.target.value })} placeholder="https://hooks.slack.com/services/…" className="font-mono text-[11px]" />
      </Field>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => void test()} busy={testing} disabled={dirty}>
          Send test
        </Button>
        {dirty && (
          <Button size="sm" variant="primary" onClick={() => void save()} busy={saving}>
            Save
          </Button>
        )}
      </div>
    </Card>
  );
}
