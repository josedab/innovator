/**
 * @description Multimodal innovation — combine text, image, and audio inputs.
 */
export const runtime = "nodejs";

import {
  validateAttachment,
  parseAttachment,
  buildMultiModalContext as buildExtendedMultiModalContext,
  processMultiModalInput as processExtendedMultiModalInput,
} from "@innovator/core";
import type { Attachment } from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const AttachmentInputSchema = z.object({
  id: z.string().max(200),
  type: z.enum(["image", "pdf", "url", "audio"]),
  name: z.string().max(500),
  mimeType: z.string().max(200).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  base64Data: z.string().optional(),
  sourceUrl: z.string().max(2000).optional(),
  extractedText: z.string().optional(),
  status: z.enum(["pending", "processing", "completed", "failed"]).default("pending"),
});

const ProcessSchema = z.object({
  action: z.literal("process"),
  subject: z.string().min(1).max(5000),
  attachments: z.array(AttachmentInputSchema).min(1).max(20),
  contextNotes: z.string().max(5000).optional(),
  focusAreas: z.array(z.string().max(200)).max(10).optional(),
  model: z.string().optional(),
});

const ValidateSchema = z.object({
  action: z.literal("validate"),
  attachment: AttachmentInputSchema,
});

const ParseSingleSchema = z.object({
  action: z.literal("parse"),
  attachment: AttachmentInputSchema,
  model: z.string().optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [
  ProcessSchema,
  ValidateSchema,
  ParseSingleSchema,
]);

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: API_RESPONSE_HEADERS });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const data = parsed.data;

  if (data.action === "validate") {
    const errors = validateAttachment(data.attachment as Attachment);
    return Response.json(
      { valid: errors.length === 0, errors },
      { headers: API_RESPONSE_HEADERS }
    );
  }

  if (data.action === "parse") {
    try {
      const result = await parseAttachment(data.attachment as Attachment, {
        model: data.model,
      });
      return Response.json({ result }, { headers: API_RESPONSE_HEADERS });
    } catch (err) {
      return Response.json(
        { error: "Failed to parse attachment", details: (err as Error).message },
        { status: 500, headers: API_RESPONSE_HEADERS }
      );
    }
  }

  if (data.action === "process") {
    try {
      const result = await processExtendedMultiModalInput(
        {
          subject: data.subject,
          attachments: data.attachments as Attachment[],
          contextNotes: data.contextNotes,
          focusAreas: data.focusAreas,
        },
        { model: data.model }
      );
      return Response.json({ result }, { headers: API_RESPONSE_HEADERS });
    } catch (err) {
      return Response.json(
        { error: "Failed to process input", details: (err as Error).message },
        { status: 500, headers: API_RESPONSE_HEADERS }
      );
    }
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: API_RESPONSE_HEADERS });
}
