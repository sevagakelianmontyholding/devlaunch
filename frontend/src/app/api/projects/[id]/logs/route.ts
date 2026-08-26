import { agentError, fetchAgent } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/projects/[id]/logs">) {
  const { id } = await context.params;

  try {
    const response = await fetchAgent(
      `/v1/projects/${encodeURIComponent(id)}/logs?tail=120`,
      undefined,
      20_000,
    );
    if (!response.ok) {
      return Response.json({ error: await agentError(response) }, { status: response.status });
    }
    return Response.json(await response.json());
  } catch {
    return Response.json({ error: "Project logs are unavailable" }, { status: 503 });
  }
}
