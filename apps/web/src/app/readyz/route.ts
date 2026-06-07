import { accessSync, constants, mkdirSync } from "node:fs";
import packageJson from "../../../package.json" with { type: "json" };
import { getCopilotProviderHealth } from "@/lib/provider-health";
import { validateProductionRuntime } from "@/lib/runtime-policy";

/**
 * GET /readyz — Runtime configuration and writable-state readiness probe.
 *
 * @response 200 {{ status: "ready", version: string }} application/json
 * @response 503 {{ status: "not-ready" }} application/json
 */
export async function GET() {
  try {
    validateProductionRuntime();
    const homeDirectory = process.env.HOME ?? "/home/innovator";
    for (const directoryName of [".innovator", ".copilot"]) {
      const stateDirectory = `${homeDirectory}/${directoryName}`;
      mkdirSync(stateDirectory, { recursive: true });
      accessSync(stateDirectory, constants.R_OK | constants.W_OK);
    }
    const copilot = await getCopilotProviderHealth();
    if (copilot.status !== "healthy") {
      throw new Error("Copilot provider is not ready");
    }

    return Response.json(
      {
        status: "ready",
        version: packageJson.version,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch {
    return Response.json(
      {
        status: "not-ready",
        version: packageJson.version,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  }
}
