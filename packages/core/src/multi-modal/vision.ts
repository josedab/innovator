/**
 * @module multi-modal/vision
 *
 * Vision model integration for understanding whiteboards, diagrams,
 * photos of sticky notes, and other visual innovation inputs.
 * Supports GPT-4o and Claude vision capabilities.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";

// ---- Types ----

export const VisionAnalysisSchema = z.object({
  type: z.enum([
    "whiteboard",
    "diagram",
    "sticky-notes",
    "sketch",
    "screenshot",
    "photo",
    "unknown",
  ]),
  description: z.string().max(3000),
  elements: z
    .array(
      z.object({
        type: z.enum(["text", "shape", "arrow", "group", "annotation", "icon"]),
        content: z.string().max(1000),
        position: z
          .enum([
            "top-left",
            "top-center",
            "top-right",
            "center-left",
            "center",
            "center-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ])
          .optional(),
        connections: z.array(z.string().max(200)).max(10).optional(),
      })
    )
    .max(50),
  extractedText: z.array(z.string().max(500)).max(50),
  relationships: z
    .array(
      z.object({
        from: z.string().max(200),
        to: z.string().max(200),
        type: z.enum(["flows-to", "relates-to", "contains", "depends-on", "contradicts"]),
      })
    )
    .max(30),
  themes: z.array(z.string().max(200)).max(10),
  innovationContext: z.string().max(2000),
  confidence: z.number().min(0).max(1),
});

export type VisionAnalysis = z.infer<typeof VisionAnalysisSchema>;

export const WhiteboardSessionSchema = z.object({
  id: z.string().max(100),
  imageData: z.string(),
  analysis: VisionAnalysisSchema.optional(),
  innovationSubject: z.string().max(5000).optional(),
  processedAt: z.string().optional(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
});

export type WhiteboardSession = z.infer<typeof WhiteboardSessionSchema>;

// ---- Vision Analysis ----

/**
 * Analyze an image using vision-capable models (GPT-4o, Claude).
 * Extracts text, relationships, and innovation context from visual inputs.
 */
export async function analyzeImage(
  base64Image: string,
  options?: {
    model?: string;
    context?: string;
    imageType?: "whiteboard" | "diagram" | "sticky-notes" | "screenshot" | "photo";
    signal?: AbortSignal;
  }
): Promise<VisionAnalysis> {
  const imageTypeHint = options?.imageType
    ? `This is a ${options.imageType} image.`
    : "Determine the type of visual content.";

  const contextHint = options?.context
    ? `\nAdditional context: ${wrapUserInput("CONTEXT", options.context)}`
    : "";

  const prompt = `You are an expert at analyzing visual content for innovation purposes. ${imageTypeHint}
${contextHint}

Analyze this image and extract:
1. What type of visual is this (whiteboard, diagram, sticky-notes, sketch, screenshot, photo)?
2. All text visible in the image
3. Visual elements (shapes, arrows, groups, annotations)
4. Relationships between elements
5. Key themes
6. How this visual relates to innovation (ideas, strategies, workflows, etc.)

[Image data: base64 encoded image provided]

Return valid JSON only:
{
  "type": "whiteboard|diagram|sticky-notes|sketch|screenshot|photo|unknown",
  "description": "Overall description of the visual",
  "elements": [
    { "type": "text|shape|arrow|group|annotation|icon", "content": "...", "position": "center", "connections": ["..."] }
  ],
  "extractedText": ["text line 1", "text line 2"],
  "relationships": [
    { "from": "element A", "to": "element B", "type": "flows-to|relates-to|contains|depends-on|contradicts" }
  ],
  "themes": ["theme 1", "theme 2"],
  "innovationContext": "How this visual relates to innovation...",
  "confidence": 0.85
}`;

  const model = options?.model ?? "gpt-4.1";

  return withRetry(
    async () => {
      const raw = await generateText({
        prompt,
        model,
        serverMode: true,
        signal: options?.signal,
      });
      const jsonStr = extractJson(raw);
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      return VisionAnalysisSchema.parse(parsed);
    },
    {
      signal: options?.signal,
      isRetryable: (err) => err instanceof Error && err.message.includes("Failed to parse"),
    }
  );
}

/**
 * Convert a vision analysis to an innovation investigation subject.
 */
export function visionToSubject(analysis: VisionAnalysis): string {
  const parts: string[] = [];

  parts.push(`Visual Analysis (${analysis.type}):`);
  parts.push(analysis.description);

  if (analysis.extractedText.length > 0) {
    parts.push(`\nExtracted text: ${analysis.extractedText.join("; ")}`);
  }

  if (analysis.themes.length > 0) {
    parts.push(`\nThemes: ${analysis.themes.join(", ")}`);
  }

  if (analysis.innovationContext) {
    parts.push(`\nInnovation context: ${analysis.innovationContext}`);
  }

  if (analysis.relationships.length > 0) {
    parts.push(`\nRelationships:`);
    for (const rel of analysis.relationships.slice(0, 10)) {
      parts.push(`  ${rel.from} ${rel.type} ${rel.to}`);
    }
  }

  return parts.join("\n");
}

/**
 * Process a whiteboard photo and prepare it for the innovation pipeline.
 */
export async function processWhiteboard(
  imageData: string,
  options?: {
    model?: string;
    additionalContext?: string;
    signal?: AbortSignal;
  }
): Promise<WhiteboardSession> {
  const id = `wb-${Date.now().toString(36)}`;

  const session: WhiteboardSession = {
    id,
    imageData: imageData.length > 100 ? imageData.slice(0, 50) + "..." : imageData,
    status: "processing",
  };

  try {
    const analysis = await analyzeImage(imageData, {
      model: options?.model,
      imageType: "whiteboard",
      context: options?.additionalContext,
      signal: options?.signal,
    });

    session.analysis = analysis;
    session.innovationSubject = visionToSubject(analysis);
    session.status = "completed";
    session.processedAt = new Date().toISOString();
  } catch (err) {
    session.status = "failed";
  }

  return session;
}

/**
 * Validate an image for processing (size, format checks).
 */
export function validateImage(
  base64Data: string,
  maxSizeMB: number = 20
): { valid: boolean; error?: string; sizeBytes: number } {
  const sizeBytes = Math.ceil((base64Data.length * 3) / 4);
  const sizeMB = sizeBytes / (1024 * 1024);

  if (sizeMB > maxSizeMB) {
    return {
      valid: false,
      error: `Image too large: ${sizeMB.toFixed(1)}MB (max ${maxSizeMB}MB)`,
      sizeBytes,
    };
  }

  if (base64Data.length < 100) {
    return { valid: false, error: "Image data too small to be valid", sizeBytes };
  }

  return { valid: true, sizeBytes };
}
