export const runtime = "nodejs";

import {
  ingestTranscript,
  extractSignals,
  getExtractionResult,
  getHighConfidenceSignals,
  getSuggestedInvestigations,
  MeetingTranscriptSchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const IngestRequestSchema = z.object({
  action: z.literal("ingest"),
  transcript: MeetingTranscriptSchema,
});

const ExtractRequestSchema = z.object({
  action: z.literal("extract"),
  transcriptId: z.string().min(1).max(200),
  model: z.string().optional(),
});

const RequestSchema = z.discriminatedUnion("action", [IngestRequestSchema, ExtractRequestSchema]);

/**
 * Meeting intelligence — ingest transcripts and extract innovation signals.
 *
 * @route POST /api/meeting-intelligence
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
      logger.warn("Invalid meeting-intelligence request", {
        route: "/api/meeting-intelligence",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(JSON.stringify({ error: "Invalid request. Please check your input." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const data = parsed.data;

    if (data.action === "ingest") {
      ingestTranscript(data.transcript);
      logger.info("Transcript ingested", {
        route: "/api/meeting-intelligence",
        requestId,
        meetingId: data.transcript.id,
      });
      return Response.json(
        { success: true, meetingId: data.transcript.id },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    // action === "extract"
    const modelError = validateModel(data.model);
    if (modelError) return modelError;

    const result = await extractSignals(data.transcriptId, data.model, request.signal);

    logger.info("Signals extracted", {
      route: "/api/meeting-intelligence",
      requestId,
      meetingId: data.transcriptId,
      signalCount: result.signals.length,
      durationMs: Date.now() - startTime,
    });

    return Response.json(result, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Meeting intelligence error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/meeting-intelligence",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(
      JSON.stringify({ error: "Meeting intelligence failed. Please try again." }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

/**
 * Get extraction results or suggested investigations.
 *
 * @route GET /api/meeting-intelligence?meetingId=m1 or GET /api/meeting-intelligence?suggestions=true
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get("meetingId");
    const suggestions = searchParams.get("suggestions");
    const minConfidence = searchParams.get("minConfidence");

    if (suggestions === "true") {
      return Response.json(getSuggestedInvestigations(), { headers: API_RESPONSE_HEADERS });
    }

    if (minConfidence) {
      return Response.json(getHighConfidenceSignals(parseFloat(minConfidence) || 0.7), {
        headers: API_RESPONSE_HEADERS,
      });
    }

    if (meetingId) {
      const result = getExtractionResult(meetingId);
      if (!result) {
        return new Response(
          JSON.stringify({ error: "No extraction found. Run POST with action=extract first." }),
          {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          }
        );
      }
      return Response.json(result, { headers: API_RESPONSE_HEADERS });
    }

    return new Response(
      JSON.stringify({
        error: "Provide 'meetingId', 'suggestions=true', or 'minConfidence' query parameter",
      }),
      {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      }
    );
  } catch (err) {
    logger.error("Meeting intelligence GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: "Failed to retrieve meeting data." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
