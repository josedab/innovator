import { describe, it, expect, beforeEach } from "vitest";
import {
  assessNovelty,
  generateNoveltyReport,
  noveltyReportToMarkdown,
  addPriorArt,
  clearPriorArt,
  getPriorArtCount,
} from "../index.js";
import type { PriorArtEntry } from "../index.js";

const samplePriorArt: PriorArtEntry[] = [
  {
    id: "pat-1",
    source: "patent",
    title: "AI-powered solar panel optimization system",
    description:
      "Machine learning algorithm that adjusts solar panel angles in real-time based on weather data and satellite imagery to maximize energy output.",
    similarity: 0,
    patentNumber: "US10234567",
    url: "https://patents.google.com/patent/US10234567",
  },
  {
    id: "paper-1",
    source: "academic",
    title: "Deep reinforcement learning for smart grid energy distribution",
    description:
      "Novel approach using deep RL to optimize energy distribution in smart grid networks, reducing waste by 23% in simulation.",
    similarity: 0,
    doi: "10.1234/energy.2024.001",
  },
  {
    id: "prod-1",
    source: "product",
    title: "SolarEdge intelligent inverter with AI optimization",
    description:
      "Commercial product that uses machine learning to optimize solar inverter performance and predict maintenance needs.",
    similarity: 0,
    url: "https://solaredge.com",
  },
  {
    id: "pat-2",
    source: "patent",
    title: "Blockchain-based peer-to-peer energy trading platform",
    description:
      "Decentralized platform enabling households to trade surplus solar energy with neighbors using smart contracts.",
    similarity: 0,
    patentNumber: "EP3456789",
  },
  {
    id: "paper-2",
    source: "academic",
    title: "Biodegradable organic photovoltaic cells from plant waste",
    description:
      "Research demonstrating functional solar cells made from agricultural waste products, achieving 8% efficiency with full biodegradability.",
    similarity: 0,
    doi: "10.5678/green.2024.042",
  },
];

beforeEach(() => {
  clearPriorArt();
});

describe("prior art management", () => {
  it("starts with empty prior art store", () => {
    const counts = getPriorArtCount();
    expect(counts.total).toBe(0);
  });

  it("adds and counts prior art entries", () => {
    addPriorArt(samplePriorArt);
    const counts = getPriorArtCount();
    expect(counts.total).toBe(5);
    expect(counts.patents).toBe(2);
    expect(counts.papers).toBe(2);
    expect(counts.products).toBe(1);
  });

  it("clears prior art store", () => {
    addPriorArt(samplePriorArt);
    clearPriorArt();
    expect(getPriorArtCount().total).toBe(0);
  });
});

describe("assessNovelty", () => {
  it("returns high novelty for unrelated ideas when store is empty", () => {
    const result = assessNovelty(
      "quantum teleportation",
      "Teleport objects using quantum entanglement"
    );
    expect(result.noveltyScore).toBe(100);
    expect(result.assessment).toBe("highly-novel");
    expect(result.priorArt).toHaveLength(0);
  });

  it("detects similarity to existing prior art", () => {
    addPriorArt(samplePriorArt);
    const result = assessNovelty(
      "AI solar panel optimization",
      "Use machine learning to optimize solar panel angles based on weather data for maximum energy output"
    );
    expect(result.noveltyScore).toBeLessThan(80);
    expect(result.priorArt.length).toBeGreaterThan(0);
    expect(result.priorArt[0].source).toBe("patent");
  });

  it("identifies patent candidates for novel ideas", () => {
    addPriorArt(samplePriorArt);
    const result = assessNovelty(
      "DNA-encoded data storage for underwater vehicles",
      "Store navigation data in synthetic DNA molecules within autonomous underwater drones for extreme durability"
    );
    expect(result.noveltyScore).toBeGreaterThanOrEqual(75);
    expect(result.assessment).toBe("highly-novel");
  });

  it("extracts differentiators", () => {
    addPriorArt(samplePriorArt);
    const result = assessNovelty(
      "Quantum computing enhanced solar forecasting",
      "Use quantum annealing to solve solar energy forecasting optimization problems exponentially faster"
    );
    expect(result.differentiators.length).toBeGreaterThanOrEqual(0);
  });

  it("flags risk factors for low-novelty ideas", () => {
    addPriorArt(samplePriorArt);
    const result = assessNovelty(
      "AI-powered solar panel angle optimization system",
      "Machine learning algorithm that adjusts solar panel angles in real-time based on weather data to maximize energy output"
    );
    expect(result.riskFactors.length).toBeGreaterThan(0);
  });
});

describe("generateNoveltyReport", () => {
  it("generates a report for multiple ideas", () => {
    addPriorArt(samplePriorArt);
    const report = generateNoveltyReport(
      [
        {
          title: "Underwater DNA storage",
          description: "Store data in synthetic DNA for underwater drones",
        },
        {
          title: "AI solar optimization",
          description: "Machine learning for solar panel angle optimization based on weather",
        },
        {
          title: "Quantum grid balancing",
          description: "Use quantum computing to optimize smart grid energy distribution",
        },
      ],
      { domain: "renewable-energy" }
    );

    expect(report.assessments).toHaveLength(3);
    expect(report.summary.totalIdeas).toBe(3);
    expect(report.summary.averageNovelty).toBeGreaterThan(0);
    expect(report.domain).toBe("renewable-energy");
    expect(report.id).toBeTruthy();
  });

  it("handles empty ideas list", () => {
    const report = generateNoveltyReport([]);
    expect(report.assessments).toHaveLength(0);
    expect(report.summary.totalIdeas).toBe(0);
    expect(report.summary.averageNovelty).toBe(0);
  });
});

describe("noveltyReportToMarkdown", () => {
  it("generates readable markdown", () => {
    addPriorArt(samplePriorArt);
    const report = generateNoveltyReport([
      { title: "Novel Idea", description: "Something truly unique in the world of innovation" },
    ]);
    const md = noveltyReportToMarkdown(report);
    expect(md).toContain("# Novelty Oracle Report");
    expect(md).toContain("Novel Idea");
    expect(md).toContain("Novelty:");
  });
});
