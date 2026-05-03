import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), `innovator-portfolio-test-${Date.now()}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => testDir };
});

const {
  addPortfolioItem,
  getPortfolioItem,
  transitionItem,
  updatePortfolioItem,
  deletePortfolioItem,
  listPortfolioItems,
  getPortfolioMetrics,
  generatePortfolioInsights,
} = await import("../portfolio/index.js");

describe("portfolio", () => {
  beforeEach(() => {
    mkdirSync(join(testDir, ".innovator", "portfolio"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("addPortfolioItem", () => {
    it("returns item with UUID, stage, and timestamps", () => {
      const item = addPortfolioItem({
        title: "Test Idea",
        description: "A test idea",
        sourceAngle: "scamper",
      });
      expect(item.id).toBeTruthy();
      expect(item.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(item.stage).toBe("ideation");
      expect(item.createdAt).toBeTruthy();
      expect(item.updatedAt).toBeTruthy();
      expect(item.transitions).toEqual([]);
      expect(item.tags).toEqual([]);
    });

    it("persists optional fields", () => {
      const item = addPortfolioItem({
        title: "Tagged",
        description: "d",
        sourceAngle: "inversion",
        sessionId: "sess-1",
        tags: ["energy"],
        assignee: "alice",
      });
      expect(item.sessionId).toBe("sess-1");
      expect(item.tags).toEqual(["energy"]);
      expect(item.assignee).toBe("alice");
    });
  });

  describe("getPortfolioItem", () => {
    it("retrieves an existing item", () => {
      const created = addPortfolioItem({
        title: "Get me",
        description: "d",
        sourceAngle: "scamper",
      });
      const fetched = getPortfolioItem(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.title).toBe("Get me");
    });

    it("returns undefined for unknown id", () => {
      expect(getPortfolioItem("nonexistent-id")).toBeUndefined();
    });
  });

  describe("transitionItem", () => {
    it("appends transition and updates stage", () => {
      const item = addPortfolioItem({
        title: "Trans",
        description: "d",
        sourceAngle: "scamper",
      });
      const updated = transitionItem(item.id, "evaluation", "looks good", "user1");
      expect(updated).toBeDefined();
      expect(updated!.stage).toBe("evaluation");
      expect(updated!.transitions).toHaveLength(1);
      expect(updated!.transitions[0].from).toBe("ideation");
      expect(updated!.transitions[0].to).toBe("evaluation");
      expect(updated!.transitions[0].reason).toBe("looks good");
      expect(updated!.transitions[0].userId).toBe("user1");
    });

    it("returns undefined for unknown id", () => {
      expect(transitionItem("bad-id", "evaluation")).toBeUndefined();
    });

    it("supports multiple transitions", () => {
      const item = addPortfolioItem({
        title: "Multi",
        description: "d",
        sourceAngle: "scamper",
      });
      transitionItem(item.id, "evaluation");
      const result = transitionItem(item.id, "prototyping");
      expect(result!.transitions).toHaveLength(2);
      expect(result!.stage).toBe("prototyping");
    });
  });

  describe("updatePortfolioItem", () => {
    it("applies partial updates", () => {
      const item = addPortfolioItem({
        title: "Upd",
        description: "d",
        sourceAngle: "scamper",
      });
      const result = updatePortfolioItem(item.id, {
        outcome: "success",
        impactScore: 8,
        tags: ["ai"],
        assignee: "bob",
      });
      expect(result).toBe(true);
      const fetched = getPortfolioItem(item.id);
      expect(fetched!.outcome).toBe("success");
      expect(fetched!.impactScore).toBe(8);
      expect(fetched!.tags).toEqual(["ai"]);
      expect(fetched!.assignee).toBe("bob");
    });

    it("returns false for unknown id", () => {
      expect(updatePortfolioItem("bad", { outcome: "x" })).toBe(false);
    });
  });

  describe("deletePortfolioItem", () => {
    it("deletes existing item", () => {
      const item = addPortfolioItem({
        title: "Del",
        description: "d",
        sourceAngle: "scamper",
      });
      expect(deletePortfolioItem(item.id)).toBe(true);
      expect(getPortfolioItem(item.id)).toBeUndefined();
    });

    it("returns false for nonexistent item", () => {
      expect(deletePortfolioItem("nope")).toBe(false);
    });
  });

  describe("listPortfolioItems", () => {
    it("returns items sorted by updatedAt descending", async () => {
      addPortfolioItem({ title: "First", description: "d", sourceAngle: "scamper" });
      await new Promise((r) => setTimeout(r, 10));
      addPortfolioItem({ title: "Second", description: "d", sourceAngle: "scamper" });
      const items = listPortfolioItems();
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe("Second");
    });

    it("skips corrupt files", () => {
      addPortfolioItem({ title: "Good", description: "d", sourceAngle: "scamper" });
      writeFileSync(
        join(testDir, ".innovator", "portfolio", "corrupt.json"),
        "not json{{{",
        "utf-8"
      );
      const items = listPortfolioItems();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("Good");
    });
  });

  describe("getPortfolioMetrics", () => {
    it("returns correct byStage counts and conversion rates", () => {
      const a = addPortfolioItem({ title: "A", description: "d", sourceAngle: "scamper" });
      const b = addPortfolioItem({ title: "B", description: "d", sourceAngle: "inversion" });
      const c = addPortfolioItem({ title: "C", description: "d", sourceAngle: "scamper" });

      transitionItem(a.id, "evaluation");
      transitionItem(a.id, "prototyping");
      transitionItem(a.id, "shipped");

      transitionItem(b.id, "evaluation");

      const metrics = getPortfolioMetrics();
      expect(metrics.totalIdeas).toBe(3);
      expect(metrics.byStage.shipped).toBe(1);
      expect(metrics.byStage.evaluation).toBe(1);
      expect(metrics.byStage.ideation).toBe(1);
      expect(metrics.byAngle.scamper).toBe(2);
      expect(metrics.byAngle.inversion).toBe(1);
      expect(metrics.conversionRates.ideationToEvaluation).toBeCloseTo(2 / 3);
      expect(metrics.conversionRates.evaluationToPrototyping).toBeCloseTo(1 / 2);
      expect(metrics.conversionRates.prototypingToShipped).toBeCloseTo(1);
      expect(metrics.conversionRates.overallShipRate).toBeCloseTo(1 / 3);
    });

    it("handles empty portfolio without division by zero", () => {
      const metrics = getPortfolioMetrics();
      expect(metrics.totalIdeas).toBe(0);
      expect(metrics.conversionRates.ideationToEvaluation).toBe(0);
      expect(metrics.conversionRates.evaluationToPrototyping).toBe(0);
      expect(metrics.conversionRates.prototypingToShipped).toBe(0);
      expect(metrics.conversionRates.overallShipRate).toBe(0);
      expect(Number.isFinite(metrics.conversionRates.ideationToEvaluation)).toBe(true);
    });
  });

  describe("generatePortfolioInsights", () => {
    it("returns strength insight for high ship rate", () => {
      // Create items that have been shipped (>20%)
      for (let i = 0; i < 3; i++) {
        const item = addPortfolioItem({
          title: `Ship ${i}`,
          description: "d",
          sourceAngle: "scamper",
        });
        transitionItem(item.id, "evaluation");
        transitionItem(item.id, "prototyping");
        transitionItem(item.id, "shipped");
      }
      const insights = generatePortfolioInsights();
      const shipInsight = insights.find((i) => i.title === "Strong shipping rate");
      expect(shipInsight).toBeDefined();
      expect(shipInsight!.type).toBe("strength");
    });

    it("returns warning for low evaluation rate", () => {
      for (let i = 0; i < 6; i++) {
        addPortfolioItem({ title: `Stuck ${i}`, description: "d", sourceAngle: "scamper" });
      }
      // Only evaluate 1 out of 6
      const items = listPortfolioItems();
      transitionItem(items[0].id, "evaluation");

      const insights = generatePortfolioInsights();
      const warning = insights.find((i) => i.title === "Low evaluation rate");
      expect(warning).toBeDefined();
      expect(warning!.type).toBe("warning");
    });

    it("returns empty insights for empty portfolio", () => {
      const insights = generatePortfolioInsights();
      expect(Array.isArray(insights)).toBe(true);
    });
  });
});
