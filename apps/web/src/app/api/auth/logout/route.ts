/**
 * @description Session logout and token revocation.
 */
import { NextResponse } from "next/server";
import { revokeSessionToken } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../../lib/api-headers";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("session_token="))
    ?.split("=")[1];

  if (token) {
    revokeSessionToken(token);
  }

  const response = NextResponse.json({ success: true }, { headers: API_RESPONSE_HEADERS });
  response.cookies.delete("session_token");
  return response;
}
