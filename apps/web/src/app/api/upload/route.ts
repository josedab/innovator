/**
 * @description File upload handling for innovation context documents.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  processMultiModalInput,
  analyzeImage,
  visionToSubject,
  validateImage,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../lib/api-headers";

const AnalyzeImageSchema = z.object({
  action: z.literal("analyze-image"),
  imageData: z.string().min(1),
  imageType: z.enum(["whiteboard", "diagram", "sticky-notes", "screenshot", "photo"]).optional(),
  context: z.string().max(5000).optional(),
  model: z.string().max(100).optional(),
});

const ProcessInputSchema = z.object({
  action: z.literal("process"),
  subject: z.string().min(1).max(5000),
  attachments: z
    .array(
      z.object({
        id: z.string().max(200),
        type: z.enum(["image", "pdf", "url", "audio"]),
        name: z.string().max(500),
        mimeType: z.string().max(200).optional(),
        base64Data: z.string().optional(),
        sourceUrl: z.string().max(2000).optional(),
        status: z.enum(["pending", "processing", "completed", "failed"]).default("pending"),
      })
    )
    .max(10)
    .optional(),
  contextNotes: z.string().max(5000).optional(),
  focusAreas: z.array(z.string().max(200)).max(10).optional(),
  model: z.string().max(100).optional(),
});

const ValidateImageSchema = z.object({
  action: z.literal("validate"),
  imageData: z.string().min(1),
  maxSizeMB: z.number().min(1).max(50).optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [
  AnalyzeImageSchema,
  ProcessInputSchema,
  ValidateImageSchema,
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    switch (parsed.action) {
      case "validate": {
        const result = validateImage(parsed.imageData, parsed.maxSizeMB);
        return NextResponse.json({ validation: result }, { headers: API_RESPONSE_HEADERS });
      }

      case "analyze-image": {
        const validation = validateImage(parsed.imageData);
        if (!validation.valid) {
          return NextResponse.json(
            { error: validation.error },
            { status: 400, headers: API_RESPONSE_HEADERS }
          );
        }

        const analysis = await analyzeImage(parsed.imageData, {
          model: parsed.model,
          imageType: parsed.imageType,
          context: parsed.context,
        });

        const subject = visionToSubject(analysis);
        return NextResponse.json({ analysis, subject }, { headers: API_RESPONSE_HEADERS });
      }

      case "process": {
        const { context, parseResults } = await processMultiModalInput(
          {
            subject: parsed.subject,
            attachments: parsed.attachments as Parameters<
              typeof processMultiModalInput
            >[0]["attachments"],
            contextNotes: parsed.contextNotes,
            focusAreas: parsed.focusAreas,
          },
          { model: parsed.model }
        );

        return NextResponse.json({ context, parseResults }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400, headers: API_RESPONSE_HEADERS });
  }
}
