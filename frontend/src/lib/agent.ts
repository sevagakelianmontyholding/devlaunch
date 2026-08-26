const agentUrl = process.env.DEVLAUNCH_AGENT_URL ?? "http://127.0.0.1:47821";

export async function fetchAgent(path: string, init?: RequestInit, timeout = 125_000) {
  return fetch(`${agentUrl}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
}

export async function agentError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `Agent returned ${response.status}`;
  } catch {
    return `Agent returned ${response.status}`;
  }
}
