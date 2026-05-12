import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@innovator/core", async () => {
  const { z: zod } = await import("zod");
  return {
    recordInnovationEvent: vi.fn(),
    getTeamMetrics: vi.fn(),
    getTeamLeaderboard: vi.fn(),
    getTeamEvents: vi.fn(),
    RecordEventSchema: zod.object({
      type: zod.enum([
        "session-start",
        "idea-generated",
        "idea-scored",
        "idea-implemented",
        "session-completed",
        "idea-exported",
      ]),
      userId: zod.string().min(1).max(100),
      teamId: zod.string().min(1).max(100),
      sessionId: zod.string().max(100).optional(),
      ideaId: zod.string().max(100).optional(),
      angleId: zod.string().max(100).optional(),
      qualityScore: zod.number().min(0).max(100).optional(),
      metadata: zod.record(zod.string().max(500)).optional(),
    }),
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/validate-request", () => ({
  validateJsonContentType: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

import { POST } from "../app/api/team-metrics/route.js";
import {
  recordInnovationEvent,
  getTeamMetrics,
  getTeamLeaderboard,
  getTeamEvents,
} from "@innovator/core";
import { validateJsonContentType } from "@/lib/validate-request";

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/team-metrics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API /api/team-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateJsonContentType).mockReturnValue(null);
  });

  describe("POST action=record", () => {
    it("records an innovation event", async () => {
      vi.mocked(recordInnovationEvent).mockReturnValue({ id: "ev1" } as never);

      const res = await POST(
        makePost({
          action: "record",
          type: "idea-generated",
          userId: "user-1",
          teamId: "team-1",
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.event).toBeDefined();
    });
  });

  describe("POST action=metrics", () => {
    it("returns team metrics", async () => {
      vi.mocked(getTeamMetrics).mockReturnValue({ ideas: 10 } as never);

      const res = await POST(
        makePost({ action: "metrics", teamId: "team-1", periodType: "weekly" })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.metrics).toBeDefined();
      expect(getTeamMetrics).toHaveBeenCalledWith("team-1", "weekly");
    });
  });

  describe("POST action=leaderboard", () => {
    it("returns team leaderboard", async () => {
      vi.mocked(getTeamLeaderboard).mockReturnValue([{ userId: "u1" }] as never);

      const res = await POST(makePost({ action: "leaderboard", teamId: "team-1" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.leaderboard).toBeDefined();
    });
  });

  describe("POST action=events", () => {
    it("returns team events with default limit", async () => {
      vi.mocked(getTeamEvents).mockReturnValue([{ id: "e1" }] as never);

      const res = await POST(makePost({ action: "events", teamId: "team-1" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.events).toBeDefined();
      expect(getTeamEvents).toHaveBeenCalledWith("team-1", 100);
    });

    it("respects limit bounds (1-500)", async () => {
      vi.mocked(getTeamEvents).mockReturnValue([] as never);

      const res = await POST(makePost({ action: "events", teamId: "team-1", limit: 250 }));
      expect(res.status).toBe(200);
      expect(getTeamEvents).toHaveBeenCalledWith("team-1", 250);
    });
  });

  describe("POST unknown action", () => {
    it("returns 400", async () => {
      const res = await POST(makePost({ action: "unknown", teamId: "team-1" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  describe("POST invalid JSON", () => {
    it("returns 400", async () => {
      const req = new Request("http://localhost/api/team-metrics", {
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

  describe("POST non-JSON content-type", () => {
    it("returns 415", async () => {
      vi.mocked(validateJsonContentType).mockReturnValue(
        new Response(JSON.stringify({ error: "Unsupported Media Type" }), { status: 415 })
      );

      const res = await POST(makePost({ action: "metrics", teamId: "team-1" }));
      expect(res.status).toBe(415);
    });
  });

  describe("POST internal error", () => {
    it("returns 500", async () => {
      vi.mocked(getTeamMetrics).mockImplementation(() => {
        throw new Error("DB crash");
      });

      const res = await POST(makePost({ action: "metrics", teamId: "team-1" }));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Internal server error");
    });
  });
});
