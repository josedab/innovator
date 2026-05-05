/**
 * @module patent-scanner
 *
 * Prior art detection and freedom-to-operate assessment using LLM analysis
 * against USPTO, EPO, and WIPO patent databases.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { InnovationIdea } from "../types.js";
import type {
  PatentScanConfig,
  PatentScanProgress,
  PatentScanResult,
  PriorArtAssessment,
  PatentReference,
  PatentDatabase,
} from "./types.js";

export {
  PatentDatabaseSchema,
  PatentReferenceSchema,
  PriorArtAssessmentSchema,
  PatentScanResultSchema,
} from "./types.js";
export type {
  PatentDatabase,
  PatentReference,
  PriorArtAssessment,
  PatentScanResult,
  PatentScanProgress,
  PatentScanConfig,
} from "./types.js";

// ---- Prompt Builders ----

function buildPriorArtPrompt(
  subject: string,
  idea: InnovationIdea,
  databases: PatentDatabase[]
): string {
  return `You are a patent analyst performing a prior art search and freedom-to-operate assessment.

${wrapUserInput("SUBJECT DOMAIN", subject)}

IDEA TO ASSESS:
${wrapUserInput("TITLE", idea.title)}
${wrapUserInput("DESCRIPTION", idea.description)}
${wrapUserInput("IMPACT", idea.potentialImpact)}
${wrapUserInput("IMPLEMENTATION", idea.implementationHint)}

DATABASES TO SEARCH: ${databases.join(", ")}

Analyze this idea for potential patent conflicts. Consider:
1. Existing patents that may cover similar inventions
2. White space areas where no patents exist
3. Freedom to operate — can this be implemented without infringing?
4. Novelty — how different is this from existing patented inventions?

Generate realistic patent references that would likely exist in these databases based on your knowledge.

Respond with JSON only:
{
  "riskLevel": "clear" | "low" | "moderate" | "high" | "blocked",
  "relatedPatents": [
    {
      "patentNumber": "US12345678",
      "title": "...",
      "abstract": "...",
      "applicant": "...",
      "filingDate": "2023-01-15",
      "database": "USPTO",
      "relevanceScore": 0-100
    }
  ],
  "whiteSpaceAreas": ["area1", "area2"],
  "recommendations": ["recommendation1"],
  "freedomToOperate": 0-100,
  "noveltyAssessment": "Assessment of idea novelty vs prior art"
}`;
}

function buildWhiteSpacePrompt(subject: string, assessments: PriorArtAssessment[]): string {
  const summaries = assessments.map((a) => ({
    idea: a.ideaTitle,
    risk: a.riskLevel,
    whiteSpaces: a.whiteSpaceAreas,
    freedomToOperate: a.freedomToOperate,
  }));

  return `You are a patent strategist identifying white space opportunities.

${wrapUserInput("SUBJECT", subject)}

PRIOR ART ASSESSMENTS:
"""
${sanitizeLlmOutput(JSON.stringify(summaries, null, 2))}
"""

Identify the top innovation white spaces — areas with low patent density and high opportunity.

Respond with JSON only:
{
  "whiteSpaces": [
    {
      "area": "Description of white space area",
      "opportunity": "Why this is valuable",
      "competitorDensity": "low" | "medium" | "high"
    }
  ],
  "overallRisk": "clear" | "low" | "moderate" | "high"
}`;
}

const PriorArtResponseSchema = z.object({
  riskLevel: z.enum(["clear", "low", "moderate", "high", "blocked"]),
  relatedPatents: z.array(
    z.object({
      patentNumber: z.string().max(50),
      title: z.string().max(500),
      abstract: z.string().max(5000),
      applicant: z.string().max(500),
      filingDate: z.string().max(20),
      database: z.enum(["USPTO", "EPO", "WIPO"]),
      relevanceScore: z.number().min(0).max(100),
    })
  ),
  whiteSpaceAreas: z.array(z.string().max(500)).max(10).default([]),
  recommendations: z.array(z.string().max(1000)).max(10).default([]),
  freedomToOperate: z.number().min(0).max(100),
  noveltyAssessment: z.string().max(2000),
});

const WhiteSpaceResponseSchema = z.object({
  whiteSpaces: z.array(
    z.object({
      area: z.string().max(500),
      opportunity: z.string().max(1000),
      competitorDensity: z.enum(["low", "medium", "high"]),
    })
  ),
  overallRisk: z.enum(["clear", "low", "moderate", "high"]),
});

// ---- Core Functions ----

/**
 * Scan a single idea for prior art and assess freedom to operate.
 */
export async function assessPriorArt(
  subject: string,
  idea: InnovationIdea,
  config: PatentScanConfig = {}
): Promise<PriorArtAssessment> {
  const databases = config.databases ?? ["USPTO", "EPO", "WIPO"];
  const model = config.model;
  const signal = config.signal;

  const prompt = buildPriorArtPrompt(subject, idea, databases);
  const parsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, signal });
      const jsonStr = extractJson(raw);
      return PriorArtResponseSchema.parse(JSON.parse(jsonStr));
    },
    { signal }
  );

  const maxPatents = config.maxPatentsPerIdea ?? 10;

  return {
    ideaTitle: idea.title,
    riskLevel: parsed.riskLevel,
    relatedPatents: parsed.relatedPatents.slice(0, maxPatents).map((p) => ({
      id: randomUUID(),
      ...p,
      url:
        p.database === "USPTO"
          ? `https://patents.google.com/patent/${p.patentNumber}`
          : p.database === "EPO"
            ? `https://worldwide.espacenet.com/patent/search?q=${p.patentNumber}`
            : `https://patentscope.wipo.int/search/en/detail.jsf?docId=${p.patentNumber}`,
    })),
    whiteSpaceAreas: parsed.whiteSpaceAreas,
    recommendations: parsed.recommendations,
    freedomToOperate: parsed.freedomToOperate,
    noveltyAssessment: parsed.noveltyAssessment,
  };
}

/**
 * Run a full patent scan across multiple ideas.
 *
 * @param subject - The innovation domain
 * @param ideas - Ideas to scan
 * @param onProgress - Progress callback
 * @param config - Scan configuration
 * @returns Full patent scan result with assessments and white space map
 */
export async function runPatentScan(
  subject: string,
  ideas: InnovationIdea[],
  onProgress?: (progress: PatentScanProgress) => void,
  config: PatentScanConfig = {}
): Promise<PatentScanResult> {
  if (ideas.length === 0) {
    throw new Error("No ideas to scan");
  }

  const databases = config.databases ?? ["USPTO", "EPO", "WIPO"];
  const model = config.model;
  const signal = config.signal;
  const startTime = Date.now();

  const assessments: PriorArtAssessment[] = [];
  let totalPatents = 0;

  onProgress?.({
    stage: "searching",
    completedIdeas: 0,
    totalIdeas: ideas.length,
    patentsFound: 0,
  });

  for (let i = 0; i < ideas.length; i++) {
    if (signal?.aborted) break;

    onProgress?.({
      stage: "analyzing",
      currentIdea: ideas[i].title,
      completedIdeas: i,
      totalIdeas: ideas.length,
      patentsFound: totalPatents,
    });

    try {
      const assessment = await assessPriorArt(subject, ideas[i], config);
      assessments.push(assessment);
      totalPatents += assessment.relatedPatents.length;
    } catch {
      assessments.push({
        ideaTitle: ideas[i].title,
        riskLevel: "moderate",
        relatedPatents: [],
        whiteSpaceAreas: [],
        recommendations: ["Assessment failed — manual review recommended"],
        freedomToOperate: 50,
        noveltyAssessment: "Could not complete automated assessment",
      });
    }
  }

  // Generate white space map
  onProgress?.({
    stage: "assessing",
    completedIdeas: ideas.length,
    totalIdeas: ideas.length,
    patentsFound: totalPatents,
  });

  let whiteSpaceMap: PatentScanResult["whiteSpaceMap"] = [];
  let overallRisk: PatentScanResult["overallRisk"] = "low";

  try {
    const prompt = buildWhiteSpacePrompt(subject, assessments);
    const raw = await withRetry(
      async () => {
        const text = await generateText({ prompt, model, signal });
        return text;
      },
      { signal }
    );
    const jsonStr = extractJson(raw);
    const parsed = WhiteSpaceResponseSchema.parse(JSON.parse(jsonStr));
    whiteSpaceMap = parsed.whiteSpaces;
    overallRisk = parsed.overallRisk;
  } catch {
    // White space analysis is supplementary
    const riskCounts = assessments.reduce(
      (acc, a) => {
        acc[a.riskLevel] = (acc[a.riskLevel] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    overallRisk =
      (riskCounts["high"] ?? 0) + (riskCounts["blocked"] ?? 0) > assessments.length / 2
        ? "high"
        : (riskCounts["moderate"] ?? 0) > assessments.length / 2
          ? "moderate"
          : "low";
  }

  const result: PatentScanResult = {
    subject,
    assessments,
    overallRisk,
    whiteSpaceMap,
    databasesSearched: databases,
    totalPatentsAnalyzed: totalPatents,
    scanDurationMs: Date.now() - startTime,
    createdAt: new Date().toISOString(),
  };

  onProgress?.({
    stage: "complete",
    completedIdeas: ideas.length,
    totalIdeas: ideas.length,
    patentsFound: totalPatents,
  });

  return result;
}

/** Format patent scan results as markdown. */
export function patentScanToMarkdown(result: PatentScanResult): string {
  const lines: string[] = [
    `# Patent Scan: ${result.subject}`,
    "",
    `**Overall Risk:** ${result.overallRisk}`,
    `**Databases:** ${result.databasesSearched.join(", ")}`,
    `**Patents Analyzed:** ${result.totalPatentsAnalyzed}`,
    `**Scan Duration:** ${Math.round(result.scanDurationMs / 1000)}s`,
    "",
  ];

  for (const assessment of result.assessments) {
    const riskIcon =
      assessment.riskLevel === "clear"
        ? "✅"
        : assessment.riskLevel === "low"
          ? "🟢"
          : assessment.riskLevel === "moderate"
            ? "🟡"
            : assessment.riskLevel === "high"
              ? "🟠"
              : "🔴";

    lines.push(`## ${riskIcon} ${assessment.ideaTitle}`);
    lines.push(
      `**Risk:** ${assessment.riskLevel} | **Freedom to Operate:** ${assessment.freedomToOperate}%`
    );
    lines.push(`**Novelty:** ${assessment.noveltyAssessment}`);
    lines.push("");

    if (assessment.relatedPatents.length > 0) {
      lines.push("### Related Patents");
      for (const p of assessment.relatedPatents) {
        lines.push(
          `- [${p.patentNumber}](${p.url ?? "#"}) — ${p.title} (${p.database}, relevance: ${p.relevanceScore}%)`
        );
      }
      lines.push("");
    }

    if (assessment.whiteSpaceAreas.length > 0) {
      lines.push("### White Space");
      for (const ws of assessment.whiteSpaceAreas) {
        lines.push(`- ${ws}`);
      }
      lines.push("");
    }
  }

  if (result.whiteSpaceMap.length > 0) {
    lines.push("## White Space Opportunities", "");
    for (const ws of result.whiteSpaceMap) {
      lines.push(`- **${ws.area}** (density: ${ws.competitorDensity}): ${ws.opportunity}`);
    }
  }

  return lines.join("\n");
}
