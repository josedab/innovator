/**
 * @description Content generation from innovation insights.
 */
export const runtime = "nodejs";

import {
  generateContent,
  reviseContent,
  CONTENT_FORMATS,
  CONTENT_TONES,
  CONTENT_AUDIENCES,
  InnovationIdeaSchema,
  InvestigationSchema,
  RevisionRequestSchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const GenerateRequestSchema = z.object({
  action: z.literal("generate"),
  idea: InnovationIdeaSchema,
  format: z.enum(CONTENT_FORMATS),
  tone: z.enum(CONTENT_TONES).optional(),
  audience: z.enum(CONTENT_AUDIENCES).optional(),
  subject: z.string().max(500).optional(),
  investigation: InvestigationSchema.optional(),
  companyName: z.string().max(300).optional(),
  brandVoice: z.string().max(1000).optional(),
  model: z.string().optional(),
});

const ReviseRequestSchema = z.object({
  action: z.literal("revise"),
  contentId: z.string().min(1).max(100),
  feedback: z.string().min(1).max(2000),
  focusAreas: z.array(z.string().max(200)).max(10).optional(),
  toneShift: z.enum(CONTENT_TONES).optional(),
  audienceShift: z.enum(CONTENT_AUDIENCES).optional(),
  model: z.string().optional(),
});

const RequestSchema = z.discriminatedUnion("action", [GenerateRequestSchema, ReviseRequestSchema]);

/**
 * Generate or revise content from innovation ideas.
 *
 * @route POST /api/content
 */
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

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Invalid content request", {
        route: "/api/content",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(JSON.stringify({ error: "Invalid request. Please check your input." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const data = parsed.data;
    const model = data.model;

    const modelError = validateModel(model);
    if (modelError) return modelError;

    if (data.action === "generate") {
      const content = await generateContent(data.idea, data.format, {
        tone: data.tone,
        audience: data.audience,
        context: {
          subject: data.subject ?? data.idea.title,
          investigation: data.investigation,
          companyName: data.companyName,
          brandVoice: data.brandVoice,
        },
        model,
        signal: request.signal,
      });

      logger.info("Content generated", {
        route: "/api/content",
        requestId,
        format: data.format,
        durationMs: Date.now() - startTime,
      });

      return Response.json(content, { headers: API_RESPONSE_HEADERS });
    }

    // action === "revise"
    const revised = await reviseContent(
      {
        contentId: data.contentId,
        feedback: data.feedback,
        focusAreas: data.focusAreas,
        toneShift: data.toneShift,
        audienceShift: data.audienceShift,
      },
      model,
      request.signal
    );

    logger.info("Content revised", {
      route: "/api/content",
      requestId,
      contentId: data.contentId,
      durationMs: Date.now() - startTime,
    });

    return Response.json(revised, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Content pipeline error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/content",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Content generation failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
