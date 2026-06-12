import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  KNOWN_MODELS: ["gpt-4.1", "gpt-4.1-mini", "gpt-5"],
}));

import {
  JsonBodyError,
  jsonBodyErrorResponse,
  readJsonBody,
  validateJsonContentType,
  validateModel,
} from "../lib/validate-request";
import { API_RESPONSE_HEADERS } from "../lib/api-headers";

function makeRequest(contentType?: string): Request {
  const headers: Record<string, string> = {};
  if (contentType !== undefined) {
    headers["content-type"] = contentType;
  }
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers,
    body: "{}",
  });
}

describe("validateJsonContentType", () => {
  it("with 'application/json' returns null", () => {
    expect(validateJsonContentType(makeRequest("application/json"))).toBeNull();
  });

  it("with 'text/plain' returns 415 Response", async () => {
    const result = validateJsonContentType(makeRequest("text/plain"));
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(415);
    const body = await result!.json();
    expect(body.error).toContain("Content-Type must be application/json");
  });

  it("with 'application/json; charset=utf-8' returns null", () => {
    expect(validateJsonContentType(makeRequest("application/json; charset=utf-8"))).toBeNull();
  });

  it("with missing Content-Type returns 415", () => {
    const req = new Request("http://localhost/api/test", { method: "POST", body: "{}" });
    const result = validateJsonContentType(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(415);
  });

  it("response includes API_RESPONSE_HEADERS", async () => {
    const result = validateJsonContentType(makeRequest("text/plain"))!;
    for (const [key, value] of Object.entries(API_RESPONSE_HEADERS)) {
      expect(result.headers.get(key)).toBe(value);
    }
  });
});

describe("validateModel", () => {
  it("with valid model name returns null", () => {
    expect(validateModel("gpt-4.1")).toBeNull();
  });

  it("with unknown model returns 400 with allowed models list", async () => {
    const result = validateModel("nonexistent-model");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
    const body = await result!.json();
    expect(body.error).toContain("Unknown model");
    expect(body.error).toContain("Allowed models");
  });

  it("validateModel(undefined) returns null", () => {
    expect(validateModel(undefined)).toBeNull();
  });

  it("response includes API_RESPONSE_HEADERS", async () => {
    const result = validateModel("bad-model")!;
    for (const [key, value] of Object.entries(API_RESPONSE_HEADERS)) {
      expect(result.headers.get(key)).toBe(value);
    }
  });
});

describe("readJsonBody", () => {
  it("parses a JSON body delivered in multiple chunks", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"subject":'));
        controller.enqueue(encoder.encode('"test"}'));
        controller.close();
      },
    });
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readJsonBody(request)).resolves.toEqual({ subject: "test" });
  });

  it("rejects the actual streamed size when Content-Length is absent", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "x".repeat(11),
    });

    await expect(readJsonBody(request, 10)).rejects.toMatchObject({
      status: 413,
      message: "Request body too large",
    });
  });

  it("returns a consistent response for malformed JSON", async () => {
    const response = jsonBodyErrorResponse(new JsonBodyError("Invalid JSON body", 400));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body" });
  });
});
