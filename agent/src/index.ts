import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { ServerResponse } from "node:http";
import { AgentError, getProjectLogs, getStatus, runProjectAction } from "./projects.js";
import {
  addProject,
  inspectProjectPath,
  removeProject,
  RegistryError,
  selectProjectFolder,
  updateProject,
} from "./registry.js";
import type { ProjectAction } from "./types.js";

const host = process.env.DEVLAUNCH_AGENT_HOST ?? "127.0.0.1";
const port = Number(process.env.DEVLAUNCH_AGENT_PORT ?? 47821);
const actions = new Set<ProjectAction>(["open-code", "start", "stop", "restart", "rebuild"]);

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 32 * 1024) throw new RegistryError("Request body is too large", 413);
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RegistryError("Invalid request body", 400);
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { online: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/projects/status") {
      sendJson(response, 200, await getStatus());
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/projects/select-folder") {
      sendJson(response, 200, await selectProjectFolder());
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/projects/inspect") {
      const body = (await readJson(request)) as { localPath?: string };
      if (typeof body.localPath !== "string") {
        throw new RegistryError("Enter a project folder path", 400);
      }
      sendJson(response, 200, await inspectProjectPath(body.localPath));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/projects") {
      const body = (await readJson(request)) as {
        localPath?: string;
        name?: string;
        description?: string;
        category?: "work" | "personal";
        stack?: string[];
        repositoryPaths?: string[];
        github?: string;
        local?: string;
        live?: string;
      };
      if (
        typeof body.localPath !== "string" ||
        typeof body.name !== "string" ||
        (body.category !== "work" && body.category !== "personal") ||
        (body.description !== undefined && typeof body.description !== "string") ||
        (body.stack !== undefined &&
          (!Array.isArray(body.stack) || body.stack.some((item) => typeof item !== "string"))) ||
        (body.repositoryPaths !== undefined &&
          (!Array.isArray(body.repositoryPaths) ||
            body.repositoryPaths.some((item) => typeof item !== "string"))) ||
        (body.github !== undefined && typeof body.github !== "string") ||
        (body.local !== undefined && typeof body.local !== "string") ||
        (body.live !== undefined && typeof body.live !== "string")
      ) {
        throw new RegistryError("Invalid project details", 400);
      }
      sendJson(response, 201, {
        project: await addProject({
          localPath: body.localPath,
          name: body.name,
          description: body.description,
          category: body.category,
          stack: body.stack,
          repositoryPaths: body.repositoryPaths,
          github: body.github,
          local: body.local,
          live: body.live,
        }),
      });
      return;
    }

    const projectRoute = url.pathname.match(/^\/v1\/projects\/([^/]+)$/);
    if (request.method === "PATCH" && projectRoute) {
      const id = decodeURIComponent(projectRoute[1] ?? "");
      const body = (await readJson(request)) as {
        localPath?: string;
        name?: string;
        description?: string;
        category?: "work" | "personal";
        stack?: string[];
        repositoryPaths?: string[];
        github?: string;
        local?: string;
        live?: string;
      };
      if (
        typeof body.localPath !== "string" ||
        typeof body.name !== "string" ||
        (body.category !== "work" && body.category !== "personal") ||
        (body.description !== undefined && typeof body.description !== "string") ||
        (body.stack !== undefined &&
          (!Array.isArray(body.stack) || body.stack.some((item) => typeof item !== "string"))) ||
        (body.repositoryPaths !== undefined &&
          (!Array.isArray(body.repositoryPaths) ||
            body.repositoryPaths.some((item) => typeof item !== "string"))) ||
        (body.github !== undefined && typeof body.github !== "string") ||
        (body.local !== undefined && typeof body.local !== "string") ||
        (body.live !== undefined && typeof body.live !== "string")
      ) {
        throw new RegistryError("Invalid project details", 400);
      }
      sendJson(response, 200, {
        project: await updateProject(id, {
          localPath: body.localPath,
          name: body.name,
          description: body.description,
          category: body.category,
          stack: body.stack,
          repositoryPaths: body.repositoryPaths,
          github: body.github,
          local: body.local,
          live: body.live,
        }),
      });
      return;
    }

    if (request.method === "DELETE" && projectRoute) {
      const id = decodeURIComponent(projectRoute[1] ?? "");
      sendJson(response, 200, await removeProject(id));
      return;
    }

    const logsRoute = url.pathname.match(/^\/v1\/projects\/([^/]+)\/logs$/);
    if (request.method === "GET" && logsRoute) {
      const id = decodeURIComponent(logsRoute[1] ?? "");
      const tail = Number(url.searchParams.get("tail") ?? 120);
      sendJson(response, 200, await getProjectLogs(id, tail));
      return;
    }

    const actionRoute = url.pathname.match(/^\/v1\/projects\/([^/]+)\/actions\/([^/]+)$/);
    if (request.method === "POST" && actionRoute) {
      const id = decodeURIComponent(actionRoute[1] ?? "");
      const action = actionRoute[2] as ProjectAction;
      if (!actions.has(action)) throw new AgentError("Unsupported action", 400);
      sendJson(response, 200, await runProjectAction(id, action));
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const status =
      error instanceof AgentError || error instanceof RegistryError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected agent error";
    sendJson(response, status, { error: message });
  }
});

server.listen(port, host, () => {
  console.log(`DevLaunch agent listening on http://${host}:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
