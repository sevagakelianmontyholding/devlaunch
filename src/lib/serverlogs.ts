import path from "node:path";
import { dataDir } from "./db";
import { launchRun } from "./docker";
import { getProject } from "./projects";
import { getServerRow, keyPath, writeKey } from "./servers";
import { run, shQuote, UserError } from "./shell";
import type { LocalRun, ServerContainer } from "./types";

// Containers on a deploy server, for the live-logs picker.
export async function listServerContainers(serverId: string): Promise<ServerContainer[]> {
  const server = getServerRow(serverId);
  await writeKey(server.id, server.private_key);
  const { stdout } = await run("ssh", ["-i", keyPath(server.id), "-p", String(server.port), "-o", "StrictHostKeyChecking=accept-new", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", `${server.username}@${server.host}`, "docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}'"], { timeoutMs: 30_000 });
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name = "", image = "", status = "", state = ""] = line.split("|");
      return { name, image, status, running: state === "running" };
    })
    .sort((a, b) => Number(b.running) - Number(a.running) || a.name.localeCompare(b.name));
}

// Follows a container's logs over SSH as a background run: it streams to the
// terminal panel, can be stopped, and does not block the project's other
// commands. It ends by itself after an hour.
export async function followServerLogs(projectId: string | null, serverId: string, container: string, tail: number): Promise<LocalRun> {
  // From the Servers page there is no project; the run is filed under the server instead.
  const project = projectId ? getProject(projectId) : { id: `server:${serverId}`, path: dataDir };
  if (!project) throw new UserError("Project not found");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(container)) throw new UserError("Choose a container");
  const lines = Math.min(Math.max(Math.round(tail) || 200, 10), 5000);
  const server = getServerRow(serverId);
  await writeKey(server.id, server.private_key);
  const ssh = `ssh -i ${shQuote(keyPath(server.id))} -p ${server.port} -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 ${shQuote(`${server.username}@${server.host}`)}`;
  const remote = `docker logs -f --tail ${lines} --timestamps ${shQuote(container)} 2>&1`;
  return launchRun(project, "custom", `${ssh} ${shQuote(remote)}`, path.resolve(project.path), 60 * 60_000, `Following ${container} on ${server.name} (last ${lines} lines, then live)\n\n`, `Logs · ${container}`, { pty: false, background: true });
}
