import { describe, it, expect } from "vitest";
import {
  InvestigationSchema,
  AngleResultSchema,
  SynthesisSchema,
  InnovationIdeaSchema,
} from "../types.js";

describe("InvestigationSchema", () => {
  const validInvestigation = {
    summary: "A summary of the subject",
    keyAspects: [
      { title: "Aspect 1", description: "Description 1" },
      { title: "Aspect 2", description: "Description 2" },
    ],
    currentState: "Current state of the art",
    challenges: ["Challenge 1", "Challenge 2"],
    opportunities: ["Opportunity 1", "Opportunity 2"],
  };

  it("accepts valid investigation data", () => {
    const result = InvestigationSchema.parse(validInvestigation);
    expect(result.summary).toBe("A summary of the subject");
    expect(result.keyAspects).toHaveLength(2);
    expect(result.challenges).toHaveLength(2);
    expect(result.opportunities).toHaveLength(2);
  });

  it("rejects missing summary", () => {
    const { summary: _summary, ...incomplete } = validInvestigation;
    expect(() => InvestigationSchema.parse(incomplete)).toThrow();
  });

  it("rejects missing keyAspects", () => {
    const { keyAspects: _keyAspects, ...incomplete } = validInvestigation;
    expect(() => InvestigationSchema.parse(incomplete)).toThrow();
  });

  it("rejects keyAspect without title", () => {
    const invalid = {
      ...validInvestigation,
      keyAspects: [{ description: "no title" }],
    };
    expect(() => InvestigationSchema.parse(invalid)).toThrow();
  });

  it("accepts empty arrays for challenges and opportunities", () => {
    const data = { ...validInvestigation, challenges: [], opportunities: [] };
    const result = InvestigationSchema.parse(data);
    expect(result.challenges).toHaveLength(0);
  });
});

describe("InnovationIdeaSchema", () => {
  it("accepts valid idea", () => {
    const idea = {
      title: "Idea",
      description: "Desc",
      potentialImpact: "High",
      implementationHint: "Start here",
    };
    expect(InnovationIdeaSchema.parse(idea)).toEqual(idea);
  });

  it("rejects missing fields", () => {
    expect(() => InnovationIdeaSchema.parse({ title: "only title" })).toThrow();
  });
});

describe("AngleResultSchema", () => {
  it("accepts valid angle result", () => {
    const result = AngleResultSchema.parse({
      angleId: "scamper",
      angleName: "SCAMPER",
      ideas: [
        {
          title: "Idea 1",
          description: "Desc",
          potentialImpact: "Medium",
          implementationHint: "Try this",
        },
      ],
      reasoning: "Applied SCAMPER methodology",
    });
    expect(result.angleId).toBe("scamper");
    expect(result.ideas).toHaveLength(1);
  });

  it("accepts empty ideas array", () => {
    const result = AngleResultSchema.parse({
      angleId: "test",
      angleName: "Test",
      ideas: [],
      reasoning: "No ideas generated",
    });
    expect(result.ideas).toHaveLength(0);
  });
});

describe("SynthesisSchema", () => {
  it("accepts valid synthesis", () => {
    const synthesis = SynthesisSchema.parse({
      topIdeas: [
        {
          title: "Top Idea",
          description: "Description",
          sourceAngle: "scamper",
          potentialImpact: "High",
          feasibility: "high",
        },
      ],
      themes: ["Theme 1", "Theme 2"],
      recommendation: "Focus on top idea",
    });
    expect(synthesis.topIdeas).toHaveLength(1);
    expect(synthesis.themes).toHaveLength(2);
  });

  it("rejects invalid feasibility value", () => {
    expect(() =>
      SynthesisSchema.parse({
        topIdeas: [
          {
            title: "Idea",
            description: "Desc",
            sourceAngle: "x",
            potentialImpact: "y",
            feasibility: "invalid",
          },
        ],
        themes: [],
        recommendation: "rec",
      })
    ).toThrow();
  });

  it("only allows low/medium/high feasibility", () => {
    for (const value of ["low", "medium", "high"]) {
      const result = SynthesisSchema.parse({
        topIdeas: [
          {
            title: "t",
            description: "d",
            sourceAngle: "s",
            potentialImpact: "p",
            feasibility: value,
          },
        ],
        themes: [],
        recommendation: "r",
      });
      expect(result.topIdeas[0].feasibility).toBe(value);
    }
  });
});
