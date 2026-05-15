import { describe, it, expect } from "vitest";

import {
  generateFitnessLandscape,
  addEvolutionTrail,
  getGapInvestigationSuggestions,
  type FitnessLandscape,
} from "../visualization/fitness-landscape.js";
import type { AngleResult } from "../types.js";

function makeAngleResult(
  angleId: string,
  ideas: Array<{
    title: string;
    description: string;
    potentialImpact: string;
    implementationHint: string;
  }>
): AngleResult {
  return {
    angleId,
    angleName: angleId,
    reasoning: "test reasoning",
    ideas,
  };
}

const SAMPLE_RESULTS: AngleResult[] = [
  makeAngleResult("scamper", [
    {
      title: "Revolutionary AI Diagnostics",
      description: "Novel AI system for diagnostics",
      potentialImpact: "Transformative impact on healthcare",
      implementationHint: "Use existing ML infrastructure",
    },
    {
      title: "Incremental UI Tweak",
      description: "Small improvement to existing interface",
      potentialImpact: "Minor improvement for users",
      implementationHint: "Simple CSS changes",
    },
  ]),
  makeAngleResult("first-principles", [
    {
      title: "Breakthrough Storage System",
      description: "Unique and unprecedented approach to data storage",
      potentialImpact: "Significant reduction in costs",
      implementationHint: "Requires novel hardware",
    },
  ]),
];

describe("visualization/fitness-landscape", () => {
  describe("generateFitnessLandscape", () => {
    it("generates landscape from angle results", () => {
      const landscape = generateFitnessLandscape(SAMPLE_RESULTS);
      expect(landscape.points).toHaveLength(3);
      expect(landscape.terrain.length).toBeGreaterThan(0);
      expect(landscape.metadata.totalPoints).toBe(3);
    });

    it("assigns feasibility, impact, novelty scores", () => {
      const landscape = generateFitnessLandscape(SAMPLE_RESULTS);
      for (const point of landscape.points) {
        expect(point.feasibility).toBeGreaterThanOrEqual(1);
        expect(point.feasibility).toBeLessThanOrEqual(10);
        expect(point.impact).toBeGreaterThanOrEqual(1);
        expect(point.impact).toBeLessThanOrEqual(10);
        expect(point.novelty).toBeGreaterThanOrEqual(1);
        expect(point.novelty).toBeLessThanOrEqual(10);
      }
    });

    it("produces deterministic results", () => {
      const l1 = generateFitnessLandscape(SAMPLE_RESULTS);
      const l2 = generateFitnessLandscape(SAMPLE_RESULTS);
      expect(l1.points.map((p) => p.x)).toEqual(l2.points.map((p) => p.x));
      expect(l1.points.map((p) => p.y)).toEqual(l2.points.map((p) => p.y));
    });

    it("computes clusters", () => {
      const landscape = generateFitnessLandscape(SAMPLE_RESULTS);
      expect(landscape.clusters.length).toBeGreaterThanOrEqual(1);
      for (const cluster of landscape.clusters) {
        expect(cluster.pointIds.length).toBeGreaterThan(0);
        expect(cluster.averageFitness).toBeGreaterThanOrEqual(0);
      }
    });

    it("computes terrain vertices", () => {
      const landscape = generateFitnessLandscape(SAMPLE_RESULTS, { terrainResolution: 5 });
      expect(landscape.terrain.length).toBe(36); // (5+1)^2
      for (const v of landscape.terrain) {
        expect(v.color).toMatch(/^hsl/);
        expect(v.fitness).toBeGreaterThanOrEqual(0);
      }
    });

    it("computes bounds", () => {
      const landscape = generateFitnessLandscape(SAMPLE_RESULTS);
      expect(landscape.bounds.maxX).toBeGreaterThan(landscape.bounds.minX);
      expect(landscape.bounds.maxY).toBeGreaterThan(landscape.bounds.minY);
    });

    it("handles empty results", () => {
      const landscape = generateFitnessLandscape([]);
      expect(landscape.points).toHaveLength(0);
      expect(landscape.metadata.totalPoints).toBe(0);
    });

    it("high-impact words produce higher impact scores", () => {
      const highImpact = makeAngleResult("test", [
        {
          title: "Revolutionary Paradigm Shift",
          description: "Transformative breakthrough",
          potentialImpact: "Disruptive paradigm change",
          implementationHint: "straightforward",
        },
      ]);
      const lowImpact = makeAngleResult("test", [
        {
          title: "Small Fix",
          description: "Minor incremental change",
          potentialImpact: "Marginal improvement",
          implementationHint: "simple",
        },
      ]);
      const l1 = generateFitnessLandscape([highImpact]);
      const l2 = generateFitnessLandscape([lowImpact]);
      expect(l1.points[0].impact).toBeGreaterThan(l2.points[0].impact);
    });
  });

  describe("addEvolutionTrail", () => {
    it("adds generation trails to landscape", () => {
      const landscape = generateFitnessLandscape(SAMPLE_RESULTS);
      const updated = addEvolutionTrail(landscape, [SAMPLE_RESULTS, SAMPLE_RESULTS]);
      expect(updated.evolutionTrails).toHaveLength(2);
      expect(updated.evolutionTrails[0].generation).toBe(0);
      expect(updated.evolutionTrails[1].generation).toBe(1);
    });
  });

  describe("getGapInvestigationSuggestions", () => {
    it("returns suggestions for gaps", () => {
      const landscape = generateFitnessLandscape(SAMPLE_RESULTS);
      const suggestions = getGapInvestigationSuggestions(landscape);
      for (const s of suggestions) {
        expect(s.suggestedAngles.length).toBeGreaterThan(0);
        expect(s.gapDescription.length).toBeGreaterThan(0);
      }
    });
  });
});
