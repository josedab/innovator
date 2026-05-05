import { describe, it, expect } from "vitest";
import { InvestigateInputSchema, GenerateInputSchema, AutoPipelineInputSchema } from "./schemas.js";

describe("InvestigateInputSchema", () => {
  it("accepts valid subject", () => {
    const result = InvestigateInputSchema.parse({ subject: "AI innovation" });
    expect(result.subject).toBe("AI innovation");
    expect(result.model).toBeUndefined();
  });

  it("accepts subject with optional model", () => {
    const result = InvestigateInputSchema.parse({ subject: "AI", model: "gpt-5" });
    expect(result.model).toBe("gpt-5");
  });

  it("rejects empty subject (min length 1)", () => {
    expect(() => InvestigateInputSchema.parse({ subject: "" })).toThrow();
  });

  it("rejects subject exceeding 500 chars", () => {
    expect(() => InvestigateInputSchema.parse({ subject: "x".repeat(501) })).toThrow();
  });

  it("accepts subject at exactly 500 chars", () => {
    const result = InvestigateInputSchema.parse({ subject: "x".repeat(500) });
    expect(result.subject).toHaveLength(500);
  });

  it("accepts subject at exactly 1 char (min boundary)", () => {
    const result = InvestigateInputSchema.parse({ subject: "x" });
    expect(result.subject).toBe("x");
  });

  it("rejects missing subject", () => {
    expect(() => InvestigateInputSchema.parse({})).toThrow();
  });

  it("strips extra fields", () => {
    const result = InvestigateInputSchema.parse({ subject: "test", extra: "field" });
    expect((result as Record<string, unknown>).extra).toBeUndefined();
  });
});

describe("GenerateInputSchema", () => {
  const validInvestigation = {
    summary: "AI is evolving",
    keyAspects: [{ title: "ML", description: "Machine learning" }],
    currentState: "Evolving",
    challenges: ["Scale"],
    opportunities: ["Automation"],
  };

  it("accepts valid input", () => {
    const result = GenerateInputSchema.parse({
      subject: "AI",
      investigation: validInvestigation,
      angleId: "scamper",
    });
    expect(result.subject).toBe("AI");
    expect(result.angleId).toBe("scamper");
    expect(result.investigation.summary).toBe("AI is evolving");
  });

  it("accepts with optional model", () => {
    const result = GenerateInputSchema.parse({
      subject: "AI",
      investigation: validInvestigation,
      angleId: "scamper",
      model: "gpt-5",
    });
    expect(result.model).toBe("gpt-5");
  });

  it("rejects missing required nested fields (summary)", () => {
    expect(() =>
      GenerateInputSchema.parse({
        subject: "AI",
        investigation: { keyAspects: [], currentState: "", challenges: [], opportunities: [] },
        angleId: "scamper",
      })
    ).toThrow();
  });

  it("rejects missing required nested fields (keyAspects)", () => {
    expect(() =>
      GenerateInputSchema.parse({
        subject: "AI",
        investigation: { summary: "s", currentState: "", challenges: [], opportunities: [] },
        angleId: "scamper",
      })
    ).toThrow();
  });

  it("rejects invalid angleId type (number)", () => {
    expect(() =>
      GenerateInputSchema.parse({
        subject: "AI",
        investigation: validInvestigation,
        angleId: 123,
      })
    ).toThrow();
  });

  it("rejects empty angleId", () => {
    expect(() =>
      GenerateInputSchema.parse({
        subject: "AI",
        investigation: validInvestigation,
        angleId: "",
      })
    ).toThrow();
  });

  it("accepts any string angleId (no enum constraint)", () => {
    const result = GenerateInputSchema.parse({
      subject: "AI",
      investigation: validInvestigation,
      angleId: "custom-angle",
    });
    expect(result.angleId).toBe("custom-angle");
  });
});

describe("AutoPipelineInputSchema", () => {
  it("accepts valid subject only", () => {
    const result = AutoPipelineInputSchema.parse({ subject: "AI innovation" });
    expect(result.subject).toBe("AI innovation");
    expect(result.model).toBeUndefined();
    expect(result.angles).toBeUndefined();
  });

  it("accepts optional model", () => {
    const result = AutoPipelineInputSchema.parse({ subject: "AI", model: "gpt-5" });
    expect(result.model).toBe("gpt-5");
  });

  it("accepts optional angles array", () => {
    const result = AutoPipelineInputSchema.parse({
      subject: "AI",
      angles: ["scamper", "inversion"],
    });
    expect(result.angles).toEqual(["scamper", "inversion"]);
  });

  it("rejects empty subject", () => {
    expect(() => AutoPipelineInputSchema.parse({ subject: "" })).toThrow();
  });

  it("rejects subject exceeding 500 chars", () => {
    expect(() => AutoPipelineInputSchema.parse({ subject: "x".repeat(501) })).toThrow();
  });

  it("rejects invalid model type (number)", () => {
    expect(() => AutoPipelineInputSchema.parse({ subject: "AI", model: 123 })).toThrow();
  });

  it("rejects angles with invalid element type (number)", () => {
    expect(() => AutoPipelineInputSchema.parse({ subject: "AI", angles: [123] })).toThrow();
  });

  it("accepts empty angles array", () => {
    const result = AutoPipelineInputSchema.parse({ subject: "AI", angles: [] });
    expect(result.angles).toEqual([]);
  });
});

describe("Cross-schema consistency", () => {
  it("all schemas share subject min(1) max(500) constraint", () => {
    const longSubject = "x".repeat(501);
    expect(() => InvestigateInputSchema.parse({ subject: longSubject })).toThrow();
    expect(() =>
      GenerateInputSchema.parse({
        subject: longSubject,
        investigation: {
          summary: "",
          keyAspects: [],
          currentState: "",
          challenges: [],
          opportunities: [],
        },
        angleId: "x",
      })
    ).toThrow();
    expect(() => AutoPipelineInputSchema.parse({ subject: longSubject })).toThrow();
  });
});
