import { generateText, extractJson } from "../copilot/client.js";
import { buildInvestigationPrompt } from "../prompts/investigation.js";
import { InvestigationSchema, type Investigation } from "../types.js";

export async function investigate(
  subject: string,
  model?: string
): Promise<Investigation> {
  const prompt = buildInvestigationPrompt(subject);
  const raw = await generateText({ prompt, model, serverMode: true });

  const jsonStr = extractJson(raw);
  const parsed = JSON.parse(jsonStr);
  return InvestigationSchema.parse(parsed);
}
