import { z } from "zod";

export const CapabilityNodeSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(500),
  type: z.enum(["module", "api", "service", "library", "infrastructure"]),
  description: z.string().max(2000),
  dependencies: z.array(z.string()).max(50),
  metadata: z.record(z.unknown()).optional(),
});
export type CapabilityNode = z.infer<typeof CapabilityNodeSchema>;

export const CapabilityGraphSchema = z.object({
  nodes: z.array(CapabilityNodeSchema),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: z.enum(["depends-on", "extends", "uses", "enables"]),
    })
  ),
  analyzedAt: z.string(),
});
export type CapabilityGraph = z.infer<typeof CapabilityGraphSchema>;

export const CodeDeltaSchema = z.object({
  id: z.string(),
  files: z
    .array(
      z.object({
        path: z.string(),
        changeType: z.enum(["added", "modified", "deleted"]),
        summary: z.string().max(500).optional(),
      })
    )
    .max(200),
  detectedAt: z.string(),
  commitRef: z.string().optional(),
});
export type CodeDelta = z.infer<typeof CodeDeltaSchema>;

export const InnovationOpportunitySchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  description: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  category: z.enum(["new-product", "optimization", "integration", "platform-play", "developer-tool"]),
  unlockedBy: z.array(z.string()), // capability node IDs
  effort: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
  suggestedArtifacts: z.array(z.enum(["prd", "adr", "github-issue", "tech-spec"])).optional(),
});
export type InnovationOpportunity = z.infer<typeof InnovationOpportunitySchema>;
