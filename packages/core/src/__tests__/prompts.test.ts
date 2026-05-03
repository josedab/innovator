import { describe, it, expect } from "vitest";
import {
  buildInvestigationPrompt,
  buildSynthesisPrompt,
  investigationContext,
} from "../prompts/investigation.js";

describe("buildInvestigationPrompt", () => {
  it("includes the subject in the prompt", () => {
    const prompt = buildInvestigationPrompt("electric vehicles");
    expect(prompt).toContain("electric vehicles");
  });

  it("asks for JSON output", () => {
    const prompt = buildInvestigationPrompt("test subject");
    expect(prompt).toContain("JSON");
  });

  it("mentions expected fields", () => {
    const prompt = buildInvestigationPrompt("test");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("keyAspects");
    expect(prompt).toContain("challenges");
    expect(prompt).toContain("opportunities");
  });

  it("with contextDocuments includes context block", () => {
    const prompt = buildInvestigationPrompt("AI", "Some knowledge base docs");
    expect(prompt).toContain("Some knowledge base docs");
    expect(prompt).toContain("knowledge base context");
  });

  it("without contextDocuments has no context block", () => {
    const prompt = buildInvestigationPrompt("AI");
    expect(prompt).not.toContain("knowledge base context");
  });

  it("XSS/injection in subject is wrapped via wrapUserInput", () => {
    const prompt = buildInvestigationPrompt('<script>alert("xss")</script>');
    // wrapUserInput wraps with delimiters, subject should still appear in some form
    expect(prompt).toContain("SUBJECT");
  });
});

describe("buildSynthesisPrompt", () => {
  const investigation = {
    summary: "Test summary",
    keyAspects: [{ title: "A1", description: "D1" }],
    currentState: "Current state",
    challenges: ["C1"],
    opportunities: ["O1"],
  };

  it("includes subject and investigation context", () => {
    const prompt = buildSynthesisPrompt("EV", investigation, "[]");
    expect(prompt).toContain("EV");
    expect(prompt).toContain("Test summary");
    expect(prompt).toContain("A1: D1");
  });

  it("includes angle results JSON", () => {
    const results = '[{"angleId": "scamper"}]';
    const prompt = buildSynthesisPrompt("X", investigation, results);
    expect(prompt).toContain(results);
  });

  it("asks for synthesis JSON structure", () => {
    const prompt = buildSynthesisPrompt("X", investigation, "[]");
    expect(prompt).toContain("topIdeas");
    expect(prompt).toContain("themes");
    expect(prompt).toContain("recommendation");
  });
});

describe("investigationContext", () => {
  const baseInvestigation = {
    summary: "Test summary",
    keyAspects: [{ title: "A1", description: "D1" }],
    currentState: "Current state",
    challenges: ["C1", "C2"],
    opportunities: ["O1", "O2"],
  };

  it("formats all fields", () => {
    const ctx = investigationContext("Test Subject", baseInvestigation);
    expect(ctx).toContain("Test Subject");
    expect(ctx).toContain("Summary: Test summary");
    expect(ctx).toContain("A1: D1");
    expect(ctx).toContain("Current State: Current state");
    expect(ctx).toContain("C1; C2");
    expect(ctx).toContain("O1; O2");
  });

  it("truncates at 10000 chars with [truncated] marker", () => {
    const longInvestigation = {
      ...baseInvestigation,
      summary: "X".repeat(12_000),
    };
    const ctx = investigationContext("subject", longInvestigation);
    expect(ctx.length).toBeLessThanOrEqual(10_000 + "[truncated]".length + 1);
    expect(ctx).toContain("[truncated]");
  });

  it("short input has no truncation marker", () => {
    const ctx = investigationContext("short", baseInvestigation);
    expect(ctx).not.toContain("[truncated]");
  });

  it("empty challenges/opportunities arrays don't crash", () => {
    const inv = {
      ...baseInvestigation,
      challenges: [],
      opportunities: [],
    };
    const ctx = investigationContext("X", inv);
    expect(ctx).toContain("Challenges:");
    expect(ctx).toContain("Opportunities:");
  });
});
