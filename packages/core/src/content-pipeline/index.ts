/**
 * @module content-pipeline
 *
 * Transforms top-scored innovation ideas into ready-to-publish content:
 * blog posts, Twitter/X threads, LinkedIn articles, investor pitch decks,
 * internal memos, and press releases. Supports tone calibration,
 * audience-adaptive output, and revision loops.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeUserInput } from "../prompts/sanitize.js";
import type { InnovationIdea, Investigation } from "../types.js";
import { ValidationError } from "../errors.js";

// ---- Content Format Types ----

export const CONTENT_FORMATS = [
  "blog-post",
  "twitter-thread",
  "linkedin-article",
  "pitch-deck",
  "internal-memo",
  "press-release",
] as const;

export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const CONTENT_TONES = [
  "professional",
  "conversational",
  "technical",
  "inspirational",
  "persuasive",
  "academic",
] as const;

export type ContentTone = (typeof CONTENT_TONES)[number];

export const CONTENT_AUDIENCES = [
  "general",
  "technical",
  "executive",
  "investor",
  "internal-team",
  "media",
] as const;

export type ContentAudience = (typeof CONTENT_AUDIENCES)[number];

export const ContentSectionSchema = z.object({
  heading: z.string().max(300),
  body: z.string().max(10_000),
  order: z.number().int().min(0),
});

export type ContentSection = z.infer<typeof ContentSectionSchema>;

export const ContentPieceSchema = z.object({
  id: z.string().min(1).max(100),
  format: z.enum(CONTENT_FORMATS),
  title: z.string().max(500),
  subtitle: z.string().max(500).optional(),
  body: z.string().max(50_000),
  sections: z.array(ContentSectionSchema).max(30).optional(),
  metadata: z.object({
    ideaTitle: z.string().max(500),
    tone: z.enum(CONTENT_TONES),
    audience: z.enum(CONTENT_AUDIENCES),
    wordCount: z.number().int().min(0),
    generatedAt: z.string(),
    model: z.string().optional(),
    revisionNumber: z.number().int().min(0).default(0),
  }),
  hashtags: z.array(z.string().max(100)).max(20).optional(),
  callToAction: z.string().max(500).optional(),
  slideOutline: z
    .array(
      z.object({
        slideNumber: z.number().int().min(1),
        title: z.string().max(200),
        bullets: z.array(z.string().max(300)).max(8),
        speakerNotes: z.string().max(2000).optional(),
      })
    )
    .max(30)
    .optional(),
});

export type ContentPiece = z.infer<typeof ContentPieceSchema>;

export const RevisionRequestSchema = z.object({
  contentId: z.string().max(100),
  feedback: z.string().max(2000),
  focusAreas: z.array(z.string().max(200)).max(10).optional(),
  toneShift: z.enum(CONTENT_TONES).optional(),
  audienceShift: z.enum(CONTENT_AUDIENCES).optional(),
});

export type RevisionRequest = z.infer<typeof RevisionRequestSchema>;

// ---- Content Context ----

export interface ContentContext {
  subject: string;
  investigation?: Investigation;
  relatedIdeas?: InnovationIdea[];
  brandVoice?: string;
  companyName?: string;
}

// ---- Prompt Templates ----

const FORMAT_PROMPTS: Record<
  ContentFormat,
  (
    idea: InnovationIdea,
    ctx: ContentContext,
    tone: ContentTone,
    audience: ContentAudience
  ) => string
> = {
  "blog-post": (idea, ctx, tone, audience) =>
    `Write a compelling blog post about the following innovation idea. Use a ${tone} tone targeting a ${audience} audience.
${ctx.companyName ? `Company: ${ctx.companyName}` : ""}
${ctx.brandVoice ? `Brand voice: ${ctx.brandVoice}` : ""}

Idea: ${sanitizeUserInput(idea.title)}
Description: ${sanitizeUserInput(idea.description)}
Impact: ${sanitizeUserInput(idea.potentialImpact)}
${ctx.investigation ? `Context: ${sanitizeUserInput(ctx.investigation.summary)}` : ""}

Respond in JSON:
{ "title": "string", "body": "full blog post in markdown", "sections": [{"heading":"string","body":"string","order":number}], "hashtags": ["string"], "callToAction": "string" }`,

  "twitter-thread": (idea, ctx, tone, audience) =>
    `Create a Twitter/X thread (5-10 tweets) about this innovation idea. Use a ${tone} tone for a ${audience} audience. Each tweet must be under 280 characters.

Idea: ${sanitizeUserInput(idea.title)}
Description: ${sanitizeUserInput(idea.description)}
Impact: ${sanitizeUserInput(idea.potentialImpact)}

Respond in JSON:
{ "title": "thread hook", "body": "full thread with tweets separated by ---", "hashtags": ["string"], "callToAction": "string" }`,

  "linkedin-article": (idea, ctx, tone, audience) =>
    `Write a professional LinkedIn article about this innovation concept. Use a ${tone} tone for a ${audience} audience.
${ctx.companyName ? `Company: ${ctx.companyName}` : ""}

Idea: ${sanitizeUserInput(idea.title)}
Description: ${sanitizeUserInput(idea.description)}
Impact: ${sanitizeUserInput(idea.potentialImpact)}
${ctx.investigation ? `Research context: ${sanitizeUserInput(ctx.investigation.summary)}` : ""}

Respond in JSON:
{ "title": "string", "subtitle": "string", "body": "full article in markdown", "sections": [{"heading":"string","body":"string","order":number}], "hashtags": ["string"], "callToAction": "string" }`,

  "pitch-deck": (idea, ctx, tone, audience) =>
    `Create an investor pitch deck outline (10-15 slides) for this innovation idea. Use a ${tone} tone for ${audience} audience.

Idea: ${sanitizeUserInput(idea.title)}
Description: ${sanitizeUserInput(idea.description)}
Impact: ${sanitizeUserInput(idea.potentialImpact)}
${ctx.investigation ? `Market context: ${sanitizeUserInput(ctx.investigation.currentState)}` : ""}
${ctx.investigation ? `Opportunities: ${ctx.investigation.opportunities.slice(0, 5).join("; ")}` : ""}

Respond in JSON:
{ "title": "deck title", "body": "executive summary", "slideOutline": [{"slideNumber": number, "title": "string", "bullets": ["string"], "speakerNotes": "string"}] }`,

  "internal-memo": (idea, ctx, tone, audience) =>
    `Write a concise internal memo proposing this innovation initiative. Use a ${tone} tone for ${audience} audience.
${ctx.companyName ? `From: Innovation Team, ${ctx.companyName}` : ""}

Idea: ${sanitizeUserInput(idea.title)}
Description: ${sanitizeUserInput(idea.description)}
Impact: ${sanitizeUserInput(idea.potentialImpact)}
Implementation: ${sanitizeUserInput(idea.implementationHint)}

Respond in JSON:
{ "title": "MEMO: subject", "body": "full memo in markdown", "sections": [{"heading":"string","body":"string","order":number}] }`,

  "press-release": (idea, ctx, tone, audience) =>
    `Write a press release announcing this innovation. Use a ${tone} tone for ${audience} audience. Follow standard press release format (headline, dateline, body, boilerplate).
${ctx.companyName ? `Company: ${ctx.companyName}` : ""}

Idea: ${sanitizeUserInput(idea.title)}
Description: ${sanitizeUserInput(idea.description)}
Impact: ${sanitizeUserInput(idea.potentialImpact)}

Respond in JSON:
{ "title": "headline", "subtitle": "subheadline", "body": "full press release", "sections": [{"heading":"string","body":"string","order":number}], "callToAction": "string" }`,
};

// ---- In-Memory Store ----

const contentStore = new Map<string, ContentPiece>();

// ---- Functions ----

let contentIdCounter = 0;

/** Generate content from an innovation idea in the specified format. */
export async function generateContent(
  idea: InnovationIdea,
  format: ContentFormat,
  options: {
    tone?: ContentTone;
    audience?: ContentAudience;
    context?: ContentContext;
    model?: string;
    signal?: AbortSignal;
  } = {}
): Promise<ContentPiece> {
  const tone = options.tone ?? "professional";
  const audience = options.audience ?? "general";
  const ctx: ContentContext = options.context ?? { subject: idea.title };

  const promptBuilder = FORMAT_PROMPTS[format];
  if (!promptBuilder) throw new ValidationError(`Unknown content format: ${format}`);

  const prompt = promptBuilder(idea, ctx, tone, audience);
  const raw = await withRetry(() =>
    generateText({ prompt, model: options.model, serverMode: true, signal: options.signal })
  );
  const parsed = JSON.parse(extractJson(raw));

  const id = `content-${++contentIdCounter}-${Date.now()}`;
  const piece: ContentPiece = {
    id,
    format,
    title: parsed.title ?? idea.title,
    subtitle: parsed.subtitle,
    body: parsed.body ?? "",
    sections: parsed.sections,
    metadata: {
      ideaTitle: idea.title,
      tone,
      audience,
      wordCount: (parsed.body ?? "").split(/\s+/).length,
      generatedAt: new Date().toISOString(),
      model: options.model,
      revisionNumber: 0,
    },
    hashtags: parsed.hashtags,
    callToAction: parsed.callToAction,
    slideOutline: parsed.slideOutline,
  };

  const validated = ContentPieceSchema.parse(piece);
  contentStore.set(id, validated);
  return validated;
}

/** Revise an existing content piece based on feedback. */
export async function reviseContent(
  revision: RevisionRequest,
  model?: string,
  signal?: AbortSignal
): Promise<ContentPiece> {
  RevisionRequestSchema.parse(revision);

  const original = contentStore.get(revision.contentId);
  if (!original) throw new ValidationError(`Content piece not found: ${revision.contentId}`);

  const prompt = `Revise the following ${original.format} content based on the feedback provided.

## Original Content
Title: ${sanitizeUserInput(original.title)}
Body: ${sanitizeUserInput(original.body.slice(0, 10_000))}

## Feedback
${sanitizeUserInput(revision.feedback)}
${revision.focusAreas?.length ? `Focus areas: ${revision.focusAreas.join(", ")}` : ""}
${revision.toneShift ? `Shift tone to: ${revision.toneShift}` : ""}
${revision.audienceShift ? `Target audience: ${revision.audienceShift}` : ""}

Respond in JSON with the same structure: { "title": "string", "body": "revised content", "sections": [...], "hashtags": [...], "callToAction": "string" }`;

  const raw = await withRetry(() => generateText({ prompt, model, serverMode: true, signal }));
  const parsed = JSON.parse(extractJson(raw));

  const revised: ContentPiece = {
    ...original,
    title: parsed.title ?? original.title,
    body: parsed.body ?? original.body,
    sections: parsed.sections ?? original.sections,
    hashtags: parsed.hashtags ?? original.hashtags,
    callToAction: parsed.callToAction ?? original.callToAction,
    metadata: {
      ...original.metadata,
      tone: revision.toneShift ?? original.metadata.tone,
      audience: revision.audienceShift ?? original.metadata.audience,
      wordCount: (parsed.body ?? original.body).split(/\s+/).length,
      generatedAt: new Date().toISOString(),
      revisionNumber: original.metadata.revisionNumber + 1,
    },
  };

  const validated = ContentPieceSchema.parse(revised);
  contentStore.set(original.id, validated);
  return validated;
}

/** Generate content in multiple formats for the same idea. */
export async function generateContentBundle(
  idea: InnovationIdea,
  formats: ContentFormat[],
  options: {
    tone?: ContentTone;
    audience?: ContentAudience;
    context?: ContentContext;
    model?: string;
    signal?: AbortSignal;
  } = {}
): Promise<ContentPiece[]> {
  if (formats.length === 0) throw new ValidationError("At least one format is required");
  if (formats.length > 6) throw new ValidationError("Maximum 6 formats per bundle");

  const results: ContentPiece[] = [];
  for (const format of formats) {
    const piece = await generateContent(idea, format, options);
    results.push(piece);
  }
  return results;
}

/** Retrieve a stored content piece. */
export function getContentPiece(id: string): ContentPiece | undefined {
  return contentStore.get(id);
}

/** List all stored content pieces, optionally filtered by format. */
export function listContentPieces(format?: ContentFormat): ContentPiece[] {
  const all = Array.from(contentStore.values());
  return format ? all.filter((p) => p.format === format) : all;
}

/** Clear all stored content. */
export function clearContentPipeline(): void {
  contentStore.clear();
  contentIdCounter = 0;
}

/** Get human-readable label for a content format. */
export function getContentFormatLabel(format: ContentFormat): string {
  const labels: Record<ContentFormat, string> = {
    "blog-post": "Blog Post",
    "twitter-thread": "Twitter/X Thread",
    "linkedin-article": "LinkedIn Article",
    "pitch-deck": "Investor Pitch Deck",
    "internal-memo": "Internal Memo",
    "press-release": "Press Release",
  };
  return labels[format] ?? format;
}
