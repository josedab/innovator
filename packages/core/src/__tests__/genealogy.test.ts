import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../rag/embeddings.js", () => ({
  generateEmbedding: vi.fn((text: string) => text.split("").map((c) => c.charCodeAt(0) / 255)),
  cosineSimilarity: vi.fn(),
}));
vi.mock("../history/index.js", () => ({
  listSessions: vi.fn().mockReturnValue([]),
}));

import { compareInvestigationRuns, findPreviousInvestigation } from "../genealogy/index.js";
import { cosineSimilarity, generateEmbedding } from "../rag/embeddings.js";
import { listSessions } from "../history/index.js";
import type { AngleResult, InnovationIdea, SessionRecord } from "../types.js";

function makeIdea(title: string, description: string = `${title} description`): InnovationIdea {
  return {
    title,
    description,
    potentialImpact: `${title} impact`,
    implementationHint: `${title} hint`,
  };
}

function makeAngle(angleId: string, angleName: string, ideas: InnovationIdea[]): AngleResult {
  return {
    angleId,
    angleName,
    ideas,
    reasoning: `${angleName} reasoning`,
  };
}

const PREVIOUS_SESSION: SessionRecord = {
  id: "session-prev",
  subject: "previous subject",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  angleResults: [],
  tags: [],
};

function decodeEmbedding(embedding: number[]): string {
  return String.fromCharCode(Math.round((embedding[0] ?? 0) * 255));
}

describe("genealogy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listSessions).mockReturnValue([]);
  });

  describe("findPreviousInvestigation", () => {
    it("returns the most similar previous session above the threshold", () => {
      const sessions: SessionRecord[] = [
        { ...PREVIOUS_SESSION, id: "session-a", subject: "legacy workflow" },
        { ...PREVIOUS_SESSION, id: "session-b", subject: "quantum robotics" },
      ];
      vi.mocked(listSessions).mockReturnValue(sessions);
      vi.mocked(cosineSimilarity).mockReturnValueOnce(0.42).mockReturnValueOnce(0.81);

      const result = findPreviousInvestigation("quantum automation");

      expect(result).toEqual(sessions[1]);
      expect(generateEmbedding).toHaveBeenCalledWith("quantum automation");
      expect(generateEmbedding).toHaveBeenCalledWith("legacy workflow");
      expect(generateEmbedding).toHaveBeenCalledWith("quantum robotics");
    });

    it("returns undefined when no prior session clears the threshold", () => {
      vi.mocked(listSessions).mockReturnValue([
        { ...PREVIOUS_SESSION, id: "session-a", subject: "legacy workflow" },
      ]);
      vi.mocked(cosineSimilarity).mockReturnValue(0.49);

      expect(findPreviousInvestigation("quantum automation")).toBeUndefined();
    });

    it("respects a custom threshold", () => {
      vi.mocked(listSessions).mockReturnValue([
        { ...PREVIOUS_SESSION, id: "session-a", subject: "legacy workflow" },
      ]);
      vi.mocked(cosineSimilarity).mockReturnValue(0.6);

      expect(findPreviousInvestigation("quantum automation", 0.7)).toBeUndefined();
    });
  });

  describe("compareInvestigationRuns", () => {
    it("classifies evolved, converged, net-new, and extinct ideas with accurate summary counts", () => {
      const currentResults = [
        makeAngle("scamper", "SCAMPER", [
          makeIdea("E current stable", "shared description"),
          makeIdea("F current changed", "updated description"),
        ]),
        makeAngle("inversion", "Inversion", [
          makeIdea("G current converged", "converged description"),
          makeIdea("H current net-new", "brand new description"),
        ]),
      ];
      const previousResults = [
        makeAngle("scamper", "SCAMPER", [makeIdea("A previous stable", "shared description")]),
        makeAngle("constraints", "Constraints", [
          makeIdea("B previous changed", "older description"),
        ]),
        makeAngle("perspectives", "Perspectives", [
          makeIdea("C previous converge", "old converge"),
        ]),
        makeAngle("what-if", "What If", [makeIdea("D extinct idea", "gone now")]),
      ];
      const similarityMap = new Map<string, number>([
        ["E-A", 0.9],
        ["F-B", 0.6],
        ["G-C", 0.92],
        ["H-G", 0.75],
      ]);
      vi.mocked(cosineSimilarity).mockImplementation((a: number[], b: number[]) => {
        const key = `${decodeEmbedding(a)}-${decodeEmbedding(b)}`;
        const reverseKey = `${decodeEmbedding(b)}-${decodeEmbedding(a)}`;
        return similarityMap.get(key) ?? similarityMap.get(reverseKey) ?? 0.1;
      });

      const result = compareInvestigationRuns(
        currentResults,
        previousResults,
        "current subject",
        PREVIOUS_SESSION
      );

      expect(result.currentSubject).toBe("current subject");
      expect(result.previousSubject).toBe("previous subject");
      expect(result.previousSessionId).toBe("session-prev");
      expect(result.isReInvestigation).toBe(true);
      expect(result.summary).toEqual({
        netNew: 1,
        evolved: 2,
        converged: 1,
        extinct: 1,
      });
      expect(result.evolutions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ideaTitle: "E current stable",
            status: "evolved",
            previousTitle: "A previous stable",
            diff: "Idea remains consistent across runs",
          }),
          expect.objectContaining({
            ideaTitle: "F current changed",
            status: "evolved",
            previousTitle: "B previous changed",
            diff: 'Significantly evolved from "B previous changed"',
          }),
          expect.objectContaining({
            ideaTitle: "G current converged",
            status: "converged",
            previousTitle: "C previous converge",
          }),
          expect.objectContaining({
            ideaTitle: "H current net-new",
            status: "net-new",
          }),
          expect.objectContaining({
            ideaTitle: "D extinct idea",
            status: "extinct",
            previousAngle: "What If",
          }),
        ])
      );
    });

    it("marks all previous ideas extinct when the current run has no ideas", () => {
      vi.mocked(cosineSimilarity).mockReturnValue(0.1);

      const result = compareInvestigationRuns(
        [],
        [makeAngle("scamper", "SCAMPER", [makeIdea("A previous stable")])],
        "current subject",
        PREVIOUS_SESSION
      );

      expect(result.summary).toEqual({ netNew: 0, evolved: 0, converged: 0, extinct: 1 });
      expect(result.evolutions).toEqual([
        expect.objectContaining({ ideaTitle: "A previous stable", status: "extinct" }),
      ]);
    });
  });
});
