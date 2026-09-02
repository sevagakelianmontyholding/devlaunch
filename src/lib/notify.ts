import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./db";
import { run, UserError } from "./shell";
import { getSetting, setSetting } from "./settings";
import type { NotificationSettings } from "./types";

export function getNotificationSettings(): NotificationSettings {
  return {
    desktop: getSetting("notify.desktop") !== "off",
    webhookUrl: getSetting("notify.webhook") ?? "",
  };
}

export function saveNotificationSettings(input: NotificationSettings) {
  const url = input.webhookUrl.trim();
  if (url && !/^https:\/\//.test(url)) throw new UserError("The webhook URL must start with https://");
  setSetting("notify.desktop", input.desktop ? "on" : "off");
  setSetting("notify.webhook", url);
  return getNotificationSettings();
}

// Fire-and-forget: a macOS notification and/or a webhook POST. Never throws.
export async function notifyFinished(title: string, message: string, ok: boolean) {
  const settings = getNotificationSettings();
  if (settings.desktop) {
    const sound = ok ? "Glass" : "Basso";
    const notifierApp = path.join(dataDir, "DevLaunch Notifier.app");
    if (existsSync(notifierApp)) {
      // The bundled applet posts the notification so it carries the DevLaunch icon.
      const clean = (value: string) => value.replace(/[\r\n]+/g, " ");
      writeFileSync(path.join(dataDir, "notify.txt"), `${clean(title)}\n${clean(message)}\n${sound}\n`);
      run("open", ["-g", "-n", "-a", notifierApp], { timeoutMs: 10_000 }).catch(() => undefined);
    } else {
      const safe = (value: string) => value.replaceAll('"', "'");
      run("/usr/bin/osascript", ["-e", `display notification "${safe(message)}" with title "${safe(title)}" sound name "${sound}"`], { timeoutMs: 5000 }).catch(() => undefined);
    }
  }
  if (settings.webhookUrl) {
    const text = `${ok ? "✅" : "❌"} ${title} — ${message}`;
    fetch(settings.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `text` is what Slack expects, `content` is what Discord expects.
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  }
}

export async function sendTestNotification() {
  await notifyFinished("DevLaunch", "Notifications are working", true);
}
