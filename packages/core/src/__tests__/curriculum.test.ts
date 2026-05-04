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
  INNOVATION_SKILLS,
  DIFFICULTY_LEVELS,
  getLearningModule,
  getLearningPath,
  getUserLearningPaths,
  startModule,
  completeModule,
  getModuleProgress,
  getCurriculumProgress,
  getLearnerProfile,
  getWeakestSkills,
  generateCertificate,
  getUserCertificates,
  clearCurriculumData,
} = await import("../curriculum/index.js");

describe("curriculum", () => {
  beforeEach(() => {
    clearCurriculumData();
    vi.clearAllMocks();
  });

  describe("constants", () => {
    it("INNOVATION_SKILLS has 15 items", () => {
      expect(INNOVATION_SKILLS).toHaveLength(15);
    });

    it("DIFFICULTY_LEVELS has 4 items", () => {
      expect(DIFFICULTY_LEVELS).toHaveLength(4);
    });
  });

  describe("getLearnerProfile", () => {
    it("returns default profile for new user", () => {
      const profile = getLearnerProfile("user-1");
      expect(profile.userId).toBe("user-1");
      expect(profile.completedModules).toHaveLength(0);
      expect(profile.totalPoints).toBe(0);
      expect(profile.badges).toHaveLength(0);
    });
  });

  describe("getWeakestSkills", () => {
    it("returns skills for new user (all at 0)", () => {
      const weak = getWeakestSkills("user-1");
      expect(weak).toHaveLength(3); // default count = 3
      // All skills are at 0, so any 3 are valid
      for (const skill of weak) {
        expect(INNOVATION_SKILLS).toContain(skill);
      }
    });
  });

  describe("getUserLearningPaths", () => {
    it("returns empty for new user", () => {
      expect(getUserLearningPaths("user-1")).toHaveLength(0);
    });
  });

  describe("startModule", () => {
    it("creates progress record", () => {
      const prog = startModule("user-1", "mod-1");
      expect(prog.userId).toBe("user-1");
      expect(prog.moduleId).toBe("mod-1");
      expect(prog.status).toBe("in-progress");
      expect(prog.startedAt).toBeTruthy();
      expect(prog.attempts).toBe(1);
    });
  });

  describe("completeModule", () => {
    it("updates status and awards points", () => {
      startModule("user-1", "mod-1");
      const prog = completeModule("user-1", "mod-1", 85, 30);
      expect(prog.status).toBe("completed");
      expect(prog.quizScore).toBe(85);
      expect(prog.completedAt).toBeTruthy();

      const profile = getLearnerProfile("user-1");
      expect(profile.totalPoints).toBeGreaterThan(0);
      expect(profile.completedModules).toContain("mod-1");
    });
  });

  describe("getModuleProgress", () => {
    it("retrieves stored progress", () => {
      startModule("user-1", "mod-1");
      const prog = getModuleProgress("user-1", "mod-1");
      expect(prog).toBeDefined();
      expect(prog!.status).toBe("in-progress");
    });

    it("returns undefined for unknown module", () => {
      expect(getModuleProgress("user-1", "unknown")).toBeUndefined();
    });
  });

  describe("getCurriculumProgress", () => {
    it("returns all progress for user", () => {
      startModule("user-1", "mod-1");
      startModule("user-1", "mod-2");
      const all = getCurriculumProgress("user-1");
      expect(all).toHaveLength(2);
    });
  });

  describe("getUserCertificates", () => {
    it("returns empty initially", () => {
      expect(getUserCertificates("user-1")).toHaveLength(0);
    });
  });

  describe("generateCertificate", () => {
    it("returns undefined when path doesn't exist", () => {
      expect(generateCertificate("user-1", "nonexistent-path")).toBeUndefined();
    });
  });
});
