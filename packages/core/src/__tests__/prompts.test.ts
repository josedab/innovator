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

// ---- Angle Prompt Builders ----

import {
  buildScamperPrompt,
  buildFirstPrinciplesPrompt,
  buildCrossDomainPrompt,
  buildConstraintsPrompt,
  buildInversionPrompt,
  buildPerspectivesPrompt,
  buildWhatIfPrompt,
  buildTrendCollisionPrompt,
} from "../prompts/angles/index.js";
import type { Investigation } from "../types.js";

const mockInvestigation: Investigation = {
  summary: "AI-driven automation is transforming industries",
  keyAspects: [{ title: "ML", description: "Machine learning techniques" }],
  currentState: "Rapid adoption phase",
  challenges: ["Data quality"],
  opportunities: ["Cost reduction"],
};

const emptyInvestigation: Investigation = {
  summary: "",
  keyAspects: [],
  currentState: "",
  challenges: [],
  opportunities: [],
};

describe("angle prompts", () => {
  const angleBuilders = [
    { name: "SCAMPER", fn: buildScamperPrompt, angleId: "scamper" },
    { name: "First Principles", fn: buildFirstPrinciplesPrompt, angleId: "first-principles" },
    { name: "Cross-Domain", fn: buildCrossDomainPrompt, angleId: "cross-domain" },
    { name: "Constraints", fn: buildConstraintsPrompt, angleId: "constraints" },
    { name: "Inversion", fn: buildInversionPrompt, angleId: "inversion" },
    { name: "Perspectives", fn: buildPerspectivesPrompt, angleId: "perspectives" },
    { name: "What-If", fn: buildWhatIfPrompt, angleId: "what-if" },
    { name: "Trend Collision", fn: buildTrendCollisionPrompt, angleId: "trend-collision" },
  ];

  for (const { name, fn, angleId } of angleBuilders) {
    describe(name, () => {
      it("includes subject and investigation context", () => {
        const prompt = fn("home automation", mockInvestigation);
        expect(prompt).toContain("home automation");
        expect(prompt).toContain("INVESTIGATION CONTEXT");
      });

      it(`specifies angleId "${angleId}"`, () => {
        const prompt = fn("test", mockInvestigation);
        expect(prompt).toContain(`"${angleId}"`);
      });

      it("requests JSON output with ideas structure", () => {
        const prompt = fn("test", mockInvestigation);
        expect(prompt).toContain("angleId");
        expect(prompt).toContain("angleName");
        expect(prompt).toContain('"ideas"');
        expect(prompt).toContain("JSON");
      });

      it("produces valid prompt with empty investigation", () => {
        const prompt = fn("test", emptyInvestigation);
        expect(prompt).not.toContain("undefined");
        expect(prompt.length).toBeGreaterThan(100);
      });
    });
  }
});
