/**
 * @module chaining
 *
 * Angle chaining allows composing multiple innovation angles into
 * a pipeline where the output of one angle feeds as context into the next.
 */

import { z } from "zod";
import type { AngleId, AngleResult, Investigation } from "../types.js";
import { generateForAngle } from "../innovation/generate.js";

// ---- Types ----

export interface AngleChainStep {
  angleId: AngleId | string;
  /** Optional filter to select which ideas from previous step to pass forward. */
  contextFilter?: "top3" | "all" | "highest-impact";
}

export interface AngleChain {
  id: string;
  name: string;
  description: string;
  steps: AngleChainStep[];
}

export const AngleChainStepSchema = z.object({
  angleId: z.string().min(1).max(100),
  contextFilter: z.enum(["top3", "all", "highest-impact"]).optional(),
});

export const AngleChainSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  steps: z.array(AngleChainStepSchema).min(2).max(10),
});

// ---- Default Chains ----

export const DEFAULT_CHAINS: AngleChain[] = [
  {
    id: "deep-disruption",
    name: "Deep Disruption",
    description:
      "Decompose to fundamentals, then invert assumptions, then explore hypotheticals for maximum disruption",
    steps: [
      { angleId: "first-principles", contextFilter: "all" },
      { angleId: "inversion", contextFilter: "top3" },
      { angleId: "what-if", contextFilter: "highest-impact" },
    ],
  },
  {
    id: "practical-innovation",
    name: "Practical Innovation",
    description:
      "Start with systematic SCAMPER modifications, add constraints for creativity, then explore stakeholder perspectives",
    steps: [
      { angleId: "scamper", contextFilter: "all" },
      { angleId: "constraints", contextFilter: "top3" },
      { angleId: "perspectives", contextFilter: "highest-impact" },
    ],
  },
  {
    id: "market-entry",
    name: "Market Entry",
    description:
      "Borrow ideas from other domains, collide with trends, then view through stakeholder lenses for go-to-market",
    steps: [
      { angleId: "cross-domain", contextFilter: "all" },
      { angleId: "trend-collision", contextFilter: "top3" },
      { angleId: "perspectives", contextFilter: "highest-impact" },
    ],
  },
  {
    id: "contrarian-path",
    name: "Contrarian Path",
    description:
      "Invert the problem, challenge with constraints, then collide with trends for contrarian innovation",
    steps: [
      { angleId: "inversion", contextFilter: "all" },
      { angleId: "constraints", contextFilter: "top3" },
      { angleId: "trend-collision", contextFilter: "highest-impact" },
    ],
  },
  {
    id: "full-spectrum",
    name: "Full Spectrum",
    description:
      "Systematic SCAMPER → First Principles decomposition → Cross-domain inspiration → What-if exploration",
    steps: [
      { angleId: "scamper", contextFilter: "all" },
      { angleId: "first-principles", contextFilter: "top3" },
      { angleId: "cross-domain", contextFilter: "top3" },
      { angleId: "what-if", contextFilter: "highest-impact" },
    ],
  },
];

// ---- Chain Execution ----

/** Filter ideas from a step result based on the context filter. */
function filterIdeas(result: AngleResult, filter: AngleChainStep["contextFilter"]): string {
  const ideas = result.ideas;
  switch (filter) {
    case "top3":
      return ideas
        .slice(0, 3)
        .map((i) => `- ${i.title}: ${i.description}`)
        .join("\n");
    case "highest-impact":
      return ideas
        .slice(0, 1)
        .map((i) => `- ${i.title}: ${i.description} (Impact: ${i.potentialImpact})`)
        .join("\n");
    case "all":
    default:
      return ideas.map((i) => `- ${i.title}: ${i.description}`).join("\n");
  }
}

export interface ChainProgress {
  chainId: string;
  currentStep: number;
  totalSteps: number;
  currentAngleId: string;
  completedResults: AngleResult[];
}

/**
 * Run an angle chain, passing filtered context from each step to the next.
 * The investigation is enriched with prior step results at each stage.
 */
export async function runChain(
  chain: AngleChain,
  subject: string,
  investigation: Investigation,
  onProgress?: (progress: ChainProgress) => void,
  model?: string,
  signal?: AbortSignal
): Promise<AngleResult[]> {
  const results: AngleResult[] = [];

  for (let i = 0; i < chain.steps.length; i++) {
    if (signal?.aborted) break;

    const step = chain.steps[i];

    onProgress?.({
      chainId: chain.id,
      currentStep: i + 1,
      totalSteps: chain.steps.length,
      currentAngleId: step.angleId,
      completedResults: [...results],
    });

    // Enrich investigation with prior step context
    let enrichedInvestigation = investigation;
    if (results.length > 0) {
      const priorContext = results
        .map((r) => {
          const filtered = filterIdeas(r, step.contextFilter);
          return `[${r.angleName}]:\n${filtered}`;
        })
        .join("\n\n");

      enrichedInvestigation = {
        ...investigation,
        summary: `${investigation.summary}\n\nPRIOR CHAIN RESULTS:\n${priorContext}`,
      };
    }

    const result = await generateForAngle(
      subject,
      enrichedInvestigation,
      step.angleId,
      model,
      signal
    );
    results.push(result);
  }

  return results;
}

/** Get a chain by ID from the default chains. */
export function getChainById(id: string): AngleChain | undefined {
  return DEFAULT_CHAINS.find((c) => c.id === id);
}

/** List all available chains. */
export function listChains(): AngleChain[] {
  return [...DEFAULT_CHAINS];
}
