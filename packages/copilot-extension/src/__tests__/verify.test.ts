import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "../verify.js";

describe("legacy verifySignature compatibility", () => {
  it("retains the previous HMAC signature API", () => {
    const payload = '{"action":"test"}';
    const secret = "legacy-secret";
    const signature = `sha256=${createHmac("sha256", secret)
      .update(payload, "utf-8")
      .digest("hex")}`;

    expect(verifySignature(payload, signature, secret)).toBe(true);
    expect(verifySignature(`${payload}tampered`, signature, secret)).toBe(false);
  });
});
