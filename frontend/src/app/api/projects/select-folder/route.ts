import { agentError, fetchAgent } from "@/lib/agent";

export async function POST() {
  try {
    const response = await fetchAgent(
      "/v1/projects/select-folder",
      { method: "POST" },
      125_000,
    );
    if (!response.ok) {
      return Response.json({ error: await agentError(response) }, { status: response.status });
    }
    return Response.json(await response.json());
  } catch {
    return Response.json({ error: "Local DevLaunch agent is unavailable" }, { status: 503 });
  }
}
