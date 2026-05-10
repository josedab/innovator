import { NextResponse } from "next/server";
import { getAuthorizationUrl } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../../lib/api-headers";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const returnTo = searchParams.get("returnTo") ?? "/playground";

    const { url, state } = getAuthorizationUrl(returnTo);

    const response = NextResponse.redirect(url);
    response.cookies.set("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auth configuration error";
    return NextResponse.json({ error: message }, { status: 500, headers: API_RESPONSE_HEADERS });
  }
}
