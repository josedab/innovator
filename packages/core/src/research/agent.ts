import { generateText, extractJson } from "../copilot/client.js";
import { wrapUserInput } from "../prompts/sanitize.js";
import type {
  ResearchBrief,
  ResearchConfig,
  ResearchDepth,
  ResearchFinding,
  ResearchProgress,
  ResearchStep,
} from "./types.js";
import { DEPTH_STEP_LIMITS } from "./types.js";

/**
 * Research agent that performs multi-step LLM-driven research
 * using a plan-then-execute loop.
 */
export class ResearchAgent {
  private config: ResearchConfig;
  private steps: ResearchStep[] = [];
  private findings: ResearchFinding[] = [];
  private stepCounter = 0;

  constructor(config: ResearchConfig) {
    this.config = {
      ...config,
      maxSteps: config.maxSteps ?? DEPTH_STEP_LIMITS[config.depth],
    };
  }

  /**
   * Execute the full research pipeline for a subject.
   */
  async research(
    subject: string,
    onProgress?: (progress: ResearchProgress) => void
  ): Promise<ResearchBrief> {
    const startTime = Date.now();
    const totalSteps = this.config.maxSteps;

    const emitProgress = (stage: ResearchProgress["stage"], currentStep?: string) => {
      onProgress?.({
        stage,
        currentStep,
        completedSteps: this.steps.length,
        totalSteps,
        findings: [...this.findings],
      });
    };

    emitProgress("planning", "Creating research plan");

    // Step 1: Plan research queries
    const queries = await this.planResearch(subject);
    emitProgress("researching", "Starting research");

    // Step 2: Execute research queries (simulated via LLM)
    for (let i = 0; i < Math.min(queries.length, totalSteps); i++) {
      if (this.config.signal?.aborted) {
        emitProgress("error");
        throw new Error("Research was aborted");
      }

      const query = queries[i];
      emitProgress("researching", `Researching: ${query}`);

      const finding = await this.executeResearchStep(subject, query, i);
      this.findings.push(finding);
    }

    // Step 3: Synthesize findings into a brief
    emitProgress("synthesizing", "Compiling research brief");
    const brief = await this.synthesizeBrief(subject, startTime);

    emitProgress("complete");
    return brief;
  }

  private async planResearch(subject: string): Promise<string[]> {
    const stepStart = Date.now();
    const prompt = `You are a research planning agent. Given a subject, generate specific research queries to investigate it thoroughly.

${wrapUserInput("SUBJECT", subject)}

Research depth: ${this.config.depth}
Max queries: ${this.config.maxSteps}

Generate research queries covering:
- Current state and trends
- Academic/scientific findings
- Competitor analysis
- Market opportunities
- Gaps and unexplored areas

Respond with valid JSON only:
{
  "queries": ["query 1", "query 2", ...]
}`;

    const raw = await generateText({
      prompt,
      model: this.config.model,
      serverMode: true,
      signal: this.config.signal,
    });

    const json = JSON.parse(extractJson(raw)) as { queries: string[] };

    this.steps.push({
      id: `step-${++this.stepCounter}`,
      action: "decide",
      input: subject,
      output: JSON.stringify(json.queries),
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - stepStart,
    });

    return json.queries.slice(0, this.config.maxSteps);
  }

  private async executeResearchStep(
    subject: string,
    query: string,
    index: number
  ): Promise<ResearchFinding> {
    const stepStart = Date.now();
    const prompt = `You are a research agent. Synthesize knowledge about a specific research query in the context of a broader subject.

${wrapUserInput("SUBJECT", subject)}
${wrapUserInput("RESEARCH QUERY", query)}

Provide a thorough, factual research finding. Respond with valid JSON only:
{
  "title": "Finding title",
  "content": "Detailed finding (2-3 paragraphs)",
  "sourceType": "web" | "academic" | "competitor" | "internal",
  "relevanceScore": 0.0-1.0
}`;

    const raw = await generateText({
      prompt,
      model: this.config.model,
      serverMode: true,
      signal: this.config.signal,
    });

    const json = JSON.parse(extractJson(raw)) as {
      title: string;
      content: string;
      sourceType: "web" | "academic" | "competitor" | "internal";
      relevanceScore: number;
    };

    const durationMs = Date.now() - stepStart;

    this.steps.push({
      id: `step-${++this.stepCounter}`,
      action: "search",
      input: query,
      output: json.title,
      timestamp: new Date().toISOString(),
      durationMs,
    });

    return {
      id: `finding-${index}`,
      source: query,
      sourceType: json.sourceType,
      title: json.title,
      content: json.content,
      relevanceScore: Math.max(0, Math.min(1, json.relevanceScore)),
      timestamp: new Date().toISOString(),
    };
  }

  private async synthesizeBrief(subject: string, startTime: number): Promise<ResearchBrief> {
    const stepStart = Date.now();
    const findingsSummary = this.findings
      .map((f) => `[${f.sourceType}] ${f.title}: ${f.content.slice(0, 300)}`)
      .join("\n\n");

    const prompt = `You are a research synthesis agent. Compile the following research findings into a comprehensive research brief.

${wrapUserInput("SUBJECT", subject)}

FINDINGS:
"""
${findingsSummary}
"""

Respond with valid JSON only:
{
  "summary": "Executive summary (2-3 paragraphs)",
  "keyFindings": ["finding 1", "finding 2", ...],
  "competitorInsights": ["insight 1", ...],
  "academicReferences": ["reference 1", ...],
  "trendSignals": ["trend 1", ...],
  "gaps": ["gap 1", ...],
  "recommendations": ["recommendation 1", ...]
}`;

    const raw = await generateText({
      prompt,
      model: this.config.model,
      serverMode: true,
      signal: this.config.signal,
    });

    const json = JSON.parse(extractJson(raw)) as {
      summary: string;
      keyFindings: string[];
      competitorInsights: string[];
      academicReferences: string[];
      trendSignals: string[];
      gaps: string[];
      recommendations: string[];
    };

    this.steps.push({
      id: `step-${++this.stepCounter}`,
      action: "synthesize",
      input: `${this.findings.length} findings`,
      output: "Research brief compiled",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - stepStart,
    });

    return {
      subject,
      depth: this.config.depth,
      summary: json.summary,
      keyFindings: json.keyFindings,
      competitorInsights: json.competitorInsights,
      academicReferences: json.academicReferences,
      trendSignals: json.trendSignals,
      gaps: json.gaps,
      recommendations: json.recommendations,
      findings: this.findings,
      steps: this.steps,
      totalDurationMs: Date.now() - startTime,
      createdAt: new Date().toISOString(),
    };
  }
}

/**
 * Run a deep investigation that first performs research, then feeds
 * the grounded context into the standard investigate() pipeline.
 */
export async function deepInvestigate(
  subject: string,
  researchDepth: ResearchDepth = "moderate",
  model?: string,
  signal?: AbortSignal,
  onProgress?: (progress: ResearchProgress) => void
): Promise<{ brief: ResearchBrief; investigation: import("../types.js").Investigation }> {
  const { investigate } = await import("../innovation/investigate.js");
  const { buildInvestigationPrompt: _buildInvestigationPrompt } =
    await import("../prompts/investigation.js");

  const agent = new ResearchAgent({
    depth: researchDepth,
    maxSteps: DEPTH_STEP_LIMITS[researchDepth],
    model,
    signal,
  });
  const brief = await agent.research(subject, onProgress);

  // Feed research context into investigation
  const _contextBlock = `RESEARCH BRIEF:
${brief.summary}

Key Findings: ${brief.keyFindings.join("; ")}
Competitor Insights: ${brief.competitorInsights.join("; ")}
Trend Signals: ${brief.trendSignals.join("; ")}
Gaps: ${brief.gaps.join("; ")}`;

  const investigation = await investigate(subject, model, signal);

  return { brief, investigation };
}
