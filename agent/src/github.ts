import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type {
  GitHubIntegrationStatus,
  GitHubProjectStatus,
  GitHubWorkflowRun,
} from "./types.js";

const execFile = promisify(execFileCallback);
const repositoryCache = new Map<
  string,
  { expiresAt: number; value: GitHubProjectStatus }
>();
const tokenCache = new Map<string, { expiresAt: number; value: string | null }>();
const sshAccountCache = new Map<string, Promise<string | null>>();
let integrationCache: { expiresAt: number; value: GitHubIntegrationStatus } | null = null;

const repositoryQuery = `
  query DevLaunchRepository($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      nameWithOwner
      url
      isPrivate
      defaultBranchRef { name }
      pullRequests(first: 3, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
        totalCount
        nodes { number title url isDraft headRefName reviewDecision updatedAt }
      }
      issues(first: 3, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
        totalCount
        nodes { number title url updatedAt }
      }
    }
  }
`;

type RepositoryQueryResult = {
  data?: {
    repository?: {
      nameWithOwner: string;
      url: string;
      isPrivate: boolean;
      defaultBranchRef: { name: string } | null;
      pullRequests: {
        totalCount: number;
        nodes: GitHubProjectStatus["pullRequests"];
      };
      issues: {
        totalCount: number;
        nodes: GitHubProjectStatus["issues"];
      };
    } | null;
  };
};

type AuthStatusResult = {
  hosts?: Record<
    string,
    Array<{
      state: string;
      active: boolean;
      login: string;
    }>
  >;
};

export type GitHubRepositoryRequest = {
  key: string;
  repositoryUrl: string;
  hostAlias: string | null;
};

function repositorySlug(repositoryUrl: string) {
  try {
    const url = new URL(repositoryUrl);
    if (url.hostname !== "github.com") return null;
    const [owner, repository] = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    return owner && repository ? { owner, repository, slug: `${owner}/${repository}` } : null;
  } catch {
    return null;
  }
}

async function gh(args: string[], timeout = 12_000, token?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, GH_PROMPT_DISABLED: "1" };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  if (token) env.GH_TOKEN = token;
  const { stdout } = await execFile("gh", args, {
    timeout,
    maxBuffer: 2 * 1024 * 1024,
    env,
  });
  return stdout;
}

async function accountToken(login: string) {
  const cached = tokenCache.get(login);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const token = (
      await gh(["auth", "token", "--hostname", "github.com", "--user", login], 5000)
    ).trim();
    const value = token || null;
    tokenCache.set(login, { expiresAt: Date.now() + 5 * 60_000, value });
    return value;
  } catch {
    tokenCache.set(login, { expiresAt: Date.now() + 60_000, value: null });
    return null;
  }
}

export async function githubAccountForHostAlias(hostAlias: string | null) {
  if (!hostAlias || hostAlias === "github.com" || !hostAlias.startsWith("github-")) return null;
  const cached = sshAccountCache.get(hostAlias);
  if (cached) return cached;
  const lookup = new Promise<string | null>((resolve) => {
    execFileCallback(
      "ssh",
      ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-T", `git@${hostAlias}`],
      { timeout: 8000, maxBuffer: 128 * 1024 },
      (_error, stdout, stderr) => {
        const match = `${stdout}\n${stderr}`.match(/Hi ([^!\s]+)!/);
        resolve(match?.[1] ?? null);
      },
    );
  });
  sshAccountCache.set(hostAlias, lookup);
  return lookup;
}

export async function getGitHubIntegrationStatus(): Promise<GitHubIntegrationStatus> {
  if (integrationCache && integrationCache.expiresAt > Date.now()) return integrationCache.value;
  const checkedAt = new Date().toISOString();
  try {
    const output = await gh(
      ["auth", "status", "--hostname", "github.com", "--json", "hosts"],
      8000,
    );
    const status = JSON.parse(output) as AuthStatusResult;
    const accounts = (status.hosts?.["github.com"] ?? [])
      .filter((candidate) => candidate.state === "success" && candidate.login)
      .map((candidate) => ({ login: candidate.login, active: candidate.active }));
    const account = accounts.find((candidate) => candidate.active)?.login ?? accounts[0]?.login ?? null;
    const value = {
      available: true,
      authenticated: accounts.length > 0,
      account,
      accounts,
      checkedAt,
    };
    integrationCache = { expiresAt: Date.now() + 5 * 60_000, value };
    return value;
  } catch (error) {
    const unavailable = error instanceof Error && "code" in error && error.code === "ENOENT";
    const value = {
      available: !unavailable,
      authenticated: false,
      account: null,
      accounts: [],
      checkedAt,
    };
    integrationCache = { expiresAt: Date.now() + 60_000, value };
    return value;
  }
}

async function getRepositoryStatus(
  repositoryUrl: string,
  preferredAccount: string | null,
  integration: GitHubIntegrationStatus,
): Promise<GitHubProjectStatus> {
  const accountKey = integration.accounts.map((account) => account.login).sort().join(",");
  const cacheKey = `${repositoryUrl}:${preferredAccount ?? "auto"}:${accountKey}`;
  const cached = repositoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const checkedAt = new Date().toISOString();
  const repository = repositorySlug(repositoryUrl);
  if (!repository) {
    return {
      connected: false,
      repositoryUrl,
      account: preferredAccount,
      nameWithOwner: null,
      isPrivate: null,
      defaultBranch: null,
      pullRequestCount: 0,
      pullRequests: [],
      issueCount: 0,
      issues: [],
      latestWorkflow: null,
      error: "Only github.com repository URLs are supported",
      checkedAt,
    };
  }

  const accountCandidates = [
    preferredAccount,
    ...integration.accounts.filter((account) => account.active).map((account) => account.login),
    ...integration.accounts.map((account) => account.login),
  ].filter((login, index, values): login is string => Boolean(login) && values.indexOf(login) === index);

  for (const login of accountCandidates) {
    const token = await accountToken(login);
    if (!token) continue;
    try {
      const [repositoryOutput, workflowOutput] = await Promise.all([
        gh([
          "api",
          "graphql",
          "-f",
          `query=${repositoryQuery}`,
          "-F",
          `owner=${repository.owner}`,
          "-F",
          `name=${repository.repository}`,
        ], 12_000, token),
        gh([
          "run",
          "list",
          "--repo",
          repository.slug,
          "--limit",
          "1",
          "--json",
          "name,displayTitle,status,conclusion,url,headBranch,createdAt",
        ], 12_000, token).catch(() => "[]"),
      ]);
      const queryResult = JSON.parse(repositoryOutput) as RepositoryQueryResult;
      const data = queryResult.data?.repository;
      if (!data) continue;
      const workflow = (JSON.parse(workflowOutput || "[]") as GitHubWorkflowRun[])[0] ?? null;
      const value: GitHubProjectStatus = {
        connected: true,
        repositoryUrl: data.url,
        account: login,
        nameWithOwner: data.nameWithOwner,
        isPrivate: data.isPrivate,
        defaultBranch: data.defaultBranchRef?.name ?? null,
        pullRequestCount: data.pullRequests.totalCount,
        pullRequests: data.pullRequests.nodes,
        issueCount: data.issues.totalCount,
        issues: data.issues.nodes,
        latestWorkflow: workflow,
        error: null,
        checkedAt,
      };
      repositoryCache.set(cacheKey, { expiresAt: Date.now() + 60_000, value });
      return value;
    } catch {
      // Try the next configured GitHub account.
    }
  }

  const missingPreferredAccount =
    preferredAccount && !integration.accounts.some((account) => account.login === preferredAccount);
  const value: GitHubProjectStatus = {
    connected: false,
    repositoryUrl,
    account: preferredAccount,
    nameWithOwner: repository.slug,
    isPrivate: null,
    defaultBranch: null,
    pullRequestCount: 0,
    pullRequests: [],
    issueCount: 0,
    issues: [],
    latestWorkflow: null,
    error: missingPreferredAccount
      ? `GitHub account @${preferredAccount} is not connected to the GitHub CLI.`
      : "Repository not found or not accessible with the configured GitHub accounts.",
    checkedAt,
  };
  repositoryCache.set(cacheKey, { expiresAt: Date.now() + 60_000, value });
  return value;
}

export async function getGitHubRepositoryStatuses(
  requests: GitHubRepositoryRequest[],
  integration: GitHubIntegrationStatus,
) {
  const results = new Map<string, GitHubProjectStatus>();
  for (let index = 0; index < requests.length; index += 4) {
    const batch = requests.slice(index, index + 4);
    const statuses = await Promise.all(
      batch.map(async (request) => {
        const account = await githubAccountForHostAlias(request.hostAlias);
        return [
          request.key,
          await getRepositoryStatus(request.repositoryUrl, account, integration),
        ] as const;
      }),
    );
    for (const [key, status] of statuses) results.set(key, status);
  }
  return results;
}
