/**
 * @description Third-party integration management (Slack, Jira, etc.).
 */
export const runtime = "nodejs";

import {
  registerExternalIntegration as registerIntegration,
  listExternalIntegrations as listIntegrations,
  removeExternalIntegration as removeIntegration,
  exportIdeaToJira as exportToJira,
  exportToLinear,
  exportIdeaToNotion as exportToNotion,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RegisterSchema = z.object({
  action: z.literal("register"),
  id: z.string().max(100),
  type: z.enum(["jira", "linear", "notion", "github", "slack"]),
  name: z.string().max(200),
  apiUrl: z.string().max(500).optional(),
  apiToken: z.string().max(500).optional(),
  projectId: z.string().max(200).optional(),
});

const RemoveSchema = z.object({
  action: z.literal("remove"),
  id: z.string().max(100),
});

const ListSchema = z.object({
  action: z.literal("list"),
});

const ExportSchema = z.object({
  action: z.literal("export"),
  target: z.enum(["jira", "linear", "notion"]),
  idea: z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(5000),
    potentialImpact: z.string().min(1).max(2000),
    implementationHint: z.string().max(2000).optional(),
    sourceAngle: z.string().max(100).optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  }),
  options: z.record(z.string(), z.unknown()).optional(),
  integrationId: z.string().max(100).optional(),
});

const RequestSchema = z.discriminatedUnion("action", [
  RegisterSchema,
  RemoveSchema,
  ListSchema,
  ExportSchema,
]);

export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    switch (parsed.action) {
      case "register": {
        const integration = registerIntegration({
          id: parsed.id,
          type: parsed.type,
          name: parsed.name,
          status: "connected",
          apiUrl: parsed.apiUrl,
          apiToken: parsed.apiToken,
          projectId: parsed.projectId,
        });
        logger.info("Integration registered", { id: parsed.id, type: parsed.type });
        return Response.json(
          { integration: { ...integration, apiToken: undefined } },
          { headers: API_RESPONSE_HEADERS }
        );
      }
      case "remove": {
        const removed = removeIntegration(parsed.id);
        return Response.json({ removed }, { headers: API_RESPONSE_HEADERS });
      }
      case "list": {
        const all = listIntegrations().map((i) => ({ ...i, apiToken: undefined }));
        return Response.json({ integrations: all }, { headers: API_RESPONSE_HEADERS });
      }
      case "export": {
        const opts = (parsed.options ?? {}) as Record<string, string>;
        let result;

        switch (parsed.target) {
          case "jira":
            result = await exportToJira(
              parsed.idea,
              {
                projectKey: opts.projectKey ?? "INNOV",
                issueType: opts.issueType,
                epicKey: opts.epicKey,
              },
              parsed.integrationId
            );
            break;
          case "linear":
            result = await exportToLinear(
              parsed.idea,
              {
                teamId: opts.teamId ?? "",
                projectId: opts.projectId,
              },
              parsed.integrationId
            );
            break;
          case "notion":
            result = await exportToNotion(
              parsed.idea,
              {
                databaseId: opts.databaseId ?? "",
              },
              parsed.integrationId
            );
            break;
        }

        if (!result) {
          return Response.json(
            { error: "Export target not supported" },
            { status: 400, headers: API_RESPONSE_HEADERS }
          );
        }
        return Response.json({ result }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.errors },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    logger.error(error instanceof Error ? error.message : "Unknown error", {
      route: "/api/integrations",
    });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function GET() {
  const all = listIntegrations().map((i) => ({ ...i, apiToken: undefined }));
  return Response.json({ integrations: all }, { headers: API_RESPONSE_HEADERS });
}
