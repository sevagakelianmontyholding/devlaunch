import { execFile as execFileCallback } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ProxyDomain, ProxyManagerStatus } from "./types.js";

const execFile = promisify(execFileCallback);

const databasePath =
  process.env.DEVLAUNCH_NPM_DB ??
  path.join(homedir(), "projects", "nginx-proxy-manager", "data", "database.sqlite");

type RawProxyHost = {
  id: number;
  domain_names: string;
  forward_scheme: string;
  forward_host: string;
  forward_port: number;
  ssl_forced: number;
  enabled: number;
};

let cache: { expiresAt: number; value: ProxyManagerStatus } | null = null;

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchProject(
  hostname: string,
  forwardHost: string,
  projectIds: string[],
  containerProjects: Map<string, string>,
) {
  const directContainerMatch = containerProjects.get(forwardHost);
  if (directContainerMatch) return directContainerMatch;

  const overrides: Record<string, string> = {
    "npm.localhost": "nginx-proxy-manager",
  };
  if (overrides[hostname]) return overrides[hostname];

  const searchValue = normalized(`${hostname} ${forwardHost}`);
  return (
    [...projectIds]
      .sort((left, right) => normalized(right).length - normalized(left).length)
      .find((id) => searchValue.includes(normalized(id))) ?? null
  );
}

async function healthFor(url: string) {
  const startedAt = performance.now();
  const checkedAt = new Date().toISOString();

  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 405) {
      response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(3000),
      });
    }

    return {
      healthy: response.status >= 200 && response.status < 400,
      statusCode: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt,
    };
  } catch {
    return {
      healthy: false,
      statusCode: null,
      latencyMs: null,
      checkedAt,
    };
  }
}

export async function discoverProxyManager(
  projectIds: string[],
  containerProjects: Map<string, string>,
): Promise<ProxyManagerStatus> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  try {
    const { stdout } = await execFile(
      "sqlite3",
      [
        "-readonly",
        "-json",
        databasePath,
        "SELECT id, domain_names, forward_scheme, forward_host, forward_port, ssl_forced, enabled FROM proxy_host WHERE is_deleted = 0 ORDER BY id;",
      ],
      { timeout: 5000, maxBuffer: 2 * 1024 * 1024 },
    );
    const hosts = JSON.parse(stdout || "[]") as RawProxyHost[];

    const domainSeeds = hosts.flatMap((host) => {
      const domainNames = JSON.parse(host.domain_names || "[]") as string[];
      return domainNames.map((hostname) => {
        const url = `${host.ssl_forced ? "https" : "http"}://${hostname}`;
        return {
          id: host.id,
          hostname,
          url,
          forwardScheme: host.forward_scheme,
          forwardHost: host.forward_host,
          forwardPort: host.forward_port,
          enabled: Boolean(host.enabled),
          projectId: matchProject(hostname, host.forward_host, projectIds, containerProjects),
        };
      });
    });

    const domains: ProxyDomain[] = await Promise.all(
      domainSeeds.map(async (domain) => ({
        ...domain,
        health: domain.enabled ? await healthFor(domain.url) : null,
      })),
    );
    const dashboardUrl =
      domains.find((domain) => domain.hostname === "npm.localhost")?.url ??
      "http://localhost:81";
    const value: ProxyManagerStatus = {
      available: true,
      dashboardUrl,
      hostCount: domains.length,
      healthyCount: domains.filter((domain) => domain.health?.healthy).length,
      domains,
    };
    cache = { expiresAt: Date.now() + 30_000, value };
    return value;
  } catch {
    return {
      available: false,
      dashboardUrl: "http://localhost:81",
      hostCount: 0,
      healthyCount: 0,
      domains: [],
    };
  }
}
