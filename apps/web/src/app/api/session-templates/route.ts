/**
 * @description Reusable session templates for common innovation workflows.
 */
export const runtime = "nodejs";

import {
  WIZARD_QUESTIONS,
  generateConfig,
  saveTemplate,
  getSessionTemplate,
  listTemplates,
  deleteTemplate,
  WizardAnswersSchema,
  SaveTemplateSchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const GenerateConfigSchema = z.object({
  action: z.literal("generate-config"),
  answers: WizardAnswersSchema,
});

const SaveSchema = z.object({
  action: z.literal("save"),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  answers: WizardAnswersSchema,
  config: SaveTemplateSchema.shape.config,
});

const GetSchema = z.object({
  action: z.literal("get"),
  templateId: z.string().min(1),
});

const DeleteSchema = z.object({
  action: z.literal("delete"),
  templateId: z.string().min(1),
});

const ListSchema = z.object({
  action: z.literal("list"),
});

const RequestSchema = z.discriminatedUnion("action", [
  GenerateConfigSchema,
  SaveSchema,
  GetSchema,
  DeleteSchema,
  ListSchema,
]);

/** POST /api/session-templates — manage session templates and wizard config. */
export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    switch (parsed.data.action) {
      case "generate-config": {
        const config = generateConfig(parsed.data.answers);
        return Response.json(
          { config, answers: parsed.data.answers },
          {
            headers: API_RESPONSE_HEADERS,
          }
        );
      }
      case "save": {
        const template = saveTemplate(
          parsed.data.name,
          parsed.data.description,
          parsed.data.answers,
          parsed.data.config
        );
        return Response.json({ template }, { headers: API_RESPONSE_HEADERS });
      }
      case "get": {
        const template = getSessionTemplate(parsed.data.templateId);
        if (!template) {
          return new Response(JSON.stringify({ error: "Template not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        return Response.json({ template }, { headers: API_RESPONSE_HEADERS });
      }
      case "delete": {
        const deleted = deleteTemplate(parsed.data.templateId);
        return Response.json({ success: deleted }, { headers: API_RESPONSE_HEADERS });
      }
      case "list": {
        const templates = listTemplates();
        return Response.json({ templates }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    logger.error("Session templates error", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/session-templates",
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** GET /api/session-templates — get wizard questions and saved templates. */
export async function GET() {
  try {
    const templates = listTemplates();
    return Response.json(
      { questions: WIZARD_QUESTIONS, templates },
      { headers: API_RESPONSE_HEADERS }
    );
  } catch (error) {
    logger.error("Session templates GET error", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/session-templates",
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
