import { describe, it, expect } from "vitest";
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

const MOCK_INVESTIGATION: Investigation = {
  summary: "Test summary about EVs",
  keyAspects: [{ title: "Battery Tech", description: "Lithium-ion advances" }],
  currentState: "Rapidly evolving market",
  challenges: ["Range anxiety", "Charging infrastructure"],
  opportunities: ["Grid integration", "Fleet electrification"],
};

const SUBJECT = "electric vehicles";

describe("buildScamperPrompt", () => {
  it("includes subject and investigation context", () => {
    const prompt = buildScamperPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain(SUBJECT);
    expect(prompt).toContain("Test summary about EVs");
  });

  it("references SCAMPER method letters", () => {
    const prompt = buildScamperPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain("ubstitute");
    expect(prompt).toContain("ombine");
    expect(prompt).toContain("dapt");
    expect(prompt).toContain("odify");
    expect(prompt).toContain("liminate");
    expect(prompt).toContain("everse");
  });

  it("specifies angleId and angleName", () => {
    const prompt = buildScamperPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain('"scamper"');
    expect(prompt).toContain('"SCAMPER"');
  });

  it("requests JSON output", () => {
    const prompt = buildScamperPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain("valid JSON only");
    expect(prompt).toContain("angleId");
    expect(prompt).toContain("ideas");
  });
});

describe("buildFirstPrinciplesPrompt", () => {
  it("includes subject and investigation context", () => {
    const prompt = buildFirstPrinciplesPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain(SUBJECT);
    expect(prompt).toContain("Test summary about EVs");
  });

  it("references first principles thinking", () => {
    const prompt = buildFirstPrinciplesPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain("fundamental truths");
    expect(prompt).toContain("assumptions");
  });

  it("specifies correct angleId", () => {
    const prompt = buildFirstPrinciplesPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain('"first-principles"');
  });
});

describe("buildCrossDomainPrompt", () => {
  it("includes subject and investigation context", () => {
    const prompt = buildCrossDomainPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain(SUBJECT);
    expect(prompt).toContain("Battery Tech");
  });

  it("references cross-domain analogies", () => {
    const prompt = buildCrossDomainPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain("analogous systems");
    expect(prompt).toContain("different fields");
  });

  it("specifies correct angleId", () => {
    const prompt = buildCrossDomainPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain('"cross-domain"');
  });
});

describe("buildConstraintsPrompt", () => {
  it("includes subject and investigation context", () => {
    const prompt = buildConstraintsPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain(SUBJECT);
    expect(prompt).toContain("Range anxiety");
  });

  it("references constraint injection examples", () => {
    const prompt = buildConstraintsPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain("budget were $0");
    expect(prompt).toContain("offline");
  });

  it("specifies correct angleId", () => {
    const prompt = buildConstraintsPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain('"constraints"');
  });
});

describe("buildInversionPrompt", () => {
  it("includes subject and investigation context", () => {
    const prompt = buildInversionPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain(SUBJECT);
    expect(prompt).toContain("Grid integration");
  });

  it("references problem inversion technique", () => {
    const prompt = buildInversionPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain("Invert");
    expect(prompt).toContain("FAIL");
  });

  it("specifies correct angleId", () => {
    const prompt = buildInversionPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain('"inversion"');
  });
});

describe("buildPerspectivesPrompt", () => {
  it("includes subject and investigation context", () => {
    const prompt = buildPerspectivesPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain(SUBJECT);
    expect(prompt).toContain("Rapidly evolving market");
  });

  it("references multiple stakeholder perspectives", () => {
    const prompt = buildPerspectivesPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain("End User");
    expect(prompt).toContain("Competitor");
    expect(prompt).toContain("Historian");
    expect(prompt).toContain("Sci-Fi Author");
  });

  it("specifies correct angleId", () => {
    const prompt = buildPerspectivesPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain('"perspectives"');
  });
});

describe("buildWhatIfPrompt", () => {
  it("includes subject and investigation context", () => {
    const prompt = buildWhatIfPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain(SUBJECT);
    expect(prompt).toContain("Fleet electrification");
  });

  it("references what-if scenarios", () => {
    const prompt = buildWhatIfPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain("1 billion users");
    expect(prompt).toContain("cost had to be literally zero");
  });

  it("specifies correct angleId", () => {
    const prompt = buildWhatIfPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain('"what-if"');
  });
});

describe("buildTrendCollisionPrompt", () => {
  it("includes subject and investigation context", () => {
    const prompt = buildTrendCollisionPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain(SUBJECT);
    expect(prompt).toContain("Charging infrastructure");
  });

  it("references emerging trends", () => {
    const prompt = buildTrendCollisionPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain("AI / LLMs");
    expect(prompt).toContain("Sustainability");
    expect(prompt).toContain("Decentralization");
    expect(prompt).toContain("Biotech");
  });

  it("specifies correct angleId", () => {
    const prompt = buildTrendCollisionPrompt(SUBJECT, MOCK_INVESTIGATION);
    expect(prompt).toContain('"trend-collision"');
  });
});
