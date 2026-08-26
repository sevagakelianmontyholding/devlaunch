import { agentError, fetchAgent } from "@/lib/agent";
import type { ProjectAction } from "@/types/agent";

const actions = new Set<ProjectAction>(["open-code", "start", "stop", "restart", "rebuild"]);

export async function POST(request: Request, context: RouteContext<"/api/projects/[id]/action">) {
  const { id } = await context.params;

  try {
    const body = (await request.json()) as { action?: ProjectAction };
    if (!body.action || !actions.has(body.action)) {
      return Response.json({ error: "Unsupported project action" }, { status: 400 });
    }

    const response = await fetchAgent(
      `/v1/projects/${encodeURIComponent(id)}/actions/${body.action}`,
      { method: "POST" },
      body.action === "rebuild" ? 610_000 : 125_000,
    );
    if (!response.ok) {
      return Response.json({ error: await agentError(response) }, { status: response.status });
    }
    return Response.json(await response.json());
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    return Response.json({ error: "Local DevLaunch agent is unavailable" }, { status: 503 });
  }
}
