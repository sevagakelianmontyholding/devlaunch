import { agentError, fetchAgent } from "@/lib/agent";
import type { AddProjectRequest } from "@/types/agent";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AddProjectRequest;
    const response = await fetchAgent("/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return Response.json({ error: await agentError(response) }, { status: response.status });
    }
    return Response.json(await response.json(), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    return Response.json({ error: "Local DevLaunch agent is unavailable" }, { status: 503 });
  }
}
