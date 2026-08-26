import { agentError, fetchAgent } from "@/lib/agent";
import type { UpdateProjectRequest } from "@/types/agent";

export async function PATCH(request: Request, context: RouteContext<"/api/projects/[id]">) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as UpdateProjectRequest;
    const response = await fetchAgent(`/v1/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
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

export async function DELETE(_request: Request, context: RouteContext<"/api/projects/[id]">) {
  const { id } = await context.params;
  try {
    const response = await fetchAgent(`/v1/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      return Response.json({ error: await agentError(response) }, { status: response.status });
    }
    return Response.json(await response.json());
  } catch {
    return Response.json({ error: "Local DevLaunch agent is unavailable" }, { status: 503 });
  }
}
