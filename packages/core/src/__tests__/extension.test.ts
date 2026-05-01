import { describe, it, expect } from "vitest";
import {
  parseSlashCommand,
  formatInvestigationForChat,
  formatAngleResultsForChat,
  formatSynthesisForChat,
  formatProgressForChat,
  formatAnglesForChat,
  formatPresetsForChat,
  formatHelpForChat,
} from "../extension/index.js";
import type { Investigation, AngleResult, Synthesis, PipelineProgress } from "../types.js";

describe("extension", () => {
  describe("parseSlashCommand", () => {
    it("parses @innovator prefixed commands", () => {
      const cmd = parseSlashCommand("@innovator investigate solar energy");
      expect(cmd?.command).toBe("investigate");
      expect(cmd?.args).toBe("solar energy");
    });

    it("parses slash commands", () => {
      const cmd = parseSlashCommand("/investigate solar energy");
      expect(cmd?.command).toBe("investigate");
      expect(cmd?.args).toBe("solar energy");
    });

    it("parses bare commands", () => {
      const cmd = parseSlashCommand("auto quantum computing");
      expect(cmd?.command).toBe("auto");
      expect(cmd?.args).toBe("quantum computing");
    });

    it("defaults to auto for unknown input", () => {
      const cmd = parseSlashCommand("@innovator solar energy innovations");
      expect(cmd?.command).toBe("auto");
      expect(cmd?.args).toBe("solar energy innovations");
    });

    it("returns null for empty input", () => {
      expect(parseSlashCommand("")).toBeNull();
      expect(parseSlashCommand("@innovator")).toBeNull();
    });

    it("parses help command", () => {
      const cmd = parseSlashCommand("@innovator help");
      expect(cmd?.command).toBe("help");
    });

    it("parses angles command", () => {
      const cmd = parseSlashCommand("/angles");
      expect(cmd?.command).toBe("angles");
    });
  });

  describe("formatInvestigationForChat", () => {
    it("formats investigation as markdown", () => {
      const inv: Investigation = {
        summary: "Test summary",
        keyAspects: [{ title: "Aspect 1", description: "Description 1" }],
        currentState: "Current state info",
        challenges: ["Challenge 1"],
        opportunities: ["Opportunity 1"],
      };
      const result = formatInvestigationForChat(inv);
      expect(result.markdown).toContain("## 📋 Investigation Results");
      expect(result.markdown).toContain("Test summary");
      expect(result.markdown).toContain("Aspect 1");
      expect(result.markdown).toContain("Challenge 1");
    });
  });

  describe("formatAngleResultsForChat", () => {
    it("formats angle results as markdown", () => {
      const results: AngleResult[] = [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Idea 1",
              description: "Description",
              potentialImpact: "High",
              implementationHint: "Start here",
            },
          ],
          reasoning: "Applied method",
        },
      ];
      const response = formatAngleResultsForChat(results);
      expect(response.markdown).toContain("SCAMPER");
      expect(response.markdown).toContain("Idea 1");
      expect(response.metadata?.ideaCount).toBe(1);
    });
  });

  describe("formatSynthesisForChat", () => {
    it("formats synthesis with feasibility indicators", () => {
      const synth: Synthesis = {
        topIdeas: [
          {
            title: "Top Idea",
            description: "Description",
            sourceAngle: "SCAMPER",
            potentialImpact: "High",
            feasibility: "high",
          },
        ],
        themes: ["Theme 1"],
        recommendation: "Focus on this",
      };
      const response = formatSynthesisForChat(synth);
      expect(response.markdown).toContain("🟢");
      expect(response.markdown).toContain("Top Idea");
      expect(response.markdown).toContain("Theme 1");
    });
  });

  describe("formatProgressForChat", () => {
    it("formats each pipeline stage", () => {
      expect(formatProgressForChat({ stage: "investigating", completedAngles: [], totalAngles: 8, angleResults: [] })).toContain("🔍");
      expect(formatProgressForChat({ stage: "generating", completedAngles: ["a", "b"], totalAngles: 8, angleResults: [] })).toContain("2/8");
      expect(formatProgressForChat({ stage: "synthesizing", completedAngles: [], totalAngles: 8, angleResults: [] })).toContain("🧪");
      expect(formatProgressForChat({ stage: "complete", completedAngles: [], totalAngles: 8, angleResults: [] })).toContain("✅");
      expect(formatProgressForChat({ stage: "error", completedAngles: [], totalAngles: 8, angleResults: [], error: "Oops" })).toContain("Oops");
    });
  });

  describe("utility formatters", () => {
    it("formatAnglesForChat lists all angles", () => {
      const result = formatAnglesForChat();
      expect(result.markdown).toContain("SCAMPER");
      expect(result.markdown).toContain("First Principles");
    });

    it("formatPresetsForChat lists presets", () => {
      const result = formatPresetsForChat();
      expect(result.markdown).toContain("Startup Idea Validation");
    });

    it("formatHelpForChat shows commands", () => {
      const result = formatHelpForChat();
      expect(result.markdown).toContain("investigate");
      expect(result.markdown).toContain("innovate");
      expect(result.markdown).toContain("auto");
    });
  });
});
