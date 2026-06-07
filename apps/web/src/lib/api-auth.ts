/**
 * @module api-auth
 *
 * Static API-key authentication for the single-tenant production profile.
 */

import { getConfiguredApiKeys, isProductionRuntime } from "./runtime-policy";

export interface ApiKeyValidationResult {
  valid: boolean;
  keyId?: string;
  error?: string;
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index++) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

/**
 * Validate `Authorization: Bearer <key>` or `X-API-Key`.
 * Development permits anonymous requests when no key is configured; production fails closed.
 */
export function validateApiKey(request: Request): ApiKeyValidationResult {
  let apiKeys: string[];
  try {
    apiKeys = getConfiguredApiKeys();
  } catch {
    return { valid: false, error: "Server API authentication is misconfigured" };
  }

  if (apiKeys.length === 0) {
    if (isProductionRuntime()) {
      return { valid: false, error: "Server API authentication is not configured" };
    }
    return { valid: true, keyId: "anonymous" };
  }

  const authorization = request.headers.get("Authorization");
  const apiKeyHeader = request.headers.get("X-API-Key");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : apiKeyHeader;

  if (!token) {
    return {
      valid: false,
      error: "Missing API key. Provide via Authorization: Bearer <key> or X-API-Key.",
    };
  }

  const keyIndex = apiKeys.findIndex((key) => constantTimeEqual(key, token));
  if (keyIndex === -1) {
    return { valid: false, error: "Invalid API key" };
  }

  return { valid: true, keyId: `key-${keyIndex}` };
}
