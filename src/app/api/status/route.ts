import { currentUser } from "@/lib/auth";
import { getStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to continue" }, { status: 401 });
  return Response.json(await getStatus(user), { headers: { "cache-control": "no-store" } });
}
