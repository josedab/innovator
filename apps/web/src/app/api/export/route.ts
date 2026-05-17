/**
 * @description Export innovation sessions to various formats (JSON, CSV, markdown).
 */
export const runtime = "nodejs";

import {
  exportToMarkdown,
  exportToJson,
  exportToClipboard,
  generateGitHubIssueBody,
  exportToPowerPoint,
  exportToJira,
  exportToConfluence,
  exportToNotion,
  exportToGoogleSlides,
  getAvailableFormats,
} from "@innovator/core";
import type { ExportData } from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ExportSchema = z.object({
  format: z.enum([
    "markdown",
    "json",
    "clipboard",
    "github-issue",
    "powerpoint",
    "jira",
    "confluence",
    "notion",
    "google-slides",
  ]),
  data: z.object({
    subject: z.string(),
    investigation: z.any().optional(),
    angleResults: z.array(z.any()),
    synthesis: z.any().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  config: z.record(z.unknown()).optional(),
});

/**
 * POST /api/export — Export innovation data in the specified format.
 *
 * @requestBody {object} application/json
 *   - `format` {string} (required) — One of: "markdown", "json", "clipboard",
 *     "github-issue", "powerpoint", "jira", "confluence", "notion", "google-slides"
 *   - `data` {ExportData} (required) — Innovation data to export:
 *     - `subject` {string} — Original investigation subject
 *     - `investigation` {Investigation} (optional) — Investigation context
 *     - `angleResults` {AngleResult[]} — Generated ideas per angle
 *     - `synthesis` {Synthesis} (optional) — Cross-angle synthesis
 *     - `metadata` {Record<string, unknown>} (optional) — Extra metadata
 *   - `config` {Record<string, unknown>} (optional) — Format-specific config
 *
 * @response 200 {object} application/json — Exported content in requested format
 * @response 400 {{ error: string }} — Invalid format or validation failure
 * @response 500 {{ error: string }} — Export failure
 *
 * GET /api/export — List available export formats.
 * @response 200 {{ formats: string[] }} — Array of supported format identifiers
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ExportSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid export request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const { format, data, config } = parsed.data;
    const exportData = data as ExportData;

    switch (format) {
      case "markdown": {
        const result = exportToMarkdown(exportData);
        return new Response(JSON.stringify({ data: result }), { headers: API_RESPONSE_HEADERS });
      }
      case "json": {
        const result = exportToJson(exportData);
        return new Response(JSON.stringify({ data: result }), { headers: API_RESPONSE_HEADERS });
      }
      case "clipboard": {
        const text = exportToClipboard(exportData);
        return new Response(JSON.stringify({ data: { content: text } }), {
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "github-issue": {
        const issue = generateGitHubIssueBody(exportData);
        return new Response(JSON.stringify({ data: issue }), { headers: API_RESPONSE_HEADERS });
      }
      case "powerpoint": {
        const result = exportToPowerPoint(exportData);
        return new Response(JSON.stringify({ data: result }), { headers: API_RESPONSE_HEADERS });
      }
      case "jira": {
        const result = exportToJira(exportData, config as Parameters<typeof exportToJira>[1]);
        return new Response(JSON.stringify({ data: result }), { headers: API_RESPONSE_HEADERS });
      }
      case "confluence": {
        const result = exportToConfluence(
          exportData,
          config as Parameters<typeof exportToConfluence>[1]
        );
        return new Response(JSON.stringify({ data: result }), { headers: API_RESPONSE_HEADERS });
      }
      case "notion": {
        const result = exportToNotion(exportData);
        return new Response(JSON.stringify({ data: result }), { headers: API_RESPONSE_HEADERS });
      }
      case "google-slides": {
        const result = exportToGoogleSlides(exportData);
        return new Response(JSON.stringify({ data: result }), { headers: API_RESPONSE_HEADERS });
      }
      default:
        return new Response(JSON.stringify({ error: "Unknown format" }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Export failed" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** GET /api/export — list available export formats. */
export async function GET() {
  return new Response(JSON.stringify({ formats: getAvailableFormats() }), {
    headers: API_RESPONSE_HEADERS,
  });
}
