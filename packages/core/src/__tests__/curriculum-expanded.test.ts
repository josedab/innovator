import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));
const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();
vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
  generateTextStream: vi.fn(),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));
vi.mock("../prompts/sanitize.js", () => ({
  sanitizeUserInput: vi.fn((s: string) => s),
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

const {
  generateLearningPath,
  getLearningModule,
  getLearningPath,
  startModule,
  completeModule,
  generateCertificate,
  getLearnerProfile,
  getWeakestSkills,
  clearCurriculumData,
} = await import("../curriculum/index.js");

const sampleLLMResponse = JSON.stringify({
  title: "Innovation Skills Path",
  description: "Learn key innovation skills",
  estimatedHours: 5,
  modules: [
    {
      title: "Divergent Thinking Basics",
      description: "Learn divergent thinking",
      skill: "divergent-thinking",
      conceptExplanation: "Divergent thinking is...",
      exampleInvestigation: {
        subject: "AI in education",
        walkthrough: "Step 1...",
        keyInsights: ["Insight 1"],
      },
      exercises: [
        {
          title: "Brainstorm exercise",
          description: "Generate 20 ideas",
          type: "freeform",
          evaluationCriteria: ["Quantity", "Diversity"],
          estimatedMinutes: 30,
          difficulty: "intermediate",
        },
      ],
      quiz: [
        {
          question: "What is divergent thinking?",
          options: ["Generating many ideas", "Selecting best idea", "Analyzing data", "None"],
          correctIndex: 0,
          explanation: "Divergent thinking generates many ideas",
          difficulty: "intermediate",
        },
      ],
      estimatedMinutes: 60,
    },
    {
      title: "Empathy Mapping",
      description: "Learn empathy mapping",
      skill: "empathy-mapping",
      conceptExplanation: "Empathy mapping is...",
      exercises: [
        {
          title: "Create empathy map",
          description: "Map a user's experience",
          type: "investigation",
          evaluationCriteria: ["Completeness"],
          estimatedMinutes: 45,
          difficulty: "intermediate",
        },
      ],
      quiz: [
        {
          question: "What does an empathy map capture?",
          options: ["User emotions", "Code quality", "Revenue", "None"],
          correctIndex: 0,
          explanation: "Empathy maps capture user emotions",
          difficulty: "intermediate",
        },
      ],
      estimatedMinutes: 90,
    },
  ],
});

describe("curriculum - expanded", () => {
  beforeEach(() => {
    clearCurriculumData();
    vi.clearAllMocks();
  });

  describe("generateLearningPath", () => {
    it("with mocked LLM returns path with modules/quiz/exercises", async () => {
      mockGenerateText.mockResolvedValue(sampleLLMResponse);
      mockExtractJson.mockReturnValue(sampleLLMResponse);

      const path = await generateLearningPath("user-1", ["divergent-thinking", "empathy-mapping"]);

      expect(path.id).toContain("path-user-1");
      expect(path.title).toBe("Innovation Skills Path");
      expect(path.modules).toHaveLength(2);
      expect(path.targetSkills).toContain("divergent-thinking");
      expect(path.targetSkills).toContain("empathy-mapping");

      // Verify modules were stored
      for (const moduleId of path.modules) {
        const mod = getLearningModule(moduleId);
        expect(mod).toBeDefined();
        expect(mod!.quiz.length).toBeGreaterThan(0);
        expect(mod!.exercises.length).toBeGreaterThan(0);
      }
    });

    it("with targetSkills filtering", async () => {
      mockGenerateText.mockResolvedValue(sampleLLMResponse);
      mockExtractJson.mockReturnValue(sampleLLMResponse);

      const path = await generateLearningPath("user-1", ["divergent-thinking"], {
        difficulty: "beginner",
        maxModules: 5,
      });

      expect(path.targetSkills).toContain("divergent-thinking");
      expect(path.difficulty).toBe("beginner");
    });

    it("throws on empty weakSkills", async () => {
      await expect(generateLearningPath("user-1", [])).rejects.toThrow(
        "At least one target skill is required"
      );
    });

    it("LLM failure error handling", async () => {
      mockGenerateText.mockRejectedValue(new Error("LLM timeout"));

      await expect(generateLearningPath("user-1", ["divergent-thinking"])).rejects.toThrow(
        "LLM timeout"
      );
    });
  });

  describe("generateCertificate happy path", () => {
    it("create path → complete all modules → generate cert → verify badge", async () => {
      mockGenerateText.mockResolvedValue(sampleLLMResponse);
      mockExtractJson.mockReturnValue(sampleLLMResponse);

      // 1. Generate path
      const path = await generateLearningPath("user-1", ["divergent-thinking", "empathy-mapping"]);

      // 2. Start and complete all modules
      for (const moduleId of path.modules) {
        startModule("user-1", moduleId);
        completeModule("user-1", moduleId, 85, 30);
      }

      // 3. Generate certificate
      const cert = generateCertificate("user-1", path.id);
      expect(cert).toBeDefined();
      expect(cert!.userId).toBe("user-1");
      expect(cert!.pathId).toBe(path.id);
      expect(cert!.avgQuizScore).toBe(85);
      expect(cert!.verificationCode).toMatch(/^INNOV-/);
      expect(cert!.skills).toContain("divergent-thinking");

      // 4. Verify badge was awarded
      const profile = getLearnerProfile("user-1");
      const certBadge = profile.badges.find((b) => b.id === `badge-cert-${path.id}`);
      expect(certBadge).toBeDefined();
      expect(certBadge!.name).toContain("Certified");
    });
  });

  describe("generateCertificate with incomplete modules", () => {
    it("returns undefined", async () => {
      mockGenerateText.mockResolvedValue(sampleLLMResponse);
      mockExtractJson.mockReturnValue(sampleLLMResponse);

      const path = await generateLearningPath("user-1", ["divergent-thinking"]);
      // Only start but don't complete
      startModule("user-1", path.modules[0]);

      const cert = generateCertificate("user-1", path.id);
      expect(cert).toBeUndefined();
    });
  });

  describe("getLearningModule", () => {
    it("returns undefined for non-existent module", () => {
      expect(getLearningModule("nonexistent")).toBeUndefined();
    });

    it("returns stored module after path generation", async () => {
      mockGenerateText.mockResolvedValue(sampleLLMResponse);
      mockExtractJson.mockReturnValue(sampleLLMResponse);

      const path = await generateLearningPath("user-1", ["divergent-thinking"]);
      const mod = getLearningModule(path.modules[0]);
      expect(mod).toBeDefined();
      expect(mod!.title).toBeTruthy();
    });
  });

  describe("skill level progression after module completion", () => {
    it("increases skill level", async () => {
      mockGenerateText.mockResolvedValue(sampleLLMResponse);
      mockExtractJson.mockReturnValue(sampleLLMResponse);

      const path = await generateLearningPath("user-1", ["divergent-thinking"]);
      const profileBefore = getLearnerProfile("user-1");
      const skillBefore = profileBefore.skillLevels?.["divergent-thinking"] ?? 0;

      startModule("user-1", path.modules[0]);
      completeModule("user-1", path.modules[0], 80, 30);

      const profileAfter = getLearnerProfile("user-1");
      const skillAfter = profileAfter.skillLevels?.["divergent-thinking"] ?? 0;
      expect(skillAfter).toBeGreaterThan(skillBefore);
    });
  });

  describe("getWeakestSkills with custom count", () => {
    it("returns requested count of skills", () => {
      const weak = getWeakestSkills("user-1", 5);
      expect(weak).toHaveLength(5);
    });

    it("returns 1 skill when count=1", () => {
      const weak = getWeakestSkills("user-1", 1);
      expect(weak).toHaveLength(1);
    });
  });
});
