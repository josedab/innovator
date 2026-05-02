/**
 * @module vision
 *
 * Multi-Modal Input: accept screenshots, whiteboard photos, or sketches as
 * investigation subjects using vision models. Extracts structured content
 * from images and feeds extraction into the investigate() pipeline.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

// ---- Schemas ----

/** Schema for an extracted visual element. */
export const VisualElementSchema = z.object({
  type: z.enum(["text", "diagram", "sketch", "chart", "table", "annotation", "icon", "photo"]),
  content: z.string().max(5000),
  confidence: z.number().min(0).max(1),
  position: z
    .object({
      x: z.number().min(0).max(1).describe("Relative x position (0-1)"),
      y: z.number().min(0).max(1).describe("Relative y position (0-1)"),
    })
    .optional(),
});

/** Schema for the extraction result from an image. */
export const ImageExtractionSchema = z.object({
  summary: z.string().max(5000),
  elements: z.array(VisualElementSchema).max(50),
  detectedType: z.enum([
    "whiteboard",
    "screenshot",
    "sketch",
    "diagram",
    "document",
    "photo",
    "presentation",
    "unknown",
  ]),
  extractedText: z.string().max(10000),
  themes: z.array(z.string().max(200)).max(20),
  suggestedSubject: z.string().max(2000),
  innovationContext: z
    .string()
    .max(5000)
    .describe("How this image relates to potential innovation"),
});

/** Schema for supported image metadata. */
export const ImageMetadataSchema = z.object({
  width: z.number().min(1).optional(),
  height: z.number().min(1).optional(),
  format: z.enum(["png", "jpeg", "jpg", "gif", "webp", "bmp", "svg"]).optional(),
  sizeBytes: z.number().min(0).optional(),
  source: z.enum(["upload", "camera", "clipboard", "url"]).optional(),
});

// ---- Types ----

export type VisualElement = z.infer<typeof VisualElementSchema>;
export type ImageExtraction = z.infer<typeof ImageExtractionSchema>;
export type ImageMetadata = z.infer<typeof ImageMetadataSchema>;

// ---- Constants ----

const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const SUPPORTED_FORMATS = ["png", "jpeg", "jpg", "gif", "webp", "bmp"] as const;

// ---- Validation ----

/**
 * Validate an image buffer for processing.
 */
export function validateImage(
  imageBuffer: Buffer,
  metadata?: ImageMetadata
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!imageBuffer || imageBuffer.length === 0) {
    errors.push("Image buffer is empty");
    return { valid: false, errors };
  }

  if (imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
    errors.push(`Image exceeds maximum size of ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB`);
  }

  if (
    metadata?.format &&
    !SUPPORTED_FORMATS.includes(metadata.format as (typeof SUPPORTED_FORMATS)[number])
  ) {
    errors.push(
      `Unsupported image format: ${metadata.format}. Supported: ${SUPPORTED_FORMATS.join(", ")}`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Detect image format from buffer magic bytes.
 */
export function detectImageFormat(imageBuffer: Buffer): ImageMetadata["format"] | undefined {
  if (imageBuffer.length < 4) return undefined;

  // PNG: 89 50 4E 47
  if (
    imageBuffer[0] === 0x89 &&
    imageBuffer[1] === 0x50 &&
    imageBuffer[2] === 0x4e &&
    imageBuffer[3] === 0x47
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff) {
    return "jpeg";
  }
  // GIF: 47 49 46 38
  if (
    imageBuffer[0] === 0x47 &&
    imageBuffer[1] === 0x49 &&
    imageBuffer[2] === 0x46 &&
    imageBuffer[3] === 0x38
  ) {
    return "gif";
  }
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (
    imageBuffer[0] === 0x52 &&
    imageBuffer[1] === 0x49 &&
    imageBuffer[2] === 0x46 &&
    imageBuffer[3] === 0x46
  ) {
    if (imageBuffer.length >= 12 && imageBuffer[8] === 0x57 && imageBuffer[9] === 0x45) {
      return "webp";
    }
  }
  // BMP: 42 4D
  if (imageBuffer[0] === 0x42 && imageBuffer[1] === 0x4d) {
    return "bmp";
  }

  return undefined;
}

// ---- Prompt builder ----

function buildExtractionPrompt(base64Image: string, format: string): string {
  return `You are a visual content analysis expert. Analyze the provided image and extract structured information for innovation purposes.

The image is provided as a base64-encoded ${format} image.

IMAGE DATA: [base64 image of ${base64Image.length} characters provided]

Analyze the image and provide:
1. **summary**: A concise description of what the image contains
2. **elements**: Individual visual elements (text, diagrams, sketches, charts, etc.) with their content and type
3. **detectedType**: The type of image (whiteboard, screenshot, sketch, diagram, document, photo, presentation, unknown)
4. **extractedText**: All readable text found in the image
5. **themes**: Key themes or topics identified
6. **suggestedSubject**: A suggested innovation subject based on the image content
7. **innovationContext**: How this image relates to potential innovation opportunities

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "summary": "Description of the image",
  "elements": [
    { "type": "text", "content": "Extracted content", "confidence": 0.9 }
  ],
  "detectedType": "whiteboard",
  "extractedText": "All text found in the image",
  "themes": ["theme1", "theme2"],
  "suggestedSubject": "A suggested subject for investigation",
  "innovationContext": "How this relates to innovation"
}`;
}

// ---- Core functions ----

/**
 * Extract structured content from an image buffer using vision models.
 */
export async function extractFromImage(
  imageBuffer: Buffer,
  metadata?: ImageMetadata,
  model?: string,
  signal?: AbortSignal
): Promise<ImageExtraction> {
  const validation = validateImage(imageBuffer, metadata);
  if (!validation.valid) {
    throw new Error(`Invalid image: ${validation.errors.join(", ")}`);
  }

  const format = metadata?.format ?? detectImageFormat(imageBuffer) ?? "png";
  const base64 = imageBuffer.toString("base64");

  const prompt = buildExtractionPrompt(base64, format);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse vision response as JSON: ${jsonStr.slice(0, 200)}`);
      }
    },
    {
      signal,
      isRetryable: (err) =>
        err instanceof Error &&
        (err.message.includes("Failed to parse") ||
          err.message.includes("No JSON object found") ||
          err.message.includes("Unbalanced JSON braces")),
    }
  );

  return ImageExtractionSchema.parse(parsed);
}

/**
 * Convert an image extraction to an investigation subject string.
 */
export function extractionToSubject(extraction: ImageExtraction): string {
  return extraction.suggestedSubject || extraction.summary;
}

/**
 * Convert an image extraction to context documents for investigation.
 */
export function extractionToContext(extraction: ImageExtraction): string {
  const sections: string[] = [];

  sections.push(`IMAGE ANALYSIS: ${extraction.summary}`);
  sections.push(`TYPE: ${extraction.detectedType}`);

  if (extraction.extractedText) {
    sections.push(`EXTRACTED TEXT:\n${extraction.extractedText}`);
  }

  if (extraction.themes.length > 0) {
    sections.push(`THEMES: ${extraction.themes.join(", ")}`);
  }

  if (extraction.innovationContext) {
    sections.push(`INNOVATION CONTEXT: ${extraction.innovationContext}`);
  }

  const diagrams = extraction.elements.filter((e) => e.type === "diagram" || e.type === "sketch");
  if (diagrams.length > 0) {
    sections.push(`DIAGRAMS/SKETCHES:\n${diagrams.map((d) => `- ${d.content}`).join("\n")}`);
  }

  return sections.join("\n\n");
}

/**
 * Create a base64 data URL from an image buffer.
 */
export function imageToDataUrl(imageBuffer: Buffer, format?: string): string {
  const detectedFormat = format ?? detectImageFormat(imageBuffer) ?? "png";
  const mimeType = detectedFormat === "jpg" ? "jpeg" : detectedFormat;
  return `data:image/${mimeType};base64,${imageBuffer.toString("base64")}`;
}
