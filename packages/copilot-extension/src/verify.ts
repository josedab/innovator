/**
 * Legacy HMAC verifier retained only so existing imports continue to compile
 * while migrating from the retired Copilot Extension protocol to MCP.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * @deprecated GitHub retired server-side Copilot Extensions. Use MCP authentication instead.
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret || !signature.startsWith("sha256=")) return false;

  const providedHex = signature.slice("sha256=".length);
  const expectedHex = createHmac("sha256", secret).update(payload, "utf-8").digest("hex");
  if (providedHex.length !== expectedHex.length) return false;

  try {
    return timingSafeEqual(Buffer.from(providedHex, "hex"), Buffer.from(expectedHex, "hex"));
  } catch {
    return false;
  }
}
