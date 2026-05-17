/**
 * @description Data provenance visualization for innovation lineage.
 */
export const runtime = "nodejs";

import {
  buildProvenanceChain,
  generateSankeyDiagram,
  exportSankeyAsSVG,
  exportSankeyAsHTML,
  getFlowMetrics,
  formatProvenanceMarkdown,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ProvenanceSchema = z.object({
  subject: z.string().min(1).max(500),
  investigation: z.record(z.unknown()),
  angleResults: z.array(z.record(z.unknown())),
  synthesis: z.record(z.unknown()).optional(),
  scores: z.array(z.record(z.unknown())).optional(),
  format: z.enum(["json", "svg", "html", "markdown"]).optional(),
  config: z
    .object({
      maxNodes: z.number().int().min(5).max(200).optional(),
      showScores: z.boolean().optional(),
      showFindings: z.boolean().optional(),
      layout: z.enum(["horizontal", "vertical"]).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const contentTypeError = validateJsonContentType(request);
    if (contentTypeError) return contentTypeError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = ProvenanceSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request." }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const { subject, investigation, angleResults, synthesis, scores, format, config } = parsed.data;

    /* eslint-disable @typescript-eslint/no-explicit-any -- pipeline results shape varies */
    const chain = buildProvenanceChain(
      subject,
      investigation as any,
      angleResults as any,
      synthesis as any,
      scores as any
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const diagram = generateSankeyDiagram(chain, config);
    const metrics = getFlowMetrics(diagram);

    if (format === "svg") {
      const svg = exportSankeyAsSVG(diagram);
      return new Response(svg, {
        headers: { ...API_RESPONSE_HEADERS, "Content-Type": "image/svg+xml" },
      });
    }

    if (format === "html") {
      const html = exportSankeyAsHTML(diagram);
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (format === "markdown") {
      const markdown = formatProvenanceMarkdown(chain);
      return new Response(markdown, {
        headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
      });
    }

    logger.info("Provenance visualization generated", {
      route: "/api/provenance-visualization",
      requestId,
      durationMs: Date.now() - startTime,
      nodeCount: diagram.nodes.length,
    });

    return Response.json({ diagram, metrics, chain }, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Provenance visualization error", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/provenance-visualization",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: "Provenance visualization failed." }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
