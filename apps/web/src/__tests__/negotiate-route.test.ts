// @ts-nocheck — test mocks use simplified types
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  startNegotiation: vi.fn(),
  negotiateStep: vi.fn(),
  getNegotiation: vi.fn(),
  completeNegotiation: vi.fn(),
  listNegotiations: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn(() => null),
  validateModel: vi.fn(() => null),
}));
vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/negotiate/route.js";
import {
  startNegotiation,
  negotiateStep,
  getNegotiation,
  completeNegotiation,
  listNegotiations,
} from "@innovator/core";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/negotiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const testIdea = {
  title: "AI Assistant",
  description: "An AI-powered assistant for teams",
};

describe("API /api/negotiate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(startNegotiation).mockResolvedValue({
      id: "neg-1",
      idea: testIdea,
      status: "active",
      turns: [],
    } as Awaited<ReturnType<typeof startNegotiation>>);
    vi.mocked(negotiateStep).mockResolvedValue({
      id: "neg-1",
      idea: testIdea,
      status: "active",
      turns: [{ role: "user", content: "test" }],
    } as Awaited<ReturnType<typeof negotiateStep>>);
    vi.mocked(getNegotiation).mockReturnValue({
      id: "neg-1",
      idea: testIdea,
      status: "active",
      turns: [],
    } as ReturnType<typeof getNegotiation>);
    vi.mocked(completeNegotiation).mockReturnValue({
      id: "neg-1",
      idea: testIdea,
      status: "completed",
      turns: [],
    } as ReturnType<typeof completeNegotiation>);
    vi.mocked(listNegotiations).mockReturnValue([]);
  });

  // ---- Invalid input ----

  it("returns 500 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/negotiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("returns 400 for missing action", async () => {
    const res = await POST(makeRequest({ foo: "bar" }));
    expect(res.status).toBe(400);
  });

  // ---- Start ----

  it("starts a negotiation session", async () => {
    const res = await POST(makeRequest({ action: "start", idea: testIdea }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.id).toBe("neg-1");
    expect(startNegotiation).toHaveBeenCalled();
  });

  it("returns 400 when start is missing idea", async () => {
    const res = await POST(makeRequest({ action: "start" }));
    expect(res.status).toBe(400);
  });

  // ---- Step ----

  it("advances negotiation with step", async () => {
    const res = await POST(
      makeRequest({ action: "step", sessionId: "neg-1", message: "What about pricing?" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session).toBeDefined();
  });

  it("returns 404 when step session not found", async () => {
    vi.mocked(negotiateStep).mockResolvedValue(null as unknown as Awaited<ReturnType<typeof negotiateStep>>);
    const res = await POST(
      makeRequest({ action: "step", sessionId: "bad-id", message: "test" })
    );
    expect(res.status).toBe(404);
  });

  // ---- Get ----

  it("gets a negotiation session by ID", async () => {
    const res = await POST(makeRequest({ action: "get", sessionId: "neg-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.id).toBe("neg-1");
  });

  it("returns 404 when session not found", async () => {
    vi.mocked(getNegotiation).mockReturnValue(undefined as unknown as ReturnType<typeof getNegotiation>);
    const res = await POST(makeRequest({ action: "get", sessionId: "bad-id" }));
    expect(res.status).toBe(404);
  });

  // ---- Complete ----

  it("completes a negotiation session", async () => {
    const res = await POST(makeRequest({ action: "complete", sessionId: "neg-1" }));
    expect(res.status).toBe(200);
  });

  it("returns 404 when completing non-existent session", async () => {
    vi.mocked(completeNegotiation).mockReturnValue(null as unknown as ReturnType<typeof completeNegotiation>);
    const res = await POST(makeRequest({ action: "complete", sessionId: "bad-id" }));
    expect(res.status).toBe(404);
  });

  // ---- List ----

  it("lists all negotiation sessions", async () => {
    const res = await POST(makeRequest({ action: "list" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });
});
