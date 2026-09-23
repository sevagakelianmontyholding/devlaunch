import { getDeployment } from "./deploy";
import { getServerRow, readRemoteFile, writeRemoteFile } from "./servers";
import { UserError } from "./shell";
import type { EnvFile } from "./types";

// The environment file of a deployment lives on the server only, at the
// deployment's env path inside its server directory. DevLaunch reads and
// writes it there, so everyone deploying the project sees the same file and
// nothing has to be copied between machines.

function target(remotePath: string, envPath: string) {
  return `${remotePath.replace(/\/$/, "")}/${envPath}`;
}

export async function readEnvFile(deploymentId: string): Promise<EnvFile> {
  const deployment = getDeployment(deploymentId);
  const server = getServerRow(deployment.serverId);
  const content = await readRemoteFile(server, target(deployment.remotePath, deployment.envPath));
  return { path: deployment.envPath, exists: content !== null, content: content ?? "" };
}

export async function writeEnvFile(deploymentId: string, content: string): Promise<EnvFile> {
  const deployment = getDeployment(deploymentId);
  const server = getServerRow(deployment.serverId);
  const text = content.replace(/\r\n/g, "\n");
  if (text.length > 64_000) throw new UserError("The environment file is too large");
  await writeRemoteFile(server, target(deployment.remotePath, deployment.envPath), text.endsWith("\n") || text === "" ? text : `${text}\n`);
  return readEnvFile(deploymentId);
}
