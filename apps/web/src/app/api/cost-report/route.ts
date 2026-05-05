export const runtime = "nodejs";

import { generateCostReport } from "@innovator/core";
import { logger } from "@/lib/logger";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const startTime = Date.now();
  try {
    const report = generateCostReport();
    logger.info("Cost report generated", { route: "/api/cost-report", requestId, durationMs: Date.now() - startTime });
    return Response.json(report, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    logger.error("Cost report error", { error: err instanceof Error ? err.message : String(err), route: "/api/cost-report", requestId, durationMs: Date.now() - startTime });
    return new Response(JSON.stringify({ error: "Cost report generation failed." }), { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
