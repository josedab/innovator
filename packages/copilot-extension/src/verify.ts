/**
 * @module copilot-extension/verify
 *
 * Request signature verification for GitHub webhook payloads.
 * Uses HMAC-SHA256 to validate that requests originate from GitHub.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify the HMAC-SHA256 signature of a GitHub webhook payload.
 *
 * @param payload - Raw request body as string
 * @param signature - Value of the X-Hub-Signature-256 header
 * @param secret - Webhook secret configured in the GitHub App
 * @returns true if the signature is valid
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;

  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) return false;

  const sigHex = signature.slice(expectedPrefix.length);
  const hmac = createHmac("sha256", secret).update(payload, "utf-8").digest("hex");

  if (sigHex.length !== hmac.length) return false;

  try {
    return timingSafeEqual(Buffer.from(sigHex, "hex"), Buffer.from(hmac, "hex"));
  } catch {
    return false;
  }
}
