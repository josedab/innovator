/**
 * @module github-health
 *
 * Innovation health scoring for GitHub repositories.
 * Analyzes architecture freshness, dependency staleness,
 * contribution diversity, issue velocity, and competitive landscape.
 * Generates weekly digest PRs with innovation suggestions and
 * provides badge/shield data for viral growth.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

// ---- Health Dimension Schemas ----

export const HealthDimensionSchema = z.object({
  name: z.string().max(200),
  score: z.number().min(0).max(100),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  details: z.string().max(2000),
  suggestions: z.array(z.string().max(500)).max(10),
});

export type HealthDimension = z.infer<typeof HealthDimensionSchema>;

export const ArchitectureFreshnessSchema = z.object({
  score: z.number().min(0).max(100),
  lastMajorRefactor: z.string().optional(),
  techDebtIndicators: z.array(z.string().max(500)).max(20),
  modernizationOpportunities: z.array(z.string().max(500)).max(10),
  patternStaleness: z.number().min(0).max(100).describe("How outdated design patterns are"),
});

export type ArchitectureFreshness = z.infer<typeof ArchitectureFreshnessSchema>;

export const DependencyStalenessSchema = z.object({
  score: z.number().min(0).max(100),
  totalDependencies: z.number().int().min(0),
  outdatedCount: z.number().int().min(0),
  criticalUpdates: z
    .array(
      z.object({
        name: z.string().max(200),
        currentVersion: z.string().max(50),
        latestVersion: z.string().max(50),
        severity: z.enum(["low", "medium", "high", "critical"]),
      })
    )
    .max(50),
  avgDaysOutdated: z.number().min(0),
});

export type DependencyStaleness = z.infer<typeof DependencyStalenessSchema>;

export const ContributionDiversitySchema = z.object({
  score: z.number().min(0).max(100),
  totalContributors: z.number().int().min(0),
  activeContributors30d: z.number().int().min(0),
  busFactorScore: z.number().min(0).max(100).describe("Risk of knowledge concentration"),
  topContributorShare: z.number().min(0).max(1).describe("Fraction of commits by top contributor"),
  newContributors90d: z.number().int().min(0),
});

export type ContributionDiversity = z.infer<typeof ContributionDiversitySchema>;

export const IssueVelocitySchema = z.object({
  score: z.number().min(0).max(100),
  openIssues: z.number().int().min(0),
  closedLast30d: z.number().int().min(0),
  avgResolutionDays: z.number().min(0),
  staleIssueCount: z.number().int().min(0).describe("Issues with no activity in 90+ days"),
  featureRequestRatio: z.number().min(0).max(1),
});

export type IssueVelocity = z.infer<typeof IssueVelocitySchema>;

export const CompetitiveLandscapeSchema = z.object({
  score: z.number().min(0).max(100),
  competitors: z
    .array(
      z.object({
        name: z.string().max(200),
        url: z.string().max(500).optional(),
        stars: z.number().int().min(0).optional(),
        differentiator: z.string().max(500),
      })
    )
    .max(20),
  uniqueSellingPoints: z.array(z.string().max(500)).max(10),
  marketPosition: z.enum(["leader", "contender", "niche", "emerging", "declining"]),
});

export type CompetitiveLandscape = z.infer<typeof CompetitiveLandscapeSchema>;

// ---- Overall Health Score ----

export const RepoHealthScoreSchema = z.object({
  repositoryUrl: z.string().max(500),
  repositoryName: z.string().max(200),
  analyzedAt: z.string(),
  overallScore: z.number().min(0).max(100),
  overallGrade: z.enum(["A", "B", "C", "D", "F"]),
  dimensions: z.object({
    architectureFreshness: HealthDimensionSchema,
    dependencyStaleness: HealthDimensionSchema,
    contributionDiversity: HealthDimensionSchema,
    issueVelocity: HealthDimensionSchema,
    competitiveLandscape: HealthDimensionSchema,
  }),
  topSuggestions: z.array(z.string().max(500)).max(10),
  innovationOpportunities: z
    .array(
      z.object({
        title: z.string().max(300),
        description: z.string().max(1000),
        effort: z.enum(["low", "medium", "high"]),
        impact: z.enum(["low", "medium", "high"]),
      })
    )
    .max(10),
  badgeData: z.object({
    shieldUrl: z.string().max(500),
    color: z.string().max(20),
    label: z.string().max(100),
  }),
});

export type RepoHealthScore = z.infer<typeof RepoHealthScoreSchema>;

// ---- Weekly Digest ----

export const WeeklyDigestSchema = z.object({
  repositoryName: z.string().max(200),
  weekStarting: z.string(),
  previousScore: z.number().min(0).max(100).optional(),
  currentScore: z.number().min(0).max(100),
  scoreDelta: z.number().optional(),
  highlights: z.array(z.string().max(500)).max(10),
  concerns: z.array(z.string().max(500)).max(10),
  actionItems: z
    .array(
      z.object({
        title: z.string().max(300),
        description: z.string().max(1000),
        priority: z.enum(["low", "medium", "high", "critical"]),
      })
    )
    .max(10),
  prBody: z.string().max(20_000).describe("Markdown body for the digest PR"),
});

export type WeeklyDigest = z.infer<typeof WeeklyDigestSchema>;

// ---- GitHub App Config ----

export const GitHubAppConfigSchema = z.object({
  appId: z.string().max(100),
  installationId: z.string().max(100),
  repositoryFullName: z.string().max(300),
  analysisSchedule: z.enum(["daily", "weekly", "biweekly", "monthly"]).default("weekly"),
  enableDigestPR: z.boolean().default(true),
  enableBadge: z.boolean().default(true),
  excludePaths: z.array(z.string().max(200)).max(50).optional(),
  customDimensionWeights: z
    .object({
      architectureFreshness: z.number().min(0).max(1).default(0.25),
      dependencyStaleness: z.number().min(0).max(1).default(0.2),
      contributionDiversity: z.number().min(0).max(1).default(0.2),
      issueVelocity: z.number().min(0).max(1).default(0.2),
      competitiveLandscape: z.number().min(0).max(1).default(0.15),
    })
    .optional(),
});

export type GitHubAppConfig = z.infer<typeof GitHubAppConfigSchema>;

// ---- In-Memory Store ----

const healthScores = new Map<string, RepoHealthScore>();
const configs = new Map<string, GitHubAppConfig>();

// ---- Score Computation ----

function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function shieldColor(score: number): string {
  if (score >= 90) return "brightgreen";
  if (score >= 75) return "green";
  if (score >= 60) return "yellow";
  if (score >= 40) return "orange";
  return "red";
}

/** Compute overall health score from dimension data using LLM analysis. */
export async function analyzeRepoHealth(
  repoData: {
    repositoryUrl: string;
    repositoryName: string;
    description?: string;
    language?: string;
    stars?: number;
    openIssues?: number;
    contributors?: number;
    lastCommitDate?: string;
    packageJson?: Record<string, unknown>;
    recentCommitMessages?: string[];
  },
  model?: string,
  signal?: AbortSignal
): Promise<RepoHealthScore> {
  const prompt = `You are an innovation health analyst for GitHub repositories. Analyze this repository and score it across 5 dimensions.

## Repository
- Name: ${repoData.repositoryName}
- URL: ${repoData.repositoryUrl}
${repoData.description ? `- Description: ${repoData.description}` : ""}
${repoData.language ? `- Primary language: ${repoData.language}` : ""}
${repoData.stars !== undefined ? `- Stars: ${repoData.stars}` : ""}
${repoData.openIssues !== undefined ? `- Open issues: ${repoData.openIssues}` : ""}
${repoData.contributors !== undefined ? `- Contributors: ${repoData.contributors}` : ""}
${repoData.lastCommitDate ? `- Last commit: ${repoData.lastCommitDate}` : ""}
${repoData.recentCommitMessages?.length ? `- Recent commits: ${repoData.recentCommitMessages.slice(0, 10).join("; ")}` : ""}

Score each dimension 0-100 and provide suggestions. Respond in JSON:
{
  "dimensions": {
    "architectureFreshness": { "name": "Architecture Freshness", "score": 0-100, "grade": "A-F", "details": "string", "suggestions": ["string"] },
    "dependencyStaleness": { "name": "Dependency Staleness", "score": 0-100, "grade": "A-F", "details": "string", "suggestions": ["string"] },
    "contributionDiversity": { "name": "Contribution Diversity", "score": 0-100, "grade": "A-F", "details": "string", "suggestions": ["string"] },
    "issueVelocity": { "name": "Issue Velocity", "score": 0-100, "grade": "A-F", "details": "string", "suggestions": ["string"] },
    "competitiveLandscape": { "name": "Competitive Landscape", "score": 0-100, "grade": "A-F", "details": "string", "suggestions": ["string"] }
  },
  "topSuggestions": ["string"],
  "innovationOpportunities": [{ "title": "string", "description": "string", "effort": "low|medium|high", "impact": "low|medium|high" }]
}`;

  const raw = await withRetry(() => generateText({ prompt, model, serverMode: true, signal }));
  const parsed = JSON.parse(extractJson(raw));
  const dims = parsed.dimensions ?? {};

  const weights = {
    architectureFreshness: 0.25,
    dependencyStaleness: 0.2,
    contributionDiversity: 0.2,
    issueVelocity: 0.2,
    competitiveLandscape: 0.15,
  };

  const overallScore = Math.round(
    Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (dims[key]?.score ?? 50) * weight;
    }, 0)
  );

  const result: RepoHealthScore = {
    repositoryUrl: repoData.repositoryUrl,
    repositoryName: repoData.repositoryName,
    analyzedAt: new Date().toISOString(),
    overallScore,
    overallGrade: scoreToGrade(overallScore),
    dimensions: {
      architectureFreshness: HealthDimensionSchema.parse(
        dims.architectureFreshness ?? {
          name: "Architecture Freshness",
          score: 50,
          grade: "C",
          details: "Insufficient data",
          suggestions: [],
        }
      ),
      dependencyStaleness: HealthDimensionSchema.parse(
        dims.dependencyStaleness ?? {
          name: "Dependency Staleness",
          score: 50,
          grade: "C",
          details: "Insufficient data",
          suggestions: [],
        }
      ),
      contributionDiversity: HealthDimensionSchema.parse(
        dims.contributionDiversity ?? {
          name: "Contribution Diversity",
          score: 50,
          grade: "C",
          details: "Insufficient data",
          suggestions: [],
        }
      ),
      issueVelocity: HealthDimensionSchema.parse(
        dims.issueVelocity ?? {
          name: "Issue Velocity",
          score: 50,
          grade: "C",
          details: "Insufficient data",
          suggestions: [],
        }
      ),
      competitiveLandscape: HealthDimensionSchema.parse(
        dims.competitiveLandscape ?? {
          name: "Competitive Landscape",
          score: 50,
          grade: "C",
          details: "Insufficient data",
          suggestions: [],
        }
      ),
    },
    topSuggestions: parsed.topSuggestions ?? [],
    innovationOpportunities: parsed.innovationOpportunities ?? [],
    badgeData: {
      shieldUrl: `https://img.shields.io/badge/innovation%20health-${overallScore}%25-${shieldColor(overallScore)}`,
      color: shieldColor(overallScore),
      label: `Innovation Health: ${overallScore}%`,
    },
  };

  const validated = RepoHealthScoreSchema.parse(result);
  healthScores.set(repoData.repositoryUrl, validated);
  return validated;
}

/** Generate a weekly digest PR body from health score changes. */
export async function generateWeeklyDigest(
  repoName: string,
  currentScore: RepoHealthScore,
  previousScore?: RepoHealthScore,
  model?: string,
  signal?: AbortSignal
): Promise<WeeklyDigest> {
  const prompt = `Generate a weekly innovation health digest for repository "${repoName}".

Current overall score: ${currentScore.overallScore}/100 (${currentScore.overallGrade})
${previousScore ? `Previous score: ${previousScore.overallScore}/100 (change: ${currentScore.overallScore - previousScore.overallScore > 0 ? "+" : ""}${currentScore.overallScore - previousScore.overallScore})` : "First analysis"}

Dimensions:
${Object.entries(currentScore.dimensions)
  .map(([_k, v]) => `- ${v.name}: ${v.score}/100 (${v.grade})`)
  .join("\n")}

Top suggestions: ${currentScore.topSuggestions.join("; ")}

Create an engaging, actionable PR body in markdown with emoji, clear sections, and specific next steps.

Respond in JSON:
{
  "highlights": ["string"],
  "concerns": ["string"],
  "actionItems": [{ "title": "string", "description": "string", "priority": "low|medium|high|critical" }],
  "prBody": "full markdown content for PR"
}`;

  const raw = await withRetry(() => generateText({ prompt, model, serverMode: true, signal }));
  const parsed = JSON.parse(extractJson(raw));

  return WeeklyDigestSchema.parse({
    repositoryName: repoName,
    weekStarting: new Date().toISOString().split("T")[0],
    previousScore: previousScore?.overallScore,
    currentScore: currentScore.overallScore,
    scoreDelta: previousScore ? currentScore.overallScore - previousScore.overallScore : undefined,
    highlights: parsed.highlights ?? [],
    concerns: parsed.concerns ?? [],
    actionItems: parsed.actionItems ?? [],
    prBody:
      parsed.prBody ?? `# Innovation Health Digest\n\nScore: ${currentScore.overallScore}/100`,
  });
}

/** Register a GitHub App configuration. */
export function registerGitHubAppConfig(config: GitHubAppConfig): void {
  GitHubAppConfigSchema.parse(config);
  configs.set(config.repositoryFullName, config);
}

/** Get stored health score for a repository. */
export function getRepoHealthScore(repoUrl: string): RepoHealthScore | undefined {
  return healthScores.get(repoUrl);
}

/** Generate a badge markdown snippet for README embedding. */
export function generateBadgeMarkdown(score: RepoHealthScore): string {
  return `[![Innovation Health](${score.badgeData.shieldUrl})](${score.repositoryUrl}) _Powered by [Innovator](https://github.com/innovator)_`;
}

/** Clear all stored health data. */
export function clearGitHubHealthData(): void {
  healthScores.clear();
  configs.clear();
}
