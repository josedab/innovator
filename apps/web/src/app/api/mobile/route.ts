export const runtime = "nodejs";

import {
  processVoiceCapture,
  processCameraCapture,
  createTextCapture,
  getMobileCaptures,
  getSyncState,
  getUnreadNotifications,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType, validateModel } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const VoiceCaptureSchema = z.object({
  action: z.literal("voice"),
  transcript: z.string().min(1).max(50000),
  model: z.string().optional(),
});

const CameraCaptureSchema = z.object({
  action: z.literal("camera"),
  ocrText: z.string().min(1).max(50000),
  model: z.string().optional(),
});

const TextCaptureSchema = z.object({
  action: z.literal("text"),
  text: z.string().min(1).max(50000),
  subject: z.string().max(500).optional(),
});

const RequestSchema = z.discriminatedUnion("action", [
  VoiceCaptureSchema,
  CameraCaptureSchema,
  TextCaptureSchema,
]);

/**
 * Mobile companion — capture innovation ideas via voice, camera, or text.
 *
 * @route POST /api/mobile
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
      logger.warn("Invalid mobile capture request", {
        route: "/api/mobile",
        requestId,
        details: parsed.error.flatten(),
      });
      return new Response(JSON.stringify({ error: "Invalid request. Please check your input." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const data = parsed.data;

    switch (data.action) {
      case "voice": {
        const modelError = validateModel(data.model);
        if (modelError) return modelError;
        const capture = await processVoiceCapture(data.transcript, data.model, request.signal);
        logger.info("Voice capture processed", {
          route: "/api/mobile",
          requestId,
          captureId: capture.id,
          durationMs: Date.now() - startTime,
        });
        return Response.json(capture, { headers: API_RESPONSE_HEADERS });
      }
      case "camera": {
        const modelError = validateModel(data.model);
        if (modelError) return modelError;
        const capture = await processCameraCapture(data.ocrText, data.model, request.signal);
        logger.info("Camera capture processed", {
          route: "/api/mobile",
          requestId,
          captureId: capture.id,
          durationMs: Date.now() - startTime,
        });
        return Response.json(capture, { headers: API_RESPONSE_HEADERS });
      }
      case "text": {
        const capture = createTextCapture(data.text, data.subject);
        return Response.json(capture, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (err) {
    logger.error("Mobile capture error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/mobile",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Mobile capture failed. Please try again." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/**
 * Get captures, sync state, or notifications.
 *
 * @route GET /api/mobile?type=voice or GET /api/mobile?deviceId=d1&sync=true or GET /api/mobile?notifications=true
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const deviceId = searchParams.get("deviceId");
    const notifications = searchParams.get("notifications");

    if (notifications === "true") {
      return Response.json(getUnreadNotifications(), { headers: API_RESPONSE_HEADERS });
    }

    if (deviceId) {
      return Response.json(getSyncState(deviceId), { headers: API_RESPONSE_HEADERS });
    }

    const captures = getMobileCaptures(type as Parameters<typeof getMobileCaptures>[0]);
    return Response.json(captures, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Mobile GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: "Failed to retrieve mobile data." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
