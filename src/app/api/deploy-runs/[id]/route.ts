import { currentUser } from "@/lib/auth";
import { getRun } from "@/lib/deploy";
import { UserError } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/deploy-runs/[id]">) {
  const { id } = await context.params;
  if (!(await currentUser())) return Response.json({ error: "Sign in to continue" }, { status: 401 });
  try {
    return Response.json({ run: getRun(id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof UserError ? error.message : "Run is unavailable";
    return Response.json({ error: message }, { status: error instanceof UserError ? 404 : 500 });
  }
}
