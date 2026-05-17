/**
 * @module __test-utils__/factories
 *
 * Shared test data factories for creating typed mock objects.
 * Use these instead of hand-crafting test data in every test file.
 *
 * @example
 * ```typescript
 * import { makeInvestigation, makeAngleResult } from "../__test-utils__/factories.js";
 *
 * const investigation = makeInvestigation({ summary: "Custom summary" });
 * const result = makeAngleResult({ angleId: "scamper", ideas: [makeIdea()] });
 * ```
 */

import type {
  Investigation,
  InnovationIdea,
  AngleResult,
  Synthesis,
  PipelineProgress,
} from "../types.js";

// ---- Investigation ----

export function makeInvestigation(overrides: Partial<Investigation> = {}): Investigation {
  return {
    summary: "A comprehensive investigation of the subject.",
    keyAspects: [
      { title: "Aspect 1", description: "First key aspect of the subject." },
      { title: "Aspect 2", description: "Second key aspect of the subject." },
    ],
    currentState: "The subject is in an active state of development.",
    challenges: ["Challenge A", "Challenge B"],
    opportunities: ["Opportunity X", "Opportunity Y"],
    ...overrides,
  };
}

// ---- InnovationIdea ----

let ideaCounter = 0;

export function makeIdea(overrides: Partial<InnovationIdea> = {}): InnovationIdea {
  ideaCounter++;
  return {
    title: `Test Idea ${ideaCounter}`,
    description: `Description for test idea ${ideaCounter}.`,
    potentialImpact: "Medium impact on the target domain.",
    implementationHint: "Start with a prototype.",
    ...overrides,
  };
}

// ---- AngleResult ----

export function makeAngleResult(overrides: Partial<AngleResult> = {}): AngleResult {
  return {
    angleId: "scamper",
    angleName: "SCAMPER",
    ideas: [makeIdea(), makeIdea()],
    reasoning:
      "Applied the SCAMPER framework to explore substitution and combination opportunities.",
    ...overrides,
  };
}

// ---- Synthesis ----

export function makeSynthesis(overrides: Partial<Synthesis> = {}): Synthesis {
  return {
    topIdeas: [
      {
        title: "Top Idea 1",
        description: "The most promising idea from the synthesis.",
        sourceAngle: "scamper",
        potentialImpact: "High impact potential.",
        feasibility: "high" as const,
      },
      {
        title: "Top Idea 2",
        description: "A complementary secondary idea.",
        sourceAngle: "first-principles",
        potentialImpact: "Medium impact potential.",
        feasibility: "medium" as const,
      },
    ],
    themes: ["innovation", "efficiency", "sustainability"],
    recommendation:
      "Focus on Top Idea 1 as the primary initiative, with Top Idea 2 as a supporting effort.",
    ...overrides,
  };
}

// ---- PipelineProgress ----

export function makePipelineProgress(overrides: Partial<PipelineProgress> = {}): PipelineProgress {
  return {
    stage: "investigating",
    completedAngles: [],
    totalAngles: 8,
    angleResults: [],
    ...overrides,
  };
}

// ---- Session Record (for history) ----

export interface MockSessionRecord {
  id: string;
  subject: string;
  investigation: Investigation;
  angleResults: AngleResult[];
  synthesis: Synthesis | null;
  createdAt: string;
}

let sessionCounter = 0;

export function makeSessionRecord(overrides: Partial<MockSessionRecord> = {}): MockSessionRecord {
  sessionCounter++;
  return {
    id: `session-${sessionCounter}`,
    subject: `Test Subject ${sessionCounter}`,
    investigation: makeInvestigation(),
    angleResults: [makeAngleResult()],
    synthesis: makeSynthesis(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---- Attack (for gauntlet) ----

import type { Attack, GauntletResult } from "../gauntlet/types.js";

export function makeAttack(overrides: Partial<Attack> = {}): Attack {
  return {
    adversaryRole: "skeptic",
    category: "flawed-assumption",
    severity: 5,
    title: "Test Attack",
    reasoning: "This assumption lacks supporting evidence.",
    evidence: "No market data supports the claimed adoption rate.",
    suggestedCounter: "Conduct a survey or pilot to validate the assumption.",
    ...overrides,
  };
}

// ---- GauntletResult ----

let gauntletCounter = 0;

export function makeGauntletResult(overrides: Partial<GauntletResult> = {}): GauntletResult {
  gauntletCounter++;
  return {
    id: `gauntlet-${gauntletCounter}`,
    ideaTitle: `Gauntlet Idea ${gauntletCounter}`,
    ideaDescription: `Description of stress-tested idea ${gauntletCounter}.`,
    attacks: [makeAttack()],
    survivabilityIndex: 72,
    transcript: [
      {
        adversaryRole: "skeptic",
        attacks: [makeAttack()],
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---- Temporal Memory Session Ingestion ----

import type { SessionIngestion } from "../temporal-memory/types.js";

export function makeSessionIngestion(overrides: Partial<SessionIngestion> = {}): SessionIngestion {
  return {
    sessionId: `session-${Date.now()}`,
    subject: "AI Ethics",
    investigation: {
      summary: "Investigation of AI ethics challenges.",
      keyAspects: [{ title: "Bias in AI", description: "Algorithmic bias and fairness concerns." }],
      challenges: ["Lack of regulation"],
      opportunities: ["Ethical AI frameworks"],
    },
    ideas: [
      {
        title: "Bias Detection Tool",
        description: "Automated bias scanner.",
        angleId: "first-principles",
      },
    ],
    themes: ["fairness"],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ---- AnonymizedPattern (for federation-dp) ----

import type { AnonymizedPattern } from "../federation-dp/types.js";

let patternCounter = 0;

export function makeAnonymizedPattern(
  overrides: Partial<AnonymizedPattern> = {}
): AnonymizedPattern {
  patternCounter++;
  return {
    id: `dp-${patternCounter.toString().padStart(8, "0")}`,
    type: "angle-effectiveness",
    angleId: "scamper",
    topicCategory: "technology",
    noisedValue: 0.75,
    ciLower: 0.6,
    ciUpper: 0.9,
    sampleSize: 10,
    epoch: "2025-01",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
