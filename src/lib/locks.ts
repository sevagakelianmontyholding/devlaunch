import { db } from "./db";
import { parseLock, sshArgs, writeKey, type ServerRow } from "./servers";
import { run } from "./shell";
import type { DeployLock, ServerLock } from "./types";

// Keeps a cached view of every server's ~/.devlaunch/deploy.lock so cards and
// the dashboard can show who is deploying without an SSH round-trip per poll.
const INTERVAL_MS = 60_000;
const LOCK_FILE = "$HOME/.devlaunch/deploy.lock";

const globalState = globalThis as unknown as { devlaunchLocks?: Map<string, DeployLock | null>; devlaunchLockTimer?: ReturnType<typeof setInterval> };
const locks = (globalState.devlaunchLocks ??= new Map());

async function refreshOne(server: ServerRow) {
  try {
    await writeKey(server.id, server.private_key);
    const { stdout } = await run("ssh", [...sshArgs(server), `cat ${LOCK_FILE} 2>/dev/null || true`], { timeoutMs: 25_000 });
    locks.set(server.id, parseLock(stdout));
  } catch {
    // Unreachable: keep whatever we knew.
  }
}

async function refreshAll() {
  const servers = db().prepare("SELECT * FROM servers").all() as ServerRow[];
  for (const id of [...locks.keys()]) if (!servers.some((server) => server.id === id)) locks.delete(id);
  await Promise.all(servers.map(refreshOne));
}

export function ensureLockMonitor() {
  if (globalState.devlaunchLockTimer) return;
  globalState.devlaunchLockTimer = setInterval(() => void refreshAll(), INTERVAL_MS);
  void refreshAll();
}

// Called by the deploy engine when it writes or removes a lock itself, so the
// UI reflects it immediately instead of at the next minute.
export function rememberLock(serverId: string, lock: DeployLock | null) {
  locks.set(serverId, lock);
}

export function heldLocks(): Record<string, ServerLock> {
  const result: Record<string, ServerLock> = {};
  const servers = db().prepare("SELECT id, name FROM servers").all() as Array<{ id: string; name: string }>;
  for (const server of servers) {
    const lock = locks.get(server.id);
    if (lock && parseLock(JSON.stringify(lock))) result[server.id] = { serverId: server.id, serverName: server.name, lock };
  }
  return result;
}
