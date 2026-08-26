import { agentError, fetchAgent } from "@/lib/agent";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { localPath?: string };
    if (typeof body.localPath !== "string") {
      return Response.json({ error: "Enter a project folder path" }, { status: 400 });
    }
    const response = await fetchAgent("/v1/projects/inspect", {
      method: "POST",
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
