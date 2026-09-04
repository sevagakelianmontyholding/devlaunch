import { randomUUID } from "node:crypto";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, keysDir, now } from "./db";
import { shQuote, stream, UserError } from "./shell";
import { openScriptInTerminal } from "./terminal";
import type { DeployLock, Server, ServerHealth, ServerInput } from "./types";

export type ServerRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  private_key: string;
  created_at: string;
  updated_at: string;
};

function fromRow(row: ServerRow): Server {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listServers(): Server[] {
  return (db().prepare("SELECT * FROM servers ORDER BY name COLLATE NOCASE").all() as ServerRow[]).map(fromRow);
}

export function getServerRow(id: string) {
  const row = db().prepare("SELECT * FROM servers WHERE id = ?").get(id) as ServerRow | undefined;
  if (!row) throw new UserError("Server not found");
  return row;
}

export function keyPath(serverId: string) {
  return path.join(keysDir, `${serverId}.pem`);
}

export async function writeKey(serverId: string, privateKey: string) {
  await mkdir(keysDir, { recursive: true, mode: 0o700 });
  const target = keyPath(serverId);
  await writeFile(target, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, { mode: 0o600 });
  await chmod(target, 0o600);
}

function validate(input: ServerInput, keyRequired: boolean) {
  const name = input.name.trim();
  const host = input.host.trim();
  const username = input.username.trim();
  const privateKey = input.privateKey.trim();
  if (!name || name.length > 60) throw new UserError("Enter a server name (max 60 characters)");
  if (!/^[A-Za-z0-9._:-]+$/.test(host)) throw new UserError("Enter a valid host name or IP address");
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) throw new UserError("Enter a valid SSH port");
  if (!/^[A-Za-z0-9._-]+$/.test(username)) throw new UserError("Enter a valid SSH user");
  if (keyRequired && !privateKey) throw new UserError("Paste the private SSH key");
  if (privateKey && !privateKey.includes("PRIVATE KEY")) throw new UserError("That does not look like a private SSH key");
  return { name, host, port: input.port, username, privateKey };
}

export async function createServer(input: ServerInput): Promise<Server> {
  const server = validate(input, true);
  const id = randomUUID();
  const timestamp = now();
  await writeKey(id, server.privateKey);
  db()
    .prepare(
      `INSERT INTO servers (id, name, host, port, username, private_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, server.name, server.host, server.port, server.username, server.privateKey, timestamp, timestamp);
  return fromRow(getServerRow(id));
}

export async function updateServer(id: string, input: ServerInput): Promise<Server> {
  const current = getServerRow(id);
  const server = validate(input, false);
  const privateKey = server.privateKey || current.private_key;
  await writeKey(id, privateKey);
  db()
    .prepare(
      `UPDATE servers SET name = ?, host = ?, port = ?, username = ?, private_key = ?, updated_at = ? WHERE id = ?`,
    )
    .run(server.name, server.host, server.port, server.username, privateKey, now(), id);
  return fromRow(getServerRow(id));
}

export async function deleteServer(id: string) {
  const server = getServerRow(id);
  const used = db().prepare("SELECT COUNT(*) AS count FROM deployments WHERE server_id = ?").get(id) as { count: number };
  if (used.count > 0) throw new UserError("Remove the deployments that use this server first");
  db().prepare("DELETE FROM servers WHERE id = ?").run(id);
  await rm(keyPath(id), { force: true });
  return fromRow(server);
}

export function sshArgs(server: ServerRow) {
  return [
    "-i",
    keyPath(server.id),
    "-p",
    String(server.port),
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=15",
    `${server.username}@${server.host}`,
  ];
}

export async function testServer(id: string) {
  const server = getServerRow(id);
  await writeKey(id, server.private_key);
  let output = "";
  try {
    await stream("ssh", [...sshArgs(server), "echo connected && docker --version && docker compose version"], {
      timeoutMs: 30_000,
      onOutput: (chunk) => (output += chunk),
    });
    return output.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    throw new UserError(`${message}${output ? `\n${output.trim()}` : ""}`.slice(0, 2000));
  }
}

// One SSH round-trip per server: architecture, Docker version, disk, memory,
// uptime, and running containers. Failures are reported, never thrown.
export async function serverHealth(): Promise<ServerHealth[]> {
  const script = [
    "echo ARCH=$(uname -m)",
    "echo DOCKER=$(docker --version 2>/dev/null | sed 's/Docker version //; s/,.*//')",
    "echo DISK=$(df -h / | awk 'NR==2 {print $3\"|\"$2\"|\"$5}')",
    "echo MEM=$(free -h 2>/dev/null | awk 'NR==2 {print $3\"|\"$2}')",
    "echo UPTIME=$(uptime -p 2>/dev/null || uptime)",
    "docker ps --format 'CONTAINER={{.Names}}|{{.Status}}|{{.Image}}' 2>/dev/null",
    'echo "LOCK=$(cat $HOME/.devlaunch/deploy.lock 2>/dev/null)"',
  ].join("; ");
  const rows = db().prepare("SELECT * FROM servers ORDER BY name COLLATE NOCASE").all() as ServerRow[];
  return Promise.all(
    rows.map(async (server): Promise<ServerHealth> => {
      const base = { id: server.id, name: server.name, checkedAt: new Date().toISOString() };
      let output = "";
      try {
        await writeKey(server.id, server.private_key);
        await stream("ssh", [...sshArgs(server), script], { timeoutMs: 25_000, onOutput: (chunk) => (output += chunk) });
      } catch (error) {
        return { ...base, reachable: false, error: error instanceof Error ? error.message : "Unreachable", arch: null, dockerVersion: null, disk: null, memory: null, uptime: null, containers: [], lock: null };
      }
      const get = (key: string) => output.split("\n").find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
      const [used = "", total = "", percent = ""] = get("DISK").split("|");
      const [memUsed = "", memTotal = ""] = get("MEM").split("|");
      return {
        ...base,
        reachable: true,
        error: null,
        arch: get("ARCH") || null,
        dockerVersion: get("DOCKER") || null,
        disk: used ? { used, total, percent: Number(percent.replace("%", "")) || 0 } : null,
        memory: memUsed ? { used: memUsed, total: memTotal } : null,
        uptime: get("UPTIME").replace(/^up /, "") || null,
        containers: output
          .split("\n")
          .filter((line) => line.startsWith("CONTAINER="))
          .map((line) => {
            const [name = "", status = "", image = ""] = line.slice("CONTAINER=".length).split("|");
            return { name, status, image };
          }),
        lock: parseLock(get("LOCK")),
      };
    }),
  );
}

// Locks older than this are treated as leftovers from a crashed run.
export const LOCK_STALE_MS = 3 * 60 * 60_000;

export function parseLock(text: string): DeployLock | null {
  try {
    const lock = JSON.parse(text.trim()) as Partial<DeployLock>;
    if (!lock || typeof lock.startedAt !== "string" || typeof lock.runId !== "string") return null;
    if (Date.now() - new Date(lock.startedAt).getTime() > LOCK_STALE_MS) return null;
    return {
      user: typeof lock.user === "string" ? lock.user : null,
      machine: String(lock.machine ?? "another Mac"),
      project: String(lock.project ?? "a project"),
      deployment: String(lock.deployment ?? ""),
      kind: lock.kind === "commands" || lock.kind === "rollback" ? lock.kind : "deploy",
      startedAt: lock.startedAt,
      runId: lock.runId,
    };
  } catch {
    return null;
  }
}

// Opens an interactive SSH session to the server in the user's terminal,
// landing in remotePath when given, using the key stored for this server.
export async function openServerTerminal(id: string, remotePath?: string | null) {
  const server = getServerRow(id);
  await writeKey(id, server.private_key);
  const target = remotePath?.trim() || "";
  const remote = target ? `cd ${shQuote(target)} 2>/dev/null || echo "Directory not found: ${target.replaceAll('"', "")}"; exec "$SHELL" -l` : 'exec "$SHELL" -l';
  const script = [
    "clear",
    `echo "Connecting to ${server.name.replaceAll('"', "")} (${server.username}@${server.host})…"`,
    `exec ssh -i ${shQuote(keyPath(server.id))} -p ${server.port} -o StrictHostKeyChecking=accept-new -t ${shQuote(`${server.username}@${server.host}`)} ${shQuote(remote)}`,
  ].join("\n");
  await openScriptInTerminal(`ssh-${server.name}`, script);
}
