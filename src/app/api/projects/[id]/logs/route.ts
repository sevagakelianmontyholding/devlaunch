import { currentUser } from "@/lib/auth";
import { composeLogs } from "@/lib/docker";
import { UserError } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/projects/[id]/logs">) {
  const { id } = await context.params;
  if (!(await currentUser())) return Response.json({ error: "Sign in to continue" }, { status: 401 });
  try {
    return Response.json({ logs: await composeLogs(id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof UserError ? error.message : "Logs are unavailable";
    return Response.json({ error: message }, { status: error instanceof UserError ? 409 : 500 });
  }
}
