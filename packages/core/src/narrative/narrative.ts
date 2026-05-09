import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import type { Investigation, InnovationIdea } from "../types.js";
import {
  AUDIENCE_PROFILES,
  ARCHETYPE_STRUCTURES,
  NarrativeSchema,
  type AudienceType,
  type NarrativeFormat,
  type NarrativeArchetype,
  type Narrative,
  type NarrativeBundle,
  type NarrativeConfig,
} from "./types.js";

const DEFAULT_AUDIENCES: AudienceType[] = ["investor", "executive", "technical-team"];
const DEFAULT_FORMATS: NarrativeFormat[] = ["pitch-deck-script", "executive-memo", "blog-post"];

function selectArchetype(
  audience: AudienceType,
  override?: NarrativeArchetype
): NarrativeArchetype {
  if (override) return override;
  const mapping: Partial<Record<AudienceType, NarrativeArchetype>> = {
    investor: "vision-reality-gap",
    executive: "problem-solution",
    "technical-team": "data-revelation",
    customer: "before-after",
    board: "inevitable-future",
    media: "hero-journey",
    "internal-advocate": "underdog-story",
    "general-public": "before-after",
  };
  return mapping[audience] ?? "problem-solution";
}

function buildNarrativePrompt(
  idea: InnovationIdea,
  audience: AudienceType,
  format: NarrativeFormat,
  archetype: NarrativeArchetype,
  investigation?: Investigation
): string {
  const profile = AUDIENCE_PROFILES[audience];
  const structure = ARCHETYPE_STRUCTURES[archetype];

  return `Generate a compelling ${format.replace(/-/g, " ")} for this innovation idea, targeted at a ${audience.replace(/-/g, " ")} audience.

Idea: "${idea.title}"
Description: ${idea.description}
Impact: ${idea.potentialImpact}
Implementation: ${idea.implementationHint}
${investigation ? `\nContext: ${investigation.summary.slice(0, 1000)}` : ""}

Audience profile:
- Tone: ${profile.tone}
- Focus areas: ${profile.focus}
- Target length: ${profile.maxLength}

Narrative structure (${archetype} archetype):
${structure.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Respond in JSON:
{
  "title": "compelling title for this narrative",
  "content": "the full narrative text",
  "sections": [
    { "heading": "section heading", "content": "section content" }
  ],
  "keyMessages": ["key takeaway 1", "key takeaway 2"],
  "callToAction": "specific next step for this audience",
  "estimatedReadTime": "X min read"
}`;
}

/** Generate a single narrative for an idea, audience, and format combination. */
export async function generateNarrative(
  idea: InnovationIdea,
  audience: AudienceType,
  format: NarrativeFormat,
  investigation?: Investigation,
  config: NarrativeConfig = {}
): Promise<Narrative> {
  const archetype = selectArchetype(audience, config.archetype);

  const result = await withRetry(
    async () => {
      const raw = await generateText({
        prompt: buildNarrativePrompt(idea, audience, format, archetype, investigation),
        model: config.model,
        signal: config.signal,
      });
      const parsed = JSON.parse(extractJson(raw));
      return NarrativeSchema.parse({
        id: `narrative-${audience}-${format}-${Date.now()}`,
        ideaTitle: idea.title,
        audience,
        format,
        archetype,
        ...parsed,
      });
    },
    { signal: config.signal }
  );

  return result;
}

/** Generate a bundle of narratives for multiple audiences and formats. */
export async function generateNarrativeBundle(
  idea: InnovationIdea,
  investigation?: Investigation,
  config: NarrativeConfig = {}
): Promise<NarrativeBundle> {
  const audiences = config.audiences ?? DEFAULT_AUDIENCES;
  const formats = config.formats ?? DEFAULT_FORMATS;

  const pairs: Array<{ audience: AudienceType; format: NarrativeFormat }> = [];
  for (const audience of audiences) {
    for (const format of formats) {
      pairs.push({ audience, format });
    }
  }

  const narratives: Narrative[] = [];
  for (let i = 0; i < pairs.length; i++) {
    if (config.signal?.aborted) break;
    const { audience, format } = pairs[i];

    config.onProgress?.({
      stage: "generating",
      completedNarratives: i,
      totalNarratives: pairs.length,
      currentAudience: audience,
      currentFormat: format,
    });

    try {
      const narrative = await generateNarrative(idea, audience, format, investigation, config);
      narratives.push(narrative);
    } catch {
      // Non-critical: skip narrative on failure
    }
  }

  config.onProgress?.({
    stage: "complete",
    completedNarratives: narratives.length,
    totalNarratives: pairs.length,
  });

  return {
    ideaTitle: idea.title,
    ideaDescription: idea.description,
    narratives,
    generatedAt: new Date().toISOString(),
  };
}

/** Convert a narrative bundle to markdown. */
export function narrativeBundleToMarkdown(bundle: NarrativeBundle): string {
  const lines: string[] = [
    "# Innovation Narrative Bundle",
    "",
    `**Idea:** ${bundle.ideaTitle}`,
    `**Generated:** ${bundle.generatedAt}`,
    `**Total Narratives:** ${bundle.narratives.length}`,
    "",
  ];

  for (const narrative of bundle.narratives) {
    lines.push(`---`);
    lines.push("");
    lines.push(`## ${narrative.title} (${narrative.audience} / ${narrative.format})`);
    lines.push(`*Archetype: ${narrative.archetype} | ${narrative.estimatedReadTime}*`);
    lines.push("");
    lines.push(narrative.content);
    lines.push("");
    if (narrative.keyMessages.length > 0) {
      lines.push("**Key Messages:**");
      narrative.keyMessages.forEach((m) => lines.push(`- ${m}`));
      lines.push("");
    }
    lines.push(`**Call to Action:** ${narrative.callToAction}`);
    lines.push("");
  }

  return lines.join("\n");
}
