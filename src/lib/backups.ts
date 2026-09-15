import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";
import { dataDir, db } from "./db";
import { UserError } from "./shell";
import type { BackupInfo } from "./types";

// Nightly copies of the database (SQLite's online backup, so they are
// consistent even mid-write), kept for 30 days in data/backups. Keys and the
// secret stay where they are; they never change once created.
export const backupsDir = path.join(dataDir, "backups");
const KEEP_DAYS = 30;
const EVERY_MS = 24 * 60 * 60_000;
const CHECK_MS = 30 * 60_000;

function stamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function listBackups(): BackupInfo[] {
  if (!existsSync(backupsDir)) return [];
  return readdirSync(backupsDir)
    .filter((file) => file.endsWith(".sqlite"))
    .map((file) => {
      const info = statSync(path.join(backupsDir, file));
      return { file, size: info.size, createdAt: info.mtime.toISOString(), reason: file.includes("-before-restore") ? "before restore" : file.includes("-manual") ? "manual" : "nightly" };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createBackup(reason: "nightly" | "manual" | "before-restore" = "manual"): Promise<BackupInfo> {
  mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
  const suffix = reason === "nightly" ? "" : `-${reason}`;
  const file = `devlaunch-${stamp()}${suffix}.sqlite`;
  await db().backup(path.join(backupsDir, file));
  prune();
  const info = statSync(path.join(backupsDir, file));
  return { file, size: info.size, createdAt: info.mtime.toISOString(), reason: reason === "before-restore" ? "before restore" : reason };
}

function prune() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60_000;
  for (const backup of listBackups()) {
    if (new Date(backup.createdAt).getTime() < cutoff && backup.reason === "nightly") rmSync(path.join(backupsDir, backup.file), { force: true });
  }
}

export function deleteBackup(file: string) {
  if (!/^[A-Za-z0-9._-]+\.sqlite$/.test(file)) throw new UserError("Unknown backup");
  rmSync(path.join(backupsDir, file), { force: true });
}

// Copies the backup over the live database (a safety copy of the current one
// is taken first), then restarts the login service so every connection reopens.
export async function restoreBackup(file: string) {
  if (!/^[A-Za-z0-9._-]+\.sqlite$/.test(file)) throw new UserError("Unknown backup");
  const source = path.join(backupsDir, file);
  if (!existsSync(source)) throw new UserError("That backup no longer exists");
  await createBackup("before-restore");
  const backup = new Database(source, { readonly: true });
  try {
    if (!backup.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'").get()) throw new UserError("That file is not a DevLaunch database");
    await backup.backup(path.join(dataDir, "devlaunch.sqlite"));
  } finally {
    backup.close();
  }
  const child = spawn(process.execPath, [path.join(process.cwd(), "scripts", "service.mjs"), "install"], { cwd: process.cwd(), detached: true, stdio: "ignore", env: { ...process.env } });
  child.unref();
}

const globalState = globalThis as unknown as { devlaunchBackupTimer?: ReturnType<typeof setInterval> };

export function ensureBackups() {
  if (globalState.devlaunchBackupTimer) return;
  const check = () => {
    const latest = listBackups().find((backup) => backup.reason === "nightly");
    if (!latest || Date.now() - new Date(latest.createdAt).getTime() > EVERY_MS) void createBackup("nightly").catch(() => undefined);
  };
  globalState.devlaunchBackupTimer = setInterval(check, CHECK_MS);
  setTimeout(check, 5000);
}
