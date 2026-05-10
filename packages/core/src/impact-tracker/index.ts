/**
 * @module impact-tracker
 *
 * Innovation Impact Tracker — connects generated ideas to real-world outcomes.
 * Tracks ideas from proposal through shipping, records outcomes, computes
 * impact scores, and produces dashboard data with LLM-generated executive summaries.
 */

import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const STORE_DIR = path.join(os.homedir(), ".innovator", "impact-tracker");
const IDEAS_FILE = path.join(STORE_DIR, "ideas.json");
const OUTCOMES_FILE = path.join(STORE_DIR, "outcomes.json");

function ensureStoreDir(): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(filePath: string, data: unknown): void {
  ensureStoreDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

export const IdeaStatusSchema = z.enum([
  "proposed",
  "in-progress",
  "shipped",
  "abandoned",
]);
export type IdeaStatus = z.infer<typeof IdeaStatusSchema>;

export const TrackedIdeaSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  description: z.string().max(5000),
  sourceSessionId: z.string().max(200).optional(),
  createdAt: z.string(),
  status: IdeaStatusSchema.default("proposed"),
  linkedPRs: z.array(z.string().url()).default([]),
  linkedIssues: z.array(z.string().url()).default([]),
  customOutcomes: z.array(z.string()).default([]),
  tags: z.array(z.string().max(100)).default([]),
});
export type TrackedIdea = z.infer<typeof TrackedIdeaSchema>;

export const OutcomeTypeSchema = z.enum([
  "pr-merged",
  "feature-shipped",
  "revenue-impact",
  "user-adoption",
  "custom",
]);
export type OutcomeType = z.infer<typeof OutcomeTypeSchema>;

export const OutcomeSourceSchema = z.enum(["github", "jira", "manual"]);
export type OutcomeSource = z.infer<typeof OutcomeSourceSchema>;

export const OutcomeRecordSchema = z.object({
  id: z.string().min(1).max(200),
  ideaId: z.string().min(1).max(200),
  type: OutcomeTypeSchema,
  title: z.string().min(1).max(500),
  value: z.number().optional(),
  unit: z.string().max(50).optional(),
  source: OutcomeSourceSchema,
  detectedAt: z.string(),
  metadata: z.record(z.unknown()).default({}),
});
export type OutcomeRecord = z.infer<typeof OutcomeRecordSchema>;

export const ImpactScoreSchema = z.object({
  ideaId: z.string().min(1).max(200),
  implementationScore: z.number().min(0).max(100),
  adoptionScore: z.number().min(0).max(100),
  businessScore: z.number().min(0).max(100),
  compositeScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
});
export type ImpactScore = z.infer<typeof ImpactScoreSchema>;

export const TeamComparisonSchema = z.object({
  teamId: z.string().min(1).max(200),
  ideasGenerated: z.number().int().min(0),
  ideasShipped: z.number().int().min(0),
  avgImpactScore: z.number().min(0).max(100),
  topIdea: z.string().optional(),
});
export type TeamComparison = z.infer<typeof TeamComparisonSchema>;

export const InnovationFunnelSchema = z.object({
  totalIdeas: z.number().int().min(0),
  inProgress: z.number().int().min(0),
  shipped: z.number().int().min(0),
  abandoned: z.number().int().min(0),
  conversionRate: z.number().min(0).max(1),
  avgTimeToShip: z.number().min(0),
  byTeam: z.record(z.number().int().min(0)).default({}),
});
export type InnovationFunnel = z.infer<typeof InnovationFunnelSchema>;

export const TrendRecordSchema = z.object({
  period: z.string(),
  ideasCreated: z.number().int().min(0),
  ideasShipped: z.number().int().min(0),
  avgImpactScore: z.number().min(0).max(100),
});
export type TrendRecord = z.infer<typeof TrendRecordSchema>;

export const ImpactDashboardSchema = z.object({
  funnel: InnovationFunnelSchema,
  topPerformers: z.array(ImpactScoreSchema),
  teamComparisons: z.array(TeamComparisonSchema),
  trends: z.array(TrendRecordSchema),
  executiveSummary: z.string(),
});
export type ImpactDashboard = z.infer<typeof ImpactDashboardSchema>;

// ---------------------------------------------------------------------------
// In-memory stores (synced to disk)
// ---------------------------------------------------------------------------

let ideasStore: Map<string, TrackedIdea> = new Map();
let outcomesStore: Map<string, OutcomeRecord[]> = new Map();
let storeLoaded = false;

function loadStores(): void {
  if (storeLoaded) return;
  const ideas = loadJson<TrackedIdea[]>(IDEAS_FILE, []);
  for (const idea of ideas) {
    ideasStore.set(idea.id, idea);
  }
  const outcomes = loadJson<OutcomeRecord[]>(OUTCOMES_FILE, []);
  for (const o of outcomes) {
    const list = outcomesStore.get(o.ideaId) ?? [];
    list.push(o);
    outcomesStore.set(o.ideaId, list);
  }
  storeLoaded = true;
}

function persistIdeas(): void {
  saveJson(IDEAS_FILE, Array.from(ideasStore.values()));
}

function persistOutcomes(): void {
  const all: OutcomeRecord[] = [];
  for (const list of Array.from(outcomesStore.values())) {
    all.push(...list);
  }
  saveJson(OUTCOMES_FILE, all);
}

// ---------------------------------------------------------------------------
// Idea tracking
// ---------------------------------------------------------------------------

/** Register an idea for impact tracking. */
export function trackIdea(idea: TrackedIdea): TrackedIdea {
  loadStores();
  const parsed = TrackedIdeaSchema.parse(idea);
  ideasStore.set(parsed.id, parsed);
  persistIdeas();
  return parsed;
}

/** Update an idea's implementation status. */
export function updateIdeaStatus(ideaId: string, status: IdeaStatus): TrackedIdea {
  loadStores();
  const idea = ideasStore.get(ideaId);
  if (!idea) {
    throw new Error(`Tracked idea not found: ${ideaId}`);
  }
  idea.status = status;
  ideasStore.set(ideaId, idea);
  persistIdeas();
  return idea;
}

/** Link a GitHub PR to an idea. */
export function linkPR(ideaId: string, prUrl: string): TrackedIdea {
  if (!prUrl || prUrl.trim().length === 0) throw new Error("PR URL cannot be empty");
  loadStores();
  const idea = ideasStore.get(ideaId);
  if (!idea) {
    throw new Error(`Tracked idea not found: ${ideaId}`);
  }
  if (!idea.linkedPRs.includes(prUrl)) {
    idea.linkedPRs.push(prUrl);
  }
  ideasStore.set(ideaId, idea);
  persistIdeas();
  return idea;
}

/** Link a Jira or GitHub issue to an idea. */
export function linkIssue(ideaId: string, issueUrl: string): TrackedIdea {
  if (!issueUrl || issueUrl.trim().length === 0) throw new Error("Issue URL cannot be empty");
  loadStores();
  const idea = ideasStore.get(ideaId);
  if (!idea) {
    throw new Error(`Tracked idea not found: ${ideaId}`);
  }
  if (!idea.linkedIssues.includes(issueUrl)) {
    idea.linkedIssues.push(issueUrl);
  }
  ideasStore.set(ideaId, idea);
  persistIdeas();
  return idea;
}

/** Retrieve a tracked idea by id. */
export function getTrackedIdea(ideaId: string): TrackedIdea | undefined {
  loadStores();
  return ideasStore.get(ideaId);
}

/** List tracked ideas with optional status and tag filters. */
export function listTrackedIdeas(options?: {
  status?: IdeaStatus;
  tag?: string;
}): TrackedIdea[] {
  loadStores();
  let results = Array.from(ideasStore.values());
  if (options?.status) {
    results = results.filter((i) => i.status === options.status);
  }
  if (options?.tag) {
    results = results.filter((i) => i.tags.includes(options.tag!));
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Outcome recording
// ---------------------------------------------------------------------------

/** Record a real-world outcome for a tracked idea. */
export function recordOutcome(outcome: OutcomeRecord): OutcomeRecord {
  loadStores();
  const parsed = OutcomeRecordSchema.parse(outcome);
  if (!ideasStore.has(parsed.ideaId)) {
    throw new Error(`Tracked idea not found: ${parsed.ideaId}`);
  }
  const list = outcomesStore.get(parsed.ideaId) ?? [];
  list.push(parsed);
  outcomesStore.set(parsed.ideaId, list);
  persistOutcomes();
  return parsed;
}

/** Get all outcomes for a tracked idea. */
export function getOutcomes(ideaId: string): OutcomeRecord[] {
  loadStores();
  return outcomesStore.get(ideaId) ?? [];
}

/** Attempt to auto-detect outcomes from linked PRs/issues (stub). */
export async function autoDetectOutcomes(
  ideaId: string,
): Promise<{ detected: boolean; outcomes: OutcomeRecord[] }> {
  loadStores();
  const idea = ideasStore.get(ideaId);
  if (!idea) {
    throw new Error(`Tracked idea not found: ${ideaId}`);
  }

  const detected: OutcomeRecord[] = [];

  // Stub: create outcomes for linked PRs as "pr-merged" placeholders
  for (const prUrl of idea.linkedPRs) {
    detected.push({
      id: `auto-pr-${ideaId}-${detected.length}`,
      ideaId,
      type: "pr-merged",
      title: `PR merged: ${prUrl}`,
      source: "github",
      detectedAt: new Date().toISOString(),
      metadata: { url: prUrl, autoDetected: true },
    });
  }

  for (const outcome of detected) {
    recordOutcome(outcome);
  }

  return { detected: detected.length > 0, outcomes: detected };
}

// ---------------------------------------------------------------------------
// Impact scoring
// ---------------------------------------------------------------------------

/** Compute composite impact score for a tracked idea from its outcomes. */
export function calculateImpactScore(ideaId: string): ImpactScore {
  loadStores();
  const idea = ideasStore.get(ideaId);
  if (!idea) {
    throw new Error(`Tracked idea not found: ${ideaId}`);
  }

  const outcomes = outcomesStore.get(ideaId) ?? [];

  // Implementation score: based on linked PRs and implementation outcomes
  const prCount = idea.linkedPRs.length;
  const mergedCount = outcomes.filter((o) => o.type === "pr-merged").length;
  const implementationScore = Math.min(
    100,
    (prCount > 0 ? 30 : 0) +
      mergedCount * 20 +
      (idea.status === "shipped" ? 30 : idea.status === "in-progress" ? 15 : 0),
  );

  // Adoption score: from user-adoption and feature-shipped outcomes
  const adoptionOutcomes = outcomes.filter(
    (o) => o.type === "user-adoption" || o.type === "feature-shipped",
  );
  const adoptionScore = Math.min(
    100,
    adoptionOutcomes.reduce((sum, o) => sum + (o.value ?? 20), 0),
  );

  // Business score: from revenue-impact outcomes
  const revenueOutcomes = outcomes.filter((o) => o.type === "revenue-impact");
  const businessScore = Math.min(
    100,
    revenueOutcomes.reduce((sum, o) => sum + (o.value ?? 15), 0),
  );

  // Composite: weighted average
  const compositeScore = Math.round(
    implementationScore * 0.3 + adoptionScore * 0.4 + businessScore * 0.3,
  );

  // Confidence: higher with more outcomes
  const confidence = Math.min(1, outcomes.length * 0.2 + 0.1);

  return ImpactScoreSchema.parse({
    ideaId,
    implementationScore,
    adoptionScore,
    businessScore,
    compositeScore,
    confidence: Math.round(confidence * 100) / 100,
  });
}

/** Rank all tracked ideas by composite impact score. */
export function rankByImpact(options?: {
  status?: IdeaStatus;
  limit?: number;
}): ImpactScore[] {
  loadStores();
  let ideas = Array.from(ideasStore.values());
  if (options?.status) {
    ideas = ideas.filter((i) => i.status === options.status);
  }

  const scores = ideas.map((idea) => calculateImpactScore(idea.id));
  scores.sort((a, b) => b.compositeScore - a.compositeScore);

  const limit = options?.limit ?? scores.length;
  return scores.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Dashboard data
// ---------------------------------------------------------------------------

/** Compute innovation funnel metrics. */
export function getInnovationFunnel(options?: {
  tag?: string;
}): InnovationFunnel {
  loadStores();
  let ideas = Array.from(ideasStore.values());
  if (options?.tag) {
    ideas = ideas.filter((i) => i.tags.includes(options.tag!));
  }

  const totalIdeas = ideas.length;
  const inProgress = ideas.filter((i) => i.status === "in-progress").length;
  const shipped = ideas.filter((i) => i.status === "shipped").length;
  const abandoned = ideas.filter((i) => i.status === "abandoned").length;
  const conversionRate = totalIdeas > 0 ? shipped / totalIdeas : 0;

  // Average time to ship (ms) for shipped ideas
  const shippedIdeas = ideas.filter((i) => i.status === "shipped");
  let avgTimeToShip = 0;
  if (shippedIdeas.length > 0) {
    const now = Date.now();
    const totalMs = shippedIdeas.reduce(
      (sum, i) => sum + (now - new Date(i.createdAt).getTime()),
      0,
    );
    avgTimeToShip = totalMs / shippedIdeas.length;
  }

  // By team: count ideas per tag (tags act as team identifiers)
  const byTeam: Record<string, number> = {};
  for (const idea of ideas) {
    for (const tag of idea.tags) {
      byTeam[tag] = (byTeam[tag] ?? 0) + 1;
    }
  }

  return InnovationFunnelSchema.parse({
    totalIdeas,
    inProgress,
    shipped,
    abandoned,
    conversionRate: Math.round(conversionRate * 1000) / 1000,
    avgTimeToShip,
    byTeam,
  });
}

/** Compute per-team comparison metrics. */
export function getTeamComparisons(): TeamComparison[] {
  loadStores();
  const teamMap = new Map<string, TrackedIdea[]>();

  for (const idea of Array.from(ideasStore.values())) {
    for (const tag of idea.tags) {
      const list = teamMap.get(tag) ?? [];
      list.push(idea);
      teamMap.set(tag, list);
    }
  }

  const comparisons: TeamComparison[] = [];
  for (const [teamId, ideas] of Array.from(teamMap)) {
    const shippedIdeas = ideas.filter((i) => i.status === "shipped");
    const scores = ideas.map((i) => calculateImpactScore(i.id));
    const avgImpactScore =
      scores.length > 0
        ? Math.round(
            scores.reduce((s, sc) => s + sc.compositeScore, 0) / scores.length,
          )
        : 0;

    const topScore = scores.sort(
      (a, b) => b.compositeScore - a.compositeScore,
    )[0];

    comparisons.push(
      TeamComparisonSchema.parse({
        teamId,
        ideasGenerated: ideas.length,
        ideasShipped: shippedIdeas.length,
        avgImpactScore,
        topIdea: topScore?.ideaId,
      }),
    );
  }

  return comparisons.sort((a, b) => b.avgImpactScore - a.avgImpactScore);
}

/** Generate a full impact dashboard with an LLM-generated executive summary. */
export async function generateImpactDashboard(
  model?: string,
): Promise<ImpactDashboard> {
  loadStores();

  const funnel = getInnovationFunnel();
  const topPerformers = rankByImpact({ limit: 10 });
  const teamComparisons = getTeamComparisons();

  // Build simple trends from existing ideas grouped by month
  const monthMap = new Map<string, { created: number; shipped: number; scores: number[] }>();
  for (const idea of Array.from(ideasStore.values())) {
    const month = idea.createdAt.slice(0, 7); // YYYY-MM
    const entry = monthMap.get(month) ?? { created: 0, shipped: 0, scores: [] };
    entry.created++;
    if (idea.status === "shipped") entry.shipped++;
    entry.scores.push(calculateImpactScore(idea.id).compositeScore);
    monthMap.set(month, entry);
  }

  const trends: TrendRecord[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => ({
      period,
      ideasCreated: data.created,
      ideasShipped: data.shipped,
      avgImpactScore:
        data.scores.length > 0
          ? Math.round(
              data.scores.reduce((s, v) => s + v, 0) / data.scores.length,
            )
          : 0,
    }));

  // Generate executive summary via LLM
  const summaryPrompt = `You are an innovation portfolio analyst. Given the following innovation metrics, write a concise executive summary (3-5 sentences) highlighting key insights, risks, and recommendations.

Funnel: ${JSON.stringify(funnel)}
Top Performers: ${JSON.stringify(topPerformers.slice(0, 5))}
Team Comparisons: ${JSON.stringify(teamComparisons)}
Trends: ${JSON.stringify(trends)}

Respond with a JSON object: { "summary": "<your executive summary>" }`;

  let executiveSummary: string;
  try {
    const raw = await withRetry(() =>
      generateText({ prompt: summaryPrompt, model: model ?? "gpt-4o" }),
    );
    const parsed = JSON.parse(extractJson(raw)) as { summary: string };
    executiveSummary = parsed.summary ?? "No summary available.";
  } catch {
    executiveSummary =
      `Innovation portfolio: ${funnel.totalIdeas} ideas tracked, ` +
      `${funnel.shipped} shipped (${Math.round(funnel.conversionRate * 100)}% conversion). ` +
      `${funnel.inProgress} in progress, ${funnel.abandoned} abandoned.`;
  }

  return ImpactDashboardSchema.parse({
    funnel,
    topPerformers,
    teamComparisons,
    trends,
    executiveSummary,
  });
}

/** Export an impact dashboard as Markdown. */
export function dashboardToMarkdown(dashboard: ImpactDashboard): string {
  const lines: string[] = [];

  lines.push("# Innovation Impact Dashboard\n");

  // Executive summary
  lines.push("## Executive Summary\n");
  lines.push(dashboard.executiveSummary);
  lines.push("");

  // Funnel
  const f = dashboard.funnel;
  lines.push("## Innovation Funnel\n");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Total Ideas | ${f.totalIdeas} |`);
  lines.push(`| In Progress | ${f.inProgress} |`);
  lines.push(`| Shipped | ${f.shipped} |`);
  lines.push(`| Abandoned | ${f.abandoned} |`);
  lines.push(
    `| Conversion Rate | ${Math.round(f.conversionRate * 100)}% |`,
  );
  lines.push(
    `| Avg Time to Ship | ${Math.round(f.avgTimeToShip / 86_400_000)}d |`,
  );
  lines.push("");

  // Top performers
  if (dashboard.topPerformers.length > 0) {
    lines.push("## Top Performers\n");
    lines.push(
      `| Idea | Composite | Implementation | Adoption | Business | Confidence |`,
    );
    lines.push(`| --- | --- | --- | --- | --- | --- |`);
    for (const s of dashboard.topPerformers) {
      lines.push(
        `| ${s.ideaId} | ${s.compositeScore} | ${s.implementationScore} | ${s.adoptionScore} | ${s.businessScore} | ${s.confidence} |`,
      );
    }
    lines.push("");
  }

  // Team comparisons
  if (dashboard.teamComparisons.length > 0) {
    lines.push("## Team Comparisons\n");
    lines.push(
      `| Team | Generated | Shipped | Avg Impact | Top Idea |`,
    );
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const t of dashboard.teamComparisons) {
      lines.push(
        `| ${t.teamId} | ${t.ideasGenerated} | ${t.ideasShipped} | ${t.avgImpactScore} | ${t.topIdea ?? "—"} |`,
      );
    }
    lines.push("");
  }

  // Trends
  if (dashboard.trends.length > 0) {
    lines.push("## Trends\n");
    lines.push(`| Period | Created | Shipped | Avg Impact |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const tr of dashboard.trends) {
      lines.push(
        `| ${tr.period} | ${tr.ideasCreated} | ${tr.ideasShipped} | ${tr.avgImpactScore} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Data management
// ---------------------------------------------------------------------------

/** Clear all in-memory and persisted impact tracker data. */
export function clearImpactTrackerData(): void {
  ideasStore = new Map();
  outcomesStore = new Map();
  storeLoaded = false;
  try {
    if (fs.existsSync(IDEAS_FILE)) fs.unlinkSync(IDEAS_FILE);
    if (fs.existsSync(OUTCOMES_FILE)) fs.unlinkSync(OUTCOMES_FILE);
  } catch {
    // ignore cleanup errors
  }
}
