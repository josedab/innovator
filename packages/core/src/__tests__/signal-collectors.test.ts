import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

import {
  detectPatternsHeuristic,
  formatNotifications,
  getStoredTriggers,
  dismissTrigger,
  markTriggerActedOn,
  getPendingTriggers,
  clearTriggerState,
  type Signal,
  type NotificationConfig,
} from "../triggers/signal-collectors.js";

describe("triggers/signal-collectors", () => {
  beforeEach(() => {
    clearTriggerState();
  });

  describe("detectPatternsHeuristic", () => {
    it("detects stale epics", () => {
      const staleDate = new Date(Date.now() - 60 * 86400_000).toISOString();
      const signals: Signal[] = [
        {
          id: "sig-1",
          source: "github-issues",
          title: "Revamp onboarding flow",
          body: "Epic for onboarding improvements",
          timestamp: staleDate,
          metadata: { type: "epic" },
        },
      ];
      const triggers = detectPatternsHeuristic(signals, { staleEpicDays: 30 });
      expect(triggers.length).toBeGreaterThanOrEqual(1);
      expect(triggers[0].pattern).toBe("stale-epic");
      expect(triggers[0].priority).toBeDefined();
    });

    it("detects complaint clusters", () => {
      const signals: Signal[] = [
        {
          id: "s1",
          source: "github-issues",
          title: "Bug: login broken",
          body: "Login doesn't work error 500",
          timestamp: new Date().toISOString(),
        },
        {
          id: "s2",
          source: "github-issues",
          title: "Error on login page",
          body: "Getting crash error when logging in",
          timestamp: new Date().toISOString(),
        },
        {
          id: "s3",
          source: "slack-messages",
          title: "Login issue",
          body: "Users reporting broken login again",
          timestamp: new Date().toISOString(),
        },
      ];
      const triggers = detectPatternsHeuristic(signals, { complaintClusterSize: 3 });
      const complaints = triggers.filter((t) => t.pattern === "customer-complaint-cluster");
      expect(complaints.length).toBeGreaterThanOrEqual(1);
      expect(complaints[0].priority).toBe("high");
    });

    it("detects strategic planning meetings", () => {
      const signals: Signal[] = [
        {
          id: "cal-1",
          source: "calendar-meetings",
          title: "Q3 Strategy Planning Session",
          body: "Quarterly roadmap and OKR review",
          timestamp: new Date().toISOString(),
        },
      ];
      const triggers = detectPatternsHeuristic(signals);
      const planning = triggers.filter((t) => t.pattern === "strategic-planning-meeting");
      expect(planning.length).toBeGreaterThanOrEqual(1);
    });

    it("ignores non-matching signals", () => {
      const signals: Signal[] = [
        {
          id: "normal-1",
          source: "github-issues",
          title: "Add feature X",
          body: "Would be nice to have feature X",
          timestamp: new Date().toISOString(),
          metadata: { type: "feature" },
        },
      ];
      const triggers = detectPatternsHeuristic(signals);
      expect(triggers).toHaveLength(0);
    });
  });

  describe("trigger management", () => {
    it("stores and retrieves triggers", () => {
      const signals: Signal[] = [
        {
          id: "cal-2",
          source: "calendar-meetings",
          title: "Annual strategy planning",
          body: "Company-wide vision and roadmap session",
          timestamp: new Date().toISOString(),
        },
      ];
      detectPatternsHeuristic(signals);
      expect(getStoredTriggers().length).toBeGreaterThan(0);
    });

    it("dismisses trigger", () => {
      const signals: Signal[] = [
        {
          id: "cal-3",
          source: "calendar-meetings",
          title: "Strategy planning meeting",
          body: "Quarterly OKR review",
          timestamp: new Date().toISOString(),
        },
      ];
      detectPatternsHeuristic(signals);
      const triggers = getStoredTriggers();
      expect(dismissTrigger(triggers[0].id)).toBe(true);
      expect(getPendingTriggers().length).toBe(0);
    });

    it("marks trigger as acted on", () => {
      const signals: Signal[] = [
        {
          id: "cal-4",
          source: "calendar-meetings",
          title: "Planning strategy session",
          body: "Vision alignment",
          timestamp: new Date().toISOString(),
        },
      ];
      detectPatternsHeuristic(signals);
      const triggers = getStoredTriggers();
      markTriggerActedOn(triggers[0].id);
      expect(getPendingTriggers().length).toBe(0);
    });
  });

  describe("formatNotifications", () => {
    it("formats realtime notifications", () => {
      const signals: Signal[] = [
        {
          id: "cal-5",
          source: "calendar-meetings",
          title: "Strategic planning roadmap",
          body: "Quarterly review OKR",
          timestamp: new Date().toISOString(),
        },
      ];
      detectPatternsHeuristic(signals);
      const triggers = getStoredTriggers();
      const config: NotificationConfig = {
        channels: ["slack-dm"],
        digestFrequency: "realtime",
        minPriority: "low",
      };
      const notifications = formatNotifications(triggers, config);
      expect(notifications.length).toBeGreaterThanOrEqual(1);
      expect(notifications[0].channel).toBe("slack-dm");
      expect(notifications[0].title).toContain("Innovation Opportunity");
    });

    it("formats digest notifications", () => {
      const signals: Signal[] = [
        {
          id: "cal-6",
          source: "calendar-meetings",
          title: "OKR planning strategy",
          body: "Vision quarterly",
          timestamp: new Date().toISOString(),
        },
        {
          id: "cal-7",
          source: "calendar-meetings",
          title: "Roadmap strategy planning",
          body: "Annual direction",
          timestamp: new Date().toISOString(),
        },
      ];
      detectPatternsHeuristic(signals);
      const triggers = getStoredTriggers();
      const config: NotificationConfig = {
        channels: ["email-digest"],
        digestFrequency: "daily",
        minPriority: "low",
      };
      const notifications = formatNotifications(triggers, config);
      expect(notifications).toHaveLength(1); // One digest
      expect(notifications[0].title).toContain("Digest");
    });

    it("filters by priority", () => {
      const signals: Signal[] = [
        {
          id: "cal-8",
          source: "calendar-meetings",
          title: "Strategy planning quarterly",
          body: "OKR roadmap",
          timestamp: new Date().toISOString(),
        },
      ];
      detectPatternsHeuristic(signals);
      const triggers = getStoredTriggers();
      const config: NotificationConfig = {
        channels: ["slack-dm"],
        digestFrequency: "realtime",
        minPriority: "urgent",
      };
      const notifications = formatNotifications(triggers, config);
      // Medium-priority triggers filtered out when minPriority is urgent
      expect(notifications).toHaveLength(0);
    });
  });
});
