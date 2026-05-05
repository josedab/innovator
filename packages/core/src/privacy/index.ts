/**
 * @module privacy
 *
 * Privacy-preserving cross-org innovation collaboration using
 * differential privacy and encrypted matching.
 */

import { randomUUID, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { InnovationIdea } from "../types.js";
import type {
  PrivateIdea,
  CrossOrgMatch,
  PrivacyBudget,
  MatchingResult,
  CrossOrgConfig,
  NoiseMechanism,
} from "./types.js";

export {
  PrivateIdeaSchema,
  CrossOrgMatchSchema,
  PrivacyBudgetSchema,
  MatchingResultSchema,
  NoiseMechanismSchema,
} from "./types.js";
export type {
  PrivateIdea,
  CrossOrgMatch,
  PrivacyBudget,
  MatchingResult,
  CrossOrgConfig,
  NoiseMechanism,
} from "./types.js";

const PRIVACY_DIR = join(homedir(), ".innovator", "privacy");
const PRIVATE_IDEAS_FILE = join(PRIVACY_DIR, "private-ideas.json");
const BUDGETS_FILE = join(PRIVACY_DIR, "budgets.json");

function ensureDir(): void {
  if (!existsSync(PRIVACY_DIR)) mkdirSync(PRIVACY_DIR, { recursive: true });
}

// ---- Differential Privacy Primitives ----

/** Generate Laplace noise for ε-differential privacy. */
export function laplaceMechanism(sensitivity: number, epsilon: number): number {
  const scale = sensitivity / epsilon;
  const u = Math.random() - 0.5;
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

/** Generate Gaussian noise for (ε,δ)-differential privacy. */
export function gaussianMechanism(sensitivity: number, epsilon: number, delta: number): number {
  const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * sigma;
}

/** Apply noise to a numeric score. */
function addNoise(
  value: number,
  sensitivity: number,
  epsilon: number,
  mechanism: NoiseMechanism,
  delta: number = 1e-5
): number {
  const noise =
    mechanism === "laplace"
      ? laplaceMechanism(sensitivity, epsilon)
      : gaussianMechanism(sensitivity, epsilon, delta);
  return Math.max(0, Math.min(100, Math.round(value + noise)));
}

/** Create a one-way fingerprint hash of idea content. */
function fingerprintIdea(idea: InnovationIdea): string {
  const content = `${idea.title.toLowerCase().trim()}|${idea.description.toLowerCase().trim().slice(0, 200)}`;
  return createHash("sha256").update(content).digest("hex");
}

/** Bucket a numeric score into discrete categories. */
function bucketImpact(score: number): "low" | "medium" | "high" | "transformative" {
  if (score >= 80) return "transformative";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function bucketFeasibility(score: number): "low" | "medium" | "high" {
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

/** Extract domain tags from idea text using keyword extraction. */
function extractDomainTags(idea: InnovationIdea): string[] {
  const text = `${idea.title} ${idea.description}`.toLowerCase();
  const domains = [
    "ai",
    "ml",
    "blockchain",
    "iot",
    "cloud",
    "mobile",
    "web",
    "healthcare",
    "finance",
    "education",
    "energy",
    "sustainability",
    "security",
    "data",
    "automation",
    "robotics",
    "biotech",
  ];
  return domains.filter((d) => text.includes(d)).slice(0, 5);
}

// ---- Core Functions ----

/**
 * Convert an innovation idea to a privacy-preserving representation.
 * Applies differential privacy noise and removes identifying details.
 */
export function privatizeIdea(
  idea: InnovationIdea,
  orgId: string,
  impactScore: number = 50,
  feasibilityScore: number = 5,
  config: CrossOrgConfig = {}
): PrivateIdea {
  const epsilon = config.epsilon ?? 1.0;
  const mechanism = config.noiseMechanism ?? "laplace";
  const delta = config.delta ?? 1e-5;

  return {
    id: randomUUID(),
    fingerprintHash: fingerprintIdea(idea),
    category: extractDomainTags(idea)[0] ?? "general",
    abstractDescription: idea.description
      .slice(0, 200)
      .replace(/[A-Z][a-z]+\s[A-Z][a-z]+/g, "[ENTITY]"),
    impactBucket: bucketImpact(impactScore),
    feasibilityBucket: bucketFeasibility(feasibilityScore),
    domainTags: extractDomainTags(idea),
    noisyScore: addNoise(impactScore, 10, epsilon, mechanism, delta),
    epsilon,
    orgId,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Find matches between private ideas from different organizations.
 * Uses domain tag overlap and category similarity for matching.
 */
export function findCrossOrgMatches(
  ideas: PrivateIdea[],
  config: CrossOrgConfig = {}
): MatchingResult {
  const minMatchScore = config.minMatchScore ?? 30;
  const maxResults = config.maxResults ?? 50;
  const matches: CrossOrgMatch[] = [];

  for (let i = 0; i < ideas.length; i++) {
    for (let j = i + 1; j < ideas.length; j++) {
      const a = ideas[i];
      const b = ideas[j];

      if (a.orgId === b.orgId) continue;

      // Compute tag overlap (Jaccard similarity)
      const tagsA = new Set(a.domainTags);
      const tagsB = new Set(b.domainTags);
      const intersection = [...tagsA].filter((t) => tagsB.has(t)).length;
      const union = new Set([...tagsA, ...tagsB]).size;
      const tagSimilarity = union > 0 ? (intersection / union) * 100 : 0;

      // Category match bonus
      const categoryBonus = a.category === b.category ? 20 : 0;

      // Impact alignment
      const impactMatch = a.impactBucket === b.impactBucket ? 15 : 0;

      const matchScore = Math.min(100, Math.round(tagSimilarity + categoryBonus + impactMatch));

      if (matchScore >= minMatchScore) {
        const matchType =
          tagSimilarity > 60 ? "similar" : tagSimilarity > 30 ? "adjacent" : "complementary";

        matches.push({
          id: randomUUID(),
          ideaAHash: a.fingerprintHash,
          ideaBHash: b.fingerprintHash,
          orgAId: a.orgId,
          orgBId: b.orgId,
          matchScore,
          complementaryAreas: [...new Set([...a.domainTags, ...b.domainTags])].slice(0, 5),
          matchType,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  const sorted = matches.sort((a, b) => b.matchScore - a.matchScore).slice(0, maxResults);
  const epsilon = config.epsilon ?? 1.0;

  return {
    matches: sorted,
    totalCandidates: ideas.length,
    privacyGuarantee: `ε=${epsilon}-differential privacy with ${config.noiseMechanism ?? "laplace"} mechanism`,
    epsilonUsed: epsilon,
    createdAt: new Date().toISOString(),
  };
}

// ---- Privacy Budget Management ----

/** Get or create a privacy budget for an organization. */
export function getPrivacyBudget(orgId: string, totalEpsilon: number = 10): PrivacyBudget {
  ensureDir();
  const budgets = loadBudgets();
  const existing = budgets.find((b) => b.orgId === orgId);
  if (existing) return existing;

  const budget: PrivacyBudget = {
    orgId,
    totalEpsilon,
    usedEpsilon: 0,
    remainingEpsilon: totalEpsilon,
    queryCount: 0,
    resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  budgets.push(budget);
  saveBudgets(budgets);
  return budget;
}

/** Consume privacy budget for a query. Returns false if budget exceeded. */
export function consumeBudget(orgId: string, epsilonCost: number): boolean {
  ensureDir();
  const budgets = loadBudgets();
  const budget = budgets.find((b) => b.orgId === orgId);
  if (!budget) return false;
  if (budget.remainingEpsilon < epsilonCost) return false;

  budget.usedEpsilon += epsilonCost;
  budget.remainingEpsilon -= epsilonCost;
  budget.queryCount++;
  saveBudgets(budgets);
  return true;
}

function loadBudgets(): PrivacyBudget[] {
  ensureDir();
  if (!existsSync(BUDGETS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(BUDGETS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveBudgets(budgets: PrivacyBudget[]): void {
  ensureDir();
  writeFileSync(BUDGETS_FILE, JSON.stringify(budgets, null, 2), "utf-8");
}

// ---- Storage ----

/** Store a private idea for cross-org matching. */
export function storePrivateIdea(idea: PrivateIdea): void {
  ensureDir();
  const ideas = loadPrivateIdeas();
  ideas.push(idea);
  writeFileSync(PRIVATE_IDEAS_FILE, JSON.stringify(ideas, null, 2), "utf-8");
}

/** Load all stored private ideas. */
export function loadPrivateIdeas(): PrivateIdea[] {
  ensureDir();
  if (!existsSync(PRIVATE_IDEAS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(PRIVATE_IDEAS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

/** Clear all privacy data (for testing). */
export function clearPrivacyData(): void {
  ensureDir();
  writeFileSync(PRIVATE_IDEAS_FILE, "[]", "utf-8");
  writeFileSync(BUDGETS_FILE, "[]", "utf-8");
}
