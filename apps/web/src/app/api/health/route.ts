/**
 * @description Health check endpoint with component-level status report.
 */
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { getHealthReport } from "@innovator/core";

/**
 * Health check endpoint.
 * Returns a full health report with component-level status.
 */
export async function GET() {
  try {
    const report = await getHealthReport();
    const statusCode = report.status === "unhealthy" ? 503 : 200;

    return Response.json(report, { status: statusCode, headers: API_RESPONSE_HEADERS });
  } catch {
    return Response.json(
      { status: "unhealthy", error: "Health check failed", timestamp: new Date().toISOString() },
      { status: 503, headers: API_RESPONSE_HEADERS }
    );
  }
}
