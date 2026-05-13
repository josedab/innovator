import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockInvestigate,
  mockGenerateForAngle,
  mockRunAutoPipeline,
  mockAnalyzeCodebaseSync,
  mockDeepAnalyze,
  mockGenerateInnovationPRs,
  mockGenerateNLExecutionPlan,
  mockRetrieveRelatedMemories,
  mockGenerateOrgDNA,
  mockOrgDNAToMarkdown,
  mockGenerateStakeholderAssessment,
  mockAssessmentToMarkdown,
} = vi.hoisted(() => ({
  mockInvestigate: vi.fn(),
  mockGenerateForAngle: vi.fn(),
  mockRunAutoPipeline: vi.fn(),
  mockAnalyzeCodebaseSync: vi.fn(),
  mockDeepAnalyze: vi.fn(),
  mockGenerateInnovationPRs: vi.fn(),
  mockGenerateNLExecutionPlan: vi.fn(),
  mockRetrieveRelatedMemories: vi.fn(),
  mockGenerateOrgDNA: vi.fn(),
  mockOrgDNAToMarkdown: vi.fn(),
  mockGenerateStakeholderAssessment: vi.fn(),
  mockAssessmentToMarkdown: vi.fn(),
}));

vi.mock("@innovator/core", () => ({
  investigate: mockInvestigate,
  generateForAngle: mockGenerateForAngle,
  runAutoPipeline: mockRunAutoPipeline,
  analyzeCodebaseSync: mockAnalyzeCodebaseSync,
  deepAnalyze: mockDeepAnalyze,
  generateInnovationPRs: mockGenerateInnovationPRs,
  innovationPRToMarkdown: vi.fn(() => "# PR"),
  analysisToMarkdown: vi.fn(() => "# Analysis"),
  generateNLExecutionPlan: mockGenerateNLExecutionPlan,
  retrieveRelatedMemories: mockRetrieveRelatedMemories,
  generateOrgDNA: mockGenerateOrgDNA,
  orgDNAToMarkdown: mockOrgDNAToMarkdown,
  generateStakeholderAssessment: mockGenerateStakeholderAssessment,
  assessmentToMarkdown: mockAssessmentToMarkdown,
  ANGLE_IDS: [
    "scamper",
    "first-principles",
    "cross-domain",
    "constraints",
    "inversion",
    "perspectives",
    "what-if",
    "trend-collision",
  ],
}));

import {
  handleInvestigate,
  handleGenerate,
  handleAutoPipeline,
  handleInnovateFromCode,
  handleInnovateFile,
  handleInnovateArchitecture,
  handlePersonaEval,
} from "./handlers.js";

describe("handleInvestigate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns investigation JSON for valid subject", async () => {
    const investigation = {
      summary: "AI summary",
      keyAspects: [{ title: "ML", description: "Machine learning" }],
      currentState: "Evolving",
      challenges: ["Scale"],
      opportunities: ["Automation"],
    };
    mockInvestigate.mockResolvedValue(investigation);

    const result = await handleInvestigate({ subject: "AI innovation" });
    const parsed = JSON.parse(result);
    expect(parsed.summary).toBe("AI summary");
    expect(mockInvestigate).toHaveBeenCalledWith("AI innovation", undefined);
  });

  it("passes model override through", async () => {
    mockInvestigate.mockResolvedValue({ summary: "test" });
    await handleInvestigate({ subject: "test", model: "gpt-5" });
    expect(mockInvestigate).toHaveBeenCalledWith("test", "gpt-5");
  });

  it("throws Zod validation error for empty subject", async () => {
    await expect(handleInvestigate({ subject: "" })).rejects.toThrow();
  });

  it("throws Zod validation error for missing subject", async () => {
    await expect(handleInvestigate({})).rejects.toThrow();
  });

  it("throws for subject exceeding 500 chars", async () => {
    await expect(handleInvestigate({ subject: "x".repeat(501) })).rejects.toThrow();
  });

  it("accepts subject at exactly 500 char boundary", async () => {
    mockInvestigate.mockResolvedValue({ summary: "ok" });
    const result = await handleInvestigate({ subject: "x".repeat(500) });
    expect(JSON.parse(result).summary).toBe("ok");
  });

  it("throws for null subject", async () => {
    await expect(handleInvestigate({ subject: null })).rejects.toThrow();
  });
});

describe("handleGenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validArgs = {
    subject: "AI innovation",
    investigation: {
      summary: "AI is evolving",
      keyAspects: [{ title: "ML", description: "Machine learning" }],
      currentState: "Evolving",
      challenges: ["Scale"],
      opportunities: ["Automation"],
    },
    angleId: "scamper",
  };

  it("returns angle result for valid args", async () => {
    const angleResult = {
      angleId: "scamper",
      angleName: "SCAMPER",
      ideas: [{ title: "Idea 1", description: "desc" }],
      reasoning: "Applied SCAMPER",
    };
    mockGenerateForAngle.mockResolvedValue(angleResult);

    const result = await handleGenerate(validArgs);
    const parsed = JSON.parse(result);
    expect(parsed.angleId).toBe("scamper");
    expect(mockGenerateForAngle).toHaveBeenCalledWith(
      "AI innovation",
      validArgs.investigation,
      "scamper",
      undefined
    );
  });

  it("passes model override through", async () => {
    mockGenerateForAngle.mockResolvedValue({ angleId: "scamper" });
    await handleGenerate({ ...validArgs, model: "gpt-5" });
    expect(mockGenerateForAngle).toHaveBeenCalledWith(
      "AI innovation",
      validArgs.investigation,
      "scamper",
      "gpt-5"
    );
  });

  it("throws for missing investigation fields", async () => {
    await expect(
      handleGenerate({
        subject: "AI",
        investigation: { summary: "s" },
        angleId: "scamper",
      })
    ).rejects.toThrow();
  });

  it("throws for missing angleId", async () => {
    await expect(
      handleGenerate({
        subject: "AI",
        investigation: validArgs.investigation,
      })
    ).rejects.toThrow();
  });

  it("throws for empty angleId", async () => {
    await expect(
      handleGenerate({
        ...validArgs,
        angleId: "",
      })
    ).rejects.toThrow();
  });
});

describe("handleAutoPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pipeline result with progress log for valid subject", async () => {
    const pipelineResult = {
      investigation: { summary: "test" },
      angleResults: [],
      synthesis: { topIdeas: [] },
    };
    mockRunAutoPipeline.mockImplementation(async (subject, onProgress) => {
      onProgress({ stage: "investigating", completedAngles: [], totalAngles: 3 });
      onProgress({ stage: "generating", completedAngles: ["scamper"], totalAngles: 3 });
      onProgress({
        stage: "complete",
        completedAngles: ["scamper", "inversion", "what-if"],
        totalAngles: 3,
      });
      return pipelineResult;
    });

    const result = await handleAutoPipeline({ subject: "AI innovation" });
    const parsed = JSON.parse(result);
    expect(parsed.finalResult).toBeDefined();
    expect(parsed.progressLog).toHaveLength(3);
    expect(parsed.progressLog[0].stage).toBe("investigating");
    expect(parsed.progressLog[2].completedAngles).toEqual(["scamper", "inversion", "what-if"]);
  });

  it("progress callback accumulates stages", async () => {
    mockRunAutoPipeline.mockImplementation(async (_sub, onProgress) => {
      onProgress({ stage: "investigating", completedAngles: [], totalAngles: 2 });
      onProgress({ stage: "synthesizing", completedAngles: ["a", "b"], totalAngles: 2 });
      return {};
    });

    const result = await handleAutoPipeline({ subject: "test" });
    const parsed = JSON.parse(result);
    expect(parsed.progressLog).toHaveLength(2);
    expect(parsed.progressLog[1].stage).toBe("synthesizing");
  });

  it("passes model and angles options", async () => {
    mockRunAutoPipeline.mockResolvedValue({});
    await handleAutoPipeline({
      subject: "test",
      model: "gpt-5",
      angles: ["scamper", "inversion"],
    });
    expect(mockRunAutoPipeline).toHaveBeenCalledWith("test", expect.any(Function), "gpt-5", [
      "scamper",
      "inversion",
    ]);
  });

  it("propagates thrown error from pipeline", async () => {
    mockRunAutoPipeline.mockRejectedValue(new Error("LLM failure"));
    await expect(handleAutoPipeline({ subject: "test" })).rejects.toThrow("LLM failure");
  });

  it("throws for empty subject", async () => {
    await expect(handleAutoPipeline({ subject: "" })).rejects.toThrow();
  });

  it("accepts subject at 500 char boundary", async () => {
    mockRunAutoPipeline.mockResolvedValue({});
    await expect(handleAutoPipeline({ subject: "x".repeat(500) })).resolves.toBeDefined();
  });
});

// ---- validatePath security tests (via handleInnovateFromCode) ----

describe("handleInnovateFromCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws for path traversal with ../", async () => {
    await expect(handleInnovateFromCode({ path: "../../etc/passwd" })).rejects.toThrow();
  });

  it("throws for non-existent path", async () => {
    await expect(
      handleInnovateFromCode({ path: "/nonexistent/path/that/does/not/exist" })
    ).rejects.toThrow("does not exist");
  });

  it("throws for empty path", async () => {
    await expect(handleInnovateFromCode({ path: "" })).rejects.toThrow();
  });

  it("succeeds with valid existing directory", async () => {
    const mockAnalysis = {
      fileCount: 5,
      totalLines: 100,
      languages: ["TypeScript"],
      patterns: [],
      subjects: [],
      complexityHotspots: [],
    };
    mockAnalyzeCodebaseSync.mockReturnValue(mockAnalysis);
    mockDeepAnalyze.mockReturnValue({
      architecturalDebt: [],
      featureGaps: [],
      performanceBottlenecks: [],
      innovationOpportunities: [],
    });
    mockGenerateInnovationPRs.mockReturnValue([]);

    // Use current directory as a known-existing path
    const result = await handleInnovateFromCode({ path: "." });
    const parsed = JSON.parse(result);
    expect(parsed.summary.files).toBe(5);
  });
});

describe("handleInnovateFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws for non-existent file", async () => {
    await expect(handleInnovateFile({ path: "/nonexistent/file.ts" })).rejects.toThrow(
      "does not exist"
    );
  });

  it("throws for empty path", async () => {
    await expect(handleInnovateFile({ path: "" })).rejects.toThrow();
  });
});

describe("handleInnovateArchitecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws for non-existent path", async () => {
    await expect(handleInnovateArchitecture({ path: "/nonexistent/dir" })).rejects.toThrow(
      "does not exist"
    );
  });

  it("succeeds with valid path", async () => {
    const mockAnalysis = {
      fileCount: 3,
      totalLines: 50,
      languages: ["TypeScript"],
      patterns: [],
      subjects: [],
      complexityHotspots: [],
    };
    mockAnalyzeCodebaseSync.mockReturnValue(mockAnalysis);
    mockDeepAnalyze.mockReturnValue({
      architecturalDebt: [],
      featureGaps: [],
      performanceBottlenecks: [],
      innovationOpportunities: [],
    });
    mockGenerateInnovationPRs.mockReturnValue([]);

    const result = await handleInnovateArchitecture({ path: "." });
    expect(result).toContain("Analysis");
  });
});

describe("handlePersonaEval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws for empty personaIds", async () => {
    await expect(handlePersonaEval({ idea: "Test idea", personaIds: [] })).rejects.toThrow();
  });

  it("throws for missing idea", async () => {
    await expect(handlePersonaEval({ personaIds: ["p1"] })).rejects.toThrow();
  });

  it("throws for empty idea", async () => {
    await expect(handlePersonaEval({ idea: "", personaIds: ["p1"] })).rejects.toThrow();
  });

  it("succeeds with valid inputs", async () => {
    mockGenerateStakeholderAssessment.mockResolvedValue({ personas: [] });
    mockAssessmentToMarkdown.mockReturnValue("# Assessment");

    const result = await handlePersonaEval({
      idea: "A great innovation idea",
      personaIds: ["cto", "product-manager"],
    });
    expect(result).toBe("# Assessment");
    expect(mockGenerateStakeholderAssessment).toHaveBeenCalledWith(
      "A great innovation idea",
      ["cto", "product-manager"],
      { model: undefined }
    );
  });

  it("passes model override", async () => {
    mockGenerateStakeholderAssessment.mockResolvedValue({});
    mockAssessmentToMarkdown.mockReturnValue("");

    await handlePersonaEval({
      idea: "Test",
      personaIds: ["cto"],
      model: "gpt-5",
    });
    expect(mockGenerateStakeholderAssessment).toHaveBeenCalledWith("Test", ["cto"], {
      model: "gpt-5",
    });
  });

  it("throws for > 12 persona IDs", async () => {
    await expect(
      handlePersonaEval({
        idea: "Test",
        personaIds: Array.from({ length: 13 }, (_, i) => `p${i}`),
      })
    ).rejects.toThrow();
  });
});
