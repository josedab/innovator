/**
 * @module hypothesis
 *
 * Hypothesis-Driven Innovation: enables users to define a hypothesis and have
 * Innovator generate experiments to test it, counter-evidence, alternative
 * hypotheses, and pivot suggestions. Includes structured experiment cards
 * and hypothesis lifecycle management.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput } from "../prompts/sanitize.js";
import type { Investigation } from "../types.js";

// ---- Schemas ----

/** Schema for a parsed hypothesis. */
export const ParsedHypothesisSchema = z.object({
  statement: z.string().max(2000),
  independentVariable: z.string().max(500),
  dependentVariable: z.string().max(500),
  assumptions: z.array(z.string().max(500)).max(10),
  domain: z.string().max(200),
  testability: z.enum(["easily-testable", "testable", "hard-to-test", "untestable"]),
  confidence: z.number().min(0).max(1),
});

/** Schema for an experiment card. */
export const ExperimentCardSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  hypothesis: z.string().max(2000),
  method: z.string().max(2000),
  metrics: z.array(z.string().max(500)).max(10),
  successCriteria: z.string().max(1000),
  failureCriteria: z.string().max(1000),
  duration: z.string().max(200),
  resources: z.array(z.string().max(500)).max(10),
  risks: z.array(z.string().max(500)).max(10),
  expectedOutcome: z.string().max(1000),
  priority: z.enum(["critical", "high", "medium", "low"]),
});

/** Schema for counter-evidence. */
export const CounterEvidenceSchema = z.object({
  claim: z.string().max(1000),
  evidence: z.string().max(2000),
  source: z.string().max(500).optional(),
  strength: z.enum(["strong", "moderate", "weak"]),
  implication: z.string().max(1000),
});

/** Schema for an alternative hypothesis. */
export const AlternativeHypothesisSchema = z.object({
  statement: z.string().max(2000),
  rationale: z.string().max(2000),
  differentiator: z.string().max(1000),
  testability: z.enum(["easily-testable", "testable", "hard-to-test", "untestable"]),
});

/** Schema for a pivot suggestion. */
export const PivotSuggestionSchema = z.object({
  direction: z.string().max(500),
  rationale: z.string().max(2000),
  newHypothesis: z.string().max(2000),
  effortEstimate: z.enum(["minimal", "moderate", "significant", "major"]),
  riskLevel: z.enum(["low", "medium", "high"]),
});

/** Schema for the full hypothesis analysis. */
export const HypothesisAnalysisSchema = z.object({
  parsedHypothesis: ParsedHypothesisSchema,
  experiments: z.array(ExperimentCardSchema).max(10),
  counterEvidence: z.array(CounterEvidenceSchema).max(10),
  alternativeHypotheses: z.array(AlternativeHypothesisSchema).max(5),
  pivotSuggestions: z.array(PivotSuggestionSchema).max(5),
});

/** Schema for a hypothesis session tracking lifecycle. */
export const HypothesisSessionSchema = z.object({
  id: z.string().max(100),
  originalText: z.string().max(5000),
  analysis: HypothesisAnalysisSchema.optional(),
  status: z.enum([
    "draft",
    "analyzing",
    "analyzed",
    "testing",
    "validated",
    "invalidated",
    "pivoted",
  ]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ---- Types ----

export type ParsedHypothesis = z.infer<typeof ParsedHypothesisSchema>;
export type ExperimentCard = z.infer<typeof ExperimentCardSchema>;
export type CounterEvidence = z.infer<typeof CounterEvidenceSchema>;
export type AlternativeHypothesis = z.infer<typeof AlternativeHypothesisSchema>;
export type PivotSuggestion = z.infer<typeof PivotSuggestionSchema>;
export type HypothesisAnalysis = z.infer<typeof HypothesisAnalysisSchema>;
export type HypothesisSession = z.infer<typeof HypothesisSessionSchema>;

// ---- In-memory store ----

const hypothesisSessions: Map<string, HypothesisSession> = new Map();
let sessionCounter = 0;

// ---- Prompt builders ----

function buildHypothesisPrompt(hypothesisText: string, investigation?: Investigation): string {
  const context = investigation
    ? `\nCONTEXT:\nSummary: ${investigation.summary}\nChallenges: ${investigation.challenges.join("; ")}\nOpportunities: ${investigation.opportunities.join("; ")}`
    : "";

  return `You are a scientific methodology expert and innovation strategist. Analyze the following hypothesis and generate a comprehensive testing framework.

${wrapUserInput("HYPOTHESIS", hypothesisText)}
${context}

Provide:
1. **parsedHypothesis**: Parse the hypothesis into structured components (independent/dependent variables, assumptions, domain, testability, confidence)
2. **experiments**: 3-5 experiment cards to test this hypothesis (each with method, metrics, success/failure criteria, duration, resources)
3. **counterEvidence**: 2-4 pieces of counter-evidence or contradictory findings
4. **alternativeHypotheses**: 2-3 alternative hypotheses that could explain the same phenomena
5. **pivotSuggestions**: 2-3 pivot directions if the hypothesis proves false

You MUST respond with valid JSON only — no markdown, no explanation outside the JSON.

{
  "parsedHypothesis": {
    "statement": "Refined hypothesis statement",
    "independentVariable": "The variable being manipulated",
    "dependentVariable": "The variable being measured",
    "assumptions": ["assumption 1"],
    "domain": "Domain area",
    "testability": "testable",
    "confidence": 0.7
  },
  "experiments": [
    {
      "id": "exp-1",
      "title": "Experiment title",
      "hypothesis": "Specific sub-hypothesis",
      "method": "How to conduct the experiment",
      "metrics": ["metric 1"],
      "successCriteria": "What constitutes success",
      "failureCriteria": "What constitutes failure",
      "duration": "2 weeks",
      "resources": ["resource 1"],
      "risks": ["risk 1"],
      "expectedOutcome": "Expected result",
      "priority": "high"
    }
  ],
  "counterEvidence": [
    {
      "claim": "Counter claim",
      "evidence": "Supporting evidence",
      "strength": "moderate",
      "implication": "What this means for the hypothesis"
    }
  ],
  "alternativeHypotheses": [
    {
      "statement": "Alternative hypothesis",
      "rationale": "Why this is plausible",
      "differentiator": "How to distinguish from original",
      "testability": "testable"
    }
  ],
  "pivotSuggestions": [
    {
      "direction": "Pivot direction",
      "rationale": "Why pivot here",
      "newHypothesis": "New hypothesis after pivot",
      "effortEstimate": "moderate",
      "riskLevel": "medium"
    }
  ]
}`;
}

// ---- Core functions ----

/**
 * Parse a natural language hypothesis into structured components.
 * Lightweight local parsing without LLM call.
 */
export function parseHypothesis(text: string): {
  statement: string;
  isWellFormed: boolean;
  suggestions: string[];
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      statement: "",
      isWellFormed: false,
      suggestions: ["Hypothesis text cannot be empty."],
    };
  }

  const suggestions: string[] = [];
  const _lower = trimmed.toLowerCase();

  // Check for hypothesis structure indicators
  const hasIfThen = /\bif\b.*\bthen\b/i.test(trimmed);
  const hasCausal = /\b(because|causes?|leads?\s+to|results?\s+in|increases?|decreases?)\b/i.test(
    trimmed
  );
  const hasVariable = /\b(more|less|increase|decrease|higher|lower|greater|fewer)\b/i.test(trimmed);

  if (!hasIfThen && !hasCausal) {
    suggestions.push("Consider using 'If [condition], then [outcome]' format for clarity.");
  }
  if (!hasVariable) {
    suggestions.push(
      "Include measurable variables (e.g., 'increases', 'decreases', 'more', 'less')."
    );
  }
  if (trimmed.length < 20) {
    suggestions.push(
      "Hypothesis seems too brief. Add more detail about variables and expected outcomes."
    );
  }
  if (!trimmed.endsWith(".") && !trimmed.endsWith("?")) {
    suggestions.push("End the hypothesis with a period for clarity.");
  }

  return {
    statement: trimmed,
    isWellFormed: suggestions.length === 0,
    suggestions,
  };
}

/**
 * Analyze a hypothesis using AI to generate experiments, counter-evidence, and alternatives.
 */
export async function analyzeHypothesis(
  hypothesisText: string,
  investigation?: Investigation,
  model?: string,
  signal?: AbortSignal
): Promise<HypothesisAnalysis> {
  const prompt = buildHypothesisPrompt(hypothesisText, investigation);

  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, serverMode: true, signal });
      const jsonStr = extractJson(raw);
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        throw new Error(`Failed to parse hypothesis response as JSON: ${jsonStr.slice(0, 200)}`);
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

  return HypothesisAnalysisSchema.parse(parsed);
}

/**
 * Create a new hypothesis session.
 */
export function createHypothesisSession(hypothesisText: string): HypothesisSession {
  const id = `hyp-${++sessionCounter}-${Date.now()}`;
  const now = new Date().toISOString();
  const session: HypothesisSession = {
    id,
    originalText: hypothesisText,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  hypothesisSessions.set(id, session);
  return session;
}

/**
 * Get a hypothesis session by ID.
 */
export function getHypothesisSession(id: string): HypothesisSession | undefined {
  return hypothesisSessions.get(id);
}

/**
 * List all hypothesis sessions.
 */
export function listHypothesisSessions(): HypothesisSession[] {
  return Array.from(hypothesisSessions.values());
}

/**
 * Update hypothesis session status.
 */
export function updateHypothesisStatus(
  id: string,
  status: HypothesisSession["status"]
): HypothesisSession | undefined {
  const session = hypothesisSessions.get(id);
  if (!session) return undefined;
  session.status = status;
  session.updatedAt = new Date().toISOString();
  return session;
}

/**
 * Attach analysis results to a hypothesis session.
 */
export function attachAnalysis(
  id: string,
  analysis: HypothesisAnalysis
): HypothesisSession | undefined {
  const session = hypothesisSessions.get(id);
  if (!session) return undefined;
  session.analysis = analysis;
  session.status = "analyzed";
  session.updatedAt = new Date().toISOString();
  return session;
}

/**
 * Clear all hypothesis sessions.
 */
export function clearHypothesisSessions(): void {
  hypothesisSessions.clear();
  sessionCounter = 0;
}
