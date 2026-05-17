/**
 * @module backtesting
 *
 * Innovation Backtesting Engine — replays historical innovations through
 * Innovator's pipeline to calibrate scoring accuracy. Ships with 10 seed
 * cases covering landmark innovations from iPhone to Zoom.
 */

import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import { investigate } from "../innovation/investigate.js";
import { generateForAngle } from "../innovation/generate.js";
import { runGauntlet } from "../gauntlet/index.js";
import { scoreIdeas } from "../scoring/index.js";
import type { AngleResult, Investigation } from "../types.js";
import type {
  BacktestCase,
  BacktestConfig,
  CasePack,
  PipelineReplayResult,
  AccuracyMetrics,
  CalibrationAdjustment,
  CalibrationReport,
} from "./types.js";
import { PipelineReplayResultSchema } from "./types.js";

export * from "./types.js";

// ---- Seed Case Pack (10 landmark innovations) ----

const SEED_CASES: BacktestCase[] = [
  {
    id: "iphone-2007",
    name: "Apple iPhone",
    year: 2007,
    subject: "How might we reimagine the mobile phone experience for consumers?",
    domain: "technology",
    historicalContext:
      "Nokia and BlackBerry dominate. Touchscreen phones exist but are clunky. iPod is Apple's biggest hit. Mobile web browsing is painful.",
    actualInnovation:
      "A full-touchscreen smartphone combining phone, iPod, and internet communicator with a capacitive multi-touch display and mobile app ecosystem.",
    outcome: {
      succeeded: true,
      revenueOrValuation: 394_000_000_000,
      timeToProductMarketFit: "months",
      marketShareCaptured: 0.27,
      narrative:
        "Launched June 2007. Created the modern smartphone category. App Store (2008) became a $85B/year ecosystem.",
    },
    tags: ["hardware", "platform", "consumer"],
  },
  {
    id: "airbnb-2009",
    name: "Airbnb Pivot",
    year: 2009,
    subject: "How might we make travel accommodation more affordable and authentic?",
    domain: "hospitality",
    historicalContext:
      "Hotel industry is mature and expensive. Craigslist vacation rentals exist but lack trust. Couchsurfing is free but inconsistent quality.",
    actualInnovation:
      "A peer-to-peer marketplace for short-term home rentals with professional photography, reviews, host guarantee insurance, and identity verification.",
    outcome: {
      succeeded: true,
      revenueOrValuation: 75_000_000_000,
      timeToProductMarketFit: "1-2years",
      marketShareCaptured: 0.2,
      narrative:
        "Pivoted from air mattress rentals to full home sharing. Grew to 7M+ listings in 220+ countries.",
    },
    tags: ["marketplace", "sharing-economy", "consumer"],
  },
  {
    id: "slack-2013",
    name: "Slack",
    year: 2013,
    subject: "How might we reduce email overload and improve team communication?",
    domain: "enterprise-software",
    historicalContext:
      "Email is primary business communication. IRC and HipChat exist. Yammer and other enterprise social networks have limited adoption.",
    actualInnovation:
      "A channel-based messaging platform with searchable history, integrations, file sharing, and a consumer-grade UX for enterprise teams.",
    outcome: {
      succeeded: true,
      revenueOrValuation: 27_700_000_000,
      timeToProductMarketFit: "months",
      marketShareCaptured: 0.15,
      narrative:
        "Pivoted from a failed game (Glitch). Grew to 12M+ DAU. Acquired by Salesforce for $27.7B in 2021.",
    },
    tags: ["saas", "communication", "enterprise"],
  },
  {
    id: "netflix-streaming-2007",
    name: "Netflix Streaming Pivot",
    year: 2007,
    subject: "How might we make movie and TV access instant and on-demand?",
    domain: "entertainment",
    historicalContext:
      "Netflix is a DVD-by-mail service. Blockbuster dominates physical rental. YouTube proves streaming is viable. Broadband adoption is growing.",
    actualInnovation:
      "A subscription streaming service offering unlimited on-demand video over the internet, eventually producing original content.",
    outcome: {
      succeeded: true,
      revenueOrValuation: 150_000_000_000,
      timeToProductMarketFit: "1-2years",
      marketShareCaptured: 0.25,
      narrative:
        "Transitioned from DVD to streaming. House of Cards (2013) launched original content era. 230M+ subscribers globally.",
    },
    tags: ["streaming", "content", "consumer"],
  },
  {
    id: "tesla-model3-2017",
    name: "Tesla Model 3",
    year: 2017,
    subject: "How might we make electric vehicles accessible to the mass market?",
    domain: "automotive",
    historicalContext:
      "Tesla has Model S/X for luxury segment. EVs are seen as niche/expensive. Charging infrastructure is sparse. Battery costs are falling.",
    actualInnovation:
      "A $35K mass-market electric sedan with 220+ mile range, supercharger network access, and over-the-air software updates.",
    outcome: {
      succeeded: true,
      revenueOrValuation: 800_000_000_000,
      timeToProductMarketFit: "1-2years",
      marketShareCaptured: 0.14,
      narrative:
        "Became the best-selling EV globally. Proved mass-market EV demand. Forced legacy automakers to accelerate EV plans.",
    },
    tags: ["hardware", "automotive", "sustainability"],
  },
  {
    id: "zoom-2013",
    name: "Zoom Video Communications",
    year: 2013,
    subject: "How might we make video conferencing reliable and frictionless?",
    domain: "enterprise-software",
    historicalContext:
      "WebEx and Skype dominate video calls. Quality is unreliable. Setup is complex. Mobile video calling is emerging.",
    actualInnovation:
      "A cloud-native video conferencing platform with one-click join, gallery view, virtual backgrounds, and freemium model with 40-min free tier.",
    outcome: {
      succeeded: true,
      revenueOrValuation: 20_000_000_000,
      timeToProductMarketFit: "1-2years",
      marketShareCaptured: 0.35,
      narrative:
        "Grew steadily pre-COVID. Exploded to 300M daily participants during pandemic. Became a verb for video calls.",
    },
    tags: ["saas", "communication", "enterprise"],
  },
  {
    id: "spotify-2008",
    name: "Spotify",
    year: 2008,
    subject: "How might we provide legal, convenient access to all music?",
    domain: "entertainment",
    historicalContext:
      "iTunes dominates legal downloads at $0.99/song. Piracy via BitTorrent is rampant. Pandora offers radio-style streaming. Labels are struggling.",
    actualInnovation:
      "An ad-supported and premium subscription music streaming service with 30M+ tracks, social features, playlists, and algorithmic discovery.",
    outcome: {
      succeeded: true,
      revenueOrValuation: 50_000_000_000,
      timeToProductMarketFit: "1-2years",
      marketShareCaptured: 0.31,
      narrative:
        "Helped reduce piracy. 600M+ users, 220M+ premium subscribers. Expanded into podcasts and audiobooks.",
    },
    tags: ["streaming", "content", "consumer"],
  },
  {
    id: "stripe-2011",
    name: "Stripe",
    year: 2011,
    subject: "How might we make accepting payments on the internet simple for developers?",
    domain: "fintech",
    historicalContext:
      "PayPal is dominant but developer-unfriendly. Setting up a merchant account takes weeks. PCI compliance is a nightmare for startups.",
    actualInnovation:
      "A developer-first payment API that lets any website accept payments with 7 lines of code, handling PCI compliance, fraud detection, and global currencies.",
    outcome: {
      succeeded: true,
      revenueOrValuation: 95_000_000_000,
      timeToProductMarketFit: "months",
      marketShareCaptured: 0.2,
      narrative:
        "Became the default payments infrastructure for internet businesses. Powers Shopify, Lyft, DoorDash, and millions of businesses.",
    },
    tags: ["fintech", "api", "developer-tools"],
  },
  {
    id: "impossible-burger-2016",
    name: "Impossible Burger",
    year: 2016,
    subject: "How might we create a plant-based meat alternative that appeals to meat eaters?",
    domain: "food-tech",
    historicalContext:
      "Veggie burgers exist but taste nothing like meat. Climate concerns about cattle farming are growing. Protein engineering is advancing.",
    actualInnovation:
      "A plant-based burger using heme (soy leghemoglobin) to replicate the taste, smell, and sizzle of beef, targeting meat-lovers rather than vegetarians.",
    outcome: {
      succeeded: true,
      revenueOrValuation: 7_000_000_000,
      timeToProductMarketFit: "1-2years",
      marketShareCaptured: 0.03,
      narrative:
        "Available in 40,000+ restaurants and grocery stores. Proved mainstream demand for plant-based meat alternatives.",
    },
    tags: ["food-tech", "sustainability", "consumer"],
  },
  {
    id: "google-wave-2009",
    name: "Google Wave (Failure Case)",
    year: 2009,
    subject: "How might we reinvent email with real-time collaboration?",
    domain: "enterprise-software",
    historicalContext:
      "Email is entrenched. Google Docs shows real-time collaboration is possible. Social media is rising. IM and email are separate tools.",
    actualInnovation:
      "A real-time collaborative communication platform combining email, IM, wiki, and social networking into 'waves' with live typing and embeddable apps.",
    outcome: {
      succeeded: false,
      timeToProductMarketFit: "5+years",
      narrative:
        "Launched to hype, but users found it confusing. Too many features, unclear use case. Shut down in 2012. Some ideas lived on in Google Docs.",
    },
    tags: ["collaboration", "enterprise", "failure"],
  },
];

/** Returns the built-in seed case pack with 10 landmark innovations. */
export function getSeedCasePack(): CasePack {
  return {
    id: "seed-pack-v1",
    name: "Landmark Innovations Seed Pack",
    description:
      "10 well-documented historical innovations spanning technology, hospitality, entertainment, fintech, and food-tech. Includes one failure case (Google Wave) for calibration.",
    cases: SEED_CASES,
    createdAt: "2024-01-01T00:00:00.000Z",
    version: "1.0.0",
  };
}

/**
 * Use LLM to evaluate how similar a pipeline-generated idea is to the actual
 * historical innovation.
 */
async function evaluateSimilarity(
  pipelineIdea: { title: string; description: string },
  actualInnovation: string,
  config: { model?: string; signal?: AbortSignal }
): Promise<{ similarity: number; hit: boolean }> {
  const prompt = `You are an innovation historian. Compare a pipeline-generated idea against the actual historical innovation.

PIPELINE IDEA:
${wrapUserInput("TITLE", pipelineIdea.title)}
${wrapUserInput("DESCRIPTION", pipelineIdea.description)}

${wrapUserInput("ACTUAL INNOVATION", actualInnovation)}

Rate the similarity on a 0–1 scale where:
- 0.0 = completely unrelated
- 0.3 = same domain but different approach
- 0.6 = similar core concept
- 0.8 = very close match
- 1.0 = essentially identical

Respond in JSON: {"similarity": <number>, "hit": <boolean>, "reasoning": "<brief explanation>"}
A "hit" is true if similarity >= 0.5.`;

  return withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config.model, signal: config.signal });
      const parsed = JSON.parse(extractJson(sanitizeLlmOutput(raw)));
      const similarity = Math.max(0, Math.min(1, Number(parsed.similarity) || 0));
      return { similarity, hit: similarity >= 0.5 };
    },
    { signal: config.signal }
  );
}

/**
 * Replay a single historical case through the innovation pipeline.
 */
export async function replayCase(
  testCase: BacktestCase,
  config: BacktestConfig = {}
): Promise<PipelineReplayResult> {
  const startTime = Date.now();
  const { model, signal } = config;

  // Step 1: Investigate the historical subject
  const investigation: Investigation = await investigate(testCase.subject, model, signal);

  // Step 2: Generate ideas from multiple angles
  const angles = ["first-principles", "scamper", "blue-ocean"] as const;
  const angleResults: AngleResult[] = [];

  for (const angleId of angles) {
    if (signal?.aborted) break;
    try {
      const result = await generateForAngle(
        testCase.subject,
        investigation,
        angleId,
        model,
        signal
      );
      angleResults.push(result);
    } catch {
      // Continue with remaining angles if one fails
    }
  }

  // Collect all ideas from all angles
  const allIdeas = angleResults.flatMap((ar) =>
    ar.ideas.map((idea) => ({ ...idea, angleId: ar.angleId }))
  );

  // Step 3: Score all ideas
  let pipelineScore: PipelineReplayResult["pipelineScore"] | undefined;
  try {
    const scoringResult = await scoreIdeas(
      testCase.subject,
      angleResults,
      investigation,
      model,
      signal
    );
    if (scoringResult.scores.length > 0) {
      const best = scoringResult.scores.sort(
        (a, b) => b.feasibility + b.impact + b.novelty - (a.feasibility + a.impact + a.novelty)
      )[0];
      pipelineScore = {
        feasibility: best.feasibility,
        impact: best.impact,
        novelty: best.novelty,
        confidence: best.confidence,
      };
    }
  } catch {
    // Scoring is optional; continue without it
  }

  // Step 4: Run gauntlet on top ideas
  const gauntletResults: Array<{ title: string; survivability: number }> = [];
  for (const idea of allIdeas.slice(0, 3)) {
    if (signal?.aborted) break;
    try {
      const result = await runGauntlet(
        {
          title: idea.title,
          description: idea.description,
          potentialImpact: idea.potentialImpact,
          implementationHint: idea.implementationHint,
        },
        { model, signal }
      );
      gauntletResults.push({ title: idea.title, survivability: result.survivabilityIndex });
    } catch {
      // Continue if gauntlet fails for an idea
    }
  }

  // Step 5: Find the best matching idea
  let bestMatch = { similarity: 0, hit: false, title: "", angleId: "" };

  for (const idea of allIdeas) {
    if (signal?.aborted) break;
    try {
      const result = await evaluateSimilarity(idea, testCase.actualInnovation, { model, signal });
      if (result.similarity > bestMatch.similarity) {
        bestMatch = {
          similarity: result.similarity,
          hit: result.hit,
          title: idea.title,
          angleId: idea.angleId,
        };
      }
    } catch {
      // Skip comparison failures
    }
  }

  return PipelineReplayResultSchema.parse({
    caseId: testCase.id,
    hitActualInnovation: bestMatch.hit,
    similarityToActual: bestMatch.similarity,
    ideasGenerated: allIdeas.length,
    bestMatchTitle: bestMatch.title || undefined,
    pipelineScore,
    matchingAngles: bestMatch.angleId ? [bestMatch.angleId] : [],
    durationMs: Date.now() - startTime,
    replayedAt: new Date().toISOString(),
  });
}

/**
 * Run the full backtesting suite across a case pack.
 */
export async function runBacktest(
  config: BacktestConfig = {}
): Promise<{ results: PipelineReplayResult[]; metrics: AccuracyMetrics }> {
  const casePack = config.casePack ?? getSeedCasePack();
  let cases = casePack.cases;

  if (config.domains?.length) {
    cases = cases.filter((c) => config.domains!.includes(c.domain));
  }
  if (config.tags?.length) {
    cases = cases.filter((c) => c.tags.some((t) => config.tags!.includes(t)));
  }

  const results: PipelineReplayResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    if (config.signal?.aborted) break;

    config.onProgress?.({
      stage: "replaying",
      currentCase: testCase.name,
      casesCompleted: i,
      totalCases: cases.length,
    });

    try {
      const result = await replayCase(testCase, config);
      results.push(result);
    } catch {
      // Record failure as zero similarity
      results.push({
        caseId: testCase.id,
        hitActualInnovation: false,
        similarityToActual: 0,
        ideasGenerated: 0,
        matchingAngles: [],
        durationMs: 0,
        replayedAt: new Date().toISOString(),
      });
    }
  }

  config.onProgress?.({
    stage: "scoring",
    casesCompleted: results.length,
    totalCases: cases.length,
  });

  const metrics = computeAccuracyMetrics(results, cases);

  config.onProgress?.({
    stage: "complete",
    casesCompleted: results.length,
    totalCases: cases.length,
  });

  return { results, metrics };
}

/**
 * Compute accuracy metrics from backtest results.
 */
export function computeAccuracyMetrics(
  results: PipelineReplayResult[],
  cases: BacktestCase[]
): AccuracyMetrics {
  if (results.length === 0) {
    return {
      hitRate: 0,
      averageSimilarity: 0,
      scoreOutcomeCorrelation: 0,
      feasibilityMAE: 0,
      impactMAE: 0,
      casesEvaluated: 0,
      byDomain: {},
    };
  }

  const hits = results.filter((r) => r.hitActualInnovation).length;
  const hitRate = hits / results.length;
  const averageSimilarity =
    results.reduce((sum, r) => sum + r.similarityToActual, 0) / results.length;

  // Group by domain
  const byDomain: AccuracyMetrics["byDomain"] = {};
  for (const result of results) {
    const testCase = cases.find((c) => c.id === result.caseId);
    if (!testCase) continue;
    const domain = testCase.domain;
    if (!byDomain[domain]) {
      byDomain[domain] = { hitRate: 0, averageSimilarity: 0, caseCount: 0 };
    }
    byDomain[domain].caseCount++;
    byDomain[domain].averageSimilarity += result.similarityToActual;
    if (result.hitActualInnovation) byDomain[domain].hitRate++;
  }

  for (const domain of Object.keys(byDomain)) {
    const d = byDomain[domain];
    d.hitRate = d.caseCount > 0 ? d.hitRate / d.caseCount : 0;
    d.averageSimilarity = d.caseCount > 0 ? d.averageSimilarity / d.caseCount : 0;
  }

  // Compute score-outcome correlation using pipeline scores vs actual success
  let scoreOutcomeCorrelation = 0;
  const scoredPairs: Array<{ score: number; outcome: number }> = [];
  for (const result of results) {
    if (!result.pipelineScore) continue;
    const testCase = cases.find((c) => c.id === result.caseId);
    if (!testCase) continue;
    const compositeScore =
      (result.pipelineScore.feasibility +
        result.pipelineScore.impact +
        result.pipelineScore.novelty) /
      3;
    scoredPairs.push({
      score: compositeScore,
      outcome: testCase.outcome.succeeded ? 8 : 3,
    });
  }

  if (scoredPairs.length >= 2) {
    const meanScore = scoredPairs.reduce((s, p) => s + p.score, 0) / scoredPairs.length;
    const meanOutcome = scoredPairs.reduce((s, p) => s + p.outcome, 0) / scoredPairs.length;
    let numerator = 0;
    let denomScore = 0;
    let denomOutcome = 0;
    for (const pair of scoredPairs) {
      const ds = pair.score - meanScore;
      const dout = pair.outcome - meanOutcome;
      numerator += ds * dout;
      denomScore += ds * ds;
      denomOutcome += dout * dout;
    }
    const denom = Math.sqrt(denomScore * denomOutcome);
    scoreOutcomeCorrelation = denom > 0 ? numerator / denom : 0;
  }

  // Compute MAE for feasibility and impact vs outcome proxy
  let feasibilityMAE = 0;
  let impactMAE = 0;
  const feasPairs: Array<{ predicted: number; actual: number }> = [];
  const impactPairs: Array<{ predicted: number; actual: number }> = [];
  for (const result of results) {
    if (!result.pipelineScore) continue;
    const testCase = cases.find((c) => c.id === result.caseId);
    if (!testCase) continue;
    const actualSuccess = testCase.outcome.succeeded ? 8 : 3;
    feasPairs.push({ predicted: result.pipelineScore.feasibility, actual: actualSuccess });
    impactPairs.push({ predicted: result.pipelineScore.impact, actual: actualSuccess });
  }
  if (feasPairs.length > 0) {
    feasibilityMAE =
      feasPairs.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / feasPairs.length;
    impactMAE =
      impactPairs.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / impactPairs.length;
  }

  return {
    hitRate,
    averageSimilarity,
    scoreOutcomeCorrelation: Math.round(scoreOutcomeCorrelation * 1000) / 1000,
    feasibilityMAE: Math.round(feasibilityMAE * 100) / 100,
    impactMAE: Math.round(impactMAE * 100) / 100,
    casesEvaluated: results.length,
    byDomain,
  };
}

/**
 * Generate calibration adjustments from backtest results.
 */
export function generateCalibrationReport(
  metrics: AccuracyMetrics,
  results: PipelineReplayResult[]
): CalibrationReport {
  const adjustments: CalibrationAdjustment[] = [];
  const recommendations: string[] = [];
  const now = new Date().toISOString();

  // Analyze score distributions to suggest calibration
  const scoredResults = results.filter((r) => r.pipelineScore);
  if (scoredResults.length > 0) {
    const avgFeasibility =
      scoredResults.reduce((s, r) => s + (r.pipelineScore?.feasibility ?? 0), 0) /
      scoredResults.length;

    adjustments.push({
      dimension: "feasibility",
      biasCorrection: 5 - avgFeasibility,
      scalingFactor: 1.0,
      sampleSize: scoredResults.length,
      computedAt: now,
    });
  }

  if (metrics.hitRate < 0.3) {
    recommendations.push(
      "Hit rate is below 30%. Consider adding more diverse angles or adjusting investigation depth."
    );
  }
  if (metrics.hitRate >= 0.3 && metrics.hitRate < 0.6) {
    recommendations.push(
      "Hit rate is moderate (30-60%). Pipeline captures some innovations but misses others. Review angle coverage."
    );
  }
  if (metrics.hitRate >= 0.6) {
    recommendations.push(
      "Hit rate is strong (60%+). Pipeline reliably identifies innovations similar to historical successes."
    );
  }

  if (metrics.averageSimilarity < 0.4) {
    recommendations.push(
      "Average similarity is low. Generated ideas diverge significantly from actual innovations. Consider domain-specific prompts."
    );
  }

  const overallCalibrationScore = (metrics.hitRate + metrics.averageSimilarity) / 2;

  return {
    metrics,
    adjustments,
    recommendations,
    overallCalibrationScore,
    createdAt: now,
  };
}
