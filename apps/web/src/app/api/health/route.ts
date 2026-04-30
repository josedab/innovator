import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const version = process.env.npm_package_version ?? "0.1.0";

/**
 * Health check endpoint.
 *
 * @returns JSON response `{ status: "ok", version: string }` (200).
 */
export function GET() {
  return Response.json({ status: "ok", version }, { headers: API_RESPONSE_HEADERS });
}
