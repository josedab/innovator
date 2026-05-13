import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature } from "../verify.js";

function computeValidSignature(payload: string, secret: string): string {
  const hmac = createHmac("sha256", secret).update(payload, "utf-8").digest("hex");
  return `sha256=${hmac}`;
}

describe("verifySignature", () => {
  const secret = "test-webhook-secret";
  const payload = '{"action":"test"}';

  it("returns true for valid signature", () => {
    const sig = computeValidSignature(payload, secret);
    expect(verifySignature(payload, sig, secret)).toBe(true);
  });

  it("returns false for tampered payload", () => {
    const sig = computeValidSignature(payload, secret);
    expect(verifySignature(payload + "tampered", sig, secret)).toBe(false);
  });

  it("returns false for tampered signature", () => {
    const sig = computeValidSignature(payload, secret);
    const tampered = sig.slice(0, -4) + "dead";
    expect(verifySignature(payload, tampered, secret)).toBe(false);
  });

  it("returns false for empty signature", () => {
    expect(verifySignature(payload, "", secret)).toBe(false);
  });

  it("returns false for empty secret", () => {
    const sig = computeValidSignature(payload, secret);
    expect(verifySignature(payload, sig, "")).toBe(false);
  });

  it("returns false for missing sha256= prefix", () => {
    const hmac = createHmac("sha256", secret).update(payload, "utf-8").digest("hex");
    expect(verifySignature(payload, hmac, secret)).toBe(false);
  });

  it("returns false for wrong prefix", () => {
    const hmac = createHmac("sha256", secret).update(payload, "utf-8").digest("hex");
    expect(verifySignature(payload, `sha1=${hmac}`, secret)).toBe(false);
  });

  it("returns false for signature with wrong length", () => {
    expect(verifySignature(payload, "sha256=abc", secret)).toBe(false);
  });

  it("returns false for malformed hex in signature", () => {
    // Create a signature with correct length but invalid hex chars
    const validSig = computeValidSignature(payload, secret);
    const malformed = validSig.slice(0, -2) + "zz";
    expect(verifySignature(payload, malformed, secret)).toBe(false);
  });

  it("handles empty payload", () => {
    const sig = computeValidSignature("", secret);
    expect(verifySignature("", sig, secret)).toBe(true);
  });

  it("handles large payload", () => {
    const largePayload = "x".repeat(100000);
    const sig = computeValidSignature(largePayload, secret);
    expect(verifySignature(largePayload, sig, secret)).toBe(true);
  });

  it("is case-sensitive on payload content", () => {
    const sig = computeValidSignature("Hello", secret);
    expect(verifySignature("hello", sig, secret)).toBe(false);
  });
});
