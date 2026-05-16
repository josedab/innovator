/**
 * @description Adversarial Idea Gauntlet — stress-test innovation ideas
 * against specialized adversary agents and get a Survivability Index.
 *
 * POST /api/gauntlet
 *
 * @requestBody {object} application/json
 *   - `idea` {object} (required) — The idea to stress-test
 *     - `title` {string} (1–500 chars)
 *     - `description` {string} (1–5000 chars)
 *     - `potentialImpact` {string} (optional, max 2000 chars)
 *     - `implementationHint` {string} (optional, max 2000 chars)
 *   - `adversaries` {string[]} (optional) — Subset of: "competitor", "regulator", "skeptic", "economist", "engineer"
 *   - `strengthen` {boolean} (optional) — Include strengthening suggestions in output
 *   - `model` {string} (optional, max 100 chars) — LLM model override
 *   - `format` {"json"|"markdown"} (default: "json") — Response format
 *
 * @response 200 {GauntletResult} application/json — Gauntlet result with Survivability Index (0–100)
 *   ```json
 *   {
 *     "survivabilityIndex": 72,
 *     "attacks": [{ "adversary": "string", "attack": "string", "severity": "string" }],
 *     "strengthenedIdea": { ... }
 *   }
 *   ```
 * @response 200 text/markdown — Markdown-formatted gauntlet report (when format="markdown")
 * @response 400 {{ error: string, details: ZodIssue[] }} — Invalid request body
 * @response 500 {{ error: string }} — Gauntlet evaluation failure
 */
export const runtime = "nodejs";

import { runGauntlet, gauntletToMarkdown } from "@innovator/core";
import type { GauntletConfig } from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RequestSchema = z.object({
  idea: z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(5000),
    potentialImpact: z.string().max(2000).default(""),
    implementationHint: z.string().max(2000).default(""),
  }),
  adversaries: z
    .array(z.enum(["competitor", "regulator", "skeptic", "economist", "engineer"]))
    .optional(),
  strengthen: z.boolean().optional(),
  model: z.string().max(100).optional(),
  format: z.enum(["json", "markdown"]).default("json"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { idea, adversaries, strengthen, model, format } = parsed.data;

    const config: GauntletConfig = {
      adversaries,
      strengthen,
      model,
    };

    const result = await runGauntlet(idea, config);

    if (format === "markdown") {
      return new Response(gauntletToMarkdown(result), {
        status: 200,
        headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
      });
    }

    return Response.json(result, { status: 200, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gauntlet evaluation failed";
    return Response.json({ error: message }, { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
