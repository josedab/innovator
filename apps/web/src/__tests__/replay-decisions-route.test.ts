import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  recordDecisionPoint: vi.fn(),
  getDecisionPoints: vi.fn(),
  branchFromDecision: vi.fn(),
  getSessionTree: vi.fn(),
  adoptBranch: vi.fn(),
  compareBranches: vi.fn(),
  branchComparisonToMarkdown: vi.fn(),
  buildTimelineView: vi.fn(),
  timelineViewToMarkdown: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST, GET } from "../app/api/replay-decisions/route.js";
import {
  recordDecisionPoint,
  getDecisionPoints,
  branchFromDecision,
  getSessionTree,
  adoptBranch,
  compareBranches,
  buildTimelineView,
  timelineViewToMarkdown,
} from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/replay-decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/replay-decisions");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe("API /api/replay-decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  // --- POST ---

  describe("POST action=record", () => {
    it("records a decision point and returns 201", async () => {
      const point = {
        stage: "investigation",
        type: "angle-selection",
        description: "Chose angle",
        chosenOption: "trend-collision",
        availableOptions: ["trend-collision", "constraints"],
      };
      vi.mocked(recordDecisionPoint).mockReturnValue({
        id: "dp1",
        runId: "run1",
        ...point,
      } as never);

      const res = await POST(makePost({ action: "record", runId: "run1", point }));
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe("dp1");
    });

    it("returns 400 when runId missing", async () => {
      const res = await POST(
        makePost({
          action: "record",
          point: {
            stage: "s",
            type: "t",
            description: "d",
            chosenOption: "o",
            availableOptions: ["o"],
          },
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when point missing", async () => {
      const res = await POST(makePost({ action: "record", runId: "run1" }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST action=branch", () => {
    it("branches from decision and returns 201", async () => {
      vi.mocked(branchFromDecision).mockResolvedValue({ id: "br1" } as never);

      const res = await POST(
        makePost({ action: "branch", decisionId: "dp1", alternativeOption: "constraints" })
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe("br1");
    });

    it("returns 400 when decisionId missing", async () => {
      const res = await POST(makePost({ action: "branch", alternativeOption: "constraints" }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST action=adopt", () => {
    it("adopts a branch", async () => {
      vi.mocked(adoptBranch).mockReturnValue(true as never);

      const res = await POST(makePost({ action: "adopt", branchId: "br1", runId: "run1" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.adopted).toBe(true);
    });

    it("returns 400 when branchId or runId missing", async () => {
      const res = await POST(makePost({ action: "adopt", branchId: "br1" }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST action=compare", () => {
    it("compares two branches", async () => {
      vi.mocked(compareBranches).mockResolvedValue({ diff: "some diff" } as never);

      const res = await POST(makePost({ action: "compare", branchIdA: "br1", branchIdB: "br2" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.diff).toBeDefined();
    });

    it("returns 400 when branchIdA or branchIdB missing", async () => {
      const res = await POST(makePost({ action: "compare", branchIdA: "br1" }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST invalid JSON", () => {
    it("returns 400", async () => {
      const req = new Request("http://localhost/api/replay-decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json{{{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid JSON");
    });
  });

  describe("POST internal error", () => {
    it("returns 500", async () => {
      vi.mocked(recordDecisionPoint).mockImplementation(() => {
        throw new Error("fail");
      });

      const res = await POST(
        makePost({
          action: "record",
          runId: "run1",
          point: {
            stage: "s",
            type: "t",
            description: "d",
            chosenOption: "o",
            availableOptions: ["o"],
          },
        })
      );
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Internal server error");
    });
  });

  // --- GET ---

  describe("GET with runId (default=decisions)", () => {
    it("returns decisions list", async () => {
      vi.mocked(getDecisionPoints).mockReturnValue([{ id: "dp1" }] as never);

      const res = await GET(makeGet({ runId: "run1" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.decisions).toBeDefined();
      expect(getDecisionPoints).toHaveBeenCalledWith("run1");
    });
  });

  describe("GET view=tree", () => {
    it("returns session tree", async () => {
      vi.mocked(getSessionTree).mockReturnValue({ root: "run1" } as never);

      const res = await GET(makeGet({ runId: "run1", view: "tree" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.root).toBeDefined();
    });
  });

  describe("GET view=timeline", () => {
    it("returns timeline JSON", async () => {
      vi.mocked(buildTimelineView).mockReturnValue({ events: [] } as never);

      const res = await GET(makeGet({ runId: "run1", view: "timeline" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.events).toBeDefined();
    });

    it("returns markdown when format=markdown", async () => {
      vi.mocked(buildTimelineView).mockReturnValue({ events: [] } as never);
      vi.mocked(timelineViewToMarkdown).mockReturnValue("# Timeline");

      const res = await GET(makeGet({ runId: "run1", view: "timeline", format: "markdown" }));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");
      const text = await res.text();
      expect(text).toBe("# Timeline");
    });
  });

  describe("GET missing runId", () => {
    it("returns 400", async () => {
      const res = await GET(makeGet());
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("runId");
    });
  });

  describe("GET internal error", () => {
    it("returns 500", async () => {
      vi.mocked(getDecisionPoints).mockImplementation(() => {
        throw new Error("fail");
      });

      const res = await GET(makeGet({ runId: "run1" }));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Internal server error");
    });
  });
});
