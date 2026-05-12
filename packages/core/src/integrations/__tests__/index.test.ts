import { describe, it, expect, beforeEach } from "vitest";
import {
  registerIntegration,
  getIntegration,
  listIntegrations,
  removeIntegration,
  formatJiraIssue,
  formatLinearIssue,
  formatNotionPage,
  clearIntegrations,
  type IdeaExportPayload,
} from "../index.js";

describe("integrations", () => {
  beforeEach(() => {
    clearIntegrations();
  });

  const sampleIdea: IdeaExportPayload = {
    title: "AI-Powered Code Review",
    description: "Use LLMs to automatically review code for security issues",
    potentialImpact: "Reduce security vulnerabilities by 60%",
    implementationHint: "Start with a VS Code extension",
    sourceAngle: "first-principles",
    priority: "high",
  };

  describe("integration registry", () => {
    it("should register an integration", () => {
      const config = registerIntegration({
        id: "jira-1",
        type: "jira",
        name: "My Jira",
        status: "connected",
        apiUrl: "https://myorg.atlassian.net",
      });

      expect(config.id).toBe("jira-1");
      expect(config.type).toBe("jira");
      expect(config.createdAt).toBeTruthy();
    });

    it("should get integration by ID", () => {
      registerIntegration({ id: "j1", type: "jira", name: "J1", status: "connected" });
      expect(getIntegration("j1")).toBeTruthy();
      expect(getIntegration("nonexistent")).toBeUndefined();
    });

    it("should list all integrations", () => {
      registerIntegration({ id: "j1", type: "jira", name: "J1", status: "connected" });
      registerIntegration({ id: "l1", type: "linear", name: "L1", status: "connected" });
      expect(listIntegrations()).toHaveLength(2);
    });

    it("should remove an integration", () => {
      registerIntegration({ id: "j1", type: "jira", name: "J1", status: "connected" });
      expect(removeIntegration("j1")).toBe(true);
      expect(listIntegrations()).toHaveLength(0);
    });

    it("should return false when removing nonexistent integration", () => {
      expect(removeIntegration("nonexistent")).toBe(false);
    });
  });

  describe("formatJiraIssue", () => {
    it("should produce valid Jira ADF payload", () => {
      const payload = formatJiraIssue(sampleIdea, { projectKey: "INNOV" });
      const fields = payload.fields as Record<string, unknown>;

      expect(fields.project).toEqual({ key: "INNOV" });
      expect(fields.summary).toContain("AI-Powered Code Review");
      expect(fields.issuetype).toEqual({ name: "Task" });
      expect((fields.labels as string[]).includes("innovator")).toBe(true);
      expect((fields.labels as string[]).includes("first-principles")).toBe(true);
    });

    it("should apply custom issue type and epic", () => {
      const payload = formatJiraIssue(sampleIdea, {
        projectKey: "DEV",
        issueType: "Story",
        epicKey: "DEV-100",
      });
      const fields = payload.fields as Record<string, unknown>;

      expect(fields.issuetype).toEqual({ name: "Story" });
      expect(fields.parent).toEqual({ key: "DEV-100" });
    });

    it("should map priority correctly", () => {
      const payload = formatJiraIssue(
        { ...sampleIdea, priority: "critical" },
        { projectKey: "X" }
      );
      const fields = payload.fields as Record<string, unknown>;
      expect(fields.priority).toEqual({ name: "Highest" });
    });
  });

  describe("formatLinearIssue", () => {
    it("should produce valid Linear mutation input", () => {
      const payload = formatLinearIssue(sampleIdea, { teamId: "team-1" });

      expect(payload.teamId).toBe("team-1");
      expect(payload.title).toContain("AI-Powered Code Review");
      expect(typeof payload.description).toBe("string");
      expect((payload.description as string)).toContain("Potential Impact");
    });

    it("should map priority to Linear scale", () => {
      const payload = formatLinearIssue(
        { ...sampleIdea, priority: "critical" },
        { teamId: "t1" }
      );
      expect(payload.priority).toBe(1);
    });
  });

  describe("formatNotionPage", () => {
    it("should produce valid Notion API payload", () => {
      const payload = formatNotionPage(sampleIdea, { databaseId: "db-123" });

      expect(payload.parent).toEqual({ database_id: "db-123" });
      expect(payload.properties).toBeTruthy();
      const props = payload.properties as Record<string, unknown>;
      expect(props.Name).toBeTruthy();
      expect(Array.isArray(payload.children)).toBe(true);
      expect((payload.children as unknown[]).length).toBeGreaterThan(0);
    });

    it("should include source angle as select property", () => {
      const payload = formatNotionPage(sampleIdea, { databaseId: "db-1" });
      const props = payload.properties as Record<string, unknown>;
      expect(props["Source Angle"]).toBeTruthy();
    });
  });

  describe("exportToJira/Linear/Notion", () => {
    it("should return error when integration not configured", async () => {
      const { exportToJira } = await import("../index.js");
      const result = await exportToJira(sampleIdea, { projectKey: "X" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
    });

    it("should return error when Linear integration not configured", async () => {
      const { exportToLinear } = await import("../index.js");
      const result = await exportToLinear(sampleIdea, { teamId: "t1" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
    });

    it("should return error when Notion integration not configured", async () => {
      const { exportToNotion } = await import("../index.js");
      const result = await exportToNotion(sampleIdea, { databaseId: "db" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
    });
  });
});
