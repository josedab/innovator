export const runtime = "nodejs";

import {
  createProject,
  getProject,
  listProjects,
  searchProjects,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  ownerId: z.string().min(1).max(200),
  settings: z
    .object({
      defaultModel: z.string().optional(),
      defaultAngles: z.array(z.string()).optional(),
      autoScore: z.boolean().optional(),
      autoValidate: z.boolean().optional(),
    })
    .optional(),
});

const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  status: z.enum(["active", "archived", "completed"]).optional(),
  ownerId: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const query = url.searchParams.get("q");

    if (id) {
      const project = await getProject(id);
      if (!project) {
        return new Response(JSON.stringify({ error: "Project not found." }), {
          status: 404,
          headers: API_RESPONSE_HEADERS,
        });
      }
      return Response.json(project, { headers: API_RESPONSE_HEADERS });
    }

    if (query) {
      const results = await searchProjects({ query });
      return Response.json(results, { headers: API_RESPONSE_HEADERS });
    }

    const projects = await listProjects();
    return Response.json(projects, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Projects list error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/projects",
    });
    return new Response(JSON.stringify({ error: "Failed to retrieve projects." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = CreateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const { name, description, ownerId, settings } = parsed.data;
    const project = await createProject(name, description ?? "", ownerId, settings);

    logger.info("Project created", {
      route: "/api/projects",
      requestId,
      durationMs: Date.now() - startTime,
      projectId: project.id,
    });

    return Response.json(project, { status: 201, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Project creation error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/projects",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Project creation failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
