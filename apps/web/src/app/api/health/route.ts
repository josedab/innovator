/**
 * @description Health check endpoint with component-level status report.
 */
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { getCopilotProviderHealth } from "@/lib/provider-health";
import { getHealthReport } from "@innovator/core";
import packageJson from "../../../../package.json" with { type: "json" };

/**
 * Health check endpoint.
 * Returns a full health report with component-level status.
 */
export async function GET() {
  try {
    const report = await getHealthReport(packageJson.version);
    const copilot = await getCopilotProviderHealth();
    const components = [
      ...report.components.filter((component) => component.name !== copilot.name),
      copilot,
    ];
    const status =
      copilot.status === "unhealthy" || report.status === "unhealthy" ? "unhealthy" : report.status;
    const statusCode = status === "unhealthy" ? 503 : 200;

    return Response.json(
      {
        ...report,
        status,
        components,
      },
      { status: statusCode, headers: API_RESPONSE_HEADERS }
    );
  } catch {
    return Response.json(
      { status: "unhealthy", error: "Health check failed", timestamp: new Date().toISOString() },
      { status: 503, headers: API_RESPONSE_HEADERS }
    );
  }
}
