/**
 * @description Negotiation simulation for stakeholder alignment on innovations.
 */
export const runtime = "nodejs";

import {
  startNegotiation,
  negotiateStep,
  getNegotiation,
  completeNegotiation,
  listNegotiations,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const StartSchema = z.object({
  action: z.literal("start"),
  idea: z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(5000),
    potentialImpact: z.string().max(2000).default(""),
    implementationHint: z.string().max(2000).default(""),
  }),
  model: z.string().optional(),
});

const StepSchema = z.object({
  action: z.literal("step"),
  sessionId: z.string().min(1),
  message: z.string().min(1).max(5000),
  model: z.string().optional(),
});

const GetSchema = z.object({
  action: z.literal("get"),
  sessionId: z.string().min(1),
});

const CompleteSchema = z.object({
  action: z.literal("complete"),
  sessionId: z.string().min(1),
});

const ListSchema = z.object({
  action: z.literal("list"),
});

const RequestSchema = z.discriminatedUnion("action", [
  StartSchema,
  StepSchema,
  GetSchema,
  CompleteSchema,
  ListSchema,
]);

export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    switch (parsed.action) {
      case "start": {
        const modelError = validateModel(parsed.model);
        if (modelError) return modelError;
        const session = await startNegotiation(parsed.idea, parsed.model, request.signal);
        logger.info("Negotiation started", { sessionId: session.id });
        return Response.json({ session }, { headers: API_RESPONSE_HEADERS });
      }
      case "step": {
        const modelError = validateModel(parsed.model);
        if (modelError) return modelError;
        const session = await negotiateStep(
          parsed.sessionId,
          parsed.message,
          parsed.model,
          request.signal
        );
        if (!session) {
          return Response.json(
            { error: "Session not found or completed" },
            { status: 404, headers: API_RESPONSE_HEADERS }
          );
        }
        return Response.json({ session }, { headers: API_RESPONSE_HEADERS });
      }
      case "get": {
        const session = getNegotiation(parsed.sessionId);
        if (!session) {
          return Response.json(
            { error: "Session not found" },
            { status: 404, headers: API_RESPONSE_HEADERS }
          );
        }
        return Response.json({ session }, { headers: API_RESPONSE_HEADERS });
      }
      case "complete": {
        const result = completeNegotiation(parsed.sessionId);
        if (!result) {
          return Response.json(
            { error: "Session not found" },
            { status: 404, headers: API_RESPONSE_HEADERS }
          );
        }
        return Response.json(result, { headers: API_RESPONSE_HEADERS });
      }
      case "list": {
        const sessions = listNegotiations();
        return Response.json({ sessions }, { headers: API_RESPONSE_HEADERS });
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
      route: "/api/negotiate",
    });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
