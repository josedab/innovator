import { z } from "zod";

// ---- Angles ----

export const ANGLE_IDS = [
  "scamper",
  "first-principles",
  "cross-domain",
  "constraints",
  "inversion",
  "perspectives",
  "what-if",
  "trend-collision",
] as const;

export type AngleId = (typeof ANGLE_IDS)[number];

export interface AngleDefinition {
  id: AngleId;
  name: string;
  shortDescription: string;
  icon: string;
}

// ---- Investigation ----

export const InvestigationSchema = z.object({
  summary: z.string().describe("A concise summary of the subject"),
  keyAspects: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
      })
    )
    .describe("Key aspects or components of the subject"),
  currentState: z.string().describe("Current state of the art or practice"),
  challenges: z.array(z.string()).describe("Main challenges or pain points"),
  opportunities: z.array(z.string()).describe("Potential opportunity areas"),
});

export type Investigation = z.infer<typeof InvestigationSchema>;

// ---- Innovation ----

export const InnovationIdeaSchema = z.object({
  title: z.string(),
  description: z.string(),
  potentialImpact: z.string(),
  implementationHint: z.string(),
});

export const AngleResultSchema = z.object({
  angleId: z.string(),
  angleName: z.string(),
  ideas: z.array(InnovationIdeaSchema),
  reasoning: z.string().describe("How this angle was applied"),
});

export type InnovationIdea = z.infer<typeof InnovationIdeaSchema>;
export type AngleResult = z.infer<typeof AngleResultSchema>;

// ---- Auto-Mode Pipeline ----

export const SynthesisSchema = z.object({
  topIdeas: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      sourceAngle: z.string(),
      potentialImpact: z.string(),
      feasibility: z.enum(["low", "medium", "high"]),
    })
  ),
  themes: z.array(z.string()).describe("Cross-cutting themes found"),
  recommendation: z.string().describe("Overall strategic recommendation"),
});

export type Synthesis = z.infer<typeof SynthesisSchema>;

export type PipelineStage =
  | "investigating"
  | "generating"
  | "synthesizing"
  | "complete"
  | "error";

export interface PipelineProgress {
  stage: PipelineStage;
  currentAngle?: string;
  completedAngles: string[];
  totalAngles: number;
  investigation?: Investigation;
  angleResults: AngleResult[];
  synthesis?: Synthesis;
  error?: string;
}

// ---- Request / Response ----

export interface InvestigateRequest {
  subject: string;
  model?: string;
}

export interface InnovateRequest {
  subject: string;
  investigation: Investigation;
  angles: AngleId[];
  model?: string;
}

export interface AutoRequest {
  subject: string;
  model?: string;
}
