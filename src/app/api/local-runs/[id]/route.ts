import { currentUser } from "@/lib/auth";
import { getLocalRun, writeRunInput } from "@/lib/docker";
import { UserError } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/local-runs/[id]">) {
  const { id } = await context.params;
  if (!(await currentUser())) return Response.json({ error: "Sign in to continue" }, { status: 401 });
  try {
    return Response.json({ run: getLocalRun(id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof UserError ? error.message : "Run is unavailable";
    return Response.json({ error: message }, { status: error instanceof UserError ? 404 : 500 });
  }
}

export async function POST(request: Request, context: RouteContext<"/api/local-runs/[id]">) {
  const { id } = await context.params;
  if (!(await currentUser())) return Response.json({ error: "Sign in to continue" }, { status: 401 });
  try {
    const body = (await request.json()) as { text?: unknown; raw?: unknown };
    if (typeof body.text !== "string" || body.text.length > 1000) return Response.json({ error: "Send a short line of text" }, { status: 400 });
    writeRunInput(id, body.text, body.raw === true);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof UserError ? error.message : "Could not send input";
    return Response.json({ error: message }, { status: error instanceof UserError ? 409 : 500 });
  }
}
