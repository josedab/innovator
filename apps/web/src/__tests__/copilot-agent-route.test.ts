import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunCopilotAgentCycle = vi.fn();
const mockRespondToProposal = vi.fn();
const mockLoadCopilotAgentRun = vi.fn();
const mockListCopilotAgentRuns = vi.fn();

vi.mock("@innovator/core", () => ({
  runCopilotAgentCycle: (...args: unknown[]) => mockRunCopilotAgentCycle(...args),
  respondToProposal: (...args: unknown[]) => mockRespondToProposal(...args),
  loadCopilotAgentRun: (...args: unknown[]) => mockLoadCopilotAgentRun(...args),
  listCopilotAgentRuns: (...args: unknown[]) => mockListCopilotAgentRuns(...args),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
  SECURITY_HEADERS: { "X-Content-Type-Options": "nosniff" },
}));

import { POST, GET } from "../app/api/copilot-agent/route.js";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/copilot-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGet(params?: Record<string, string>): Request {
  const url = new URL("http://localhost/api/copilot-agent");
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

async function readSSE(response: Response): Promise<string[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.replace("data: ", ""));
}

const validSource = {
  id: "src-1",
  type: "repository" as const,
  name: "my-repo",
  url: "https://github.com/test/repo",
  enabled: true,
};

describe("API /api/copilot-agent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("POST run-cycle", () => {
    it("returns SSE stream with progress and result events", async () => {
      mockRunCopilotAgentCycle.mockImplementation(async (opts, _existingRunId, onProgress) => {
        onProgress({ step: "scanning", message: "Scanning sources" });
        return { runId: "run-1", proposals: [] };
      });

      const res = await POST(
        makePost({
          action: "run-cycle",
          sources: [validSource],
          topics: ["AI"],
        })
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");

      const events = await readSSE(res);
      expect(events.length).toBeGreaterThanOrEqual(2);

      const progressEvent = JSON.parse(events[0]);
      expect(progressEvent.type).toBe("progress");
      expect(progressEvent.step).toBe("scanning");

      const resultEvent = JSON.parse(events[events.length - 1]);
      expect(resultEvent.type).toBe("result");
      expect(resultEvent.run.runId).toBe("run-1");
    });

    it("returns 400 for malformed JSON body", async () => {
      const req = new Request("http://localhost/api/copilot-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid JSON body");
    });

    it("returns 400 for invalid action", async () => {
      const res = await POST(makePost({ action: "unknown" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid request");
    });

    it("returns 400 for sources array >50 items", async () => {
      const sources = Array.from({ length: 51 }, (_, i) => ({
        id: `src-${i}`,
        type: "repository",
        name: `repo-${i}`,
      }));
      const res = await POST(makePost({ action: "run-cycle", sources, topics: ["test"] }));
      expect(res.status).toBe(400);
    });

    it("sends SSE error event when core throws", async () => {
      mockRunCopilotAgentCycle.mockRejectedValue(new Error("LLM timeout"));

      const res = await POST(
        makePost({
          action: "run-cycle",
          sources: [validSource],
          topics: ["AI"],
        })
      );

      expect(res.status).toBe(200);
      const events = await readSSE(res);
      const errorEvent = JSON.parse(events[events.length - 1]);
      expect(errorEvent.type).toBe("error");
      expect(errorEvent.error).toBe("LLM timeout");
    });
  });

  describe("POST respond", () => {
    it("returns updated run JSON for valid response", async () => {
      const mockRun = { runId: "run-1", proposals: [{ id: "p1" }] };
      mockLoadCopilotAgentRun.mockReturnValue(mockRun);
      mockRespondToProposal.mockReturnValue({ ...mockRun, responded: true });

      const res = await POST(
        makePost({
          action: "respond",
          runId: "run-1",
          proposalId: "p1",
          response: "accepted",
          feedback: "Great idea",
        })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.responded).toBe(true);
      expect(mockRespondToProposal).toHaveBeenCalledWith(mockRun, "p1", "accepted", "Great idea");
    });

    it("returns 404 when run not found", async () => {
      mockLoadCopilotAgentRun.mockReturnValue(null);

      const res = await POST(
        makePost({
          action: "respond",
          runId: "missing-run",
          proposalId: "p1",
          response: "dismissed",
        })
      );

      expect(res.status).toBe(404);
    });
  });

  describe("GET", () => {
    it("lists all runs", async () => {
      mockListCopilotAgentRuns.mockReturnValue([{ runId: "r1" }, { runId: "r2" }]);

      const res = await GET(makeGet());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.runs).toHaveLength(2);
    });

    it("returns specific run by ID", async () => {
      mockLoadCopilotAgentRun.mockReturnValue({ runId: "r1", proposals: [] });

      const res = await GET(makeGet({ runId: "r1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.runId).toBe("r1");
    });

    it("returns 404 for non-existent run", async () => {
      mockLoadCopilotAgentRun.mockReturnValue(null);

      const res = await GET(makeGet({ runId: "missing" }));
      expect(res.status).toBe(404);
    });
  });

  describe("content-type validation", () => {
    it("returns 415 for non-JSON content type", async () => {
      const req = new Request("http://localhost/api/copilot-agent", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "hello",
      });
      const res = await POST(req);
      expect(res.status).toBe(415);
    });
  });
});
