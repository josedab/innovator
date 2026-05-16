import { describe, it, expect } from "vitest";

import { CANONICAL_FAILURE_PATTERNS } from "../failure-library/patterns.js";
import { FailurePatternSchema, FailureCategorySchema } from "../failure-library/types.js";

describe("failure-library/patterns", () => {
  describe("CANONICAL_FAILURE_PATTERNS", () => {
    it("contains exactly 50 patterns", () => {
      expect(CANONICAL_FAILURE_PATTERNS).toHaveLength(50);
    });

    it("all patterns parse against FailurePatternSchema", () => {
      for (const pattern of CANONICAL_FAILURE_PATTERNS) {
        expect(() => FailurePatternSchema.parse(pattern)).not.toThrow();
      }
    });

    it("all pattern IDs are unique", () => {
      const ids = CANONICAL_FAILURE_PATTERNS.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("no pattern has empty symptoms array", () => {
      for (const pattern of CANONICAL_FAILURE_PATTERNS) {
        expect(pattern.symptoms.length).toBeGreaterThan(0);
      }
    });

    it("no pattern has empty preventionStrategies array", () => {
      for (const pattern of CANONICAL_FAILURE_PATTERNS) {
        expect(pattern.preventionStrategies.length).toBeGreaterThan(0);
      }
    });

    it("all required string fields are non-empty", () => {
      for (const pattern of CANONICAL_FAILURE_PATTERNS) {
        expect(pattern.title.length).toBeGreaterThan(0);
        expect(pattern.description.length).toBeGreaterThan(0);
        expect(pattern.rootCause.length).toBeGreaterThan(0);
      }
    });

    it("severity values are valid enums", () => {
      const validSeverities = ["low", "medium", "high", "critical"];
      for (const pattern of CANONICAL_FAILURE_PATTERNS) {
        expect(validSeverities).toContain(pattern.severity);
      }
    });

    it("frequency values are valid enums", () => {
      const validFrequencies = ["rare", "occasional", "common", "very-common"];
      for (const pattern of CANONICAL_FAILURE_PATTERNS) {
        expect(validFrequencies).toContain(pattern.frequency);
      }
    });

    it("category distribution covers expected categories", () => {
      const categories = new Set(CANONICAL_FAILURE_PATTERNS.map((p) => p.category));
      const validCategories = FailureCategorySchema.options;

      // Every pattern category must be a valid category
      for (const cat of categories) {
        expect(validCategories).toContain(cat);
      }

      // Should cover most categories (at least 8 of 12)
      expect(categories.size).toBeGreaterThanOrEqual(8);
    });

    it("filter by category returns correct subset", () => {
      const pivotPatterns = CANONICAL_FAILURE_PATTERNS.filter(
        (p) => p.category === "pivot-failure"
      );
      expect(pivotPatterns.length).toBeGreaterThan(0);
      expect(pivotPatterns.every((p) => p.category === "pivot-failure")).toBe(true);
    });

    it("all patterns have tags", () => {
      for (const pattern of CANONICAL_FAILURE_PATTERNS) {
        expect(pattern.tags.length).toBeGreaterThan(0);
      }
    });

    it("all patterns have at least one realWorldExample", () => {
      for (const pattern of CANONICAL_FAILURE_PATTERNS) {
        expect(pattern.realWorldExamples.length).toBeGreaterThan(0);
      }
    });
  });
});
