/**
 * @module saas/google-oauth
 *
 * Google OAuth authentication flow for the hosted SaaS platform.
 * Handles authorization URL generation, token exchange, and user profile retrieval.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

/** Zod schema for a Google user profile returned after OAuth. */
export const GoogleUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  picture: z.string().url(),
  accessToken: z.string(),
});

/** A Google user profile with access token. */
export type GoogleUser = z.infer<typeof GoogleUserSchema>;

/** Zod schema for validating Google OAuth state parameters. */
export const GoogleOAuthStateSchema = z.object({
  state: z.string(),
  returnTo: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
});

/** A Google OAuth state token with expiration, used to prevent CSRF. */
export type GoogleOAuthState = z.infer<typeof GoogleOAuthStateSchema>;

const pendingStates = new Map<string, GoogleOAuthState>();
const authenticatedUsers = new Map<string, GoogleUser>();

/** Google OAuth application configuration. */
export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

function getConfig(): GoogleOAuthConfig {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/auth/google/callback",
    scopes: ["openid", "email", "profile"],
  };
}

/**
 * Generate an authorization URL for Google OAuth.
 * @param returnTo - Optional path to redirect to after authentication.
 * @returns The Google authorization URL and generated state token.
 */
export function getGoogleAuthorizationUrl(returnTo?: string): { url: string; state: string } {
  const config = getConfig();
  if (!config.clientId) {
    throw new Error("GOOGLE_CLIENT_ID not configured");
  }

  const state = randomUUID();
  const now = new Date();
  const oauthState: GoogleOAuthState = {
    state,
    returnTo,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
  };

  pendingStates.set(state, oauthState);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: (config.scopes ?? []).join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
  };
}

/**
 * Validate a Google OAuth state parameter to prevent CSRF.
 * @param state - The state token returned by Google.
 * @returns The stored OAuth state, or `null` when invalid or expired.
 */
export function validateGoogleState(state: string): GoogleOAuthState | null {
  const pending = pendingStates.get(state);
  if (!pending) return null;

  pendingStates.delete(state);

  if (new Date(pending.expiresAt) < new Date()) return null;

  return pending;
}

/**
 * Exchange a Google authorization code for an access token and user profile.
 * @param code - The authorization code returned by Google.
 * @returns The authenticated Google user profile.
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleUser> {
  const config = getConfig();

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenResponse.status}`);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (tokenData.error || !tokenData.access_token) {
    throw new Error(
      `Google OAuth error: ${tokenData.error_description ?? tokenData.error ?? "no access token"}`
    );
  }

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
    },
  });

  if (!userResponse.ok) {
    throw new Error(`User fetch failed: ${userResponse.status}`);
  }

  const userData = (await userResponse.json()) as {
    sub?: string;
    id?: string;
    email: string;
    name: string;
    picture: string;
  };

  const user = GoogleUserSchema.parse({
    id: userData.sub ?? userData.id,
    email: userData.email,
    name: userData.name,
    picture: userData.picture,
    accessToken: tokenData.access_token,
  });

  authenticatedUsers.set(`google:${user.id}`, user);

  return user;
}

/**
 * Get an authenticated Google user from the in-memory store.
 * @param googleId - The Google account identifier.
 * @returns The stored Google user, or `null` when not found.
 */
export function getAuthenticatedGoogleUser(googleId: string): GoogleUser | null {
  return authenticatedUsers.get(`google:${googleId}`) ?? null;
}

/**
 * Clear all in-memory Google OAuth state.
 * Intended for test teardown.
 */
export function clearGoogleAuthData(): void {
  pendingStates.clear();
  authenticatedUsers.clear();
}
