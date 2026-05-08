import { describe, it, expect } from "vitest";
import {
  buildSidebarTree,
  analyzeCodeContext,
  getCopilotParticipantConfig,
  getExtensionContributions,
} from "../extension/vscode.js";

describe("VS Code Extension Helpers", () => {
  describe("buildSidebarTree", () => {
    it("builds tree with quick actions", () => {
      const tree = buildSidebarTree();
      const quickActions = tree.find((item) => item.id === "quick-actions");
      expect(quickActions).toBeDefined();
      expect(quickActions!.children!.length).toBeGreaterThan(0);
    });

    it("includes recent sessions when provided", () => {
      const tree = buildSidebarTree([{ subject: "AI testing", ideasCount: 5, date: "2024-01-01" }]);
      const recent = tree.find((item) => item.id === "recent-sessions");
      expect(recent).toBeDefined();
      expect(recent!.children).toHaveLength(1);
    });

    it("includes templates when provided", () => {
      const tree = buildSidebarTree(undefined, [{ id: "t1", name: "Template 1" }]);
      const templates = tree.find((item) => item.id === "templates");
      expect(templates).toBeDefined();
    });

    it("includes insights when provided", () => {
      const tree = buildSidebarTree(undefined, undefined, [
        { title: "Insight", description: "Test insight" },
      ]);
      const insights = tree.find((item) => item.id === "insights");
      expect(insights).toBeDefined();
    });

    it("omits sections with empty data", () => {
      const tree = buildSidebarTree([], [], []);
      const recent = tree.find((item) => item.id === "recent-sessions");
      expect(recent).toBeUndefined();
    });

    it("truncates long subject lines", () => {
      const longSubject = "A".repeat(50);
      const tree = buildSidebarTree([{ subject: longSubject, ideasCount: 1, date: "2024-01-01" }]);
      const recent = tree.find((item) => item.id === "recent-sessions");
      const label = recent!.children![0].label;
      expect(label.length).toBeLessThanOrEqual(41); // 40 + "…"
    });
  });

  describe("analyzeCodeContext", () => {
    it("suggests feature brainstorming for any code", () => {
      const suggestions = analyzeCodeContext({
        filePath: "src/utils.ts",
        language: "typescript",
        selectedText: "function add(a, b) { return a + b; }",
        startLine: 1,
        endLine: 1,
      });
      expect(suggestions.some((s) => s.category === "feature")).toBe(true);
    });

    it("detects TODO/FIXME patterns", () => {
      const suggestions = analyzeCodeContext({
        filePath: "src/api.ts",
        language: "typescript",
        selectedText: "// TODO: fix this hack\nconst value = 42;",
        startLine: 1,
        endLine: 2,
      });
      expect(suggestions.some((s) => s.id === "improve-todo")).toBe(true);
    });

    it("detects large code blocks", () => {
      const longCode = Array(60).fill("const x = 1;").join("\n");
      const suggestions = analyzeCodeContext({
        filePath: "src/big.ts",
        language: "typescript",
        selectedText: longCode,
        startLine: 1,
        endLine: 60,
      });
      expect(suggestions.some((s) => s.id === "decompose-large-block")).toBe(true);
    });

    it("detects class/interface patterns", () => {
      const suggestions = analyzeCodeContext({
        filePath: "src/models.ts",
        language: "typescript",
        selectedText: "class UserService { constructor() {} }",
        startLine: 1,
        endLine: 1,
      });
      expect(suggestions.some((s) => s.id === "architecture-alternatives")).toBe(true);
    });

    it("detects test patterns", () => {
      const suggestions = analyzeCodeContext({
        filePath: "src/__tests__/test.ts",
        language: "typescript",
        selectedText: "describe('tests', () => { it('works', () => {}) })",
        startLine: 1,
        endLine: 1,
      });
      expect(suggestions.some((s) => s.id === "test-innovation")).toBe(true);
    });

    it("includes related angles in suggestions", () => {
      const suggestions = analyzeCodeContext({
        filePath: "src/app.ts",
        language: "typescript",
        selectedText: "const x = 1;",
        startLine: 1,
        endLine: 1,
      });
      for (const suggestion of suggestions) {
        expect(suggestion.relatedAngles.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getCopilotParticipantConfig", () => {
    it("returns valid participant configuration", () => {
      const config = getCopilotParticipantConfig();
      expect(config.id).toBe("innovator");
      expect(config.name).toBe("Innovator");
      expect(config.commands.length).toBeGreaterThan(0);
      expect(config.sampleQuestions.length).toBeGreaterThan(0);
    });

    it("includes required slash commands", () => {
      const config = getCopilotParticipantConfig();
      const commandNames = config.commands.map((c) => c.name);
      expect(commandNames).toContain("investigate");
      expect(commandNames).toContain("innovate");
      expect(commandNames).toContain("auto");
      expect(commandNames).toContain("help");
    });
  });

  describe("getExtensionContributions", () => {
    it("returns VS Code contribution points", () => {
      const contributions = getExtensionContributions();
      expect(contributions.chatParticipants).toBeDefined();
      expect(contributions.commands).toBeDefined();
      expect(contributions.viewsContainers).toBeDefined();
      expect(contributions.views).toBeDefined();
    });

    it("includes all required commands", () => {
      const contributions = getExtensionContributions();
      const commands = contributions.commands as Array<{ command: string }>;
      expect(commands.some((c) => c.command === "innovator.investigate")).toBe(true);
      expect(commands.some((c) => c.command === "innovator.auto")).toBe(true);
    });
  });
});
