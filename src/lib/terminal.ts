import { existsSync } from "node:fs";
import { db } from "./db";
import { run, UserError } from "./shell";
import type { TerminalApp, TerminalSettings } from "./types";

// Known terminal apps: how to find them and how to open a folder in them.
const apps: Record<Exclude<TerminalApp, "custom">, { label: string; paths: string[]; open: (folder: string) => [string, string[]]; note?: string }> = {
  terminal: {
    label: "Terminal",
    paths: ["/System/Applications/Utilities/Terminal.app", "/Applications/Utilities/Terminal.app"],
    open: (folder) => ["open", ["-a", "Terminal", folder]],
  },
  iterm: { label: "iTerm2", paths: ["/Applications/iTerm.app"], open: (folder) => ["open", ["-a", "iTerm", folder]] },
  warp: { label: "Warp", paths: ["/Applications/Warp.app"], open: (folder) => ["open", ["-a", "Warp", folder]] },
  ghostty: {
    label: "Ghostty",
    paths: ["/Applications/Ghostty.app"],
    open: (folder) => ["open", ["-na", "Ghostty", "--args", `--working-directory=${folder}`]],
  },
  kitty: { label: "kitty", paths: ["/Applications/kitty.app"], open: (folder) => ["open", ["-na", "kitty", "--args", "--directory", folder]] },
  alacritty: { label: "Alacritty", paths: ["/Applications/Alacritty.app"], open: (folder) => ["open", ["-na", "Alacritty", "--args", "--working-directory", folder]] },
  termius: {
    label: "Termius",
    paths: ["/Applications/Termius.app"],
    open: () => ["open", ["-a", "Termius"]],
    note: "Termius cannot be told which folder to open; it just launches.",
  },
};

function setting(key: string) {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getTerminalSettings(): TerminalSettings {
  const installed = (Object.keys(apps) as Array<Exclude<TerminalApp, "custom">>)
    .filter((id) => apps[id].paths.some((candidate) => existsSync(candidate)))
    .map((id) => ({ id, label: apps[id].label, note: apps[id].note ?? null }));
  const stored = setting("terminal.app") as TerminalApp | null;
  const app: TerminalApp = stored && (stored === "custom" || installed.some((item) => item.id === stored)) ? stored : "terminal";
  return { app, customCommand: setting("terminal.command") ?? "", installed };
}

export function saveTerminalSettings(app: TerminalApp, customCommand: string) {
  if (app !== "custom" && !apps[app]) throw new UserError("Choose a terminal app");
  const command = customCommand.trim();
  if (app === "custom" && !command.includes("{path}")) throw new UserError("The custom command must contain {path}");
  const upsert = db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  upsert.run("terminal.app", app);
  upsert.run("terminal.command", command);
  return getTerminalSettings();
}

export async function openFolderInTerminal(folder: string) {
  const settings = getTerminalSettings();
  if (settings.app === "custom") {
    const command = settings.customCommand.replaceAll("{path}", `'${folder.replaceAll("'", "'\\''")}'`);
    await run("/bin/zsh", ["-lc", command], { timeoutMs: 15_000 });
    return;
  }
  const [command, args] = apps[settings.app].open(folder);
  await run(command, args, { timeoutMs: 15_000 });
}
