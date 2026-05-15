import { z } from "zod";

// ---- Audience Profiles ----

/** Validates the target audience for a narrative (e.g., investor, executive, customer). */
export const AudienceTypeSchema = z.enum([
  "investor",
  "executive",
  "technical-team",
  "customer",
  "board",
  "media",
  "internal-advocate",
  "general-public",
]);

/** Target audience identifier for narrative generation. @see AudienceTypeSchema */
export type AudienceType = z.infer<typeof AudienceTypeSchema>;

/**
 * Predefined audience profiles mapping each audience type to its preferred tone,
 * content focus areas, and maximum narrative length.
 * @see AudienceType
 */
export const AUDIENCE_PROFILES: Record<
  AudienceType,
  { tone: string; focus: string; maxLength: string }
> = {
  investor: {
    tone: "Confident, data-driven, opportunity-focused",
    focus: "Market size, ROI, competitive advantage, team, traction",
    maxLength: "1500 words",
  },
  executive: {
    tone: "Strategic, concise, decision-oriented",
    focus: "Business impact, resource requirements, risk assessment, timeline",
    maxLength: "800 words",
  },
  "technical-team": {
    tone: "Precise, technically detailed, implementation-focused",
    focus: "Architecture, tech stack, feasibility, dependencies, timeline",
    maxLength: "2000 words",
  },
  customer: {
    tone: "Empathetic, benefit-focused, clear",
    focus: "Problem solved, user experience, pricing, availability",
    maxLength: "600 words",
  },
  board: {
    tone: "Formal, strategic, governance-aware",
    focus: "Strategic alignment, financial impact, risk, competitive position",
    maxLength: "1000 words",
  },
  media: {
    tone: "Newsworthy, quotable, story-driven",
    focus: "Innovation angle, human interest, market impact, quotes",
    maxLength: "500 words",
  },
  "internal-advocate": {
    tone: "Enthusiastic, practical, team-focused",
    focus: "Why this matters, quick wins, team buy-in, next steps",
    maxLength: "600 words",
  },
  "general-public": {
    tone: "Simple, engaging, jargon-free",
    focus: "What it does, why it matters, real-world impact",
    maxLength: "400 words",
  },
};

// ---- Narrative Formats ----

/** Validates the output format for a narrative (e.g., pitch-deck-script, executive-memo, press-release). */
export const NarrativeFormatSchema = z.enum([
  "pitch-deck-script",
  "executive-memo",
  "blog-post",
  "tweet-thread",
  "elevator-pitch",
  "technical-rfc",
  "press-release",
  "internal-memo",
  "customer-story",
  "one-pager",
]);

/** Output format for a generated narrative. @see NarrativeFormatSchema */
export type NarrativeFormat = z.infer<typeof NarrativeFormatSchema>;

// ---- Narrative Archetypes ----

/** Validates the story archetype used to structure a narrative (e.g., hero-journey, problem-solution). */
export const NarrativeArchetypeSchema = z.enum([
  "hero-journey",
  "problem-solution",
  "before-after",
  "vision-reality-gap",
  "underdog-story",
  "inevitable-future",
  "data-revelation",
]);

/** Story archetype that determines the narrative's structural flow. @see NarrativeArchetypeSchema */
export type NarrativeArchetype = z.infer<typeof NarrativeArchetypeSchema>;

/**
 * Section headings for each story archetype, defining the structural
 * progression of the narrative (e.g., challenge → discovery → breakthrough → transformation).
 * @see NarrativeArchetype
 */
export const ARCHETYPE_STRUCTURES: Record<NarrativeArchetype, string[]> = {
  "hero-journey": [
    "The challenge we face",
    "The journey of discovery",
    "The breakthrough moment",
    "The transformation ahead",
  ],
  "problem-solution": [
    "The problem that needs solving",
    "Why current approaches fall short",
    "Our innovative solution",
    "The impact and results",
  ],
  "before-after": [
    "The world before",
    "The catalyst for change",
    "The world after",
    "How to get there",
  ],
  "vision-reality-gap": [
    "The vision we aspire to",
    "The reality gap today",
    "Bridging the gap",
    "The path forward",
  ],
  "underdog-story": [
    "The dominant status quo",
    "The overlooked opportunity",
    "The scrappy solution",
    "The upset victory path",
  ],
  "inevitable-future": [
    "The unstoppable trend",
    "Why resistance is futile",
    "Our position in the wave",
    "The first-mover advantage",
  ],
  "data-revelation": [
    "The surprising data point",
    "What it reveals",
    "The implication for action",
    "The evidence-based path",
  ],
};

// ---- Generated Narrative ----

/**
 * Validates a generated narrative including its content, structure, audience targeting,
 * and metadata such as key messages and estimated read time.
 * @see AudienceTypeSchema
 * @see NarrativeFormatSchema
 * @see NarrativeArchetypeSchema
 */
export const NarrativeSchema = z.object({
  id: z.string(),
  ideaTitle: z.string().max(500),
  audience: AudienceTypeSchema,
  format: NarrativeFormatSchema,
  archetype: NarrativeArchetypeSchema,
  title: z.string().max(500),
  content: z.string().max(20000),
  sections: z
    .array(
      z.object({
        heading: z.string().max(200),
        content: z.string().max(5000),
      })
    )
    .max(20),
  keyMessages: z.array(z.string().max(500)).max(10),
  callToAction: z.string().max(1000),
  estimatedReadTime: z.string().max(50),
});

/** A single generated narrative tailored to a specific audience, format, and archetype. */
export type Narrative = z.infer<typeof NarrativeSchema>;

// ---- Narrative Bundle ----

/** Validates a bundle of narratives generated for the same idea across multiple audiences/formats. */
export const NarrativeBundleSchema = z.object({
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  narratives: z.array(NarrativeSchema),
  generatedAt: z.string(),
});

/** A collection of narratives generated for a single idea, with source metadata. */
export type NarrativeBundle = z.infer<typeof NarrativeBundleSchema>;

// ---- Config ----

/** Configuration options for narrative generation, including audience/format selection and progress tracking. */
export interface NarrativeConfig {
  audiences?: AudienceType[];
  formats?: NarrativeFormat[];
  archetype?: NarrativeArchetype;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (progress: NarrativeProgress) => void;
}

/** Progress state emitted during narrative generation via {@link NarrativeConfig.onProgress}. */
export interface NarrativeProgress {
  stage: "generating" | "complete";
  completedNarratives: number;
  totalNarratives: number;
  currentAudience?: string;
  currentFormat?: string;
}
