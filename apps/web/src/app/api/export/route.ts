export const runtime = "nodejs";

import { exportToMarkdown, exportToJson, exportToClipboard, generateGitHubIssueBody } from "@innovator/core";
import type { ExportData } from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ExportSchema = z.object({
  format: z.enum(["markdown", "json", "clipboard", "github-issue"]),
  data: z.object({
    subject: z.string(),
    investigation: z.any().optional(),
    angleResults: z.array(z.any()),
    synthesis: z.any().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

/** POST /api/export — export innovation data in the specified format. */
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

    const { format, data } = parsed.data;
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
      default:
        return new Response(JSON.stringify({ error: "Unknown format" }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Export failed" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
