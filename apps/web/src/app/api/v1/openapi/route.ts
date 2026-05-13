/**
 * @description V1 API — OpenAPI specification endpoint.
 */
import { NextRequest } from "next/server";
import { getOpenApiSpec } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

export async function GET(_request: NextRequest) {
  const spec = getOpenApiSpec();
  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      ...API_RESPONSE_HEADERS,
      "Content-Type": "application/json",
    },
  });
}
