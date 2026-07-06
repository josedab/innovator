import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  investigate: vi.fn(),
  generateForAngle: vi.fn(),
  ANGLES: [
    { id: "scamper", name: "SCAMPER", shortDescription: "desc", icon: "🔄" },
    { id: "first-principles", name: "First Principles", shortDescription: "desc", icon: "🧱" },
  ],
  generateText: vi.fn(),
  extractJson: vi.fn(),
  withRetry: vi.fn(),
  indexDocument: vi.fn(),
  findSimilarDocuments: vi.fn(),
  clearEmbeddingsIndex: vi.fn(),
}));

import { POST } from "../intersection/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/intersection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/intersection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 for valid 2-subject input", async () => {
    const res = await POST(
      makeRequest({
        subjects: ["AI testing", "Code review"],
        model: "gpt-4.1",
        anglesPerSubject: 2,
      })
    );
    const data = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(data).toContain('"stage":"investigating"');
    expect(data).toContain('"subjects":["AI testing","Code review"]');
  });

  it("returns 400 for only 1 subject", async () => {
    const res = await POST(makeRequest({ subjects: ["AI testing"] }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Provide 2-3 subjects for intersection analysis.");
  });

  it("returns 400 for more than 3 subjects", async () => {
    const res = await POST(makeRequest({ subjects: ["A", "B", "C", "D"] }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Provide 2-3 subjects for intersection analysis.");
  });

  it("returns 400 for empty subject string", async () => {
    const res = await POST(makeRequest({ subjects: ["AI testing", ""] }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Provide 2-3 subjects for intersection analysis.");
  });

  it("returns 400 for missing subjects field", async () => {
    const res = await POST(makeRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Provide 2-3 subjects for intersection analysis.");
  });

  it("returns 400 for anglesPerSubject out of range (0)", async () => {
    const res = await POST(
      makeRequest({ subjects: ["AI testing", "Code review"], anglesPerSubject: 0 })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Provide 2-3 subjects for intersection analysis.");
  });

  it("returns 400 for anglesPerSubject out of range (5)", async () => {
    const res = await POST(
      makeRequest({ subjects: ["AI testing", "Code review"], anglesPerSubject: 5 })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Provide 2-3 subjects for intersection analysis.");
  });
});
