import { z } from "zod";

const MAX_ANALYSIS_FILES = 1_000;

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
  angleId: z.string().min(1).describe("The creativity angle to apply"),
  model: z.string().optional().describe("Optional LLM model override"),
});

export const AutoPipelineInputSchema = z.object({
  subject: z.string().min(1).max(500).describe("The topic to run the full innovation pipeline on"),
  model: z.string().optional().describe("Optional LLM model override"),
  angles: z.array(z.string()).optional().describe("Optional subset of angle IDs to use"),
});

export const InnovateFromCodeInputSchema = z.object({
  path: z.string().min(1).describe("Path to the repository or directory to analyze"),
  maxFiles: z
    .number()
    .int()
    .min(1)
    .max(MAX_ANALYSIS_FILES)
    .optional()
    .describe("Maximum files to analyze (default: 200, maximum: 1000)"),
});

export const InnovateFileInputSchema = z.object({
  path: z.string().min(1).describe("Path to the specific file to analyze"),
});

export const InnovateArchitectureInputSchema = z.object({
  path: z.string().min(1).describe("Path to the repository"),
});

export const NLInnovateInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(5000)
    .describe("Natural language description of the innovation task"),
  model: z.string().optional().describe("Optional LLM model override"),
});

export const MemorySearchInputSchema = z.object({
  query: z.string().min(1).max(2000).describe("Search query for finding related past ideas"),
  threshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Similarity threshold (0-1, default 0.3)"),
  limit: z.number().min(1).max(50).optional().describe("Maximum results to return (default 10)"),
});

export const OrgDNAInputSchema = z.object({
  format: z.enum(["json", "markdown"]).optional().describe("Output format (default: json)"),
});

export const PersonaEvalInputSchema = z.object({
  idea: z.string().min(1).max(5000).describe("The idea to evaluate"),
  personaIds: z
    .array(z.string())
    .min(1)
    .max(12)
    .describe("Persona IDs to evaluate with (e.g., cto, end-user, investor, regulator)"),
  model: z.string().optional().describe("Optional LLM model override"),
});

export const AutonomousInnovateInputSchema = z.object({
  subject: z.string().min(1).max(500).describe("The topic to explore autonomously"),
  maxBranches: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum exploration branches (default: 10)"),
  maxDepth: z.number().min(1).max(10).optional().describe("Maximum branch depth (default: 3)"),
  strategy: z
    .enum(["breadth-first", "depth-first", "adaptive"])
    .optional()
    .describe("Exploration strategy (default: adaptive)"),
  model: z.string().optional().describe("Optional LLM model override"),
});

export const SwarmInnovateInputSchema = z.object({
  subject: z.string().min(1).max(500).describe("The topic to explore via swarm intelligence"),
  agentCount: z.number().min(2).max(8).optional().describe("Number of agents (default: 4)"),
  maxIterations: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Max debate iterations (default: 3)"),
  model: z.string().optional().describe("Optional LLM model override"),
});

export const NetworkInsightsInputSchema = z.object({
  domainHint: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Domain category hint (e.g., fintech, healthcare, saas)"),
  angleId: z.string().optional().describe("Filter insights for a specific angle"),
});

export const NoveltyCheckInputSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().max(500),
        description: z.string().max(5000),
      })
    )
    .min(1)
    .max(20)
    .describe("Ideas to check for novelty"),
  domain: z.string().max(200).optional().describe("Domain context for more accurate matching"),
});

export type InvestigateInput = z.infer<typeof InvestigateInputSchema>;
export type GenerateInput = z.infer<typeof GenerateInputSchema>;
export type AutoPipelineInput = z.infer<typeof AutoPipelineInputSchema>;
