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
  options: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {},
) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...shellEnv, ...options.env } : shellEnv,
    timeout: options.timeoutMs ?? 10_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return { stdout, stderr };
}

export function shQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export type Child = ReturnType<typeof spawn>;

// Tracks every live process of a run so cancelling kills all of them.
export type ProcessControl = {
  cancelled: boolean;
  children: Set<Child>;
};

export function newControl(): ProcessControl {
  return { cancelled: false, children: new Set() };
}

export function killProcessGroup(child: Child, signal: NodeJS.Signals) {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

export function spawnTracked(command: string, args: string[], control: ProcessControl | undefined, cwd?: string, env?: Record<string, string>) {
  const child = spawn(command, args, { cwd, env: env ? { ...shellEnv, ...env } : shellEnv, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  control?.children.add(child);
  child.on("close", () => control?.children.delete(child));
  return child;
}

export function waitForExit(child: Child, label: string) {
  return new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${label} exited with code ${code}`))));
  });
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
    const child = spawnTracked(command, args, options.control, options.cwd);
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
      if (options.control?.cancelled) reject(new Error("Cancelled"));
      else if (code === 0) resolve();
      else reject(new Error(`Exited with code ${code}`));
    });
  });
}
