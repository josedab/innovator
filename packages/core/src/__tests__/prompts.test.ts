import { describe, it, expect } from "vitest";
import { buildInvestigationPrompt, buildSynthesisPrompt } from "../prompts/investigation.js";

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
