import { currentUser } from "@/lib/auth";
import { getLocalRun, subscribeRun } from "@/lib/docker";
import { UserError } from "@/lib/shell";

export const dynamic = "force-dynamic";

// Server-sent events: the run's log so far, then every new chunk, then "done".
export async function GET(request: Request, context: RouteContext<"/api/local-runs/[id]">) {
  const { id } = await context.params;
  if (!(await currentUser())) return Response.json({ error: "Sign in to continue" }, { status: 401 });
  let run;
  try {
    run = getLocalRun(id);
  } catch (error) {
    return Response.json({ error: error instanceof UserError ? error.message : "Run is unavailable" }, { status: 404 });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };
      send("init", { log: run.log, status: run.status });
      if (run.status !== "running") return close();
      const unsubscribe = subscribeRun(id, {
        onChunk: (chunk) => send("chunk", chunk),
        onDone: (status) => {
          send("done", status);
          close();
        },
      });
      const keepAlive = setInterval(() => send("ping", Date.now()), 15_000);
      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        unsubscribe();
        close();
      });
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
}
