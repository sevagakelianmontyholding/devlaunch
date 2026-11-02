import { db } from "./db";
import { parseLock, sshArgs, writeKey, type ServerRow } from "./servers";
import { run, shQuote } from "./shell";
import type { DeployLock, ServerLock, ShippedRecord } from "./types";

// Keeps a cached view of every server's ~/.devlaunch/deploy.lock so cards and
// the dashboard can show who is deploying without an SSH round-trip per poll.
// The same visit reads what is deployed there: the shipped records DevLaunch
// writes after each deploy (from any Mac) and the build time of each image
// deployment's image, for deploys that left no record.
const INTERVAL_MS = 60_000;
const LOCK_FILE = "$HOME/.devlaunch/deploy.lock";

const SHIPPED_DIR = "$HOME/.devlaunch/deployed";
const MARK = "__DEVLAUNCH__";

type Shipped = { records: Map<string, ShippedRecord>; images: Map<string, string> };
const globalState = globalThis as unknown as {
  devlaunchLocks?: Map<string, DeployLock | null>;
  devlaunchShipped?: Map<string, Shipped>;
  devlaunchLockTimer?: ReturnType<typeof setInterval>;
};
const locks = (globalState.devlaunchLocks ??= new Map());
const shipped = (globalState.devlaunchShipped ??= new Map());

async function refreshOne(server: ServerRow) {
  try {
    await writeKey(server.id, server.private_key);
    const images = (db().prepare("SELECT DISTINCT image_name || ':' || COALESCE(NULLIF(image_tag, ''), 'latest') AS ref FROM deployments WHERE server_id = ? AND mode = 'image' AND image_name IS NOT NULL").all(server.id) as Array<{ ref: string }>).map((row) => row.ref);
    const script = [
      `cat ${LOCK_FILE} 2>/dev/null; echo; echo ${MARK}`,
      `for f in ${SHIPPED_DIR}/*.json; do [ -f "$f" ] && cat "$f" && echo; done; echo ${MARK}`,
      ...images.map((ref) => `echo ${shQuote(ref)} $(docker image inspect --format '{{.Created}}' ${shQuote(ref)} 2>/dev/null)`),
      "true",
    ].join("; ");
    const { stdout } = await run("ssh", [...sshArgs(server), script], { timeoutMs: 25_000 });
    const [lockText = "", recordsText = "", imagesText = ""] = stdout.split(`${MARK}\n`);
    locks.set(server.id, parseLock(lockText));
    const state: Shipped = { records: new Map(), images: new Map() };
    for (const line of recordsText.split("\n")) {
      try {
        const record = JSON.parse(line) as ShippedRecord;
        if (record?.key && record.at) state.records.set(record.key, record);
      } catch {
        // Blank or foreign line.
      }
    }
    for (const line of imagesText.split("\n")) {
      const [ref, created] = line.trim().split(/\s+/);
      if (ref && created && !Number.isNaN(Date.parse(created))) state.images.set(ref, new Date(created).toISOString());
    }
    shipped.set(server.id, state);
  } catch {
    // Unreachable: keep whatever we knew.
  }
}

// What is known to be deployed on a server, from its last visit.
export function shippedOn(serverId: string): Shipped | null {
  return shipped.get(serverId) ?? null;
}

// Called after a deploy writes its record, so the UI updates at once.
export function rememberShipped(serverId: string, record: ShippedRecord) {
  const state = shipped.get(serverId) ?? { records: new Map(), images: new Map() };
  state.records.set(record.key, record);
  shipped.set(serverId, state);
}

async function refreshAll() {
  const servers = db().prepare("SELECT * FROM servers").all() as ServerRow[];
  for (const id of [...locks.keys()]) if (!servers.some((server) => server.id === id)) locks.delete(id);
  for (const id of [...shipped.keys()]) if (!servers.some((server) => server.id === id)) shipped.delete(id);
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
