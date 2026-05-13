/**
 * @module saas/github-oauth
 *
 * GitHub OAuth authentication flow for the hosted playground.
 * Handles authorization URL generation, token exchange, and user profile retrieval.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";

/** Zod schema for a GitHub user profile returned after OAuth. */
export const GitHubUserSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable(),
  email: z.string().email().nullable(),
  avatarUrl: z.string().url(),
  accessToken: z.string(),
});

/** A GitHub user profile with access token. */
export type GitHubUser = z.infer<typeof GitHubUserSchema>;

/** Zod schema for validating OAuth state parameters. */
export const OAuthStateSchema = z.object({
  state: z.string(),
  returnTo: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
});

/** An OAuth state token with expiration, used to prevent CSRF. */
export type OAuthState = z.infer<typeof OAuthStateSchema>;

const pendingStates = new Map<string, OAuthState>();
const authenticatedUsers = new Map<string, GitHubUser>();
const sessionTokens = new Map<string, string>(); // token -> userId

/** GitHub OAuth application configuration. */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

function getConfig(): OAuthConfig {
  return {
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    redirectUri: process.env.GITHUB_REDIRECT_URI ?? "http://localhost:3000/api/auth/callback",
    scopes: ["read:user", "user:email"],
  };
}

/** Generate authorization URL for GitHub OAuth. */
export function getAuthorizationUrl(returnTo?: string): { url: string; state: string } {
  const config = getConfig();
  if (!config.clientId) {
    throw new Error("GITHUB_CLIENT_ID not configured");
  }

  const state = randomUUID();
  const now = new Date();
  const oauthState: OAuthState = {
    state,
    returnTo,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
  };

  pendingStates.set(state, oauthState);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: (config.scopes ?? []).join(" "),
    state,
  });

  return {
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    state,
  };
}

/** Validate OAuth state parameter to prevent CSRF. */
export function validateState(state: string): OAuthState | null {
  const pending = pendingStates.get(state);
  if (!pending) return null;

  pendingStates.delete(state);

  if (new Date(pending.expiresAt) < new Date()) return null;

  return pending;
}

/** Exchange authorization code for access token and fetch user profile. */
export async function exchangeCodeForUser(code: string): Promise<GitHubUser> {
  const config = getConfig();

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenResponse.status}`);
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (tokenData.error || !tokenData.access_token) {
    throw new Error(`OAuth error: ${tokenData.error ?? "no access token"}`);
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!userResponse.ok) {
    throw new Error(`User fetch failed: ${userResponse.status}`);
  }

  const userData = (await userResponse.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string;
  };

  const user: GitHubUser = {
    id: userData.id,
    login: userData.login,
    name: userData.name,
    email: userData.email,
    avatarUrl: userData.avatar_url,
    accessToken: tokenData.access_token,
  };

  const userId = `github:${user.id}`;
  authenticatedUsers.set(userId, user);

  return user;
}

/** Create a session token for an authenticated user. */
export function createSessionToken(githubUserId: number): string {
  const token = `sess_${randomUUID().replace(/-/g, "")}`;
  const userId = `github:${githubUserId}`;
  sessionTokens.set(token, userId);
  return token;
}

/** Validate a session token and return the user. */
export function validateSessionToken(token: string): GitHubUser | null {
  const userId = sessionTokens.get(token);
  if (!userId) return null;
  return authenticatedUsers.get(userId) ?? null;
}

/** Revoke a session token. */
export function revokeSessionToken(token: string): boolean {
  return sessionTokens.delete(token);
}

/** Get user by GitHub ID. */
export function getAuthenticatedUser(githubId: number): GitHubUser | null {
  return authenticatedUsers.get(`github:${githubId}`) ?? null;
}

/**
 * Clear all in-memory OAuth state (pending states, users, session tokens).
 * Intended for test teardown.
 */
export function clearAuthData(): void {
  pendingStates.clear();
  authenticatedUsers.clear();
  sessionTokens.clear();
}
