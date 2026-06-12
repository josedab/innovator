import { describe, it, expect, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

import { validateJsonContentType, validateModel } from "../validate-request";

describe("validateJsonContentType", () => {
  it("returns null for valid application/json content type", () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(validateJsonContentType(request)).toBeNull();
  });

  it("returns null for content type with charset", () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
    expect(validateJsonContentType(request)).toBeNull();
  });

  it("returns 415 response for text/plain", () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
    });
    const response = validateJsonContentType(request);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(415);
  });

  it("returns 415 response when content type is missing", () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
    });
    const response = validateJsonContentType(request);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(415);
  });

  it("includes error message in 415 response body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "text/html" },
    });
    const response = validateJsonContentType(request)!;
    const body = await response.json();
    expect(body.error).toContain("Content-Type must be application/json");
  });
});

describe("validateModel", () => {
  it("returns null when model is undefined", () => {
    expect(validateModel(undefined)).toBeNull();
  });

  it("returns null for a known model", () => {
    expect(validateModel("gpt-4.1")).toBeNull();
  });

  it("returns 400 response for an unknown model", () => {
    const response = validateModel("unknown-model-xyz");
    expect(response).not.toBeNull();
    expect(response!.status).toBe(400);
  });

  it("includes allowed models in error response", async () => {
    const response = validateModel("bad-model")!;
    const body = await response.json();
    expect(body.error).toContain("Unknown model");
    expect(body.error).toContain("gpt-4.1");
  });
});
