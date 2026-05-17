import { beforeEach, describe, expect, it } from "vitest";
import {
  addGenomeRecord,
  clearGenomeAtlasData,
  clusterGenomeRecords,
  exportPatentBrief,
  generateRecombinantConcepts,
  getGenomeRecord,
  identifyWhiteSpaces,
  listGenomeRecords,
  scoreNovelty,
} from "../genome-sequencer/atlas.js";

describe("genome-sequencer/atlas", () => {
  beforeEach(() => {
    clearGenomeAtlasData();
  });

  it("adds, retrieves, and filters genome records", () => {
    const idea = addGenomeRecord("idea", "Workflow Copilot", "Automate repetitive tasks", [
      "ai",
      "workflow",
      "automation",
    ]);
    addGenomeRecord("patent", "Workflow Patent", "Protect process automation", [
      "automation",
      "claims",
    ]);

    expect(getGenomeRecord(idea.id)?.title).toBe("Workflow Copilot");
    expect(listGenomeRecords()).toHaveLength(2);
    expect(listGenomeRecords("idea")).toEqual([expect.objectContaining({ id: idea.id })]);
  });

  it("clusters records by trait overlap", () => {
    addGenomeRecord("idea", "Workflow Copilot", "Automate repetitive tasks", [
      "ai",
      "workflow",
      "automation",
    ]);
    addGenomeRecord("competitor", "Ops Assistant", "Competing workflow helper", [
      "ai",
      "workflow",
      "assistant",
    ]);
    addGenomeRecord("patent", "Bio Patent", "Protect biotech process", [
      "biology",
      "lab",
      "genomics",
    ]);

    const clusters = clusterGenomeRecords(2);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.recordIds.length + clusters[1]?.recordIds.length).toBe(3);
    expect(clusters.some((cluster) => cluster.recordIds.length === 2)).toBe(true);
  });

  it("identifies white-space regions across clusters", () => {
    addGenomeRecord("idea", "Workflow Copilot", "Automate repetitive tasks", [
      "ai",
      "workflow",
      "automation",
    ]);
    addGenomeRecord("patent", "Bio Patent", "Protect biotech process", [
      "biology",
      "lab",
      "genomics",
    ]);

    const clusters = clusterGenomeRecords(2);
    const whiteSpaces = identifyWhiteSpaces(clusters);

    expect(whiteSpaces.length).toBeGreaterThan(0);
    expect(whiteSpaces[0]?.adjacentClusters).toHaveLength(2);
    expect(whiteSpaces[0]?.suggestedTraits.length).toBeGreaterThan(0);
  });

  it("scores novelty against nearest neighbors", () => {
    const original = addGenomeRecord("idea", "Workflow Copilot", "Automate repetitive tasks", [
      "ai",
      "workflow",
      "automation",
    ]);
    const nearCopy = addGenomeRecord("competitor", "Ops Assistant", "Competing workflow helper", [
      "ai",
      "workflow",
      "automation",
    ]);
    addGenomeRecord("patent", "Bio Patent", "Protect biotech process", [
      "biology",
      "lab",
      "genomics",
    ]);

    const novelty = scoreNovelty(original.id);
    expect(novelty?.nearestNeighbors[0]).toEqual(
      expect.objectContaining({ recordId: nearCopy.id, similarity: 1 })
    );
    expect(novelty?.collisionRisk).toBe("high");
    expect(novelty?.score).toBe(0);
  });

  it("generates recombinant concepts across clusters and stores them", () => {
    addGenomeRecord("idea", "Workflow Copilot", "Automate repetitive tasks", [
      "ai",
      "workflow",
      "automation",
    ]);
    addGenomeRecord("patent", "Bio Patent", "Protect biotech process", [
      "biology",
      "lab",
      "genomics",
    ]);
    const clusters = clusterGenomeRecords(2);

    const recombinant = generateRecombinantConcepts(clusters[0].id, clusters[1].id, 2);
    expect(recombinant).toHaveLength(2);
    expect(recombinant.every((record) => record.type === "idea")).toBe(true);
    expect(listGenomeRecords("idea")).toHaveLength(3);
  });

  it("exports patent briefs as markdown", () => {
    const patent = addGenomeRecord("patent", "Workflow Patent", "Protect process automation", [
      "automation",
      "claims",
      "workflow",
    ]);

    const brief = exportPatentBrief(patent.id);
    expect(brief).toContain("# Patent Brief: Workflow Patent");
    expect(brief).toContain("## Claim Traits");
    expect(brief).toContain("- automation");
  });
});
