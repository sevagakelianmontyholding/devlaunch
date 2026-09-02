import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCallback);

// LaunchAgents start with a minimal PATH; make sure Homebrew and Docker are reachable.
export const shellEnv = {
  ...process.env,
  PATH: `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
};

export class UserError extends Error {}

export async function run(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    env: shellEnv,
    timeout: options.timeoutMs ?? 10_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return { stdout, stderr };
}

export function shQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export type ProcessControl = {
  cancelled: boolean;
  child: ReturnType<typeof spawn> | null;
};

export function killProcessGroup(child: ReturnType<typeof spawn>, signal: NodeJS.Signals) {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

// Streams a long-running command's output and supports cancellation. Each step
// runs in its own process group so a cancel kills a whole pipeline, not just sh.
export function stream(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    timeoutMs: number;
    onOutput: (chunk: string) => void;
    control?: ProcessControl;
  },
) {
  return new Promise<void>((resolve, reject) => {
    if (options.control?.cancelled) {
      reject(new Error("Cancelled"));
      return;
    }
    const child = spawn(command, args, { cwd: options.cwd, env: shellEnv, detached: true });
    if (options.control) options.control.child = child;
    const timer = setTimeout(() => {
      killProcessGroup(child, "SIGKILL");
      reject(new Error(`Timed out after ${Math.round(options.timeoutMs / 60_000)} minutes`));
    }, options.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => options.onOutput(chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => options.onOutput(chunk.toString("utf8")));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (options.control) options.control.child = null;
      if (options.control?.cancelled) reject(new Error("Cancelled"));
      else if (code === 0) resolve();
      else reject(new Error(`Exited with code ${code}`));
    });
  });
}
