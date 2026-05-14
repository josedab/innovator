/**
 * @description Prometheus-format metrics endpoint for monitoring.
 */
import { NextResponse } from "next/server";
import { renderPrometheusMetrics } from "@innovator/core";
import { CACHE_HEADERS, SECURITY_HEADERS } from "../../../lib/api-headers";

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
