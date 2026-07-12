/**
 * @module verticals/pack-schema
 *
 * Extended Vertical Pack schema, registry, and evaluation engine.
 * Adds evaluation rubrics, compliance rules, glossaries, and example sessions
 * on top of the base VerticalPack system.
 */

import { z } from "zod";

// ---- Schemas ----

/** Schema for an evaluation criterion within a rubric. */
export const RubricCriterionSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(2000),
  weight: z.number().min(0).max(1),
  scaleMin: z.number().default(0),
  scaleMax: z.number().default(10),
});

/** Schema for an evaluation rubric. */
export const EvaluationRubricSchema = z.object({
  id: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().max(200),
  criteria: z.array(RubricCriterionSchema).max(20),
  passingScore: z.number().min(0).max(10),
});

/** Schema for a compliance rule. */
export const ComplianceRuleSchema = z.object({
  id: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().max(200),
  regulation: z.string().max(200),
  description: z.string().max(2000),
  severity: z.enum(["critical", "high", "medium", "low"]),
  checkFunction: z.string().max(2000).describe("Natural language description of what to check"),
  autoDetectable: z.boolean(),
});

/** Schema for a domain angle definition within an extended pack. */
export const PackAngleDefinitionSchema = z.object({
  id: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().max(200),
  description: z.string().max(2000),
  promptContext: z.string().max(5000),
  icon: z.string().max(10).optional(),
});

/** Schema for an example session. */
export const ExampleSessionSchema = z.object({
  subject: z.string().max(500),
  description: z.string().max(2000),
  expectedAngles: z.array(z.string()).max(10),
  sampleInsights: z.array(z.string()).max(10),
});

/** Schema for pack metadata. */
export const PackMetadataSchema = z.object({
  tags: z.array(z.string().max(100)).max(30),
  icon: z.string().max(10),
  color: z.string().max(20),
});

/** Schema for an extended vertical pack with rubrics, compliance, glossary, and examples. */
export const ExtendedVerticalPackSchema = z.object({
  id: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().max(200),
  version: z.string().max(50),
  description: z.string().max(2000),
  author: z.string().max(200),
  domainAngles: z.array(PackAngleDefinitionSchema).max(20),
  evaluationRubrics: z.array(EvaluationRubricSchema).max(10),
  complianceRules: z.array(ComplianceRuleSchema).max(30),
  glossary: z.record(z.string().max(100), z.string().max(1000)),
  exampleSessions: z.array(ExampleSessionSchema).max(10),
  biomimicrySubset: z.array(z.string().max(200)).max(20),
  metadata: PackMetadataSchema,
});

// ---- Types ----

export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;
export type EvaluationRubric = z.infer<typeof EvaluationRubricSchema>;
export type ComplianceRule = z.infer<typeof ComplianceRuleSchema>;
export type PackAngleDefinition = z.infer<typeof PackAngleDefinitionSchema>;
export type ExampleSession = z.infer<typeof ExampleSessionSchema>;
export type PackMetadata = z.infer<typeof PackMetadataSchema>;
export type ExtendedVerticalPack = z.infer<typeof ExtendedVerticalPackSchema>;

/** Result of evaluating ideas against a rubric. */
export interface RubricEvaluationResult {
  rubricId: string;
  rubricName: string;
  scores: Array<{
    criterion: string;
    score: number;
    weight: number;
    weightedScore: number;
  }>;
  totalScore: number;
  passed: boolean;
  passingScore: number;
}

/** Result of a compliance check. */
export interface ComplianceCheckResult {
  packId: string;
  results: Array<{
    ruleId: string;
    ruleName: string;
    regulation: string;
    severity: "critical" | "high" | "medium" | "low";
    passed: boolean;
    message: string;
  }>;
  overallPassed: boolean;
  criticalFailures: number;
  highFailures: number;
}

// ---- Registry ----

const extendedPackRegistry: Map<string, ExtendedVerticalPack> = new Map();

/**
 * Validate a pack against the schema and return any issues.
 */
function validatePackSchema(pack: unknown): { valid: boolean; errors: string[] } {
  const result = ExtendedVerticalPackSchema.safeParse(pack);
  if (result.success) {
    // Additional semantic checks
    const errors: string[] = [];
    const p = result.data;

    for (const rubric of p.evaluationRubrics) {
      const totalWeight = rubric.criteria.reduce((sum, c) => sum + c.weight, 0);
      if (Math.abs(totalWeight - 1.0) > 0.01) {
        errors.push(`Rubric "${rubric.name}" criteria weights sum to ${totalWeight}, expected 1.0`);
      }
    }

    if (p.domainAngles.length === 0) {
      errors.push("Pack must include at least one domain angle");
    }

    if (Object.keys(p.glossary).length === 0) {
      errors.push("Pack must include at least one glossary term");
    }

    return { valid: errors.length === 0, errors };
  }
  return {
    valid: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

/**
 * Registry for extended vertical packs with evaluation and compliance features.
 */
export class VerticalPackRegistry {
  constructor(
    private readonly registry: Map<string, ExtendedVerticalPack> = extendedPackRegistry
  ) {}

  /** Register and validate an extended vertical pack. */
  register(pack: ExtendedVerticalPack): { success: boolean; errors: string[] } {
    const validation = validatePackSchema(pack);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }
    const validated = ExtendedVerticalPackSchema.parse(pack);
    this.registry.set(validated.id, validated);
    return { success: true, errors: [] };
  }

  /** Retrieve a pack by ID. */
  get(packId: string): ExtendedVerticalPack | undefined {
    return this.registry.get(packId);
  }

  /** List packs with optional filtering. */
  list(filters?: { tag?: string; search?: string }): ExtendedVerticalPack[] {
    let packs = Array.from(this.registry.values());

    if (filters?.tag) {
      const tag = filters.tag.toLowerCase();
      packs = packs.filter((p) => p.metadata.tags.some((t) => t.toLowerCase().includes(tag)));
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      packs = packs.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.metadata.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return packs;
  }

  /** Remove a pack from the registry. */
  unregister(packId: string): boolean {
    return this.registry.delete(packId);
  }

  /** Validate a pack against the schema and return any issues. */
  validatePack(pack: unknown): { valid: boolean; errors: string[] } {
    return validatePackSchema(pack);
  }

  /**
   * Score ideas against a rubric from a registered pack.
   * Uses keyword heuristics for each criterion (no LLM required).
   */
  evaluateWithRubric(ideas: string[], rubricId: string): RubricEvaluationResult | undefined {
    let rubric: EvaluationRubric | undefined;
    for (const pack of this.registry.values()) {
      rubric = pack.evaluationRubrics.find((r) => r.id === rubricId);
      if (rubric) break;
    }
    if (!rubric) return undefined;

    const combined = ideas.join(" ").toLowerCase();

    const scores = rubric.criteria.map((criterion) => {
      // Heuristic scoring based on keyword presence in ideas
      const keywords = criterion.description
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4);
      const matches = keywords.filter((kw) => combined.includes(kw)).length;
      const raw = Math.min(
        criterion.scaleMax,
        (matches / Math.max(keywords.length, 1)) * criterion.scaleMax
      );
      const score = Math.round(raw * 10) / 10;
      return {
        criterion: criterion.name,
        score,
        weight: criterion.weight,
        weightedScore: Math.round(score * criterion.weight * 100) / 100,
      };
    });

    const totalScore = Math.round(scores.reduce((sum, s) => sum + s.weightedScore, 0) * 100) / 100;

    return {
      rubricId: rubric.id,
      rubricName: rubric.name,
      scores,
      totalScore,
      passed: totalScore >= rubric.passingScore,
      passingScore: rubric.passingScore,
    };
  }

  /**
   * Run compliance checks for ideas against a pack's rules.
   * Uses keyword heuristics (no LLM required).
   */
  checkCompliance(ideas: string[], packId: string): ComplianceCheckResult | undefined {
    const pack = this.registry.get(packId);
    if (!pack) return undefined;

    const combined = ideas.join(" ").toLowerCase();

    const results = pack.complianceRules.map((rule) => {
      const checkKeywords = rule.checkFunction
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4);
      const mentions = checkKeywords.filter((kw) => combined.includes(kw)).length;
      const passed = mentions > 0 || rule.severity === "low";

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        regulation: rule.regulation,
        severity: rule.severity,
        passed,
        message: passed
          ? `Ideas appear to address ${rule.name}`
          : `Ideas may not adequately address ${rule.name} (${rule.regulation})`,
      };
    });

    const criticalFailures = results.filter((r) => !r.passed && r.severity === "critical").length;
    const highFailures = results.filter((r) => !r.passed && r.severity === "high").length;

    return {
      packId,
      results,
      overallPassed: criticalFailures === 0,
      criticalFailures,
      highFailures,
    };
  }

  /** Get the domain glossary for a pack. */
  getGlossary(packId: string): Record<string, string> | undefined {
    const pack = this.registry.get(packId);
    return pack?.glossary;
  }

  /** Get example sessions for a pack. */
  getExampleSessions(packId: string): ExampleSession[] | undefined {
    const pack = this.registry.get(packId);
    return pack?.exampleSessions;
  }

  /** Clear all packs from the registry. */
  reset(): void {
    this.registry.clear();
  }
}

/** Singleton registry instance. */
export const verticalPackRegistry = new VerticalPackRegistry();
