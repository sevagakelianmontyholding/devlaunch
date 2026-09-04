import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir, db } from "./db";
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

// Runs a shell script in a new window of the preferred terminal. Terminal,
// iTerm2 and Warp open a .command file; the others take the command as an
// argument. Termius and custom commands fall back to Terminal.
export async function openScriptInTerminal(name: string, script: string) {
  const dir = path.join(dataDir, "terminal");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${name.replace(/[^A-Za-z0-9._-]+/g, "-")}-${createHash("sha1").update(script).digest("hex").slice(0, 8)}.command`);
  writeFileSync(file, `#!/bin/zsh\n${script}\n`);
  chmodSync(file, 0o700);
  const app = getTerminalSettings().app;
  const args: Record<string, [string, string[]]> = {
    terminal: ["open", ["-a", "Terminal", file]],
    iterm: ["open", ["-a", "iTerm", file]],
    warp: ["open", ["-a", "Warp", file]],
    ghostty: ["open", ["-na", "Ghostty", "--args", "-e", file]],
    kitty: ["open", ["-na", "kitty", "--args", file]],
    alacritty: ["open", ["-na", "Alacritty", "--args", "-e", file]],
  };
  const [command, commandArgs] = args[app] ?? args.terminal!;
  await run(command, commandArgs, { timeoutMs: 15_000 });
}
