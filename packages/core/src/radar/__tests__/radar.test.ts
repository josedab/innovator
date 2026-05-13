import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createWatch,
  getWatch,
  deleteWatch,
  getDueWatches,
  diffInvestigations,
  runRadarScan,
  buildAlerts,
  deliverWebhookAlert,
  listWatches,
} from "../index.js";
import type { Investigation } from "../../types.js";
import type { RadarScanResult, WatchSubject, RadarAlert } from "../index.js";

// Mock fs operations to avoid touching the real filesystem
vi.mock("node:fs", () => {
  const store = new Map<string, string>();
  return {
    existsSync: vi.fn((path: string) => store.has(path) || path.includes("radar")),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((path: string) => {
      const data = store.get(path);
      if (!data) throw new Error(`ENOENT: ${path}`);
      return data;
    }),
    writeFileSync: vi.fn((path: string, content: string) => {
      store.set(path, content);
    }),
    readdirSync: vi.fn(() => []),
    unlinkSync: vi.fn((path: string) => {
      store.delete(path);
    }),
    __store: store,
  };
});

function makeInvestigation(overrides: Partial<Investigation> = {}): Investigation {
  return {
    summary: "Test investigation",
    keyAspects: [{ title: "Aspect 1", description: "Desc 1" }],
    currentState: "Current state of affairs",
    challenges: ["Challenge A"],
    opportunities: ["Opportunity A"],
    ...overrides,
  };
}

describe("radar", () => {
  // ---- diffInvestigations ----

  describe("diffInvestigations", () => {
    it("reports all items as new for first scan (no previous)", () => {
      const current = makeInvestigation({
        opportunities: ["Opp A", "Opp B"],
        challenges: ["Ch A"],
      });
      const changes = diffInvestigations(undefined, current);
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.filter((c) => c.type === "new_opportunity")).toHaveLength(2);
      expect(changes.filter((c) => c.type === "new_challenge")).toHaveLength(1);
    });

    it("detects new opportunities", () => {
      const prev = makeInvestigation({ opportunities: ["Opp A"] });
      const curr = makeInvestigation({ opportunities: ["Opp A", "Opp B"] });
      const changes = diffInvestigations(prev, curr);
      const newOpps = changes.filter((c) => c.type === "new_opportunity");
      expect(newOpps).toHaveLength(1);
      expect(newOpps[0].title).toBe("Opp B");
    });

    it("detects removed opportunities", () => {
      const prev = makeInvestigation({ opportunities: ["Opp A", "Opp B"] });
      const curr = makeInvestigation({ opportunities: ["Opp A"] });
      const changes = diffInvestigations(prev, curr);
      const removed = changes.filter((c) => c.type === "removed");
      expect(removed).toHaveLength(1);
      expect(removed[0].title).toBe("Opp B");
    });

    it("detects new challenges", () => {
      const prev = makeInvestigation({ challenges: ["Ch A"] });
      const curr = makeInvestigation({ challenges: ["Ch A", "Ch B"] });
      const changes = diffInvestigations(prev, curr);
      expect(changes.filter((c) => c.type === "new_challenge")).toHaveLength(1);
    });

    it("detects new key aspects", () => {
      const prev = makeInvestigation({ keyAspects: [{ title: "A", description: "a" }] });
      const curr = makeInvestigation({
        keyAspects: [
          { title: "A", description: "a" },
          { title: "B", description: "b" },
        ],
      });
      const changes = diffInvestigations(prev, curr);
      expect(changes.filter((c) => c.type === "new_aspect")).toHaveLength(1);
    });

    it("returns empty for identical investigations", () => {
      const inv = makeInvestigation();
      const changes = diffInvestigations(inv, inv);
      expect(changes).toHaveLength(0);
    });
  });

  // ---- buildAlerts ----

  describe("buildAlerts", () => {
    it("builds alerts for each channel when triggered", () => {
      const watch: WatchSubject = {
        id: "w1",
        subject: "AI",
        frequency: "daily",
        alertChannels: ["email", "webhook"],
        alertThreshold: 0.3,
        enabled: true,
        createdAt: new Date().toISOString(),
        nextRunAt: new Date().toISOString(),
      };
      const scan: RadarScanResult = {
        id: "s1",
        watchId: "w1",
        subject: "AI",
        scannedAt: new Date().toISOString(),
        investigation: makeInvestigation(),
        changes: [
          {
            type: "new_opportunity",
            category: "opportunity",
            title: "New opp",
            description: "desc",
            significance: "high",
          },
        ],
        significanceScore: 0.7,
        alertTriggered: true,
      };
      const alerts = buildAlerts(watch, scan);
      expect(alerts).toHaveLength(2);
      expect(alerts[0].channel).toBe("email");
      expect(alerts[1].channel).toBe("webhook");
    });

    it("returns empty when alert not triggered", () => {
      const watch: WatchSubject = {
        id: "w1",
        subject: "AI",
        frequency: "daily",
        alertChannels: ["webhook"],
        alertThreshold: 0.3,
        enabled: true,
        createdAt: new Date().toISOString(),
        nextRunAt: new Date().toISOString(),
      };
      const scan: RadarScanResult = {
        id: "s1",
        watchId: "w1",
        subject: "AI",
        scannedAt: new Date().toISOString(),
        investigation: makeInvestigation(),
        changes: [],
        significanceScore: 0,
        alertTriggered: false,
      };
      expect(buildAlerts(watch, scan)).toHaveLength(0);
    });
  });

  // ---- deliverWebhookAlert ----

  describe("deliverWebhookAlert", () => {
    it("returns true on successful delivery", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const alert: RadarAlert = {
        watchId: "w1",
        subject: "AI",
        changes: [],
        significanceScore: 0.5,
        scannedAt: new Date().toISOString(),
        channel: "webhook",
      };
      const result = await deliverWebhookAlert(alert, "https://hooks.example.com/test");
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();

      vi.unstubAllGlobals();
    });

    it("returns false on failed delivery", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false });
      vi.stubGlobal("fetch", mockFetch);

      const alert: RadarAlert = {
        watchId: "w1",
        subject: "AI",
        changes: [],
        significanceScore: 0.5,
        scannedAt: new Date().toISOString(),
        channel: "webhook",
      };
      const result = await deliverWebhookAlert(alert, "https://hooks.example.com/fail");
      expect(result).toBe(false);

      vi.unstubAllGlobals();
    });

    it("returns false on network error", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      const alert: RadarAlert = {
        watchId: "w1",
        subject: "AI",
        changes: [],
        significanceScore: 0.5,
        scannedAt: new Date().toISOString(),
        channel: "webhook",
      };
      const result = await deliverWebhookAlert(alert, "https://hooks.example.com/err");
      expect(result).toBe(false);

      vi.unstubAllGlobals();
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("empty investigation diff with no previous returns new items", () => {
      const current = makeInvestigation({
        opportunities: [],
        challenges: [],
        keyAspects: [],
      });
      const changes = diffInvestigations(undefined, current);
      expect(changes).toHaveLength(0);
    });

    it("significance scoring: all high = high score", () => {
      const prev = makeInvestigation({ opportunities: [], challenges: [] });
      const curr = makeInvestigation({
        opportunities: ["Big Opp"],
        challenges: ["Big Ch"],
      });
      const changes = diffInvestigations(prev, curr);
      expect(changes.length).toBeGreaterThan(0);
      // All new items in a diff with previous are "high" significance
      expect(changes.every((c) => c.significance === "high")).toBe(true);
    });

    it("case-insensitive comparison for opportunities", () => {
      const prev = makeInvestigation({ opportunities: ["Solar Power"] });
      const curr = makeInvestigation({ opportunities: ["solar power"] });
      const changes = diffInvestigations(prev, curr);
      const newOpps = changes.filter((c) => c.type === "new_opportunity");
      expect(newOpps).toHaveLength(0);
    });

    it("case-insensitive comparison for challenges", () => {
      const prev = makeInvestigation({ challenges: ["Scale Issues"] });
      const curr = makeInvestigation({ challenges: ["scale issues"] });
      const changes = diffInvestigations(prev, curr);
      const newChallenges = changes.filter((c) => c.type === "new_challenge");
      expect(newChallenges).toHaveLength(0);
    });

    it("diffInvestigations detects modified items via new aspects", () => {
      const prev = makeInvestigation({
        keyAspects: [{ title: "Energy", description: "Traditional energy" }],
      });
      const curr = makeInvestigation({
        keyAspects: [
          { title: "Energy", description: "Traditional energy" },
          { title: "AI Integration", description: "New AI capabilities" },
        ],
      });
      const changes = diffInvestigations(prev, curr);
      expect(changes.filter((c) => c.type === "new_aspect")).toHaveLength(1);
    });
  });

  // ---- runRadarScan ----

  describe("runRadarScan", () => {
    it("runs scan and returns result with changes", async () => {
      const fs = await import("node:fs");
      const watch: WatchSubject = {
        id: "scan-test",
        subject: "AI",
        frequency: "daily",
        alertChannels: ["webhook"],
        alertThreshold: 0.3,
        enabled: true,
        createdAt: new Date().toISOString(),
        nextRunAt: new Date().toISOString(),
      };

      const investigateFn = vi
        .fn()
        .mockResolvedValue(makeInvestigation({ opportunities: ["New AI Opp"] }));

      const result = await runRadarScan(watch, investigateFn);
      expect(result.watchId).toBe("scan-test");
      expect(result.investigation).toBeDefined();
      expect(result.changes.length).toBeGreaterThan(0);
      expect(investigateFn).toHaveBeenCalledWith("AI");
    });

    it("computes significance and triggers alert when above threshold", async () => {
      const watch: WatchSubject = {
        id: "alert-test",
        subject: "AI",
        frequency: "daily",
        alertChannels: ["webhook"],
        alertThreshold: 0.1, // low threshold
        enabled: true,
        createdAt: new Date().toISOString(),
        nextRunAt: new Date().toISOString(),
      };

      const investigateFn = vi.fn().mockResolvedValue(
        makeInvestigation({
          opportunities: ["Big Opp"],
          challenges: ["Big Challenge"],
        })
      );

      const result = await runRadarScan(watch, investigateFn);
      expect(result.significanceScore).toBeGreaterThan(0);
      expect(result.alertTriggered).toBe(true);
    });
  });

  // ---- getDueWatches ----

  describe("getDueWatches", () => {
    it("returns empty when no watches exist", () => {
      const due = getDueWatches();
      expect(due).toHaveLength(0);
    });
  });
});
