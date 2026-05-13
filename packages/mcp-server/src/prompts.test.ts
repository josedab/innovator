import { describe, it, expect, vi } from "vitest";

vi.mock("@innovator/core", () => ({
  ANGLES: [
    { id: "scamper", name: "SCAMPER", shortDescription: "Substitute, Combine, Adapt, Modify, Put, Eliminate, Reverse", icon: "🔄" },
    { id: "first-principles", name: "First Principles", shortDescription: "Decompose to fundamentals", icon: "🧱" },
    { id: "cross-domain", name: "Cross-Domain Analogy", shortDescription: "Map from other fields", icon: "🌐" },
  ],
}));

import { listPrompts, getPromptMessages } from "./prompts.js";

describe("MCP Prompts", () => {
  describe("listPrompts", () => {
    it("returns 6 prompt templates", () => {
      const prompts = listPrompts();
      expect(prompts).toHaveLength(6);
      const names = prompts.map((p) => p.name);
      expect(names).toContain("investigate-subject");
      expect(names).toContain("innovate-with-angle");
      expect(names).toContain("full-innovation-pipeline");
      expect(names).toContain("innovate-code-architecture");
      expect(names).toContain("debate-idea");
      expect(names).toContain("compare-approaches");
    });

    it("each prompt has name, description, and arguments", () => {
      for (const prompt of listPrompts()) {
        expect(prompt.name).toBeTruthy();
        expect(prompt.description.length).toBeGreaterThan(10);
        expect(Array.isArray(prompt.arguments)).toBe(true);
        expect(prompt.arguments.some((a) => a.required)).toBe(true);
      }
    });
  });

  describe("getPromptMessages", () => {
    it("returns user message for investigate-subject", () => {
      const messages = getPromptMessages("investigate-subject", { subject: "solar energy" });
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content.text).toContain("solar energy");
      expect(messages[0].content.text).toContain("investigate");
    });

    it("returns user message for innovate-with-angle", () => {
      const messages = getPromptMessages("innovate-with-angle", {
        subject: "batteries",
        angle: "scamper",
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("SCAMPER");
      expect(messages[0].content.text).toContain("batteries");
    });

    it("returns user message for full-innovation-pipeline", () => {
      const messages = getPromptMessages("full-innovation-pipeline", { subject: "AI ethics" });
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("AI ethics");
      expect(messages[0].content.text).toContain("auto");
    });

    it("returns user message for innovate-code-architecture", () => {
      const messages = getPromptMessages("innovate-code-architecture", {
        code_context: "class UserService { ... }",
        focus: "security",
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("security");
      expect(messages[0].content.text).toContain("UserService");
    });

    it("returns user message for debate-idea", () => {
      const messages = getPromptMessages("debate-idea", {
        idea: "Replace SQL with a graph database",
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("graph database");
      expect(messages[0].content.text).toContain("persona-eval");
    });

    it("returns user message for compare-approaches", () => {
      const messages = getPromptMessages("compare-approaches", {
        problem: "scale notification system",
        approaches: "pub/sub, polling, websockets",
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("pub/sub");
      expect(messages[0].content.text).toContain("polling");
      expect(messages[0].content.text).toContain("websockets");
    });

    it("handles unknown prompt gracefully", () => {
      const messages = getPromptMessages("nonexistent", {});
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("Unknown prompt");
    });

    it("uses default depth when not specified", () => {
      const messages = getPromptMessages("investigate-subject", { subject: "quantum" });
      expect(messages[0].content.text).toContain("standard");
    });

    it("includes custom context when provided", () => {
      const messages = getPromptMessages("innovate-with-angle", {
        subject: "test",
        angle: "scamper",
        context: "Focus on B2B use cases",
      });
      expect(messages[0].content.text).toContain("B2B use cases");
    });
  });
});
