/**
 * @description Current authenticated user profile retrieval.
 */
import { NextResponse } from "next/server";
import { validateSessionToken } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../../lib/api-headers";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("session_token="))
    ?.split("=")[1];

  if (!token) {
    return NextResponse.json({ authenticated: false }, { headers: API_RESPONSE_HEADERS });
  }

  const user = validateSessionToken(token);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { headers: API_RESPONSE_HEADERS });
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    },
    { headers: API_RESPONSE_HEADERS }
  );
}
