import { z } from "zod";
import type { AngleId, Investigation, PipelineProgress } from "@innovator/core";
import { ANGLE_IDS } from "@innovator/core";

export const InvestigateInputSchema = z.object({
  subject: z.string().min(1).max(500).describe("The topic or domain to investigate"),
  model: z.string().optional().describe("Optional LLM model override"),
});

export const GenerateInputSchema = z.object({
  subject: z.string().min(1).max(500).describe("The topic to innovate on"),
  investigation: z
    .object({
      summary: z.string(),
      keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
      currentState: z.string(),
      challenges: z.array(z.string()),
      opportunities: z.array(z.string()),
    })
    .describe("Previously generated investigation context"),
  angleId: z.string().min(1).describe("The creativity angle to apply (e.g. scamper, inversion)"),
  model: z.string().optional().describe("Optional LLM model override"),
});

export const AutoPipelineInputSchema = z.object({
  subject: z.string().min(1).max(500).describe("The topic to run the full innovation pipeline on"),
  model: z.string().optional().describe("Optional LLM model override"),
  angles: z.array(z.string()).optional().describe("Optional subset of angle IDs to use"),
});

export type InvestigateInput = z.infer<typeof InvestigateInputSchema>;
export type GenerateInput = z.infer<typeof GenerateInputSchema>;
export type AutoPipelineInput = z.infer<typeof AutoPipelineInputSchema>;
