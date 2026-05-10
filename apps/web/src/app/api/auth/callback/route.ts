import { NextResponse } from "next/server";
import { validateState, exchangeCodeForUser, createSessionToken } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../../lib/api-headers";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      return NextResponse.json(
        { error: "Missing code or state parameter" },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const cookieHeader = request.headers.get("cookie") ?? "";
    const storedState = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("oauth_state="))
      ?.split("=")[1];

    if (!storedState || storedState !== state) {
      return NextResponse.json(
        { error: "Invalid state parameter" },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const oauthState = validateState(state);
    if (!oauthState) {
      return NextResponse.json(
        { error: "State expired or invalid" },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    const user = await exchangeCodeForUser(code);
    const sessionToken = createSessionToken(user.id);

    const returnTo = oauthState.returnTo ?? "/playground";
    const response = NextResponse.redirect(new URL(returnTo, request.url));

    response.cookies.set("session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    response.cookies.delete("oauth_state");

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
