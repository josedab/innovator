import { generateText, extractJson } from "../copilot/client.js";
import {
  buildScamperPrompt,
  buildFirstPrinciplesPrompt,
  buildCrossDomainPrompt,
  buildConstraintsPrompt,
  buildInversionPrompt,
  buildPerspectivesPrompt,
  buildWhatIfPrompt,
  buildTrendCollisionPrompt,
} from "../prompts/angles/index.js";
import {
  AngleResultSchema,
  type AngleId,
  type AngleResult,
  type Investigation,
} from "../types.js";

type PromptBuilder = (subject: string, investigation: Investigation) => string;

const ANGLE_PROMPT_MAP: Record<AngleId, PromptBuilder> = {
  scamper: buildScamperPrompt,
  "first-principles": buildFirstPrinciplesPrompt,
  "cross-domain": buildCrossDomainPrompt,
  constraints: buildConstraintsPrompt,
  inversion: buildInversionPrompt,
  perspectives: buildPerspectivesPrompt,
  "what-if": buildWhatIfPrompt,
  "trend-collision": buildTrendCollisionPrompt,
};

export async function generateForAngle(
  subject: string,
  investigation: Investigation,
  angleId: AngleId,
  model?: string
): Promise<AngleResult> {
  const buildPrompt = ANGLE_PROMPT_MAP[angleId];
  if (!buildPrompt) {
    throw new Error(`Unknown angle: ${angleId}`);
  }

  const prompt = buildPrompt(subject, investigation);
  const raw = await generateText({ prompt, model, serverMode: true });

  const jsonStr = extractJson(raw);
  const parsed = JSON.parse(jsonStr);
  return AngleResultSchema.parse(parsed);
}
