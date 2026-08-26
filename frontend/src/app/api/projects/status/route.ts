import { agentError, fetchAgent } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetchAgent("/v1/projects/status");
    if (!response.ok) {
      return Response.json({ error: await agentError(response) }, { status: response.status });
    }
    return Response.json(await response.json());
  } catch {
    return Response.json({ error: "Local DevLaunch agent is unavailable" }, { status: 503 });
  }
}
