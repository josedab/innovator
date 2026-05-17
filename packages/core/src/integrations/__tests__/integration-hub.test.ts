import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeBacklog,
  backlogToInnovationSubjects,
  clearImportedBacklog,
  clearIntegrations,
  clearSyncData,
  createSyncRecord,
  exportToGitHub,
  formatGitHubIssue,
  getImportedBacklog,
  getSyncEvents,
  getSyncRecord,
  getSyncRecordByExternalId,
  importBacklog,
  listSyncRecords,
  recordSyncEvent,
  registerIntegration,
  updateSyncStatus,
  type IdeaExportPayload,
} from "../index.js";

describe("integration hub", () => {
  const sampleIdea: IdeaExportPayload = {
    title: "AI-Powered Code Review",
    description: "Use LLMs to automatically review code for security issues",
    potentialImpact: "Reduce security vulnerabilities by 60%",
    implementationHint: "Start with a VS Code extension",
    sourceAngle: "first-principles",
    labels: ["security"],
    priority: "high",
  };

  beforeEach(() => {
    clearIntegrations();
    clearImportedBacklog();
    clearSyncData();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    clearIntegrations();
    clearImportedBacklog();
    clearSyncData();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("GitHub Issues integration", () => {
    it("should format a GitHub issue payload", () => {
      const payload = formatGitHubIssue(sampleIdea, {
        owner: "acme",
        repo: "innovator",
        labels: ["roadmap"],
        assignees: ["octocat"],
        milestone: 7,
      });

      expect(payload.title).toContain("AI-Powered Code Review");
      expect(payload.body).toContain("Potential Impact");
      expect(payload.body).toContain("Implementation");
      expect(payload.labels).toEqual(
        expect.arrayContaining(["innovator", "first-principles", "security", "roadmap"])
      );
      expect(payload.assignees).toEqual(["octocat"]);
      expect(payload.milestone).toBe(7);
    });

    it("should export an issue through the GitHub API", async () => {
      registerIntegration({
        id: "github-1",
        type: "github",
        name: "GitHub",
        status: "connected",
        apiToken: "ghp_test",
        apiUrl: "https://api.github.com",
      });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            number: 42,
            html_url: "https://github.com/acme/innovator/issues/42",
            node_id: "I_kwDOExample",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: { addProjectV2ItemById: { item: { id: "PVTI_123" } } },
          }),
        });

      vi.stubGlobal("fetch", fetchMock);

      const result = await exportToGitHub(sampleIdea, {
        owner: "acme",
        repo: "innovator",
        labels: ["roadmap"],
        projectId: "PVT_kwDOProject",
      });

      expect(result).toEqual({
        success: true,
        externalId: "42",
        externalUrl: "https://github.com/acme/innovator/issues/42",
        integration: "github",
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "https://api.github.com/repos/acme/innovator/issues"
      );
      expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
        title: expect.stringContaining("AI-Powered Code Review"),
        labels: expect.arrayContaining(["innovator", "roadmap"]),
      });
      expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.github.com/graphql");
    });
  });

  describe("backlog import", () => {
    it("should import backlog items and analyze recurring themes", () => {
      const imported = importBacklog([
        {
          title: "Improve API latency",
          description: "Reduce p95 latency for search endpoints.",
          status: "In Progress",
          priority: "High",
          labels: ["performance", "api"],
          source: "jira",
        },
        {
          title: "Optimize cache invalidation",
          description: "Stabilize cache eviction strategy.",
          status: "Todo",
          priority: "Critical",
          labels: ["performance", "cache"],
          source: "linear",
        },
        {
          title: "Document incident learnings",
          description: "Capture performance incident remediation steps.",
          status: "Done",
          labels: ["documentation"],
          source: "notion",
        },
      ]);

      expect(imported).toHaveLength(3);
      expect(getImportedBacklog()).toHaveLength(3);
      expect(getImportedBacklog("jira")).toHaveLength(1);

      const analysis = analyzeBacklog(imported);
      expect(analysis.totalItems).toBe(3);
      expect(analysis.byPriority.high).toBe(1);
      expect(analysis.byPriority.critical).toBe(1);
      expect(analysis.byStatus["in progress"]).toBe(1);
      expect(analysis.suggestedSubjects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: expect.stringContaining("Performance"),
            sourceItems: expect.arrayContaining([imported[0]?.externalId, imported[1]?.externalId]),
          }),
        ])
      );

      const subjects = backlogToInnovationSubjects(imported);
      expect(subjects[0]).toEqual(
        expect.objectContaining({
          title: imported[0]?.title,
          sourceItems: [imported[0]?.externalId],
        })
      );
      expect(subjects[0]?.rationale).toContain("jira");
    });
  });

  describe("sync tracker", () => {
    it("should create, query, and update sync records", () => {
      const record = createSyncRecord({
        ideaId: "idea-123",
        integration: "github",
        externalId: "42",
        externalUrl: "https://github.com/acme/innovator/issues/42",
        direction: "bidirectional",
        localStatus: "proposed",
        externalStatus: "open",
        metadata: { owner: "acme", repo: "innovator" },
      });

      expect(getSyncRecord(record.id)).toEqual(record);
      expect(getSyncRecordByExternalId("github", "42")).toEqual(record);
      expect(listSyncRecords("idea-123")).toEqual([record]);

      const updated = updateSyncStatus(record.id, "closed");
      expect(updated?.externalStatus).toBe("closed");

      const reopenedEvent = recordSyncEvent(record.id, "reopened", "closed", "open");
      expect(reopenedEvent.eventType).toBe("reopened");

      const events = getSyncEvents(record.id);
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual(
        expect.objectContaining({
          eventType: "status-changed",
          oldValue: "open",
          newValue: "closed",
        })
      );
      expect(events[1]).toEqual(
        expect.objectContaining({
          eventType: "reopened",
          oldValue: "closed",
          newValue: "open",
        })
      );
    });
  });
});
