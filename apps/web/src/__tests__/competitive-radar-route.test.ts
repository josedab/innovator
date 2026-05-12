import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => ({
  addCompetitor: vi.fn(),
  listCompetitors: vi.fn(),
  getCompetitor: vi.fn(),
  runGapAnalysis: vi.fn(),
  runMultiCompetitorGapAnalysis: vi.fn(),
  gapReportToMarkdown: vi.fn(),
  generateRadarDashboard: vi.fn(),
  radarDashboardToMarkdown: vi.fn(),
  checkForAlerts: vi.fn(),
  getCompetitiveContext: vi.fn(),
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

import { POST, GET } from "../app/api/competitive-radar/route.js";
import {
  addCompetitor,
  listCompetitors,
  runGapAnalysis,
  runMultiCompetitorGapAnalysis,
  gapReportToMarkdown,
  generateRadarDashboard,
  checkForAlerts,
  getCompetitiveContext,
} from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

const sampleCompetitor = {
  id: "comp-1",
  name: "Competitor A",
  description: "A competitor",
  capabilities: ["feature-x"],
  strengths: ["fast"],
  weaknesses: ["expensive"],
};

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/competitive-radar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/competitive-radar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  // --- POST ---

  describe("POST add-competitor", () => {
    it("returns 201", async () => {
      vi.mocked(addCompetitor).mockReturnValue({ id: "comp-1" } as never);

      const res = await POST(makePost({ action: "add-competitor", competitor: sampleCompetitor }));
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe("comp-1");
    });

    it("returns 400 when competitor missing", async () => {
      const res = await POST(makePost({ action: "add-competitor" }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST gap-analysis", () => {
    it("returns gap analysis JSON", async () => {
      vi.mocked(runGapAnalysis).mockResolvedValue({ gaps: [] } as never);

      const res = await POST(
        makePost({
          action: "gap-analysis",
          competitorId: "comp-1",
          ourCapabilities: ["feature-y"],
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gaps).toBeDefined();
    });

    it("returns markdown when format=markdown", async () => {
      vi.mocked(runGapAnalysis).mockResolvedValue({ gaps: [] } as never);
      vi.mocked(gapReportToMarkdown).mockReturnValue("# Gap Report");

      const res = await POST(
        makePost({
          action: "gap-analysis",
          competitorId: "comp-1",
          ourCapabilities: ["feature-y"],
          format: "markdown",
        })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");
    });

    it("returns 400 when competitorId or ourCapabilities missing", async () => {
      const res = await POST(makePost({ action: "gap-analysis", competitorId: "comp-1" }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST multi-gap", () => {
    it("returns multi-competitor gap reports", async () => {
      vi.mocked(runMultiCompetitorGapAnalysis).mockResolvedValue([{ gaps: [] }] as never);

      const res = await POST(
        makePost({
          action: "multi-gap",
          competitorIds: ["comp-1", "comp-2"],
          ourCapabilities: ["feature-y"],
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reports).toBeDefined();
    });

    it("returns 400 when competitorIds or ourCapabilities missing", async () => {
      const res = await POST(makePost({ action: "multi-gap", competitorIds: ["comp-1"] }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST radar", () => {
    it("returns dashboard JSON", async () => {
      vi.mocked(generateRadarDashboard).mockResolvedValue({ quadrants: [] } as never);

      const res = await POST(makePost({ action: "radar" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.quadrants).toBeDefined();
    });
  });

  describe("POST alerts", () => {
    it("returns alerts array", async () => {
      vi.mocked(checkForAlerts).mockResolvedValue([{ message: "Alert!" }] as never);

      const res = await POST(makePost({ action: "alerts" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.alerts).toBeDefined();
    });
  });

  describe("POST context", () => {
    it("returns competitive context", async () => {
      vi.mocked(getCompetitiveContext).mockResolvedValue({ landscape: "info" } as never);

      const res = await POST(makePost({ action: "context", subject: "AI tools" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.context).toBeDefined();
    });

    it("returns 400 when subject missing", async () => {
      const res = await POST(makePost({ action: "context" }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST missing required params", () => {
    it("returns 400 for invalid action enum", async () => {
      const res = await POST(makePost({ action: "invalid-action" }));
      expect(res.status).toBe(400);
    });
  });

  describe("POST invalid JSON", () => {
    it("returns 400", async () => {
      const req = new Request("http://localhost/api/competitive-radar", {
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
      vi.mocked(addCompetitor).mockImplementation(() => {
        throw new Error("fail");
      });

      const res = await POST(makePost({ action: "add-competitor", competitor: sampleCompetitor }));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Internal server error");
    });
  });

  // --- GET ---

  describe("GET competitors list", () => {
    it("returns competitors", async () => {
      vi.mocked(listCompetitors).mockReturnValue([{ id: "comp-1", name: "A" }] as never);

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.competitors).toHaveLength(1);
    });
  });

  describe("GET internal error", () => {
    it("returns 500", async () => {
      vi.mocked(listCompetitors).mockImplementation(() => {
        throw new Error("fail");
      });

      const res = await GET();
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Internal server error");
    });
  });
});
