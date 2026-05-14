import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  verifyLedger: vi.fn(),
  getLedgerSessionEntries: vi.fn(),
  getLedgerActorEntries: vi.fn(),
  getLedgerEntriesInRange: vi.fn(),
  exportLedgerForActor: vi.fn(),
  recordLedgerHumanDecision: vi.fn(),
  ledgerToMarkdown: vi.fn(),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { GET, POST } from "../app/api/provenance/route.js";
import {
  verifyLedger,
  getLedgerSessionEntries,
  exportLedgerForActor,
  recordLedgerHumanDecision,
} from "@innovator/core";

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/provenance");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { method: "GET" });
}

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/provenance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/provenance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET verify returns ledger verification", async () => {
    vi.mocked(verifyLedger).mockReturnValue({
      valid: true,
      totalEntries: 5,
      firstEntry: "e1",
      lastEntry: "e5",
    });
    const res = await GET(makeGet({ action: "verify" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.totalEntries).toBe(5);
  });

  it("GET session requires sessionId", async () => {
    const res = await GET(makeGet({ action: "session" }));
    expect(res.status).toBe(400);
  });

  it("GET session returns entries", async () => {
    vi.mocked(getLedgerSessionEntries).mockReturnValue([{ id: "e1", type: "investigation" }]);
    const res = await GET(makeGet({ action: "session", sessionId: "s1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
  });

  it("POST record-decision creates an entry", async () => {
    vi.mocked(recordLedgerHumanDecision).mockReturnValue({ id: "e1", type: "approval" });
    const res = await POST(
      makePost({
        action: "record-decision",
        sessionId: "s1",
        actor: "alice@test.com",
        type: "approval",
        subject: "Solar panel idea",
        reasoning: "Strong market fit",
      })
    );
    expect(res.status).toBe(201);
  });

  it("POST export returns GDPR export", async () => {
    vi.mocked(exportLedgerForActor).mockReturnValue({
      exportedAt: "2026-01-01",
      requestedBy: "alice@test.com",
      entries: [],
      verificationHash: "abc",
    });
    const res = await POST(makePost({ action: "export", actor: "alice@test.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.requestedBy).toBe("alice@test.com");
  });

  it("POST rejects unknown action", async () => {
    const res = await POST(makePost({ action: "unknown" }));
    expect(res.status).toBe(400);
  });
});
