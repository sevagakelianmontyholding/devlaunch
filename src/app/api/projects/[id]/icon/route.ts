import { readFileSync } from "node:fs";
import { currentUser } from "@/lib/auth";
import { contentTypeFor, iconFile } from "@/lib/icons";
import { getProjectAny } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/projects/[id]/icon">) {
  const { id } = await context.params;
  if (!(await currentUser())) return new Response("Sign in to continue", { status: 401 });
  const project = getProjectAny(id);
  const file = project ? iconFile(project.id, project.iconFile) : null;
  if (!file) return new Response("No icon", { status: 404 });
  return new Response(readFileSync(file.path), { headers: { "content-type": contentTypeFor(file.path), "cache-control": "private, max-age=86400, immutable" } });
}
