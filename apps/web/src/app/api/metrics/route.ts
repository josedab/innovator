import { NextResponse } from "next/server";
import { renderPrometheusMetrics } from "@innovator/core";
import { CACHE_HEADERS, SECURITY_HEADERS } from "../../../lib/api-headers";

/** GET /api/metrics — expose Prometheus-format metrics for monitoring. */
export async function GET() {
  const metrics = renderPrometheusMetrics();

  return new NextResponse(metrics, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      ...CACHE_HEADERS,
      ...SECURITY_HEADERS,
    },
  });
}
