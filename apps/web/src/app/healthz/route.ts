import packageJson from "../../../package.json" with { type: "json" };

/**
 * GET /healthz — Process liveness probe.
 *
 * @response 200 {{ status: "ok", version: string }} application/json
 */
export async function GET() {
  return Response.json(
    {
      status: "ok",
      version: packageJson.version,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
