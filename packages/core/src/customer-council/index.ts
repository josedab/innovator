/**
 * @module customer-council
 *
 * Synthetic Customer Council — 10 pre-built customer archetypes,
 * council evaluation protocol with natural language feedback and
 * enthusiasm scoring, and calibration tracking.
 */

import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type {
  CustomerPersona,
  CouncilEvaluation,
  CouncilVerdict,
  CalibrationRecord,
  CouncilConfig,
} from "./types.js";
import {
  CustomerPersonaSchema,
  CouncilEvaluationSchema,
  CouncilVerdictSchema,
  CalibrationRecordSchema,
} from "./types.js";

export * from "./types.js";

// ---- Built-in Customer Archetypes (10) ----

const BUILT_IN_PERSONAS: CustomerPersona[] = [
  {
    id: "early-adopter",
    name: "Alex Chen",
    archetype: "Tech Early Adopter",
    ageRange: "25-35",
    incomeBracket: "$80K-$150K",
    occupation: "Software Engineer",
    traits: ["novelty-seeking", "tech-savvy", "social-media-active", "data-driven"],
    painPoints: ["outdated tools", "slow innovation cycles", "vendor lock-in"],
    values: ["cutting-edge technology", "efficiency", "open standards"],
    techSavviness: "expert",
    priceSensitivity: 4,
    riskTolerance: 9,
    brandLoyalty: 3,
  },
  {
    id: "budget-conscious",
    name: "Maria Santos",
    archetype: "Budget-Conscious Parent",
    ageRange: "30-45",
    incomeBracket: "$40K-$70K",
    occupation: "Teacher",
    traits: ["practical", "family-oriented", "value-seeking", "skeptical-of-hype"],
    painPoints: ["high costs", "complex products", "time constraints"],
    values: ["family well-being", "value for money", "simplicity"],
    techSavviness: "medium",
    priceSensitivity: 9,
    riskTolerance: 3,
    brandLoyalty: 7,
  },
  {
    id: "enterprise-buyer",
    name: "James O'Brien",
    archetype: "Enterprise Decision Maker",
    ageRange: "40-55",
    incomeBracket: "$150K-$300K",
    occupation: "VP of Engineering",
    traits: ["risk-averse", "roi-focused", "compliance-aware", "consensus-builder"],
    painPoints: ["integration complexity", "security risks", "team adoption"],
    values: ["reliability", "ROI", "security", "vendor support"],
    techSavviness: "high",
    priceSensitivity: 5,
    riskTolerance: 3,
    brandLoyalty: 8,
  },
  {
    id: "gen-z-creator",
    name: "Jordan Taylor",
    archetype: "Gen Z Content Creator",
    ageRange: "18-25",
    incomeBracket: "$20K-$60K",
    occupation: "Freelance Creator",
    traits: ["creative", "social-first", "authenticity-driven", "mobile-native"],
    painPoints: ["monetization", "algorithm changes", "burnout"],
    values: ["authenticity", "self-expression", "community", "sustainability"],
    techSavviness: "high",
    priceSensitivity: 7,
    riskTolerance: 7,
    brandLoyalty: 2,
  },
  {
    id: "retiree",
    name: "Barbara Williams",
    archetype: "Active Retiree",
    ageRange: "60-75",
    incomeBracket: "$50K-$100K",
    occupation: "Retired Executive",
    traits: ["experienced", "quality-focused", "time-rich", "health-conscious"],
    painPoints: ["complex interfaces", "subscription fatigue", "privacy concerns"],
    values: ["quality of life", "health", "legacy", "simplicity"],
    techSavviness: "low",
    priceSensitivity: 5,
    riskTolerance: 2,
    brandLoyalty: 9,
  },
  {
    id: "startup-founder",
    name: "Priya Patel",
    archetype: "Startup Founder",
    ageRange: "28-40",
    incomeBracket: "$60K-$200K",
    occupation: "CEO / Founder",
    traits: ["ambitious", "resourceful", "speed-oriented", "network-driven"],
    painPoints: ["limited budget", "hiring", "scaling challenges"],
    values: ["speed", "growth", "innovation", "flexibility"],
    techSavviness: "expert",
    priceSensitivity: 6,
    riskTolerance: 9,
    brandLoyalty: 2,
  },
  {
    id: "small-biz-owner",
    name: "Carlos Rodriguez",
    archetype: "Small Business Owner",
    ageRange: "35-55",
    incomeBracket: "$50K-$120K",
    occupation: "Restaurant Owner",
    traits: ["hands-on", "local-community-focused", "pragmatic", "time-poor"],
    painPoints: ["too many tools", "lack of tech support", "thin margins"],
    values: ["reliability", "local community", "simplicity", "personal touch"],
    techSavviness: "low",
    priceSensitivity: 8,
    riskTolerance: 4,
    brandLoyalty: 6,
  },
  {
    id: "healthcare-pro",
    name: "Dr. Sarah Kim",
    archetype: "Healthcare Professional",
    ageRange: "30-50",
    incomeBracket: "$100K-$300K",
    occupation: "Physician",
    traits: ["evidence-based", "compliance-focused", "patient-centric", "time-constrained"],
    painPoints: ["EHR usability", "administrative burden", "regulatory compliance"],
    values: ["patient outcomes", "evidence", "efficiency", "privacy"],
    techSavviness: "medium",
    priceSensitivity: 3,
    riskTolerance: 2,
    brandLoyalty: 7,
  },
  {
    id: "sustainability-advocate",
    name: "Aisha Johnson",
    archetype: "Sustainability Advocate",
    ageRange: "25-40",
    incomeBracket: "$50K-$100K",
    occupation: "Environmental Consultant",
    traits: [
      "mission-driven",
      "research-oriented",
      "community-active",
      "skeptical-of-greenwashing",
    ],
    painPoints: ["greenwashing", "lack of transparency", "high cost of sustainable options"],
    values: ["environmental impact", "transparency", "social justice", "long-term thinking"],
    techSavviness: "high",
    priceSensitivity: 6,
    riskTolerance: 5,
    brandLoyalty: 4,
  },
  {
    id: "power-user",
    name: "Mike Zhang",
    archetype: "Power User / Prosumer",
    ageRange: "28-45",
    incomeBracket: "$80K-$180K",
    occupation: "Data Analyst",
    traits: [
      "detail-oriented",
      "customization-loving",
      "community-contributor",
      "benchmark-obsessed",
    ],
    painPoints: ["lack of customization", "poor documentation", "forced simplification"],
    values: ["control", "transparency", "performance", "community"],
    techSavviness: "expert",
    priceSensitivity: 4,
    riskTolerance: 6,
    brandLoyalty: 5,
  },
];

/** Returns the 10 built-in customer persona archetypes. */
export function getBuiltInCustomerPersonas(): CustomerPersona[] {
  return BUILT_IN_PERSONAS.map((p) => CustomerPersonaSchema.parse(p));
}

/**
 * Create a custom customer persona.
 */
export function createCustomerPersona(
  params: Omit<CustomerPersona, "id"> & { id?: string }
): CustomerPersona {
  const id = params.id ?? params.name.toLowerCase().replace(/\s+/g, "-").slice(0, 100);
  return CustomerPersonaSchema.parse({ ...params, id });
}

/**
 * Run the council evaluation — each persona evaluates the idea.
 */
export async function runCouncilEvaluation(
  ideaTitle: string,
  ideaDescription: string,
  config: CouncilConfig = {}
): Promise<CouncilVerdict> {
  const allPersonas = getBuiltInCustomerPersonas();
  const personas = config.personaIds
    ? allPersonas.filter((p) => config.personaIds!.includes(p.id))
    : allPersonas;

  const evaluations: CouncilEvaluation[] = [];

  for (const persona of personas) {
    if (config.signal?.aborted) break;

    const prompt = `You are roleplaying as ${persona.name}, a ${persona.archetype}.

PERSONA PROFILE:
- Age: ${persona.ageRange}, Income: ${persona.incomeBracket}, Occupation: ${persona.occupation}
- Traits: ${persona.traits.join(", ")}
- Pain points: ${persona.painPoints.join(", ")}
- Values: ${persona.values.join(", ")}
- Tech savviness: ${persona.techSavviness}
- Price sensitivity: ${persona.priceSensitivity}/10
- Risk tolerance: ${persona.riskTolerance}/10

${wrapUserInput("IDEA TO EVALUATE", `${ideaTitle}: ${ideaDescription}`)}

Evaluate this idea AS this persona. Respond naturally and in-character.

Respond in JSON:
{
  "enthusiasmScore": <0-100>,
  "adoptionLikelihood": "<definitely-not|unlikely|maybe|likely|definitely>",
  "willingnessToPay": <0-10>,
  "feedback": "<2-3 sentences of natural feedback in persona's voice>",
  "concerns": ["<concern1>", "<concern2>"],
  "excitements": ["<excitement1>"],
  "suggestions": ["<suggestion1>"]
}`;

    try {
      const evaluation = await withRetry(
        async () => {
          const raw = await generateText({ prompt, model: config.model, signal: config.signal });
          const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
          return CouncilEvaluationSchema.parse({
            personaId: persona.id,
            personaName: persona.name,
            ideaTitle,
            enthusiasmScore: Math.max(0, Math.min(100, Number(parsed.enthusiasmScore) || 50)),
            adoptionLikelihood: parsed.adoptionLikelihood ?? "maybe",
            willingnessToPay: Math.max(0, Math.min(10, Number(parsed.willingnessToPay) || 5)),
            feedback: String(parsed.feedback ?? "").slice(0, 5000),
            concerns: (parsed.concerns ?? [])
              .slice(0, 10)
              .map((c: unknown) => String(c).slice(0, 500)),
            excitements: (parsed.excitements ?? [])
              .slice(0, 10)
              .map((e: unknown) => String(e).slice(0, 500)),
            suggestions: (parsed.suggestions ?? [])
              .slice(0, 10)
              .map((s: unknown) => String(s).slice(0, 500)),
          });
        },
        { signal: config.signal }
      );
      evaluations.push(evaluation);
    } catch {
      // Skip failed persona evaluations
    }
  }

  // Compute aggregate metrics
  const avgEnthusiasm =
    evaluations.length > 0
      ? evaluations.reduce((s, e) => s + e.enthusiasmScore, 0) / evaluations.length
      : 0;

  // Consensus = 1 - normalized standard deviation of scores
  const stdDev =
    evaluations.length > 1
      ? Math.sqrt(
          evaluations.reduce((s, e) => s + (e.enthusiasmScore - avgEnthusiasm) ** 2, 0) /
            evaluations.length
        )
      : 0;
  const consensusLevel = Math.max(0, Math.min(1, 1 - stdDev / 50));

  // Determine verdict
  let verdict: CouncilVerdict["verdict"];
  if (avgEnthusiasm >= 80) verdict = "strong-pass";
  else if (avgEnthusiasm >= 60) verdict = "pass";
  else if (avgEnthusiasm >= 40) verdict = "mixed";
  else if (avgEnthusiasm >= 20) verdict = "fail";
  else verdict = "strong-fail";

  // Extract key themes from concerns and excitements
  const allConcerns = evaluations.flatMap((e) => e.concerns);
  const allExcitements = evaluations.flatMap((e) => e.excitements);
  const keyThemes = [...new Set([...allConcerns.slice(0, 10), ...allExcitements.slice(0, 10)])];

  // Find best-fit segments
  const bestFitSegments = evaluations
    .filter((e) => e.enthusiasmScore >= 60)
    .map((e) => {
      const persona = personas.find((p) => p.id === e.personaId);
      return persona?.archetype ?? e.personaName;
    });

  const summary =
    `The council evaluated "${ideaTitle}" with an average enthusiasm of ${Math.round(avgEnthusiasm)}/100. ` +
    `Verdict: ${verdict}. Consensus level: ${Math.round(consensusLevel * 100)}%. ` +
    `${bestFitSegments.length} of ${evaluations.length} segments showed strong interest.`;

  return CouncilVerdictSchema.parse({
    ideaTitle,
    evaluations,
    averageEnthusiasm: Math.round(avgEnthusiasm * 100) / 100,
    consensusLevel: Math.round(consensusLevel * 100) / 100,
    verdict,
    keyThemes: keyThemes.slice(0, 20),
    bestFitSegments: bestFitSegments.slice(0, 10),
    summary,
  });
}

// ---- Calibration ----

const calibrationRecords: CalibrationRecord[] = [];

/**
 * Record a calibration data point for tracking prediction accuracy.
 */
export function calibrateCouncil(record: Omit<CalibrationRecord, "recordedAt">): CalibrationRecord {
  const entry = CalibrationRecordSchema.parse({
    ...record,
    recordedAt: new Date().toISOString(),
  });
  calibrationRecords.push(entry);
  return entry;
}
